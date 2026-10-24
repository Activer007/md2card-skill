import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSemanticDocument, validateSemanticCoverage } from '../scripts/semantic.mjs';
import { paginateSemanticDocument, PAGINATION_LIMITS } from '../scripts/pagination.mjs';
import { parseOptions } from '../scripts/render.mjs';
import { measureCards } from '../scripts/browser.mjs';

// These tests execute semantic packing and a fake measurement adapter only.
// No browser is opened, installed, or used by this suite.
const paragraphs = (count, prefix = 'paragraph') => Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`).join('\n\n');
const counts = result => result.cards.map(card => card.provenance.atomIds.length);
const snapshot = result => result.cards.map(card => ({ ...card, provenance: structuredClone(card.provenance) }));
const medium = (height, { available = 5, overflow = [], used = 5 } = {}) => ({
  available: { width: 500, height: available },
  occupied: { height },
  // scrollHeight is at least clientHeight on an underfilled content box. It is
  // retained for overflow diagnosis, never as occupied-content geometry.
  used: { width: 500, height: used },
  overflow
});
const pair = (screen, print = screen) => ({ screen, print: structuredClone(print) });
const sized = (capacity = 5) => async card => {
  const count = card.provenance.atomIds.length;
  return pair(medium(count, { available: capacity, overflow: count > capacity ? ['content-height'] : [] }));
};
const firstAtom = card => card.provenance.atomIds[0];
const hasFirst = card => /-a1$/.test(firstAtom(card) ?? '');
const six = () => parseSemanticDocument(paragraphs(6));
const assertPreserved = (result, baseline) => {
  assert.deepEqual(snapshot(result), snapshot(baseline));
  assert.equal(result.pagination.validation.status, 'pass');
  assert.equal(result.pagination.balance.enabled, true);
  assert.equal(typeof result.pagination.balance.outcome, 'string');
};
const assertCoverage = (document, result) => {
  assert.equal(validateSemanticCoverage(document, result.cards).valid, true);
  assert.deepEqual(result.cards.flatMap(card => card.provenance.atomIds), document.atoms.map(atom => atom.id));
  assert.deepEqual(result.cards.map(card => card.index), result.cards.map((_, index) => index + 1));
};

test('tail balancing is an explicit auto-only CLI option', () => {
  assert.equal(parseOptions(['input.md']).balanceTail, false);
  assert.equal(parseOptions(['input.md', '--paginate', 'auto']).balanceTail, false);
  assert.equal(parseOptions(['input.md', '--paginate', 'auto', '--balance-tail']).balanceTail, true);
  assert.equal(parseOptions(['input.md', '--balance-tail', '--paginate', 'auto']).balanceTail, true);
  for (const args of [
    ['input.md', '--balance-tail'],
    ['input.md', '--paginate', 'manual', '--balance-tail'],
    ['input.md', '--template', 'T01', '--balance-tail']
  ]) assert.throws(() => parseOptions(args), { code: 'INVALID_OPTIONS' });
  assert.throws(() => parseOptions(['input.md', '--template', 'T01', '--paginate', 'auto', '--balance-tail']), { code: 'PAGINATION_UNSUPPORTED_METADATA' });
});

test('default and explicit-false pagination preserve the original greedy contract', async () => {
  const document = six();
  let calls = 0;
  const overflowOnly = async card => {
    calls++;
    const overflow = card.provenance.atomIds.length > 5 ? ['content-height'] : [];
    return { screen: { overflow }, print: { overflow } };
  };
  const implicit = await paginateSemanticDocument(document, { measure: overflowOnly });
  assert.equal(calls, 7);
  const explicit = await paginateSemanticDocument(document, { measure: overflowOnly, balanceTail: false });
  assert.equal(calls, 14);
  assert.deepEqual(implicit, explicit);
  assert.deepEqual(counts(implicit), [5, 1]);
  assert.equal(implicit.pagination.algorithm, 'greedy-semantic-browser-v1');
  assert.equal(implicit.pagination.probes, 7);
  assert.equal(implicit.pagination.balance?.enabled ?? false, false);
  assertCoverage(document, implicit);
});

test('six equal groups balance a five-line/one-line tail into three/three', async () => {
  const document = six();
  const result = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
  assert.deepEqual(counts(result), [3, 3]);
  assert.equal(result.pagination.algorithm, 'greedy-semantic-browser-tail-v1');
  assert.equal(result.pagination.balance.enabled, true);
  assert.equal(result.pagination.balance.algorithm, 'bounded-tail-groups-v1');
  assert.equal(result.pagination.balance.appliedPartitions, 1);
  assert.equal(result.pagination.balance.attempts, 2);
  assert.equal(result.pagination.balance.outcome, 'improved');
  assert.equal(result.pagination.balance.fallback, null);
  assert.equal(result.pagination.balance.probes, result.pagination.balance.attempts * 2);
  assert.equal(result.pagination.probes, 7 + result.pagination.balance.probes);
  assert.equal(result.pagination.balance.partitions.length, 1);
  const [record] = result.pagination.balance.partitions;
  assert.equal(record.partitionIndex, 1);
  assert.deepEqual(record.cardIndexes, [1, 2]);
  assert.equal(record.outcome, 'improved');
  assert.equal(record.termination, 'balanced');
  assert.equal(record.fallback, null);
  assert.deepEqual(record.movedGroupIds, ['p1-g4', 'p1-g5']);
  assert.equal(record.candidates.filter(candidate => candidate.outcome === 'selected').length, 1);
  for (const media of ['screen', 'print']) {
    assert.deepEqual(record.before[media], { left: 1, right: 0.2, gap: 0.8 });
    assert.deepEqual(record.after[media], { left: 0.6, right: 0.6, gap: 0 });
  }
  assertCoverage(document, result);
  // The original IR is unchanged and can still produce its greedy result.
  assert.deepEqual(counts(await paginateSemanticDocument(document, { measure: sized() })), [5, 1]);
});

test('occupied geometry, not full-box scrollHeight, determines tail utilization', async () => {
  const document = six();
  const result = await paginateSemanticDocument(document, {
    balanceTail: true,
    measure: async card => {
      const count = card.provenance.atomIds.length;
      return pair(medium(count, { overflow: count > 5 ? ['content-height'] : [], used: 999 }));
    }
  });
  assert.deepEqual(counts(result), [3, 3]);
  assertCoverage(document, result);
});

test('only the last pair in each partition changes, with global order and page count intact', async () => {
  const document = parseSemanticDocument(`${paragraphs(11, 'left')}\n\n===\n\n${paragraphs(6, 'right')}`);
  const baseline = await paginateSemanticDocument(document, { measure: sized() });
  const result = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
  assert.deepEqual(counts(baseline), [5, 5, 1, 5, 1]);
  assert.deepEqual(counts(result), [5, 3, 3, 3, 3]);
  assert.deepEqual(result.cards[0], baseline.cards[0]);
  assert.deepEqual(result.cards.map(card => card.provenance.partitionIndex), [1, 1, 1, 2, 2]);
  assert.equal(result.cards.length, baseline.cards.length);
  assert.equal(result.pagination.balance.appliedPartitions, 2);
  assertCoverage(document, result);
});

test('single-page and source-only explicit partitions never lend groups to neighbors', async () => {
  const document = parseSemanticDocument(`${paragraphs(5)}\n\n===\n\nonly one\n\n===\n\n[ref]: https://example.test\n\n===\n\n${paragraphs(6, 'last')}`);
  const result = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
  assert.deepEqual(counts(result), [5, 1, 0, 3, 3]);
  assert.deepEqual(result.cards.map(card => card.provenance.partitionIndex), [1, 2, 3, 4, 4]);
  assert.equal(result.cards[2].html, '');
  assert.equal(result.pagination.balance.appliedPartitions, 1);
  assertCoverage(document, result);
});

