import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { parseOptions, exportCards } from '../scripts/render.mjs';
import { openRenderer, measureCards, findBrowser } from '../scripts/browser.mjs';

const run = promisify(execFile);
const FIXTURE = '# 中文知识卡\n\nSEARCHABLE_MARKER_2026\n\n- 中文与 English\n- **Important** knowledge\n\n| A | B |\n|---|---|\n| one | 二 |\n\n===\n\n# 第二张\n\n```text\nconst answer = 42;\n===\n```\n\n---\n\nText is not a screenshot.';

async function workspace(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'md2card-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function browserReady(t) {
  const options = parseOptions(['test.md']);
  try { const renderer = await openRenderer(options); await renderer.browser.close(); return true; }
  catch (error) {
    if (process.env.MD2CARD_REQUIRE_BROWSER === '1') throw error;
    t.skip(`Browser unavailable: ${error.message.split('\n')[0]}. Set MD2CARD_REQUIRE_BROWSER=1 in CI to require export validation.`);
    return false;
  }
}

test('exports HTML, exact-size PNGs and searchable two-page PDF', async t => {
  if (!await browserReady(t)) return;
  const dir = await workspace(t);
  const input = path.join(dir, 'fixture.md');
  await writeFile(input, FIXTURE);
  const out = path.join(dir, 'export');
  const manifest = await exportCards(parseOptions([input, '--out', out]));
  assert.equal(manifest.cardCount, 2);
  assert.equal(manifest.artifacts.length, 4);
  assert.ok(manifest.cards.every(card => !card.screen.overflow.length && !card.print.overflow.length));
  const png = await readFile(path.join(out, 'card-001.png'));
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1440);
  const pdf = await readFile(path.join(out, 'cards.pdf'));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.match(await readFile(path.join(out, 'cards.html'), 'utf8'), /SEARCHABLE_MARKER_2026/);
  try { await run('pdftotext', ['-v']); }
  catch { t.diagnostic('pdftotext unavailable; PDF text extraction was not verified.'); return; }
  const { stdout } = await run('pdftotext', [path.join(out, 'cards.pdf'), '-']);
  assert.match(stdout, /SEARCHABLE_MARKER_2026/);
  assert.match(stdout, /中文/);
  assert.equal((stdout.match(/\f/g) || []).length, 2, 'PDF must have exactly two pages');
});

test('vertical overflow produces only a report, never clipped exports', async t => {
  if (!await browserReady(t)) return;
  const dir = await workspace(t);
  const input = path.join(dir, 'overflow.md');
  await writeFile(input, '# Too much\n\n' + Array.from({ length: 100 }, (_, n) => `- Line ${n}: content`).join('\n'));
  const out = path.join(dir, 'export');
  await assert.rejects(() => exportCards(parseOptions([input, '--out', out])), error => error.exitCode === 2 && /card\(s\) 1/.test(error.message));
  assert.deepEqual(await readdir(out), ['overflow.json']);
  const report = JSON.parse(await readFile(path.join(out, 'overflow.json'), 'utf8'));
  assert.ok(report.cards[0].screen.overflow.includes('content-height'));
});

test('horizontal overflow in code, tables and long tokens is detected', async t => {
  if (!await browserReady(t)) return;
  const renderer = await openRenderer(parseOptions(['test.md', '--width', '400', '--height', '600']));
  t.after(() => renderer.browser.close());
  await renderer.page.setContent(`<style>.card{width:400px;height:600px}.card-content{width:200px;height:400px}pre{width:180px;overflow:hidden}table{width:500px}</style><article class="card"><div class="card-content"><pre>${'A'.repeat(200)}</pre><table><tr><td>Wide table</td></tr></table><p style="white-space:nowrap">${'B'.repeat(200)}</p></div><footer class="card-footer">1</footer></article>`);
  const [measurement] = await measureCards(renderer.page);
  assert.ok(measurement.overflow.includes('content-width'));
  assert.ok(measurement.overflow.includes('scroll-pre'));
  assert.ok(measurement.overflow.includes('wide-table'));
});

test('existing output files are preserved and rejected before rendering', async t => {
  const dir = await workspace(t);
  const input = path.join(dir, 'input.md');
  await writeFile(input, '# Safe');
  await assert.rejects(() => exportCards(parseOptions([input, '--out', dir])), /Output directory is not empty/);
  assert.equal(await readFile(input, 'utf8'), '# Safe');
});

test('missing explicit browser has actionable instructions', async () => {
  await assert.rejects(() => findBrowser('/definitely-not-a-browser/md2card'), /Check --browser or CHROMIUM_PATH/);
});

test('square and slide presets support scaled PNG-only export', async t => {
  if (!await browserReady(t)) return;
  const dir = await workspace(t);
  const input = path.join(dir, 'short.md');
  await writeFile(input, '# Short card\n\n中文 · English');
  for (const [size, width, height] of [['square', 1080, 1080], ['slide', 1600, 900]]) {
    const out = path.join(dir, size);
    const manifest = await exportCards(parseOptions([input, '--out', out, '--format', 'png', '--size', size, '--scale', '0.5']));
    assert.deepEqual(manifest.formats, ['png']);
    assert.deepEqual((await readdir(out)).sort(), ['card-001.png', 'manifest.json']);
    const png = await readFile(path.join(out, 'card-001.png'));
    assert.equal(png.readUInt32BE(16), width / 2);
    assert.equal(png.readUInt32BE(20), height / 2);
  }
});

test('browser context blocks script execution and resource requests', async t => {
  if (!await browserReady(t)) return;
  const renderer = await openRenderer(parseOptions(['test.md']));
  t.after(() => renderer.browser.close());
  const failures = [];
  renderer.page.on('requestfailed', request => failures.push(request.url()));
  await renderer.page.setContent('<script>window.SHOULD_NOT_EXECUTE=1</script><img src="https://example.invalid/md2card-test.png">', { waitUntil: 'load' });
  assert.equal(await renderer.page.evaluate(() => window.SHOULD_NOT_EXECUTE), undefined);
  assert.ok(failures.includes('https://example.invalid/md2card-test.png'));
  assert.equal(await renderer.page.locator('img').evaluate(image => image.naturalWidth), 0);
});
