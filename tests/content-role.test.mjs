import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderCards } from '../scripts/markdown.mjs';
import { createAssetResolver } from '../scripts/assets.mjs';
import { summarizeContentRoles } from '../scripts/content-role.mjs';

const summary = source => summarizeContentRoles(renderCards(source))[0];
test('roles use authored metadata and actual blocks, with an explicit unknown fallback', () => {
  const cases = [
    ['# screenshot 界面截图\n\n普通文字。', 'unknown'],
    ['<!-- card: {"layout":"cover"} -->\n# 开篇\n\n导语。', 'cover-intro'],
    ['# 概念\n\n## 定义\n\n正文。', 'concept-explain'],
    ['# 方法\n\n3. 检查来源\n4. 保留限定语', 'steps'],
    ['# 方法\n\n- 检查来源\n- 保留限定语', 'steps'],
    ['# 引文\n\n> 原创演示。', 'quote-evidence'],
    ['<!-- card: {"layout":"comparison"} -->\n# 两种方案\n\n## A\n\n特点甲。\n\n## B\n\n特点乙。', 'comparison'],
    ['<!-- card: {"metric":"42%","label":"演示比例"} -->\n# 指标', 'metric'],
    ['<!-- card: {"source":"作者提供的线索"} -->\n一条未核实资料。', 'source-note']
  ];
  for (const [source, role] of cases) assert.equal(summary(source).role, role, source);
  assert.ok(summary(cases[0][0]).caveats.includes('UNKNOWN_ROLE'));
  assert.ok(summary(cases[7][0]).caveats.includes('SOURCE_NOT_PROVIDED'));
  assert.ok(summary(cases[8][0]).caveats.includes('SOURCE_NOT_FACT_CHECKED'));
});

test('real local screenshot and synthetic photo identity comes from validated assets plus author description', async () => {
  const resolver = await createAssetResolver(fileURLToPath(new URL('../examples/templates', import.meta.url)));
  for (const [id, role] of [['T20', 'screenshot-evidence'], ['T37', 'photo-story']]) {
    const input = await readFile(new URL(`../examples/templates/${id}.md`, import.meta.url), 'utf8');
    const cards = renderCards(input, { resolveImage: resolver.resolveImage });
    const [result] = summarizeContentRoles(cards);
    assert.equal(result.role, role); assert.equal(result.features.metadataImage, true);
    assert.ok(result.caveats.includes('IMAGE_SEMANTICS_NOT_VERIFIED'));
  }
});

test('long code and wide tables are pressure caveats, not invented fit measurements', () => {
  const code = summary('# 代码\n\n```js\n' + Array.from({length: 9}, () => 'x'.repeat(90)).join('\n') + '\n```');
  assert.equal(code.features.codeLines, 9); assert.equal(code.features.maxCodeLineCharacters, 90);
  assert.ok(code.caveats.includes('LONG_CODE'));
  const table = summary('# 表格\n\n| A | B | C | D | E |\n|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 |');
  assert.equal(table.features.tableColumns, 5); assert.ok(table.caveats.includes('WIDE_TABLE'));
});

test('card provenance and shared references survive without mutating deeply frozen parse results', async () => {
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const cards = freeze(renderCards('# 一\n\n[证据][ref]\n\n===\n\n# 二\n\n## 说明\n\n[ref]: https://example.invalid/source'));
  const before = JSON.stringify(cards), a = summarizeContentRoles(cards), b = summarizeContentRoles(cards);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(cards), before);
  assert.deepEqual(a.map(c => c.index), [1, 2]);
  assert.deepEqual(a.map(c => c.sourceLines), cards.map(c => c.sourceLines));
  assert.equal(a[0].features.characters, 3, 'H1 plus reference label, not its URL');
  assert.deepEqual(a[1].headings[1].bodyLines, [3, 3]);
});

test('unvalidated images and unknown metadata cannot become role evidence', () => {
  assert.throws(() => renderCards('<!-- card: {"image":"https://example.invalid/ui.png"} -->\n# 图'), {code:'INVALID_ASSET'});
  assert.throws(() => renderCards('<!-- card: {"imageRole":"screenshot"} -->\n# 图'), {code:'INVALID_METADATA'});
  const [card] = renderCards('# 图');
  assert.throws(() => summarizeContentRoles([{...card,metadata:{image:'local.png'}}]), {code:'INVALID_ASSET'});
  assert.throws(() => summarizeContentRoles([{...card,metadata:{visualVariant:'anything'}}]), {code:'INVALID_METADATA'});
  assert.throws(() => summarizeContentRoles([]), {code:'INVALID_RECOMMENDATION_INPUT'});
});

test('validated inline image alt, including shared references, supplies author image descriptions', async () => {
  const resolver = await createAssetResolver(fileURLToPath(new URL('../examples/templates', import.meta.url)));
  const source = '# 界面说明\n\n![原创界面截图][image]\n\n===\n\n# 引用定义\n\n[image]: assets/original-research-interface.png';
  const cards = renderCards(source, {resolveImage: resolver.resolveImage});
  const [summary] = summarizeContentRoles(cards);
  assert.equal(summary.role, 'screenshot-evidence');
  assert.equal(summary.features.inlineImages, 1);
  assert.equal(summary.features.metadataImage, false);
});