test('heading chains move only with their following indivisible atom', async () => {
  const document = parseSemanticDocument('intro\n\n# Heading\n\n## Subheading\n\nbody\n\nafter\n\ntail');
  const result = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
  assert.deepEqual(counts(result), [4, 2]);
  assert.match(result.cards[0].html, /<h1>Heading<\/h1>\n<h2>Subheading<\/h2>\n<p>body<\/p>/);
  const chain = document.partitions[0].groups.find(group => group.atoms.length === 3);
  assert.ok(chain);
  assert.ok(result.cards.some(card => chain.atomIds.every(id => card.provenance.atomIds.includes(id))));
  assertCoverage(document, result);
});

test('a one-group penultimate page cannot be emptied to improve an underfilled tail', async () => {
  const document = parseSemanticDocument('# One\n\n## Two\n\n### Three\n\n#### Four\n\nbody\n\ntail');
  const baseline = await paginateSemanticDocument(document, { measure: sized() });
  assert.deepEqual(counts(baseline), [5, 1]);
  const result = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
  assertPreserved(result, baseline);
  assert.equal(result.pagination.balance.probes, 0);
  assert.ok(result.cards.every(card => card.provenance.atomIds.length > 0));
});

test('code, quotes, multiline paragraphs and nested list items remain indivisible', async () => {
  const document = parseSemanticDocument('first\n\n```txt\ncode line 1\n\ncode line 2\n```\n\n> quoted first\n>\n> quoted second\n\nlong paragraph\ncontinued paragraph\n\n- outer item\n  - nested item\n    continuation\n\nlast');
  assert.equal(document.atoms.length, 6);
  const result = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
  assert.deepEqual(counts(result), [3, 3]);
  assert.match(result.cards[0].html, /code line 1\n\ncode line 2/);
  assert.match(result.cards[0].html, /<blockquote>[\s\S]*quoted first[\s\S]*quoted second[\s\S]*<\/blockquote>/);
  assert.match(result.cards[1].html, /long paragraph\ncontinued paragraph/);
  assert.match(result.cards[1].html, /outer item[\s\S]*nested item[\s\S]*continuation/);
  assertCoverage(document, result);
});

