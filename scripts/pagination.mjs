import { Md2CardError } from './errors.mjs';
import { balanceSemanticTails, balanceManifest } from './tail-balance.mjs';
import { renderSemanticCard, validateSemanticCoverage, semanticManifest, MAX_SEMANTIC_ATOMS, MAX_EXPLICIT_PARTITIONS, MAX_SOURCE_RECORDS } from './semantic.mjs';

export const PAGINATION_LIMITS = Object.freeze({ atoms: MAX_SEMANTIC_ATOMS, probes: 4000, cards: MAX_EXPLICIT_PARTITIONS });

function isMeasurement(value) {
  return value && Array.isArray(value.overflow) && value.overflow.every(item => typeof item === 'string');
}

/**
 * Finite, greedy packing of semantic groups. The adapter must measure the real
 * fixed-size document in screen AND print media; this module never estimates
 * height, rewrites source, shrinks type, or moves content across a partition.
 */
export async function paginateSemanticDocument(document, { measure, checkpoint = () => {}, checkBudget = () => {}, limits = PAGINATION_LIMITS, balanceTail = false } = {}) {
  if (typeof balanceTail !== 'boolean') throw new Md2CardError('INVALID_OPTIONS', 'balanceTail must be a boolean.');
  if (typeof measure !== 'function') throw new Md2CardError('PAGINATION_MEASUREMENT', 'Automatic pagination requires a browser measurement adapter.');
  for (const name of ['atoms', 'probes', 'cards']) {
    if (!Number.isInteger(limits[name]) || limits[name] < 1 || limits[name] > PAGINATION_LIMITS[name]) {
      throw new Md2CardError('PAGINATION_BUDGET', `Invalid pagination ${name} budget.`, { limit: PAGINATION_LIMITS[name] });
    }
  }
  if (document.atoms.length > limits.atoms) throw new Md2CardError('PAGINATION_BUDGET', 'Automatic pagination exceeds 2,000 semantic atoms. Split the input into smaller documents.', { atoms: document.atoms.length, limit: limits.atoms });
  const pages = [];
  const cards = [];
  let probes = 0;
  const probe = async (partition, atoms, index = cards.length + 1, count = index) => {
    checkpoint();
    if (count > limits.cards) throw new Md2CardError('PAGINATION_BUDGET', 'Automatic pagination exceeds 200 cards. Split the input or increase the canvas size.', { cards: count, limit: limits.cards });
    checkBudget(count);
    if (probes >= limits.probes) throw new Md2CardError('PAGINATION_BUDGET', 'Automatic pagination reached its finite browser-measurement budget. Split the input into smaller documents.', { probes, limit: limits.probes });
    probes++;
    const card = renderSemanticCard(document, partition, atoms, index);
    const measurements = await measure(card);
    checkpoint();
    if (!isMeasurement(measurements?.screen) || !isMeasurement(measurements?.print)) throw new Md2CardError('PAGINATION_MEASUREMENT', 'The browser did not return both screen and print overflow measurements. No exports were produced.');
    return { card, measurements, fits: !measurements.screen.overflow.length && !measurements.print.overflow.length };
  };
  const oversized = (partition, group, result) => {
    throw new Md2CardError('PAGINATION_ATOMIC_OVERFLOW', `An indivisible ${group.atoms.map(atom => atom.kind).join(' + ') || 'empty-card frame'} does not fit on a fresh card near source line ${result.card.sourceLines[0]}. Increase the canvas size or explicitly edit this block; no text was shrunk or rewritten.`, {
      partitionIndex: partition.index, groupId: group.id, atomIds: group.atoms.map(atom => atom.id), sourceLines: result.card.sourceLines,
      screen: result.measurements.screen, print: result.measurements.print,
      guidance: 'Keep the original input. Increase dimensions, choose manual pagination with explicit edits, or ask permission to shorten the affected block. Code, quotes, images, paragraphs, list items, table rows and heading groups are never cut internally.'
    }, 2);
  };
  const commit = (partition, groups, result) => {
    cards.push(result.card);
    pages.push({ partition, groups, ...result });
  };
  for (const partition of document.partitions) {
    checkpoint();
    let current = [], currentGroups = [], accepted;
    if (!partition.groups.length) {
      const result = await probe(partition, []);
      if (!result.fits) oversized(partition, { id: `${partition.index}:empty`, atoms: [] }, result);
      commit(partition, [], result);
      continue;
    }
    for (const group of partition.groups) {
      const candidate = [...current, ...group.atoms];
      let result = await probe(partition, candidate);
      if (!result.fits && current.length) {
        // Exactly one fallback: commit the accepted prefix and try the unchanged
        // group on a fresh card. There is no recursive splitting or retry loop.
        commit(partition, currentGroups, accepted);
        current = [];
        currentGroups = [];
        result = await probe(partition, group.atoms);
      }
      if (!result.fits) oversized(partition, group, result);
      current = [...current, ...group.atoms];
      currentGroups = [...currentGroups, group];
      accepted = result;
    }
    // Explicit === boundaries terminate a card even when the next would fit.
    if (accepted) commit(partition, currentGroups, accepted);
  }
  const greedyProbes = probes;
  const balance = balanceTail ? await balanceSemanticTails(document, pages, {
    probe, remainingProbes: () => limits.probes - probes, checkpoint
  }) : balanceManifest(false);
  if (balanceTail) cards.splice(0, cards.length, ...pages.map(page => page.card));
  checkpoint();
  const validation = { status: 'pass', ...validateSemanticCoverage(document, cards) };
  return { cards, pagination: { ...semanticManifest(document, cards), mode: 'auto', algorithm: balanceTail ? 'greedy-semantic-browser-tail-v1' : 'greedy-semantic-browser-v1', probes, greedyProbes, balance, limits: { ...limits, explicitPartitions: MAX_EXPLICIT_PARTITIONS, sourceRecords: MAX_SOURCE_RECORDS }, validation } };
}
