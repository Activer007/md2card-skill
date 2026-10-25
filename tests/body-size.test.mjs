import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BODY_SIZES, normalizeBodySize, sizeBodyText } from '../scripts/body-size.mjs';
import { parseOptions, exportCards } from '../scripts/render.mjs';
import { renderCards } from '../scripts/markdown.mjs';
import { parseSemanticDocument } from '../scripts/semantic.mjs';
import { buildDocument, buildPreviewDocument, SIZES, THEMES } from '../scripts/document.mjs';
import { TEMPLATES } from '../scripts/templates.mjs';
import { createAssetResolver } from '../scripts/assets.mjs';
import { openRenderer, closeBrowser } from '../scripts/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const css = await Promise.all(['themes', 'layouts', 'templates'].map(name => readFile(path.join(ROOT, 'assets', `${name}.css`), 'utf8')));
const options = { ...SIZES.portrait, theme: 'editorial', footer: 'FOOTER' };
const render = (cards, overrides = {}) => buildDocument(cards, { ...options, ...overrides }, ...css);

test('four body sizes accept Chinese labels, default to medium, and reject untrusted values', () => {
  assert.equal(parseOptions(['a.md']).bodySize, 'medium');
  for (const [label, size] of Object.entries({ 小: 'small', 中: 'medium', 中等: 'medium', 大: 'large', 特大: 'xlarge' })) {
    assert.equal(parseOptions(['a.md', '--body-size', label]).bodySize, size);
    assert.equal(renderCards(`<!-- card: {"bodySize":"${label}"} -->\nBody`)[0].metadata.bodySize, size);
  }
  for (const value of ['', '42', '__proto__', 'large" onclick="x', null, 42]) {
    assert.throws(() => normalizeBodySize(value), { code: 'INVALID_OPTIONS' });
    assert.throws(() => renderCards(`<!-- card: ${JSON.stringify({ bodySize: value })} -->\nBody`), { code: 'INVALID_METADATA' });
    assert.throws(() => render([{ html: '<p>Body</p>', metadata: { bodySize: value } }]), { code: 'INVALID_OPTIONS' });
  }
  assert.throws(() => parseOptions(['a.md', '--body-size', 'huge']), { code: 'INVALID_OPTIONS' });
});

test('medium leaves HTML unchanged and card metadata overrides the deck preset', () => {
  const cards = renderCards('# Title\n\nBody **bold**.');
  assert.equal(render(cards), render(cards, { bodySize: 'medium' }));
  assert.doesNotMatch(render(cards), /body-text-size|data-body-size/);
  const overridden = renderCards('<!-- card: {"bodySize":"中"} -->\n# Title\n\nBody **bold**.');
  assert.equal(render(overridden, { bodySize: 'xlarge' }), render(cards));
  assert.match(buildPreviewDocument(cards, { ...options, bodySize: 'large' }, ...css), /data-body-size="large"/);
  assert.throws(() => parseSemanticDocument('<!-- card: {"bodySize":"large"} -->\nBody'), { code: 'PAGINATION_UNSUPPORTED_METADATA' });
});

test('only body text runs are wrapped, preserving nested markup, escaped HTML and code bytes', () => {
  const original = '<h1><em>Heading</em></h1><p>Body &lt;script&gt; <a href="https://example.test?q=&gt;" title="a > b"><strong>link</strong></a></p><ul><li>Outer<ul><li>Inner</li></ul></li></ul><pre><code>a &lt; b\n  c\n</code></pre><p class="card-source">Source</p><figcaption>Caption</figcaption><p class="statistic-value">42</p>';
  const sized = sizeBodyText(original, 'large');
  assert.equal(sized.replace(/<span class="body-text-size">([\s\S]*?)<\/span>/g, '$1'), original);
  assert.match(sized, /<h1><em>Heading<\/em><\/h1>/);
  assert.match(sized, /<li><span class="body-text-size">Inner<\/span><\/li>/);
  assert.match(sized, /<pre><code><span class="body-text-size">a &lt; b\n  c\n<\/span><\/code><\/pre>/);
  assert.doesNotMatch(sized, /body-text-size">(?:Heading|Source|Caption|42)</);
});

async function browser(t) {
  if (process.env.MD2CARD_SKIP_BROWSER === '1' && process.env.MD2CARD_REQUIRE_BROWSER !== '1') { t.skip('Browser explicitly skipped'); return null; }
  try {
    const renderer = await openRenderer(parseOptions(['test.md']));
    t.after(() => closeBrowser(renderer.browser));
    return renderer;
  } catch (error) {
    if (process.env.MD2CARD_REQUIRE_BROWSER === '1') throw error;
    t.skip(`Browser unavailable: ${error.message}`); return null;
  }
}

async function textMetrics(page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.querySelector('.card'), NodeFilter.SHOW_TEXT);
    const rows = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const style = getComputedStyle(node.parentElement);
      rows.push({ text: node.textContent, size: parseFloat(style.fontSize), scaled: node.parentElement.classList.contains('body-text-size') });
    }
    return rows;
  });
}