test('balanced ordered-list fragments retain original starts and exact-once list items', async () => {
  const document = parseSemanticDocument(Array.from({ length: 6 }, (_, index) => `${index + 7}. ordered item ${index + 1}`).join('\n'));
  const result = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
  assert.deepEqual(counts(result), [3, 3]);
  assert.match(result.cards[0].html, /^<ol start="7">/);
  assert.match(result.cards[1].html, /^<ol start="10">/);
  for (let index = 1; index <= 6; index++) assert.equal(result.cards.reduce((sum, card) => sum + Number(card.html.includes(`ordered item ${index}`)), 0), 1);
  assertCoverage(document, result);
});

test('balanced table fragments repeat attributed headers without duplicating body rows', async () => {
  const document = parseSemanticDocument('| Name | Value |\n| --- | --- |\n' + Array.from({ length: 6 }, (_, index) => `| row ${index + 1} | ${index + 11} |`).join('\n'));
  const result = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
  assert.deepEqual(counts(result), [3, 3]);
  for (const card of result.cards) {
    assert.equal((card.html.match(/<thead>/g) ?? []).length, 1);
    assert.match(card.html, /<th>Name<\/th>[\s\S]*<th>Value<\/th>/);
    assert.equal(card.provenance.headers.length, 1);
  }
  assert.equal(result.cards[0].provenance.repeatedHeaders.length, 0);
  assert.equal(result.cards[1].provenance.repeatedHeaders.length, 1);
  for (let index = 1; index <= 6; index++) assert.equal(result.cards.reduce((sum, card) => sum + Number(card.html.includes(`row ${index}`)), 0), 1);
  assertCoverage(document, result);
});

test('print-only overflow vetoes candidates that would otherwise balance the tail', async () => {
  const document = six();
  const measure = async card => {
    const count = card.provenance.atomIds.length;
    const screen = medium(count, { overflow: count > 5 ? ['content-height'] : [] });
    const print = medium(count, { overflow: count > 5 || (!hasFirst(card) && count > 1) ? ['content-height'] : [] });
    return pair(screen, print);
  };
  const baseline = await paginateSemanticDocument(document, { measure });
  const result = await paginateSemanticDocument(document, { measure, balanceTail: true });
  assertPreserved(result, baseline);
  assert.ok(result.pagination.balance.attempts > 0);
  assert.equal(result.pagination.balance.appliedPartitions, 0);
});

