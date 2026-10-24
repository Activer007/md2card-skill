import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createAssetResolver } from '../scripts/assets.mjs';
import { buildDocument, buildPreviewDocument, SIZES } from '../scripts/document.mjs';
import { escapeHtml, parseCardMetadata, parseMarkdownTokens, renderCards, splitCards } from '../scripts/markdown.mjs';
import { parseSemanticDocument } from '../scripts/semantic.mjs';
import { getTemplate, TEMPLATES } from '../scripts/templates.mjs';
import { loadBrand, parseOptions, exportCards } from '../scripts/render.mjs';
import { visibleSegments, assertPdfSegments } from '../scripts/validate-series.mjs';

// No browser launch, fake geometry, screenshot or generated export is used here.
const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(path.join(root, file), 'utf8');
const inventory = JSON.parse(await read('examples/series/recipes.json'));
const styles = await Promise.all(['themes', 'layouts', 'templates'].map(name => read(`assets/${name}.css`)));
const fixtures = await Promise.all(inventory.recipes.map(async recipe => {
  const source = await read(recipe.input);
  const resolver = await createAssetResolver(path.join(root, recipe.assetRoot));
  const brand = await loadBrand(path.join(root, recipe.brandFile), resolver.resolveImage);
  const cards = renderCards(source, { resolveImage: resolver.resolveImage });
  const options = { ...SIZES.portrait, title: recipe.title, brand, footer: recipe.footer, lang: 'zh-CN' };
  return { recipe, source, cards, brand, options };
}));
const articles = html => [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]);
const count = (text, fragment) => text.split(fragment).length - 1;

function assertSlots(article, card) {
  const slots = [card.templateTitleHtml, card.templateIntroHtml, ...card.sections.map(section => section.html)].filter(Boolean);
  assert.equal(slots.join(''), card.html, 'every authored parser token belongs to exactly one slot');
  let cursor = 0;
  for (const slot of slots) {
    assert.equal(count(article, slot), 1, 'complete source slot is present exactly once');
    const position = article.indexOf(slot, cursor);
    assert.ok(position >= cursor, 'source slots retain their authored reading order');
    cursor = position + slot.length;
  }
}