test('real browser: all 48 templates and five themes preserve non-body type and scale text once in screen/print', async t => {
  const renderer = await browser(t); if (!renderer) return;
  const fixtures = [];
  for (const template of TEMPLATES) {
    const source = await readFile(path.join(ROOT, 'examples/templates', `${template.id}.md`), 'utf8');
    const assets = await createAssetResolver(path.join(ROOT, 'examples/templates'));
    fixtures.push({ id: template.id, cards: renderCards(source, { resolveImage: assets.resolveImage }) });
  }
  const source = '# Title\n\nBody **bold** [link](https://example.test).\n\n- Outer\n  - Inner `code`\n\n> Quote\n\n| A | B |\n|---|---|\n| One | Two |\n\n```text\na < b\n```';
  for (const theme of THEMES) fixtures.push({ id: theme, cards: renderCards(source), theme });
  for (const media of ['screen', 'print']) {
    await renderer.page.emulateMedia({ media });
    for (const fixture of fixtures) {
      await renderer.page.setContent(render(fixture.cards, { theme: fixture.theme ?? 'editorial' }));
      const baseline = await textMetrics(renderer.page);
      for (const [bodySize, scale] of Object.entries(BODY_SIZES).filter(([key]) => key !== 'medium')) {
        await renderer.page.setContent(render(fixture.cards, { theme: fixture.theme ?? 'editorial', bodySize }));
        const actual = await textMetrics(renderer.page);
        assert.deepEqual(actual.map(row => row.text), baseline.map(row => row.text), fixture.id);
        assert.ok(actual.some(row => row.scaled), fixture.id);
        actual.forEach((row, index) => assert.ok(Math.abs(row.size - baseline[index].size * (row.scaled ? scale : 1)) < 0.02,
          `${fixture.id}/${media}/${bodySize}: ${row.text}`));
      }
    }
  }
});

test('real exports record presets, emit PNG/PDF, paginate at the selected size and reject manual overflow', async t => {
  if (!await browser(t)) return;
  const dir = await mkdtemp(path.join(tmpdir(), 'md2card-body-size-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'body.md');
  await writeFile(input, '# Body sizes\n\n' + Array.from({ length: 16 }, (_, i) => `Paragraph ${i}: readable text with enough words to wrap across multiple lines on this card.`).join('\n\n'));
  const manifests = [];
  for (const size of ['medium', 'xlarge']) {
    const out = path.join(dir, size);
    const manifest = await exportCards(parseOptions([input, '--out', out, '--body-size', size, '--paginate', 'auto', '--height', '800']));
    assert.equal(manifest.bodySize, size);
    assert.ok(manifest.cards.every(card => card.bodySize === size && !card.screen.overflow.length && !card.print.overflow.length));
    const png = await readFile(path.join(out, 'card-001.png'));
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal((await readFile(path.join(out, 'cards.pdf'))).subarray(0, 5).toString(), '%PDF-');
    manifests.push(manifest);
  }
  assert.ok(manifests[1].cardCount > manifests[0].cardCount, 'larger body must change measured pagination');
  const out = path.join(dir, 'manual');
  await assert.rejects(() => exportCards(parseOptions([input, '--out', out, '--body-size', 'xlarge', '--height', '800'])), error => error.exitCode === 2);
  assert.deepEqual(await readdir(out), ['overflow.json']);
});