test('improvement must occur independently in print as well as screen', async () => {
  const document = six();
  const measure = async card => {
    const count = card.provenance.atomIds.length;
    const overflow = count > 5 ? ['content-height'] : [];
    return pair(medium(count, { overflow }), medium(hasFirst(card) ? 5 : 1, { overflow }));
  };
  const baseline = await paginateSemanticDocument(document, { measure });
  const result = await paginateSemanticDocument(document, { measure, balanceTail: true });
  assertPreserved(result, baseline);
  assert.ok(result.pagination.balance.attempts > 0);
  assert.equal(result.pagination.balance.appliedPartitions, 0);
});

test('a smaller absolute gap cannot be accepted if tail utilization decreases', async () => {
  const document = six();
  const measure = async card => {
    const count = card.provenance.atomIds.length;
    const occupied = hasFirst(card) ? (count === 5 ? 5 : 0.5) : (count === 1 ? 1 : 0.75);
    return pair(medium(occupied, { overflow: count > 5 ? ['content-height'] : [] }));
  };
  const baseline = await paginateSemanticDocument(document, { measure });
  const result = await paginateSemanticDocument(document, { measure, balanceTail: true });
  assertPreserved(result, baseline);
  assert.equal(result.pagination.balance.appliedPartitions, 0);
});

test('five percentage points is the per-medium minimum improvement, not just any improvement', async () => {
  for (const [improvement, expectedApplied] of [[0.05, 1], [0.049, 0]]) {
    const document = six();
    const measure = async card => {
      const count = card.provenance.atomIds.length;
      const utilization = hasFirst(card) ? (count === 5 ? 1 : 1.04 - improvement) : (count === 1 ? 0.2 : 0.24);
      return pair(medium(utilization * 5, { overflow: count > 5 ? ['content-height'] : [] }));
    };
    const result = await paginateSemanticDocument(document, { measure, balanceTail: true });
    assert.equal(result.pagination.balance.appliedPartitions, expectedApplied, `improvement ${improvement}`);
    if (!expectedApplied) assert.deepEqual(counts(result), [5, 1]);
    assertCoverage(document, result);
  }
});

test('tail eligibility checks the utilization and gap thresholds in both media', async () => {
  for (const [name, screenBase, printBase, eligible] of [
    ['inclusive boundary', [0.6, 0.35], [0.6, 0.35], true],
    ['screen tail too full', [0.9, 0.3501], [1, 0.2], false],
    ['print tail too full', [1, 0.2], [0.9, 0.3501], false],
    ['screen gap too small', [0.5999, 0.35], [1, 0.2], false],
    ['print gap too small', [1, 0.2], [0.5999, 0.35], false]
  ]) {
    const document = six();
    const one = (card, baseline) => {
      const count = card.provenance.atomIds.length;
      const utilization = hasFirst(card) && count === 5 ? baseline[0] : (!hasFirst(card) && count === 1 ? baseline[1] : 0.45);
      return medium(utilization * 5, { overflow: count > 5 ? ['content-height'] : [] });
    };
    const result = await paginateSemanticDocument(document, { balanceTail: true, measure: async card => pair(one(card, screenBase), one(card, printBase)) });
    assert.equal(result.pagination.balance.appliedPartitions, Number(eligible), name);
    if (!eligible) {
      assert.deepEqual(counts(result), [5, 1], name);
      assert.equal(result.pagination.balance.attempts, 0, name);
    }
    assertCoverage(document, result);
  }
});

