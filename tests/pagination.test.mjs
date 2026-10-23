import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseSemanticDocument } from '../scripts/semantic.mjs';
import { paginateSemanticDocument, PAGINATION_LIMITS } from '../scripts/pagination.mjs';
import { parseOptions, exportCards, countDocumentAssets } from '../scripts/render.mjs';
import { buildDocument } from '../scripts/document.mjs';

const measurement = (overflow = []) => ({ index: 1, available: { width: 500, height: 700 }, used: { width: 300, height: 300 }, overflow });
const pair = (screen = [], print = screen) => ({ screen: measurement(screen), print: measurement(print) });
const accepts = capacity => async card => pair(card.provenance.atomIds.length > capacity ? ['content-height'] : []);

test('pagination is opt-in and invalid modes fail', () => {
  assert.equal(parseOptions(['input.md']).paginate, 'manual');
  assert.equal(parseOptions(['input.md', '--paginate', 'manual']).paginate, 'manual');
  assert.equal(parseOptions(['input.md', '--paginate', 'auto']).paginate, 'auto');
  assert.throws(() => parseOptions(['input.md', '--paginate', 'sometimes']), { code: 'INVALID_OPTIONS' });
});

test('greedy packing makes one fresh-page fallback and never merges explicit partitions', async () => {
  const document = parseSemanticDocument('one\n\ntwo\n\nthree\n\n===\n\nfour');
  const result = await paginateSemanticDocument(document, { measure: accepts(2) });
  assert.deepEqual(result.cards.map(card => card.provenance.atomIds.length), [2, 1, 1]);
  assert.deepEqual(result.cards.map(card => card.provenance.partitionIndex), [1, 1, 2]);
  assert.deepEqual(result.cards.map(card => card.index), [1, 2, 3]);
  assert.equal(result.pagination.probes, 5);
  assert.equal(result.pagination.validation.status, 'pass');
});

test('heading chains travel with their following atom without duplication', async () => {
  const document = parseSemanticDocument('intro\n\n# Heading\n\n## Subheading\n\nbody\n\ntail');
  const result = await paginateSemanticDocument(document, { measure: accepts(3) });
  assert.deepEqual(result.cards.map(card => card.provenance.atomIds.length), [1, 3, 1]);
  assert.match(result.cards[1].html, /<h1>Heading<\/h1>\n<h2>Subheading<\/h2>\n<p>body<\/p>/);
});

test('reference-only explicit partitions keep exactly one intentional empty card', async () => {
  const document = parseSemanticDocument('[shared]: https://example.test\n\n===\n\n[Visible][shared]');
  const result = await paginateSemanticDocument(document, { measure: accepts(2) });
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0].html, '');
  assert.deepEqual(result.cards[0].provenance.atomIds, []);
  assert.match(result.cards[1].html, /href="https:\/\/example.test"/);
});

test('print overflow alone moves a group and oversized atoms fail without rewriting', async () => {
  const document = parseSemanticDocument('first\n\nsecond');
  const result = await paginateSemanticDocument(document, { measure: async card => pair([], card.provenance.atomIds.length > 1 ? ['content-height'] : []) });
  assert.equal(result.cards.length, 2);
  let calls = 0;
  await assert.rejects(() => paginateSemanticDocument(document, { measure: async () => { calls++; return pair(['wide-pre']); } }), error => {
    assert.equal(error.code, 'PAGINATION_ATOMIC_OVERFLOW');
    assert.equal(error.exitCode, 2);
    assert.deepEqual(error.details.sourceLines, [1, 1]);
    assert.equal(error.details.atomIds.length, 1);
    return true;
  });
  assert.equal(calls, 1);
});

test('probe, card, atom and external render budgets are finite', async () => {
  const document = parseSemanticDocument('one\n\ntwo\n\nthree');
  await assert.rejects(() => paginateSemanticDocument(document, { measure: accepts(1), limits: { ...PAGINATION_LIMITS, probes: 1 } }), { code: 'PAGINATION_BUDGET' });
  await assert.rejects(() => paginateSemanticDocument(document, { measure: accepts(1), limits: { ...PAGINATION_LIMITS, cards: 1 } }), { code: 'PAGINATION_BUDGET' });
  await assert.rejects(() => paginateSemanticDocument(document, { measure: accepts(1), limits: { ...PAGINATION_LIMITS, atoms: 1 } }), { code: 'PAGINATION_BUDGET' });
  await assert.rejects(() => paginateSemanticDocument(document, { measure: accepts(1), limits: { ...PAGINATION_LIMITS, probes: 0 } }), { code: 'PAGINATION_BUDGET' });
  const marker = new Error('pixel budget');
  await assert.rejects(() => paginateSemanticDocument(document, { measure: accepts(1), checkBudget: count => { if (count === 2) throw marker; } }), error => error === marker);
});

test('invalid measurements and deadline checkpoints fail closed', async () => {
  const document = parseSemanticDocument('one');
  for (const result of [null, { screen: measurement() }, { screen: { overflow: 'no' }, print: measurement() }]) {
    await assert.rejects(() => paginateSemanticDocument(document, { measure: async () => result }), { code: 'PAGINATION_MEASUREMENT' });
  }
  let finished = false;
  const marker = new Error('deadline');
  await assert.rejects(() => paginateSemanticDocument(document, { measure: async () => { finished = true; return pair(); }, checkpoint: () => { if (finished) throw marker; } }), error => error === marker);
});

