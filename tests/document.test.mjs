import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildDocument, buildPreviewDocument, FOOTER_MODES, LAYOUTS, THEMES, SIZES } from '../scripts/document.mjs';
import { renderCards } from '../scripts/markdown.mjs';

const options = { ...SIZES.portrait, theme: 'editorial', title: 'Card preview', footer: '', lang: 'zh-CN' };
const themeCss = await readFile(new URL('../assets/themes.css', import.meta.url), 'utf8');
const layoutCss = await readFile(new URL('../assets/layouts.css', import.meta.url), 'utf8');
const image = { width: 1, height: 1, mime: 'image/png', hash: 'fixture', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' };
const basicCard = { index: 1, html: '<h1>中文与 English</h1>\n<p>A concise idea.</p>\n' };
const render = (cards = [basicCard], overrides = {}) => buildDocument(cards, { ...options, ...overrides }, themeCss, layoutCss);

test('all eight layout names and original five themes remain available', () => {
  assert.deepEqual(LAYOUTS, ['cover', 'explainer', 'comparison', 'steps', 'image-caption', 'statistic', 'case-study', 'quote']);
  assert.deepEqual(THEMES, ['editorial', 'minimal', 'midnight', 'notebook', 'bold']);
  for (const theme of THEMES) {
    for (const layout of LAYOUTS) {
      assert.match(render([{ ...basicCard, metadata: { layout } }], { theme }), new RegExp(`class="card theme-${theme} layout-${layout}"`));
    }
  }
});

test('unannotated Markdown remains an explainer and preserves the whole HTML', () => {
  const html = render();
  assert.match(html, /layout-explainer/);
  assert.ok(html.includes(`<div class="card-body">${basicCard.html}</div>`));
  assert.match(html, /@page \{ size: 1080px 1440px/);
  assert.match(html, /class="card-index">1 \/ 1/);
  assert.doesNotMatch(html, /class="preview-item"/);
});

test('comparison uses token-derived sections and preserves supplementary sections', () => {
  const card = {
    ...basicCard, metadata: { layout: 'comparison' }, introHtml: '<h1>Choose deliberately</h1>',
    sections: [
      { heading: 'A', html: '<h2>A</h2><p>First choice.</p>' },
      { heading: 'B', html: '<h2>B</h2><p>Second choice.</p>' },
      { heading: 'Limits', html: '<h2>Limits</h2><p>Both have tradeoffs.</p>' }
    ]
  };
  const html = render([card]);
  assert.match(html, /class="card-intro"><h1>Choose deliberately/);
  assert.match(html, /class="comparison-panel comparison-panel-1"><h2>A/);
  assert.match(html, /class="comparison-panel comparison-panel-2"><h2>B/);
  assert.match(html, /class="comparison-note"><h2>Limits/);
  assert.equal((html.match(/<p>Both have tradeoffs\.<\/p>/g) || []).length, 1);
});

test('case study assigns phases without inventing or replacing section headings', () => {
  const card = { ...basicCard, metadata: { layout: 'case-study' }, introHtml: '<h1>Small experiment</h1>', sections: [
    { heading: '问题', html: '<h2>问题</h2><p>Original challenge.</p>' },
    { heading: '行动', html: '<h2>行动</h2><p>Original action.</p>' },
    { heading: '结果', html: '<h2>结果</h2><p>Original result.</p>' }
  ] };
  const html = render([card]);
  assert.match(html, /class="case-stage case-stage-3"><h2>结果/);
  assert.equal((html.match(/<section class="case-stage /g) || []).length, 3);
});

test('eight short Markdown layouts compose through the actual parser', () => {
  const examples = [
    ['cover', '# 把复杂知识讲清楚\n\n一次只讲一个重要观点。', { eyebrow: '知识卡片入门' }],
    ['explainer', '# 为什么拆分内容\n\n每张卡片回答一个问题。\n\n## 保留边界\n\n结论、依据和限制都不能省略。', {}],
    ['comparison', '# 选择合适的方法\n\n## 快速概览\n\n适合了解背景。\n\n## 深入阅读\n\n适合检验论证。', {}],
    ['steps', '# 三步完成\n\n1. 确定问题。\n2. 查明依据。\n3. 检查结论。', {}],
    ['image-caption', '# 图片也要解释\n\n说明它支持了哪个观点。', { image: 'example.png', alt: '示例图', caption: '本地图片示例。' }],
    ['statistic', '# 让数字有上下文\n\n明确样本、时间和测量口径。', { metric: '42%', label: '虚构示例数据', source: '仅用于展示版式。' }],
    ['case-study', '# 一次小型实验\n\n## 问题\n\n读者找不到重点。\n\n## 行动\n\n拆成三个清晰步骤。\n\n## 结果\n\n重新收集反馈。', {}],
    ['quote', '> 清晰来自对问题的认真理解。', { source: '原创示例文案' }]
  ];
  const source = examples.map(([layout, body, metadata]) => `<!-- card: ${JSON.stringify({ layout, ...metadata })} -->\n${body}`).join('\n\n===\n\n');
  const cards = renderCards(source, { resolveImage: () => image });
  const html = render(cards);
  assert.equal(cards.length, 8);
  assert.equal((html.match(/<article class="card /g) || []).length, 8);
  assert.match(html, /comparison-panel-2"><h2>深入阅读/);
  assert.match(html, /case-stage-3"><h2>结果/);
  assert.match(html, /class="card-figure card-figure-hero"/);
  assert.match(html, /class="card-index">8 \/ 8/);
});

test('local images and brand logo are embedded without exposing source file paths', () => {
  const card = { ...basicCard, image, metadata: { layout: 'image-caption', image: '/private/path.png', alt: 'Photo "one"', caption: 'A <caption>' } };
  const html = render([card], { brand: { name: 'My <brand>', accent: '#0af', logo: image }, footer: 'Draft only' });
  assert.match(html, /img-src data:/);
  assert.equal((html.match(/src="data:image\/png;base64,/g) || []).length, 2);
  assert.match(html, /alt="Photo &quot;one&quot;"/);
  assert.match(html, /<figcaption>A &lt;caption&gt;<\/figcaption>/);
  assert.match(html, /--brand-accent: #0af/);
  assert.match(html, /class="brand-name">My &lt;brand&gt;/);
  assert.match(html, /class="footer-text">Draft only/);
  assert.doesNotMatch(html, /\/private\/path\.png/);
});

test('metadata escapes markup and never becomes CSS or an active URL', () => {
  const attack = '</p><script>alert(1)</script><img src="https://invalid.test">';
  const html = render([{ ...basicCard, metadata: { layout: 'statistic', metric: attack, label: attack, eyebrow: attack, source: attack } }], {
    title: '</title><script>bad</script>', footer: attack, brand: { name: attack }
  });
  assert.doesNotMatch(html, /<script\b|<img\b/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /font-src 'none'/);
  assert.doesNotMatch(html, /href="https:\/\/invalid/);
});

test('document rejects arbitrary CSS, invalid layouts, and unverified image sources', () => {
  for (const accent of ['red', '#123456; background:url(https://invalid.test)', '#1234', '</style>']) {
    assert.throws(() => render([basicCard], { brand: { accent } }), /hex color/);
  }
  assert.throws(() => render([{ ...basicCard, metadata: { layout: '"><script>' } }]), /unknown layout/);
  assert.throws(() => render([basicCard], { theme: 'bad"><script>' }), /Unknown theme/);
  assert.throws(() => render([basicCard], { width: '1080px' }), /dimensions/);
  assert.throws(() => render([{ ...basicCard, metadata: { metric: { css: 'red' } } }]), /plain text/);
  for (const asset of [
    { ...image, dataUrl: 'https://invalid.test/image.png' },
    { ...image, mime: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { ...image, dataUrl: 'data:image/png;base64,AQ==" onload="alert(1)' },
    { ...image, width: -1 }
  ]) assert.throws(() => render([{ ...basicCard, image: asset }]), /Images must|images must/);
});

test('statistic and quote retain plain source text without inventing values', () => {
  const stat = render([{ ...basicCard, metadata: { layout: 'statistic', metric: '42%', label: '示例数据，不代表实际表现', source: 'Source: supplied dataset' } }]);
  assert.match(stat, /class="statistic-value">42%/);
  assert.match(stat, /class="statistic-label">示例数据/);
  assert.match(stat, /class="card-source">Source: supplied dataset/);
  const empty = render([{ ...basicCard, metadata: { layout: 'statistic' } }]);
  assert.doesNotMatch(empty, /class="statistic-value"/);
  const quote = '<blockquote><p>A supplied quote.</p></blockquote>';
  assert.ok(render([{ ...basicCard, html: quote, metadata: { layout: 'quote', source: 'Named speaker' } }]).includes(quote));
});

test('preview is CSS-only, responsive, and retains original export canvas dimensions', () => {
  const html = buildPreviewDocument([basicCard], options, themeCss, layoutCss);
  assert.match(html, /class="deck deck-preview"/);
  assert.match(html, /class="preview-item"/);
  assert.match(html, /container-type: inline-size/);
  assert.match(html, /transform: scale\(calc\(100cqw \/ 1080px\)\)/);
  assert.match(html, /--card-width: 1080px; --card-height: 1440px/);
  assert.match(html, /aspect-ratio: 1080 \/ 1440/);
  assert.match(html, /transform: none; break-after: auto/);
  assert.doesNotMatch(html, /<script\b|onload=|onclick=/);
  assert.equal(buildDocument([basicCard], { ...options, preview: true }, themeCss, layoutCss), html);
});

test('theme tokens and layout geometry are separate with CJK-safe line handling', () => {
  assert.match(themeCss, /--accent: var\(--brand-accent, #9c3e24\)/);
  assert.doesNotMatch(themeCss, /\.comparison-grid|\.case-stage|\.statistic-value/);
  assert.doesNotMatch(layoutCss, /\.theme-(?:editorial|minimal|midnight|notebook|bold)/);
  assert.match(layoutCss, /word-break: normal/);
  assert.match(layoutCss, /line-break: strict/);
  assert.match(layoutCss, /orphans: 2; widows: 2/);
  assert.doesNotMatch(layoutCss, /word-break:\s*break-all/);
  assert.match(layoutCss, /object-fit: contain/);
  assert.match(layoutCss, /\.brand-logo[^}]+width: 2\.2em; height: 2\.2em/);
});

test('steps layout preserves the Markdown ordered-list starting value', () => {
  const cards = renderCards('<!-- card: {"layout":"steps"} -->\n# Deploy\n\n4. Deploy\n5. Verify');
  const html = render(cards);
  assert.match(html, /<ol start="4">/);
  assert.match(layoutCss, /content: counter\(list-item, decimal-leading-zero\)/);
  assert.doesNotMatch(layoutCss, /counter-(?:reset|increment): step/);
});

test('Bold consecutive H1 rules join titles without changing source markup', () => {
  const source='# Main title\n# Companion title\n\nParagraph.\n\n# Later title\n\nLater paragraph.';
  const cards=renderCards(source);
  const html=render(cards,{theme:'bold'});
  assert.ok(html.includes(cards[0].html));
  assert.match(themeCss,/\.theme-bold h1:has\(\+ h1\) \{[^}]*border-bottom: 0;/);
  assert.match(themeCss,/\.theme-bold h1 \+ h1 \{ margin-top: 0; \}/);
  assert.match(themeCss,/\.theme-bold h1 \{[^}]*border-bottom: 0\.08em solid var\(--ink\)/);
});

test('legacy footer is the byte-identical default and keeps the pre-mode HTML structure', () => {
  assert.deepEqual(FOOTER_MODES, ['legacy', 'poster', 'series', 'report']);
  assert.ok(Object.isFrozen(FOOTER_MODES));
  // Fixed hashes were captured before footer modes, with no stylesheet bytes so
  // independent CSS maintenance cannot silently update the markup baseline.
  const sha256 = html => createHash('sha256').update(html).digest('hex');
  assert.equal(sha256(buildDocument([basicCard], options, '')), 'ce5d6585e4a6795b238bfb3f66224dbceaf16963bb69d581cde54a3401357997');
  assert.equal(sha256(buildPreviewDocument([basicCard], options, '')), '3628dacc4ee8f44c6f6eea81251ffd20e37e08df2f15fbb6f06b8f2a9baceba4');
  assert.equal(sha256(buildDocument([basicCard], { ...options, paginationProbe: true }, '')), 'c7736082869850e2c1002bf821e561c248b1af6ec9f1d7f235b77e4f1c9ce7a6');
  for (const theme of THEMES) for (const layout of LAYOUTS) {
    const cards = [{ ...basicCard, metadata: { layout, source: 'Original attribution' } }];
    for (const overrides of [{}, { preview: true }, { paginationProbe: true }]) {
      const settings = { theme, footer: 'AI-assisted; verify facts', brand: { name: 'Author', logo: image }, ...overrides };
      assert.equal(render(cards, settings), render(cards, { ...settings, footerMode: 'legacy' }));
      assert.doesNotMatch(render(cards, settings).split('<body>')[1], /data-footer-mode=/);
    }
  }
});

test('poster omits only a final single-card counter, not footer content or probe reservation', () => {
  const settings = { footerMode: 'poster', footer: 'AI-assisted; verify facts', brand: { name: 'Original author', logo: image } };
  const one = render([basicCard], settings);
  assert.doesNotMatch(one, /class="card-index"/);
  assert.match(one, /data-footer-mode="poster"/);
  assert.match(one, /<footer class="card-footer">/);
  assert.match(one, /class="brand-name">Original author/);
  assert.match(one, /class="brand-logo"/);
  assert.match(one, /class="footer-text">AI-assisted; verify facts/);
  const two = render([basicCard, basicCard], settings);
  assert.match(two, /class="card-index">1 \/ 2/);
  assert.match(two, /class="card-index">2 \/ 2/);
  assert.match(render([basicCard], { ...settings, paginationProbe: true }), /class="card-index">200 \/ 200/);
  const preview = render([basicCard], { ...settings, preview: true });
  assert.doesNotMatch(preview, /class="card-index"/);
  assert.match(preview, /class="preview-caption">1 \/ 1/);
  assert.match(render([basicCard], { footerMode: 'poster' }), /<footer class="card-footer">/);
});

test('series numbers are generated from output order with at least two digits and a widest probe', () => {
  const html = render(Array.from({ length: 12 }, () => ({ ...basicCard, index: 999 })), { footerMode: 'series' });
  assert.match(html, /class="card-index">01 \/ 12/);
  assert.match(html, /class="card-index">12 \/ 12/);
  assert.doesNotMatch(html, /999 \/ 12/);
  assert.match(render([basicCard], { footerMode: 'series' }), /class="card-index">01 \/ 01/);
  assert.match(render([basicCard], { footerMode: 'series', paginationProbe: true }), /class="card-index">200 \/ 200/);
  const maximum = render(Array.from({ length: 200 }, () => basicCard), { footerMode: 'series' });
  assert.match(maximum, /class="card-index">200 \/ 200/);
});

test('every mode retains escaped source, brand, logo, footer and body caveats across legacy and template cards', () => {
  const body = '# Original title\n\nAI-assisted example; verify facts.\n\nSample data, not a verified result.';
  const source = 'Source <paper> & caveat: AI illustration, not evidence.';
  const footer = 'Footer <note> & caveat: confirm every factual claim.';
  const brandName = 'Author <team> & company';
  const cards = renderCards(`<!-- card: ${JSON.stringify({ source })} -->\n${body}\n\n===\n\n<!-- card: ${JSON.stringify({ template: 'T01', source })} -->\n${body}`);
  const original = JSON.stringify(cards);
  for (const footerMode of FOOTER_MODES) for (const preview of [false, true]) {
    const html = render(cards, { footerMode, preview, footer, brand: { name: brandName, logo: image } });
    const articles = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map(match => match[0]);
    assert.equal(articles.length, 2);
    for (const article of articles) {
      assert.equal(article.split('class="card-source"').length - 1, 1);
      assert.match(article, /class="card-source">Source &lt;paper&gt; &amp; caveat: AI illustration, not evidence\.<\/p>/);
      assert.match(article, /class="footer-text">Footer &lt;note&gt; &amp; caveat: confirm every factual claim\.<\/span>/);
      assert.match(article, /class="brand-name">Author &lt;team&gt; &amp; company<\/span>/);
      assert.match(article, /class="brand-logo"/);
      assert.match(article, /AI-assisted example; verify facts\./);
      assert.match(article, /Sample data, not a verified result\./);
    }
    assert.equal(JSON.stringify(cards), original, 'footer modes must not mutate the parsed cards');
  }
});

test('footer mode allowlist rejects invalid API values and every mode preserves escaping and CSP', () => {
  for (const footerMode of ['', 'none', 'Poster', ' poster ', 'poster" onclick="bad', null, false, 1, {}]) {
    assert.throws(() => render([basicCard], { footerMode }), /Unknown footer mode/);
  }
  const attack = '</span><script>bad()</script><img src="https://invalid.test">';
  for (const footerMode of FOOTER_MODES) {
    const html = render([{ ...basicCard, metadata: { source: attack } }], { footerMode, footer: attack, brand: { name: attack } });
    assert.doesNotMatch(html, /<script\b|<img\b/);
    assert.equal(html.split('&lt;script&gt;bad()&lt;/script&gt;').length - 1, 3);
    assert.match(html, /script-src 'none'/);
    assert.match(html, /connect-src 'none'/);
    assert.match(html, /img-src data:/);
  }
});

test('opt-in footer CSS emphasizes numbering and existing source without hiding or shrinking content', () => {
  const rules = [...layoutCss.matchAll(/([^{}]*\[data-footer-mode="(?:series|report)"\][^{}]*)\{([^}]+)\}/g)];
  assert.equal(rules.length, 3);
  for (const [, selector, declarations] of rules) {
    assert.match(selector, /\.card\[data-footer-mode=/);
    assert.doesNotMatch(declarations, /display\s*:\s*none|visibility|opacity|overflow|font-size|transform|zoom|position|content\s*:/);
  }
  assert.match(layoutCss, /\[data-footer-mode="series"\] > \.card-footer > \.card-index \{[^}]*font-weight: 750/);
  assert.match(layoutCss, /\[data-footer-mode="report"\] > \.card-content > \.card-source \{[^}]*color: var\(--ink\);[^}]*font-weight: 650/);
});