test('missing or malformed occupied geometry preserves greedy output and records a fallback', async () => {
  const mutations = [
    ['missing occupied', value => { delete value.occupied; }],
    ['null occupied', value => { value.occupied = null; }],
    ['missing height', value => { delete value.occupied.height; }],
    ['negative height', value => { value.occupied.height = -1; }],
    ['string height', value => { value.occupied.height = '1'; }],
    ['NaN height', value => { value.occupied.height = NaN; }],
    ['infinite height', value => { value.occupied.height = Infinity; }],
    ['missing available', value => { delete value.available; }],
    ['zero available height', value => { value.available.height = 0; }],
    ['negative available width', value => { value.available.width = -1; }],
    ['infinite available width', value => { value.available.width = Infinity; }],
    ['string available height', value => { value.available.height = '5'; }]
  ];
  for (const [name, mutate] of mutations) {
    const document = six();
    const measure = async card => {
      const result = await sized()(card);
      mutate(result.print);
      return result;
    };
    const baseline = await paginateSemanticDocument(document, { measure });
    const result = await paginateSemanticDocument(document, { measure, balanceTail: true });
    assertPreserved(result, baseline);
    assert.equal(result.pagination.balance.attempts, 0, name);
    assert.equal(result.pagination.balance.probes, 0, name);
    assert.equal(result.pagination.balance.appliedPartitions, 0, name);
    assert.ok(result.pagination.balance.fallback, name);
    assert.match(JSON.stringify(result.pagination.balance), /geometry|measurement/i, name);
  }
});

test('optional balancing never raises the existing hard budgets', () => {
  assert.deepEqual(PAGINATION_LIMITS, { atoms: 2000, probes: 4000, cards: 200 });
});

test('zero or one remaining probe cannot starve greedy or start an incomplete candidate pair', async () => {
  for (const probes of [7, 8]) {
    const document = six();
    const baseline = await paginateSemanticDocument(document, { measure: sized() });
    const result = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true, limits: { ...PAGINATION_LIMITS, probes } });
    assertPreserved(result, baseline);
    assert.equal(result.pagination.probes, 7);
    assert.equal(result.pagination.balance.probes, 0);
    assert.equal(result.pagination.balance.attempts, 0);
    assert.match(JSON.stringify(result.pagination.balance), /budget|probe/i);
  }
});

test('all partitions complete greedy packing before optional probes spend shared budget', async () => {
  const document = parseSemanticDocument(`${paragraphs(6, 'first')}\n\n===\n\n${paragraphs(6, 'second')}`);
  const baseline = await paginateSemanticDocument(document, { measure: sized() });
  const calls = [];
  const result = await paginateSemanticDocument(document, {
    balanceTail: true, limits: { ...PAGINATION_LIMITS, probes: 14 },
    measure: async card => { calls.push(card.provenance.partitionIndex); return sized()(card); }
  });
  assertPreserved(result, baseline);
  assert.deepEqual(calls, [...Array(7).fill(1), ...Array(7).fill(2)]);
  assert.deepEqual(counts(result), [5, 1, 5, 1]);
  assert.equal(result.pagination.probes, 14);
  assert.equal(result.pagination.balance.probes, 0);
});

test('candidate probes use existing page indexes and respect a final-card-count budget', async () => {
  const document = six();
  const seenBudgets = [];
  let calls = 0;
  const result = await paginateSemanticDocument(document, {
    balanceTail: true, limits: { ...PAGINATION_LIMITS, cards: 2 },
    checkBudget: count => { seenBudgets.push(count); assert.ok(count <= 2); },
    measure: async card => {
      calls++;
      if (calls > 7) assert.ok(card.index === 1 || card.index === 2);
      return sized()(card);
    }
  });
  assert.deepEqual(counts(result), [3, 3]);
  assert.equal(Math.max(...seenBudgets), 2);
  assertCoverage(document, result);
});

