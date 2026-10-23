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

test('blank-line trimming never strips indentation or trailing code spaces', () => {
  const cards = renderCards('\n\n    first  \n    ===\n    third  \n\n===\n\n\tsecond  \n\n');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].source, '    first  \n    ===\n    third  ');
  assert.equal(cards[0].html, '<pre><code>first  \n===\nthird  \n</code></pre>\n');
  assert.equal(cards[1].source, '\tsecond  ');
  assert.match(cards[1].html, /<pre><code>second  \n/);
});

test('nested fences and indented code protect literal separators', () => {
  assert.equal(splitCards('- item\n\n  ```text\n  ===\n  ```\n\n===\nEnd').length, 2);
  assert.equal(splitCards('> ```\n> ===\n> ```\n\n===\nEnd').length, 2);
  assert.equal(splitCards('    ===').length, 1);
  assert.equal(splitCards('\t===').length, 1);
});

test('reference links resolve across cards, with first definition winning', () => {
  const cards = renderCards('[Later][reference]\n\n[constructor]\n\n===\n\n[reference]: https://example.test/first "title"\n[constructor]: https://example.test/prototype\n\n[Earlier][reference]\n\n===\n\n[reference]: https://example.test/second\n\nEnd');
  assert.match(cards[0].html, /href="https:\/\/example.test\/first" title="title"/);
  assert.match(cards[1].html, /href="https:\/\/example.test\/first"/);
  assert.match(cards[0].html, /href="https:\/\/example.test\/prototype"/);
  assert.doesNotMatch(cards[2].html, /https:\/\//);
});

test('code definitions never become document references and dangerous links stay escaped', () => {
  const cards = renderCards('[missing][code]\n\n[bad][unsafe]\n\n===\n\n```\n[code]: https://example.test\n```\n\n[unsafe]: javascript:alert(1)');
  assert.doesNotMatch(cards[0].html, /href=/);
  assert.match(cards[0].html, /\[missing\]\[code\]/);
});

test('all named layouts and safe string metadata are supported', async () => {
  const { LAYOUTS, parseCardMetadata } = await import('../scripts/markdown.mjs');
  assert.equal(renderCards('# Plain')[0].metadata.layout, 'explainer');
  for (const layout of LAYOUTS) {
    const [card] = renderCards(`<!-- card: ${JSON.stringify({ layout, eyebrow: '<tag>', alt: '中文', caption: 'caption', source: 'source', metric: '42', label: 'label' })} -->\n\n# Title`);
    assert.equal(card.metadata.layout, layout);
    assert.equal(card.metadata.eyebrow, '<tag>');
    assert.equal(card.source, '# Title');
    assert.doesNotMatch(card.html, /card:/);
  }
  assert.equal(parseCardMetadata('\n\n<!-- card: {"layout":"cover"} -->\n\n    code').source, '    code');
});

test('metadata validation fails closed and never applies inside code or later content', () => {
  for (const metadata of ['[]', 'null', '42', '{"layout":"unknown"}', '{"unexpected":"x"}', '{"layout":1}', '{"caption":{}}', '{"alt":["x"]}', '{"image":""}', '{"__proto__":"x"}', '{"caption":"line\\nbreak"}', '{bad}']) {
    assert.throws(() => renderCards(`<!-- card: ${metadata} -->\n\n# A`), /metadata/);
  }
  assert.throws(() => renderCards('<!-- card: {\n"layout":"cover"\n} -->\n# A'), /metadata must be one line/);
  assert.equal(renderCards('    <!-- card: {"layout":"cover"} -->')[0].metadata.layout, 'explainer');
  assert.equal(renderCards('```\n<!-- card: {"layout":"cover"} -->\n```')[0].metadata.layout, 'explainer');
  assert.equal(renderCards('# A\n\n<!-- card: {"layout":"cover"} -->')[0].metadata.layout, 'explainer');
});

const fakeAsset = Object.freeze({ dataUrl: 'data:image/png;base64,AQID', hash: 'test', mime: 'image/png', width: 2, height: 3, bytes: 3 });

test('local inline, linked, reference and metadata images use the resolver only', () => {
  const refs = [];
  const resolveImage = ref => { refs.push(ref); return fakeAsset; };
  const cards = renderCards('<!-- card: {"layout":"image-caption","image":"cover.png","alt":"Cover"} -->\n\n![A & B](inline.png "A title")\n\n[![Linked][picture]](https://example.test)\n\n===\n\n[picture]: linked.webp\n\nEnd', { resolveImage });
  assert.deepEqual(refs, ['inline.png', 'linked.webp', 'cover.png']);
  assert.equal(cards[0].image, fakeAsset);
  assert.match(cards[0].html, /src="data:image\/png;base64,AQID"/);
  assert.match(cards[0].html, /alt="A &amp; B"/);
  assert.match(cards[0].html, /width="2" height="3"/);
  assert.doesNotMatch(cards[0].html, /src="inline.png"/);
});

test('reference images on a different card cannot bypass image safety', () => {
  assert.throws(() => renderCards('![Remote][image]\n\n===\n\n[image]: https://example.test/tracker.png\n\nEnd'), /Card 1 contains a Markdown image/);
  assert.throws(() => renderCards('<!-- card: {"image":"photo.png"} -->\n\nA'), /--asset-root/);
  for (const result of [{ dataUrl: 'https://example.test/x.png' }, { dataUrl: 'data:image/svg+xml;base64,AQID' }, Promise.resolve(fakeAsset), null]) {
    assert.throws(() => renderCards('![a](x.png)', { resolveImage: () => result }), /trusted PNG, JPEG, or WebP/);
  }
});

test('sections use only top-level h2 blocks and retain code, lists and escaped HTML', () => {
  const [card] = renderCards('# Intro\n\nPreamble\n\n## A *one*\n\n- alpha\n- beta\n\n> ## Nested\n> Quote\n\n```\n## Code\n```\n\n## B\n\n<script>x</script>');
  assert.match(card.introHtml, /Preamble/);
  assert.equal(card.sections.length, 2);
  assert.equal(card.sections[0].heading, 'A one');
  assert.match(card.sections[0].html, /^<h2>A <em>one<\/em><\/h2>/);
  assert.match(card.sections[0].html, /<ul>/);
  assert.match(card.sections[0].html, /<blockquote>/);
  assert.match(card.sections[1].html, /&lt;script&gt;/);
  assert.equal(card.introHtml + card.sections.map(section => section.html).join(''), card.html);
});

test('parser failures expose stable codes and preserve asset error diagnostics', async () => {
  const { Md2CardError } = await import('../scripts/errors.mjs');
  assert.throws(() => renderCards(''), { code: 'INVALID_MARKDOWN' });
  assert.throws(() => renderCards(null), { code: 'INVALID_MARKDOWN' });
  assert.throws(() => renderCards('<!-- card: {"layout":"unknown"} -->\n\nA'), { code: 'INVALID_METADATA' });
  assert.throws(() => renderCards('![a](a.png)'), { code: 'INVALID_ASSET' });
  const original = new Md2CardError('ASSET_BUDGET', 'Too large.', { limit: 42 }, 2);
  assert.throws(() => renderCards('![a](a.png)', { resolveImage: () => { throw original; } }), error => {
    assert.equal(error.code, 'ASSET_BUDGET');
    assert.deepEqual(error.details, { limit: 42, cardNumber: 1 });
    assert.equal(error.cause, original);
    assert.equal(error.exitCode, 2);
    return true;
  });
});
