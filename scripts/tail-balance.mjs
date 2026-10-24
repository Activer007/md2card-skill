// This optional pass never changes the greedy page count or original groups.
// Limits are additional ceilings INSIDE the paginator's unchanged global budget.
export const TAIL_BALANCE_LIMITS = Object.freeze({ candidatesPerPartition: 8, probes: 64 });
export const TAIL_BALANCE_POLICY = Object.freeze({ maxTailUtilization: 0.35, minUtilizationGap: 0.25, minGapImprovement: 0.05 });
const MEDIA = ['screen', 'print'];
const EPSILON = 1e-9;

function geometry(measurements) {
  const utilization = {}, available = {};
  for (const media of MEDIA) {
    const value = measurements?.[media];
    // scrollHeight is at least clientHeight on the stretched content container.
    // It is an overflow guard, NOT a measurement of occupied content height.
    if (value?.available === undefined || value?.occupied === undefined) return { error: 'geometry-unavailable' };
    const width = value.available?.width, height = value.available?.height, occupied = value.occupied?.height;
    if (![width, height, occupied].every(Number.isFinite) || width <= 0 || height <= 0 || occupied < 0 || occupied > height + 1) return { error: 'geometry-invalid' };
    available[media] = { width, height };
    utilization[media] = Math.min(1, occupied / height);
  }
  return { utilization, available };
}

function pairGeometry(left, right) {
  const first = geometry(left.measurements), last = geometry(right.measurements);
  if (first.error || last.error) return { error: first.error ?? last.error };
  const summary = Object.fromEntries(MEDIA.map(media => [media, {
    left: first.utilization[media], right: last.utilization[media],
    gap: Math.abs(first.utilization[media] - last.utilization[media])
  }]));
  return { summary, available: [first.available, last.available] };
}

function sameCanvas(candidate, baseline) {
  return candidate.available.every((side, index) => MEDIA.every(media => ['width', 'height'].every(dimension => Math.abs(side[media][dimension] - baseline.available[index][media][dimension]) <= 1)));
}

function score(pair) { return Math.max(...MEDIA.map(media => pair[media].gap)); }

export function balanceManifest(enabled) {
  return {
    enabled, algorithm: 'bounded-tail-groups-v1', outcome: enabled ? 'unchanged' : 'disabled',
    attempts: 0, probes: 0, appliedPartitions: 0, fallback: enabled ? 'greedy-preserved' : null,
    limits: { ...TAIL_BALANCE_LIMITS }, policy: { ...TAIL_BALANCE_POLICY }, partitions: []
  };
}

/** Reconsider only the last two greedy pages per locked partition. Greedy must
 * finish first, so optional work never steals required later-partition probes.
 * probe measures one unchanged semantic page in BOTH screen and print media.
 * Browser, deadline and safety-budget exceptions propagate; only unavailable
 * utilization geometry / exhausted optional search preserve the greedy pair. */
export async function balanceSemanticTails(document, pages, { probe, remainingProbes, checkpoint }) {
  const report = balanceManifest(true);
  for (const partition of document.partitions) {
    checkpoint();
    const pair = pages.filter(page => page.partition === partition).slice(-2);
    const record = { partitionIndex: partition.index, cardIndexes: pair.map(page => page.card.index), outcome: 'unchanged', attempts: 0, probes: 0, fallback: null, termination: null, movedGroupIds: [], candidates: [] };
    report.partitions.push(record);
    if (pair.length < 2) { record.fallback = 'single-card'; continue; }
    const [left, right] = pair;
    const baseline = pairGeometry(left, right);
    if (baseline.error) { record.fallback = baseline.error; continue; }
    record.before = baseline.summary;
    record.after = baseline.summary;
    const eligible = MEDIA.every(media => {
      const value = baseline.summary[media];
      return value.right <= TAIL_BALANCE_POLICY.maxTailUtilization + EPSILON && value.left - value.right >= TAIL_BALANCE_POLICY.minUtilizationGap - EPSILON;
    });
    if (!eligible) { record.fallback = 'sparse-tail-ineligible'; continue; }
    if (left.groups.length < 2) { record.fallback = 'no-movable-groups'; continue; }
    let best, geometryFailure;
    const maximum = Math.min(left.groups.length - 1, TAIL_BALANCE_LIMITS.candidatesPerPartition);
    for (let moved = 1; moved <= maximum; moved++) {
      checkpoint();
      if (report.probes + 2 > TAIL_BALANCE_LIMITS.probes || remainingProbes() < 2) { record.termination = 'probe-budget'; break; }
      const split = left.groups.length - moved;
      const firstGroups = left.groups.slice(0, split);
      const lastGroups = [...left.groups.slice(split), ...right.groups];
      record.attempts++; report.attempts++;
      const candidate = { movedGroups: moved, outcome: null };
      record.candidates.push(candidate);
      // Even an overflowing first page does not skip measuring the second page.
      // A pair is never accepted using just one page or one media measurement.
      const first = await probe(partition, firstGroups.flatMap(group => group.atoms), left.card.index, pages.length);
      const last = await probe(partition, lastGroups.flatMap(group => group.atoms), right.card.index, pages.length);
      record.probes += 2; report.probes += 2;
      if (!first.fits || !last.fits) { candidate.outcome = 'overflow'; candidate.geometry = 'not-evaluated-overflow'; continue; }
      const measured = pairGeometry(first, last);
      if (measured.error || !sameCanvas(measured, baseline)) {
        geometryFailure = measured.error ?? 'geometry-invalid';
        candidate.outcome = geometryFailure;
        record.termination = geometryFailure;
        break;
      }
      candidate.utilization = measured.summary;
      const improves = MEDIA.every(media => measured.summary[media].right > baseline.summary[media].right + EPSILON && baseline.summary[media].gap - measured.summary[media].gap >= TAIL_BALANCE_POLICY.minGapImprovement - EPSILON);
      if (!improves) { candidate.outcome = 'no-improvement'; continue; }
      // Minimize the worst media gap, retaining the first deterministic tie.
      if (best && score(measured.summary) >= score(best.summary) - EPSILON) { candidate.outcome = 'not-better'; continue; }
      candidate.outcome = 'viable';
      best = { first: { ...first, groups: firstGroups }, last: { ...last, groups: lastGroups }, summary: measured.summary, movedGroupIds: left.groups.slice(split).map(group => group.id), candidate };
      if (score(measured.summary) <= EPSILON) { record.termination = 'balanced'; break; }
    }
    record.termination ??= maximum < left.groups.length - 1 ? 'candidate-limit' : 'boundaries-exhausted';
    if (geometryFailure) { record.fallback = geometryFailure; continue; }
    if (!best) { record.fallback = record.termination === 'probe-budget' ? 'probe-budget' : 'no-improvement'; continue; }
    // The only mutation is replacement of these two page records, after both
    // fits and measured improvement are known. Source atoms/groups stay intact.
    Object.assign(left, best.first);
    Object.assign(right, best.last);
    best.candidate.outcome = 'selected';
    record.outcome = 'improved';
    record.after = best.summary;
    record.movedGroupIds = best.movedGroupIds;
    report.appliedPartitions++;
  }
  if (report.appliedPartitions) {
    report.outcome = 'improved';
    report.fallback = report.partitions.some(record => record.fallback) ? 'greedy-preserved-for-unimproved-partitions' : null;
  }
  return report;
}
