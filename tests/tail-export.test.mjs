import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseOptions, exportCards } from '../scripts/render.mjs';

// All renderer lifecycle adapters below are in-process fakes. Never launch a
// browser from this source-only test; real artifact acceptance is separately pending.
const source = Array.from({ length: 6 }, (_, index) => `TAIL_${index + 1}`).join('\n\n');
async function workspace(t, text = source) {
  const dir = await mkdtemp(path.join(tmpdir(), 'md2card-tail-export-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'input.md');
  await writeFile(input, text);
  const options = parseOptions([input, '--out', path.join(dir, 'output'), '--format', 'html', '--paginate', 'auto', '--balance-tail']);
  return { dir, options };
}
function fixture({ finalPrintOverflow = false, failBalance, missingGeometry = false } = {}) {
  let content = '', media = 'screen', loads = 0, closes = 0;
  const finalMedia = [];
  const page = {
    setDefaultTimeout() {},
    async setContent(html) { content = html; loads++; },
    async evaluate() {},
    async emulateMedia({ media: next }) { media = next; },
    locator: () => ({ evaluateAll: async () => [] })
  };
  return {
    finalMedia, loads: () => loads, closes: () => closes,
    dependencies: {
      inspectEnvironment: async () => ({ ok: true, checks: [], versions: {}, fonts: {} }),
      openRenderer: async () => ({ page, context: {}, browser: { close: async () => { closes++; }, version: () => 'source-only-stub' } }),
      measureCards: async () => {
        const final = !content.includes('200 / 200');
        if (final) finalMedia.push(media);
        if (loads > 7 && !final && failBalance) return await failBalance();
        return [...content.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((match, index) => {
          const count = (match[0].match(/<p>/g) || []).length;
          return { index: index + 1, available: { width: 500, height: 500 }, used: { width: 500, height: 500 },
            ...(missingGeometry ? {} : { occupied: { height: 100 * count } }),
            overflow: count > 5 || final && media === 'print' && finalPrintOverflow ? ['content-height'] : [] };
        });
      }
    }
  };
}

test('export wires opt-in, records exact attempts, and validates the final two-page deck in both media', async t => {
  const { dir, options } = await workspace(t);
  const fake = fixture();
  const result = await exportCards(options, fake.dependencies);
  assert.deepEqual(result.cards.map(card => card.provenance.atomIds.length), [3, 3]);
  assert.equal(result.pagination.algorithm, 'greedy-semantic-browser-tail-v1');
  assert.equal(result.pagination.greedyProbes, 7);
  assert.equal(result.pagination.balance.probes, 4);
  assert.equal(result.pagination.probes, 11);
  assert.equal(result.pagination.balance.attempts, 2);
  assert.equal(result.pagination.balance.outcome, 'improved');
  assert.equal(result.pagination.validation.status, 'pass');
  assert.equal(result.qa.visualReview, 'not-performed');
  assert.deepEqual(fake.finalMedia, ['screen', 'print']);
  assert.equal(fake.closes(), 1);
  const html = await readFile(path.join(dir, 'output/cards.html'), 'utf8');
  assert.match(html, /2 \/ 2/);
  assert.doesNotMatch(html, /200 \/ 200/);
  for (let number = 1; number <= 6; number++) assert.equal(html.split(`TAIL_${number}`).length - 1, 1);
  assert.deepEqual(await readFile(path.join(dir, 'input.md'), 'utf8'), source);
});

test('missing geometry explicitly preserves greedy but does not skip final validation', async t => {
  const { options } = await workspace(t);
  const fake = fixture({ missingGeometry: true });
  const result = await exportCards(options, fake.dependencies);
  assert.deepEqual(result.cards.map(card => card.provenance.atomIds.length), [5, 1]);
  assert.equal(result.pagination.balance.outcome, 'unchanged');
  assert.equal(result.pagination.balance.partitions[0].fallback, 'geometry-unavailable');
  assert.equal(result.pagination.balance.attempts, 0);
  assert.deepEqual(fake.finalMedia, ['screen', 'print']);
});

test('final print-only overflow still prevents successful publication after measured balancing', async t => {
  const { options } = await workspace(t);
  const fake = fixture({ finalPrintOverflow: true });
  await assert.rejects(() => exportCards(options, fake.dependencies), { code: 'CONTENT_OVERFLOW' });
  assert.deepEqual(await readdir(options.out), ['overflow.json']);
  const diagnostic = JSON.parse(await readFile(path.join(options.out, 'overflow.json'), 'utf8'));
  assert.ok(diagnostic.cards.every(card => !card.screen.overflow.length && card.print.overflow.length));
  assert.equal(fake.closes(), 1);
});

test('a browser fault in balancing fails closed and leaves no output or staging', async t => {
  const { dir, options } = await workspace(t);
  const marker = new Error('optional probe failed');
  const fake = fixture({ failBalance: () => { throw marker; } });
  await assert.rejects(() => exportCards(options, fake.dependencies), error => error === marker);
  assert.deepEqual(await readdir(dir), ['input.md']);
  assert.equal(fake.closes(), 1);
});

test('a stalled balancing probe obeys the existing deadline and cannot publish after a late result', async t => {
  const { dir, options } = await workspace(t);
  let resolveProbe;
  const fake = fixture({ failBalance: () => new Promise(resolve => { resolveProbe = resolve; }) });
  await assert.rejects(() => exportCards({ ...options, timeoutMs: 1000 }, fake.dependencies), { code: 'RENDER_TIMEOUT' });
  assert.deepEqual(await readdir(dir), ['input.md']);
  assert.equal(fake.closes(), 1);
  resolveProbe([{ index: 1, overflow: [] }]);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(await readdir(dir), ['input.md']);
});

test('direct export API rejects manual balancing before opening any renderer', async () => {
  await assert.rejects(() => exportCards({ paginate: 'manual', balanceTail: true }, {
    openRenderer: async () => assert.fail('manual balancing must reject before launch')
  }), { code: 'INVALID_OPTIONS' });
});


test('direct export API rejects nonboolean opt-in before opening any renderer', async () => {
  for (const balanceTail of ['true', 1, null]) await assert.rejects(() => exportCards({ paginate: 'auto', balanceTail }, {
    openRenderer: async () => assert.fail('invalid opt-in must reject before launch')
  }), { code: 'INVALID_OPTIONS' });
});


test('real tail gate requires actual list and table movement, not a successful no-op', async () => {
  const validator = await readFile(new URL('../scripts/validate-tail.mjs', import.meta.url), 'utf8');
  assert.match(validator, /name: 'lists', input: 'examples\/pagination-lists\.md', height: 1100/);
  assert.match(validator, /\['lists', 'tables'\]\.includes\(item\.name\)/);
  assert.match(validator, /balance\.appliedPartitions > 0/);
});