test('measurement footer reserves the maximum counter but final output uses true count', () => {
  const card = { index: 1, metadata: { layout: 'explainer' }, html: '<p>Body</p>' };
  const options = parseOptions(['input.md']);
  assert.match(buildDocument([card], { ...options, paginationProbe: true }, ''), /200 \/ 200/);
  assert.match(buildDocument([card], options, ''), /1 \/ 1/);
  assert.doesNotMatch(buildDocument([card], options, ''), /200 \/ 200/);
});

test('final asset accounting includes repeated headers and per-page logos', () => {
  const asset = { mime: 'image/png', dataUrl: 'data:image/png;base64,AQID', width: 100, height: 200, bytes: 3 };
  const card = { html: `<table><thead><tr><th><img src="${asset.dataUrl}"></th></tr></thead></table>` };
  const usage = countDocumentAssets([card, card, card], [asset], { logo: asset });
  assert.deepEqual(usage, { occurrences: 6, pixels: 120000, embeddedBytes: 6 * asset.dataUrl.length, loadedBytes: 3 });
  assert.throws(() => countDocumentAssets(Array.from({ length: 7 }, () => ({ html: '' })), [], { logo: { ...asset, width: 4000, height: 4000 } }), { code: 'RENDER_BUDGET' });
});

async function workspace(t, source) {
  const dir = await mkdtemp(path.join(tmpdir(), 'md2card-pagination-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'input.md');
  await writeFile(input, source);
  return { dir, options: parseOptions([input, '--out', path.join(dir, 'output'), '--format', 'html', '--paginate', 'auto']) };
}

function browserFixture({ overflowFinal = false } = {}) {
  let content = '', closes = 0;
  const page = {
    setDefaultTimeout() {},
    async setContent(html) { content = html; },
    async evaluate() {},
    async emulateMedia() {},
    locator: () => ({ evaluateAll: async () => [] })
  };
  return {
    closes: () => closes,
    dependencies: {
      inspectEnvironment: async () => ({ ok: true, checks: [], versions: {}, fonts: {} }),
      openRenderer: async () => ({ page, context: {}, browser: { close: async () => { closes++; }, version: () => 'stub' } }),
      measureCards: async () => [...content.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((match, index) => ({
        ...measurement((match[0].match(/<p>/g) || []).length > 1 || (overflowFinal && !content.includes('200 / 200')) ? ['content-height'] : []), index: index + 1
      }))
    }
  };
}

test('export integration publishes only after pagination and final-deck validation', async t => {
  const { dir, options } = await workspace(t, 'one\n\ntwo\n\nthree');
  const fixture = browserFixture();
  const manifest = await exportCards(options, fixture.dependencies);
  assert.equal(manifest.cardCount, 3);
  assert.equal(manifest.pagination.mode, 'auto');
  assert.equal(manifest.pagination.validation.status, 'pass');
  assert.equal(manifest.budget.cardPixels, 3 * 1080 * 1440);
  assert.equal(fixture.closes(), 1);
  const html = await readFile(path.join(dir, 'output/cards.html'), 'utf8');
  assert.match(html, /3 \/ 3/);
  assert.doesNotMatch(html, /200 \/ 200/);
  assert.equal((html.match(/<p>/g) || []).length, 3);
  assert.deepEqual((await readdir(options.out)).sort(), ['cards.html', 'manifest.json']);
});

test('final exact-count layout is revalidated, not trusted from packing probes', async t => {
  const { options } = await workspace(t, 'one\n\ntwo');
  const fixture = browserFixture({ overflowFinal: true });
  await assert.rejects(() => exportCards(options, fixture.dependencies), { code: 'CONTENT_OVERFLOW' });
  assert.deepEqual(await readdir(options.out), ['overflow.json']);
  assert.equal(fixture.closes(), 1);
});

test('atomic planning errors and unsupported metadata publish no output', async t => {
  const { dir, options } = await workspace(t, 'one');
  const fixture = browserFixture();
  fixture.dependencies.measureCards = async () => [measurement(['content-height'])];
  await assert.rejects(() => exportCards(options, fixture.dependencies), { code: 'PAGINATION_ATOMIC_OVERFLOW' });
  assert.deepEqual(await readdir(dir), ['input.md']);
  assert.equal(fixture.closes(), 1);
  await writeFile(options.input, '<!-- card: {"layout":"explainer","source":"keep this"} -->\n\none');
  await assert.rejects(() => exportCards(options, { openRenderer: async () => assert.fail('unsupported metadata must fail before launch') }), { code: 'PAGINATION_UNSUPPORTED_METADATA' });
});

test('growing output card counts are charged to aggregate pixels before publication', async t => {
  const { dir, options } = await workspace(t, Array.from({ length: 13 }, (_, index) => `paragraph ${index}`).join('\n\n'));
  const fixture = browserFixture();
  await assert.rejects(() => exportCards({ ...options, width: 4096, height: 4096 }, fixture.dependencies), { code: 'RENDER_BUDGET' });
  assert.deepEqual(await readdir(dir), ['input.md']);
  assert.equal(fixture.closes(), 1);
});

test('a stalled automatic probe obeys the shared deadline and cannot publish after a late result', async t => {
  const { dir, options } = await workspace(t, 'one');
  const fixture = browserFixture();
  let resolveMeasurement;
  fixture.dependencies.measureCards = () => new Promise(resolve => { resolveMeasurement = resolve; });
  await assert.rejects(() => exportCards({ ...options, timeoutMs: 1000 }, fixture.dependencies), { code: 'RENDER_TIMEOUT' });
  assert.equal(fixture.closes(), 1);
  assert.deepEqual(await readdir(dir), ['input.md']);
  resolveMeasurement([measurement()]);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(await readdir(dir), ['input.md']);
});