test('balancing is bounded to eight candidate pairs per partition and sixty-four probes per run', async () => {
  const document = parseSemanticDocument(Array.from({ length: 9 }, (_, index) => paragraphs(11, `partition ${index + 1}`)).join('\n\n===\n\n'));
  const greedyCalls = [];
  const baseline = await paginateSemanticDocument(document, { measure: async card => { greedyCalls.push({ index: card.index, ids: card.provenance.atomIds }); return sized(10)(card); } });
  const calls = [];
  const result = await paginateSemanticDocument(document, { balanceTail: true, measure: async card => { calls.push({ index: card.index, ids: card.provenance.atomIds }); return sized(10)(card); } });
  assert.deepEqual(calls.slice(0, greedyCalls.length), greedyCalls);
  const extra = calls.slice(greedyCalls.length);
  assert.equal(extra.length, result.pagination.balance.probes);
  assert.equal(extra.length, 64);
  assert.equal(extra.length % 2, 0);
  const probesByPartition = new Map();
  for (const call of extra) {
    const partition = call.ids[0].split('-')[0];
    probesByPartition.set(partition, (probesByPartition.get(partition) ?? 0) + 1);
    assert.ok(call.ids.length > 0);
  }
  assert.ok([...probesByPartition.values()].every(probes => probes <= 16));
  assert.equal(result.pagination.balance.attempts, 32);
  assert.deepEqual(result.pagination.balance.partitions.map(record => record.attempts), [8, 8, 8, 8, 0, 0, 0, 0, 0]);
  assert.ok(result.pagination.balance.partitions.slice(0, 4).every(record => record.termination === 'candidate-limit'));
  assert.ok(result.pagination.balance.partitions.slice(4).every(record => record.fallback === 'probe-budget'));
  assert.equal(result.pagination.balance.probes, result.pagination.balance.attempts * 2);
  assert.equal(result.cards.length, baseline.cards.length);
  assert.ok(result.pagination.probes <= PAGINATION_LIMITS.probes);
  assertCoverage(document, result);
});

test('deadline, resource, and adapter failures during optional work propagate unchanged', async () => {
  for (const fault of ['checkpoint', 'checkBudget', 'measure']) {
    const document = six();
    const marker = new Error(`optional ${fault} failure`);
    let calls = 0;
    let optionalStarted = false;
    await assert.rejects(() => paginateSemanticDocument(document, {
      balanceTail: true,
      checkpoint: () => { if (fault === 'checkpoint' && optionalStarted) throw marker; },
      checkBudget: () => { if (fault === 'checkBudget' && calls >= 7) throw marker; },
      measure: async card => {
        calls++;
        if (calls > 7) {
          optionalStarted = true;
          if (fault === 'measure') throw marker;
        }
        return sized()(card);
      }
    }), error => error === marker, fault);
    assert.ok(calls >= 7, fault);
  }
});

test('invalid screen/print overflow envelopes still fail closed rather than silently skipping balancing', async () => {
  const document = six();
  let calls = 0;
  await assert.rejects(() => paginateSemanticDocument(document, {
    balanceTail: true,
    measure: async card => {
      calls++;
      if (calls > 7) return { screen: { overflow: 'not-an-array' }, print: medium(1) };
      return sized()(card);
    }
  }), { code: 'PAGINATION_MEASUREMENT' });
  assert.ok(calls > 7);
});

// Exercise the adapter's DOM callback with plain objects, not Chromium. The
// content box is 700px high but its rendered descendants end only 150px below
// its top, a situation for which scrollHeight cannot measure occupancy.
test('browser measurement reports occupied descendants separately from scroll dimensions', async () => {
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const element = (tagName, bounds, children = []) => ({
    tagName,
    clientWidth: bounds.width,
    clientHeight: bounds.height,
    scrollWidth: bounds.width,
    scrollHeight: bounds.height,
    children,
    getBoundingClientRect: () => bounds,
    getClientRects: () => [bounds],
    querySelectorAll: () => children
  });
  const descendants = [element('P', rect(20, 40, 300, 40)), element('P', rect(20, 140, 300, 30))];
  const content = element('SECTION', rect(20, 20, 500, 700), descendants);
  const footer = element('FOOTER', rect(20, 740, 500, 30));
  const card = element('ARTICLE', rect(0, 0, 540, 800));
  card.querySelector = selector => selector === '.card-content' ? content : footer;
  const page = { locator: selector => {
    assert.equal(selector, '.card');
    return { evaluateAll: async callback => callback([card]) };
  } };
  const [result] = await measureCards(page);
  assert.deepEqual(result.available, { width: 500, height: 700 });
  assert.equal(result.used.height, 700);
  assert.equal(result.occupied.height, 150);
  assert.deepEqual(result.overflow, []);
});