for (const fixture of fixtures) {
  const { recipe, source, cards, brand, options } = fixture;
  test(`${recipe.id}: explicit boundaries and registered per-card templates stay fixed`, () => {
    assert.equal(source.match(/^===$/gm)?.length ?? 0, recipe.cardCount - 1);
    assert.equal(source.split('\n\n===\n\n').length, recipe.cardCount);
    assert.equal(splitCards(source).length, recipe.cardCount);
    assert.equal(cards.length, recipe.cardCount);
    assert.deepEqual(cards.map(card => card.metadata.template), recipe.templates);
    assert.deepEqual(cards.map(card => card.index), Array.from({ length: recipe.cardCount }, (_, index) => index + 1));
    for (const [index, card] of cards.entries()) {
      const authored = parseCardMetadata(splitCards(source)[index].source, index + 1);
      assert.equal(card.source, authored.source, 'wording, punctuation, line breaks and code spaces are untouched');
      assert.deepEqual(card.metadata, authored.metadata);
      assert.equal(card.metadata.layout, getTemplate(recipe.templates[index]).layout);
      assert.equal(card.metadata.density, recipe.density);
      assert.ok(card.metadata.source);
      assert.equal(card.metadata.image, undefined);
      assert.equal(card.image, undefined);
      assert.doesNotMatch(card.html, /<img\b/);
    }
  });

  test(`${recipe.id}: production HTML/preview structures preserve source, brand and consecutive counters`, async () => {
    for (const build of [buildDocument, buildPreviewDocument]) {
      const html = build(cards, options, ...styles);
      const output = articles(html);
      assert.equal(output.length, recipe.cardCount);
      for (const [index, article] of output.entries()) {
        const card = cards[index];
        assertSlots(article, card);
        assert.match(article, new RegExp(`data-template="${recipe.templates[index]}"`));
        for (const [className, value] of [['card-source', card.metadata.source], ['card-eyebrow', card.metadata.eyebrow], ['brand-name', brand.name], ['footer-text', recipe.footer], ['card-index', `${index + 1} / ${recipe.cardCount}`]]) {
          assert.equal(count(article, `class="${className}">${escapeHtml(value)}<`), 1, className);
        }
        assert.ok(card.metadata.eyebrow.startsWith(brand.name.split(' · ')[0] + ' /'));
        assert.equal(count(article, 'class="brand-logo"'), 1);
        assert.equal(count(article, `src="${brand.logo.dataUrl}"`), 1);
      }
      assert.doesNotMatch(html, /<script\b|src="(?:https?:|file:)|200 \/ 200/);
      assert.match(html, /--card-width: 1080px; --card-height: 1440px/);
      assert.match(html, new RegExp(`--brand-accent: ${brand.accent}`));
    }
    assert.equal(await read(recipe.input), source, 'source file is not rewritten');
  });

  test(`${recipe.id}: automatic pagination is rejected before preflight or browser acquisition`, async () => {
    assert.throws(() => parseSemanticDocument(source), { code: 'PAGINATION_UNSUPPORTED_METADATA' });
    const directory = await mkdtemp(path.join(tmpdir(), 'md2card-series-test-'));
    let preflightCalls = 0, rendererCalls = 0;
    try {
      const options = parseOptions([path.join(root, recipe.input), '--out', path.join(directory, 'out'), '--asset-root', path.join(root, recipe.assetRoot), '--paginate', 'auto']);
      await assert.rejects(exportCards(options, {
        inspectEnvironment: async () => { preflightCalls++; throw new Error('Preflight must not be reached.'); },
        openRenderer: async () => { rendererCalls++; throw new Error('A browser must not be acquired.'); }
      }), { code: 'PAGINATION_UNSUPPORTED_METADATA' });
      assert.equal(preflightCalls, 0);
      assert.equal(rendererCalls, 0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test('recipe selection is documentation-only and never expands the renderer CLI', async () => {
  assert.equal(inventory.status, 'source-only-awaiting-render-and-visual-review');
  assert.deepEqual(inventory.recipes.map(recipe => recipe.cardCount), [5, 3]);
  assert.deepEqual(inventory.recipes[0].roles, ['cover', 'body', 'explanation', 'evidence', 'closing']);
  assert.ok(fixtures[1].cards.every(card => card.metadata.layout !== 'cover'));
  assert.throws(() => parseOptions(['input.md', '--recipe', 'evidence-reading']), { code: 'INVALID_OPTIONS' });
  for (const recipe of inventory.recipes) {
    const options = parseOptions([path.join(root, recipe.input), '--asset-root', path.join(root, recipe.assetRoot), '--brand', path.join(root, recipe.brandFile), '--paginate', recipe.paginate, '--size', recipe.size]);
    assert.equal(options.paginate, 'manual');
    assert.equal(options.template, undefined, 'mixed-template sources are not overridden');
    assert.equal(options.assetRoot, path.join(root, 'examples'));
    assert.equal(options.brandFile, path.join(root, recipe.brandFile));
  }
  for (const file of ['render', 'markdown', 'semantic', 'pagination', 'document']) assert.doesNotMatch(await read(`scripts/${file}.mjs`), /recipes\.json|examples\/series/);
});

test('brand assets resolve from examples, not from the nested input or JSON directory', async () => {
  assert.equal(fixtures[0].brand.name, fixtures[1].brand.name);
  assert.equal(fixtures[0].brand.logo.hash, fixtures[1].brand.logo.hash);
  assert.notEqual(fixtures[0].brand.accent, fixtures[1].brand.accent, 'dark tutorial has its explicitly supplied light accent');
  const incorrect = await createAssetResolver(path.join(root, 'examples/series'));
  for (const fixture of fixtures) await assert.rejects(loadBrand(path.join(root, fixture.recipe.brandFile), incorrect.resolveImage), { code: 'INVALID_ASSET' });
});

test('manual rendering never inserts a cover, closing, CTA, filler, or another partition', () => {
  for (const fixture of fixtures) {
    for (const partition of splitCards(fixture.source)) {
      const [card] = renderCards(partition.source);
      const output = articles(buildDocument([card], fixture.options, ...styles));
      assert.equal(output.length, 1);
      assertSlots(output[0], card);
      assert.equal(count(output[0], 'class="card-index">1 / 1<'), 1);
    }
  }
  const plain = '# 只保留这一张\n\n只保留这一句，不插入封面或收尾。';
  const [card] = renderCards(plain);
  assert.equal(card.metadata.layout, 'explainer');
  assert.equal(card.source, plain);
  assert.equal(renderCards(plain).length, 1);
});

test('native list starts are source-owned, including when an authored list starts at 7', () => {
  const partition = splitCards(fixtures[0].source)[1].source;
  const original = renderCards(partition)[0];
  assert.deepEqual(original.orderedLists, [{ start: 1, count: 3 }]);
  // Synthetic regression input, not an alteration of either delivered recipe.
  const continued = partition.replace(/^1\./m, '7.').replace(/^2\./m, '8.').replace(/^3\./m, '9.');
  const [card] = renderCards(continued);
  assert.deepEqual(card.orderedLists, [{ start: 7, count: 3 }]);
  assert.match(card.html, /<ol start="7">/);
  assert.match(buildDocument([card], SIZES.portrait, ...styles), /<ol start="7">/);
  assert.equal(card.source, parseCardMetadata(continued).source);
});

test('fictional metric retains value, label, denominator, time range and causal limits', () => {
  const card = fixtures[0].cards[3];
  assert.equal(card.metadata.template, 'T21');
  assert.equal(card.metadata.metric, `${12 / 20 * 100}%`);
  assert.equal(card.metadata.label, '提交完成率 · 虚构数据');
  for (const text of ['12 ÷ 20 = 60%', '虚构第 1 周共 7 天', '20 名开始者中有 12 人提交', '每人只计一次', '未评作答质量，也无对照组', '不能证明学会、进步或推广效果']) assert.ok(card.source.includes(text), text);
  const article = articles(buildDocument([card], fixtures[0].options, ...styles))[0];
  assert.equal(count(article, 'class="statistic-value">60%</p>'), 1);
  assert.equal(count(article, 'class="statistic-label">提交完成率 · 虚构数据</p>'), 1);
  for (const field of ['metric', 'label']) {
    const metadata = { ...card.metadata };
    delete metadata[field];
    assert.throws(() => renderCards(`<!-- card: ${JSON.stringify(metadata)} -->\n${card.source}`), { code: 'TEMPLATE_METADATA_REQUIRED' });
  }
});

test('actual tutorial code executes correctly, with independently checked nonempty and empty results', () => {
  const code = fixtures[1].cards.slice(0, 2).map(card => {
    const fences = parseMarkdownTokens(card.source).filter(token => token.type === 'fence');
    assert.equal(fences.length, 1);
    assert.equal(fences[0].info, 'js');
    assert.ok(fences[0].content.trimEnd().split('\n').length <= 6);
    assert.ok(card.html.includes(escapeHtml(fences[0].content)), 'code indentation and text stay literal');
    return fences[0].content;
  });
  const output = [];
  runInNewContext(code[0], { console: { log: value => output.push(value) } }, { timeout: 1000 });
  assert.deepEqual(output, [150]);
  const cases = [ [[], null], [[120, 180, 150], 150], [[0], 0], [[100, 200], 150], [[0, 0], 0] ];
  for (const [input, expected] of cases) assert.equal(runInNewContext(`${code[1]}\nmean(${JSON.stringify(input)})`, {}, { timeout: 1000 }), expected);
  assert.doesNotMatch(code[1], /console\./, 'second card explicitly describes return values, not fake printed output');
  for (const phrase of ['有限非负数', '累加溢出', '不是实际性能测量']) assert.ok(fixtures[1].source.includes(phrase));
});

test('series keep their own input scope rather than borrowing portrait template acceptance', () => {
  for (const { cards } of fixtures) for (const card of cards) {
    assert.equal(card.metadata.density, 'compact');
    assert.equal(getTemplate(card.metadata.template).density, 'standard');
    assert.notEqual(card.metadata.density, getTemplate(card.metadata.template).density);
  }
});

// Importing the future real-browser validator is side-effect free. Only this
// pure source-text extraction helper is executed in the current environment.
test('future PDF checks derive complete source-owned segments, not potentially incomplete output', () => {
  for (const { cards } of fixtures) for (const card of cards) {
    const segments = visibleSegments(card);
    assert.ok(segments.includes(card.metadata.source));
    assert.ok(segments.includes(card.metadata.eyebrow));
    for (const token of parseMarkdownTokens(card.source).filter(token => token.type === 'fence')) assert.ok(segments.includes(token.content));
  }
  const [card] = renderCards('# 标题\n\n保留 **强调**、`code` 和 [出处](https://example.invalid)。');
  assert.deepEqual(visibleSegments(card), ['标题', '保留 强调、code 和 出处。']);
});

// pdftotext -layout aligns columns visually and can interleave complete source
// paragraphs. Presence checks use per-page -raw, not a weakened marker subset.
test('PDF source coverage keeps complete paragraphs without assuming visual column order', () => {
  const segments = ['Main first line main second line.', 'Sidebar first line sidebar second line.'];
  const visual = 'Main first line Sidebar first line\nmain second line. sidebar second line.';
  const logical = 'Main first line\nmain second line.\nSidebar first line\nsidebar second line.';
  assert.throws(() => assertPdfSegments(visual, segments, 'visual columns'));
  assert.doesNotThrow(() => assertPdfSegments(logical, segments, 'logical source'));
  assert.throws(() => assertPdfSegments('Main first line main second line.', segments, 'missing sidebar'));
});
