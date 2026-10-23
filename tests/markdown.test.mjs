import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCards, renderCards, escapeHtml } from '../scripts/markdown.mjs';
import { parseOptions } from '../scripts/render.mjs';
import { buildDocument } from '../scripts/document.mjs';

test('=== splits cards, --- remains a horizontal rule', () => {
  const cards = renderCards('# First\n\n---\n\nBody\n\n===\n\n# Second');
  assert.equal(cards.length, 2);
  assert.match(cards[0].html, /<hr>/);
  assert.deepEqual(cards[0].sourceLines, [1, 6]);
});

test('fences protect separators, including long and tilde fences', () => {
  for (const fence of ['```', '````', '~~~', '~~~~']) {
    const cards = splitCards(`# One\n\n${fence}text\n===\n---\n${fence}\n\n===\n# Two`);
    assert.equal(cards.length, 2);
    assert.match(cards[0].source, /===/);
  }
  assert.equal(splitCards('# One\n\n```\n===\n').length, 1);
  assert.equal(splitCards('# One\n\n    ===\n\n===\n# Two').length, 2);
});

test('shorter closing fences do not expose a separator', () => {
  assert.equal(splitCards('````\n```\n===\n````').length, 1);
});

test('BOM and Windows line endings are normalized', () => {
  assert.equal(splitCards('\uFEFF# One\r\n\r\n===\r\n# Two').length, 2);
});

test('empty cards fail with actionable errors', () => {
  for (const source of ['', '===\n# End', '# Start\n===', '# Start\n===\n\n===\n# End']) {
    assert.throws(() => splitCards(source), /Empty card/);
  }
});

test('HTML and scripts are escaped, unsafe link schemes are not links', () => {
  const html = renderCards('<script>alert(1)</script>\n\n<img src="https://example.test/leak">\n\n[x](javascript:alert(1))')[0].html;
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /&lt;script&gt;/);
  assert.equal(escapeHtml('<"&\''), '&lt;&quot;&amp;&#39;');
});

test('Markdown images, including reference and linked images, are rejected', () => {
  for (const source of ['![alt](https://example.test/a.png)', '![alt](./local.png)', '![a][img]\n\n[img]: https://example.test/a.png', '[![alt](a.png)](https://example.test)']) {
    assert.throws(() => renderCards(source), /Card 1 contains a Markdown image/);
  }
});

test('supported Markdown preserves CJK, tables, code and safe links', () => {
  const html = renderCards('# 中文 ABC\n\n| A | B |\n|---|---|\n| 甲 | 乙 |\n\n```js\nconst a = "<tag>";\n```\n\n[Source](https://example.test)')[0].html;
  assert.match(html, /中文 ABC/);
  assert.match(html, /<table>/);
  assert.match(html, /&lt;tag&gt;/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('CLI validates dimensions, themes and formats', () => {
  assert.equal(parseOptions(['x.md']).width, 1080);
  assert.equal(parseOptions(['x.md', '--size', 'slide']).height, 900);
  assert.deepEqual(parseOptions(['x.md', '--format', 'png,pdf']).formats, ['png', 'pdf']);
  for (const args of [['--width', '0'], ['--height', 'NaN'], ['--scale', '8'], ['--theme', 'copied'], ['--format', 'svg'], ['--size', 'auto'], ['--lang', '"><script>']]) {
    assert.throws(() => parseOptions(['x.md', ...args]));
  }
});

test('HTML is standalone with restrictive CSP and escaped user metadata', () => {
  const options = parseOptions(['input.md', '--footer', '<img src=x>', '--title', '</title><script>x</script>']);
  const html = buildDocument(renderCards('# Safe'), options, '.card { color: black; }');
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'none'/);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /@page \{ size: 1080px 1440px/);
});