test('missing fitting-candidate geometry rolls back an earlier viable move for the whole partition', async () => {
  for (const invalid of ['missing', 'negative', 'canvas-change']) {
    const document = six();
    const baseline = await paginateSemanticDocument(document, { measure: sized() });
    let calls = 0;
    const result = await paginateSemanticDocument(document, {
      balanceTail: true,
      measure: async card => {
        calls++;
        const result = await sized()(card);
        // Greedy uses seven probes. The first candidate (4/2) is valid; the
        // next candidate's left page has unusable geometry. Its right page
        // must still be measured before rejecting the whole optional pair.
        if (calls === 10) {
          if (invalid === 'missing') delete result.print.occupied;
          if (invalid === 'negative') result.screen.occupied.height = -1;
          if (invalid === 'canvas-change') result.print.available.width += 2;
        }
        return result;
      }
    });
    assertPreserved(result, baseline);
    assert.equal(calls, 11, invalid);
    assert.equal(result.pagination.balance.attempts, 2, invalid);
    assert.equal(result.pagination.balance.probes, 4, invalid);
    assert.equal(result.pagination.balance.appliedPartitions, 0, invalid);
    const [record] = result.pagination.balance.partitions;
    assert.equal(record.candidates[0].outcome, 'viable', invalid);
    assert.equal(record.fallback, invalid === 'missing' ? 'geometry-unavailable' : 'geometry-invalid', invalid);
    assert.deepEqual(record.after, record.before, invalid);
    assert.deepEqual(record.movedGroupIds, [], invalid);
  }
});

test('an overflowing later candidate is unusable but does not discard an earlier verified improvement', async () => {
  const document = six();
  let calls = 0;
  const result = await paginateSemanticDocument(document, {
    balanceTail: true,
    measure: async card => {
      calls++;
      const result = await sized()(card);
      // First candidate (4/2) is a verified improvement. All later candidates
      // overflow in print; overflowing geometry is not a fitting-page witness.
      if (calls >= 10) {
        result.print.overflow = ['content-height'];
        delete result.print.occupied;
      }
      return result;
    }
  });
  assert.deepEqual(counts(result), [4, 2]);
  assert.equal(result.pagination.balance.appliedPartitions, 1);
  assert.equal(result.pagination.balance.attempts, 4);
  assert.equal(result.pagination.balance.probes, 8);
  assert.equal(calls, 15);
  const [record] = result.pagination.balance.partitions;
  assert.equal(record.candidates[0].outcome, 'selected');
  assert.ok(record.candidates.slice(1).every(candidate => candidate.outcome === 'overflow'));
  assertCoverage(document, result);
});

test('a verified candidate can be applied when the shared budget ends before further search', async () => {
  const document = six();
  const result = await paginateSemanticDocument(document, {
    balanceTail: true, measure: sized(), limits: { ...PAGINATION_LIMITS, probes: 10 }
  });
  assert.deepEqual(counts(result), [4, 2]);
  assert.equal(result.pagination.probes, 9);
  assert.equal(result.pagination.balance.probes, 2);
  assert.equal(result.pagination.balance.attempts, 1);
  assert.equal(result.pagination.balance.appliedPartitions, 1);
  assert.equal(result.pagination.balance.partitions[0].termination, 'probe-budget');
  assertCoverage(document, result);
});

test('all optional probes move complete original suffix groups and measure both page indexes', async () => {
  const document = parseSemanticDocument('intro\n\n# Heading\n\n## Subheading\n\nbody\n\nafter\n\ntail');
  const baseline = await paginateSemanticDocument(document, { measure: sized() });
  const calls = [];
  const result = await paginateSemanticDocument(document, { balanceTail: true, measure: async card => { calls.push(card); return sized()(card); } });
  const optional = calls.slice(baseline.pagination.probes);
  assert.ok(optional.length > 0);
  assert.equal(optional.length % 2, 0);
  for (let offset = 0; offset < optional.length; offset += 2) {
    const left = optional[offset], right = optional[offset + 1];
    assert.deepEqual([left.index, right.index], [1, 2]);
    assert.ok(left.provenance.atomIds.length > 0 && right.provenance.atomIds.length > 0);
    assert.deepEqual([...left.provenance.atomIds, ...right.provenance.atomIds], document.atoms.map(atom => atom.id));
    for (const group of document.partitions[0].groups) {
      assert.ok([left, right].some(card => group.atomIds.every(id => card.provenance.atomIds.includes(id))));
    }
    assert.ok(left.provenance.atomIds.length < baseline.cards[0].provenance.atomIds.length);
  }
  assertCoverage(document, result);
});

test('image atoms and link destinations transfer unchanged without re-resolving assets', async () => {
  const asset = { dataUrl: 'data:image/png;base64,AQID', hash: 'fake', mime: 'image/png', width: 2, height: 3, bytes: 3 };
  let resolutions = 0;
  const document = parseSemanticDocument('first\n\nsecond\n\nthird\n\n![original alt](local.png "image title")\n\n[original label](https://example.test/path "link title")\n\nlast', {
    resolveImage: reference => { resolutions++; assert.equal(reference, 'local.png'); return asset; }
  });
  assert.equal(document.atoms.length, 6);
  const result = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
  assert.deepEqual(counts(result), [3, 3]);
  assert.equal(resolutions, 1);
  assert.match(result.cards[1].html, /<img src="data:image\/png;base64,AQID" alt="original alt" title="image title"/);
  assert.match(result.cards[1].html, /<a href="https:\/\/example.test\/path" title="link title"[^>]*>original label<\/a>/);
  assertCoverage(document, result);
});

test('a deterministic measurement adapter produces identical repeated balanced results', async () => {
  const document = six();
  const first = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
  const second = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
  assert.deepEqual(second, first);
});

test('direct paginator calls reject nonboolean balanceTail before attempting measurement', async () => {
  const document = six();
  for (const balanceTail of [null, 0, 1, 'true', 'false', [], {}]) {
    await assert.rejects(() => paginateSemanticDocument(document, {
      balanceTail, measure: async () => assert.fail('invalid balanceTail must fail before measurement')
    }), { code: 'INVALID_OPTIONS' });
  }
});

test('opting in never splits, shrinks, or retries an oversized original atom', async () => {
  const document = parseSemanticDocument('A single indivisible paragraph\ncontinues here without a paragraph break.');
  const originalSource = document.source;
  let calls = 0;
  await assert.rejects(() => paginateSemanticDocument(document, {
    balanceTail: true,
    measure: async card => {
      calls++;
      assert.deepEqual(card.provenance.atomIds, ['p1-a1']);
      assert.match(card.html, /A single indivisible paragraph\ncontinues here/);
      return pair(medium(6, { overflow: ['content-height'] }));
    }
  }), error => {
    assert.equal(error.code, 'PAGINATION_ATOMIC_OVERFLOW');
    assert.equal(error.exitCode, 2);
    assert.deepEqual(error.details.atomIds, ['p1-a1']);
    assert.deepEqual(error.details.sourceLines, [1, 2]);
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(document.source, originalSource);
  assert.equal(document.atoms.length, 1);
});

test('tail balancing retains the auto-layout allowlist and every partition layout', async () => {
  for (const layout of ['explainer', 'steps']) {
    const document = parseSemanticDocument(`<!-- card: {"layout":"${layout}"} -->\n\n${paragraphs(6)}`);
    const result = await paginateSemanticDocument(document, { measure: sized(), balanceTail: true });
    assert.deepEqual(counts(result), [3, 3]);
    assert.ok(result.cards.every(card => card.metadata.layout === layout));
    assertCoverage(document, result);
  }
  for (const metadata of [
    { layout: 'cover' },
    { layout: 'quote' },
    { layout: 'explainer', source: 'not supported in auto' },
    { layout: 'steps', eyebrow: 'not supported in auto' }
  ]) {
    assert.throws(() => parseSemanticDocument(`<!-- card: ${JSON.stringify(metadata)} -->\n\n${paragraphs(6)}`), {
      code: Object.keys(metadata).length > 1 ? 'PAGINATION_UNSUPPORTED_METADATA' : 'PAGINATION_UNSUPPORTED_LAYOUT'
    });
  }
});
