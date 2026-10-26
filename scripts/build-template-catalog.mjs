#!/usr/bin/env node
// Documentation only: reuse the gallery's registry and verified original PNGs.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGalleryModel, escapeHtml, ROOT } from './build-template-gallery.mjs';

export const CATALOG_PATH = 'docs/TEMPLATE_CATALOG.md';
// Editorial selection, not a second template registry. Names/images come from the model.
const FEATURED = ['T01', 'T05', 'T09', 'T13', 'T19', 'T21', 'T25', 'T29', 'T35', 'T37', 'T41', 'T48'];
const START = '<!-- template-showcase:start -->';
const END = '<!-- template-showcase:end -->';
const text = value => escapeHtml(value).replaceAll('|', '&#124;').replace(/\r?\n/g, ' ');
const aspectLabels = { portrait: '3:4', square: '1:1', slide: '16:9', 'wechat-wide': '21:9' };
const table = cells => {
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`| ${cells[i]} | ${cells[i + 1] ?? ''} |`);
  return '| 模板效果 | 模板效果 |\n| --- | --- |\n' + rows.join('\n');
};
const preview = (item, prefix = '') => item.preview
  ? `[![${text(`${item.id} ${item.name}`)}](${prefix}${item.preview.path})](${prefix}${item.preview.path})`
  : '暂无已绑定预览；不借用历史图片';

export function renderShowcase(model) {
  const items = FEATURED.map(id => {
    const item = model.items.find(item => item.id === id);
    assert.ok(item, `Featured template ${id} is missing; review the selection`);
    return item;
  });
  assert.equal(new Set(items.map(item => item.family)).size, 12, 'Feature one example per family');
  return `${START}\n${table(items.map(item => `**${text(item.familyLabel)} · ${item.id}**<br>${preview(item)}<br>${text(item.purpose)}<br>[模板详情与示例](docs/TEMPLATE_CATALOG.md#${item.id.toLowerCase()})`))}\n${END}`;
}

export function renderCatalog(model) {
  const families = [...new Set(model.items.map(item => item.family))];
  const intro = `# ${model.items.length} 套模板效果目录\n\n[返回首页](../README.md) · [Skill 使用指南](SKILL_USAGE.md) · [下载后打开离线图库](gallery/index.html)\n\n按家族浏览，点击图片查看原尺寸，点击 Markdown 查看可复现输入。此页可在 GitHub 直接阅读；离线图库需下载完整仓库后打开。\n\n预览是已绑定的真实 1080×1440、标准间距、默认字号样例，不保证换成你的内容仍能放下。画幅列表表示已注册的支持范围，不表示竖图能直接裁成其他比例。额外画幅使用独立示例，见[画幅说明](TEMPLATE_ASPECTS.md)与[公众号封面](visual-upgrade/M4_WECHAT_COVERS.md)。素材包含明确披露的合成图及虚构演示，见[素材说明](../examples/templates/assets/README.md)。\n\n`;
  const nav = families.map(family => {
    const members = model.items.filter(item => item.family === family);
    return `- [${text(members[0].familyLabel)} · ${members.map(item => item.id).join(' / ')}](#family-${family})`;
  }).join('\n');
  const sections = families.map(family => {
    const members = model.items.filter(item => item.family === family);
    const cells = members.map(item => `<a name="${item.id.toLowerCase()}"></a>**${item.id} ${text(item.name)}**<br>${preview(item, '../')}<br><strong>用途：</strong>${text(item.purpose)}<br><strong>图片：</strong>${text(item.imageLabel)}<br><strong>画幅：</strong>${item.aspects.map(aspect => aspectLabels[aspect] ?? text(aspect)).join(' / ')}<br>[Markdown 示例](../${item.example})`);
    const conditions = members.map(item => `**${item.id} ${text(item.name)}**\n\n- 结构：${text(item.structure)}\n- 不适合：${text(item.unsuitable)}\n`).join('\n');
    return `<a name="family-${family}"></a>\n## ${text(members[0].familyLabel)}\n\n${table(cells)}\n\n<details>\n<summary>查看这组模板的内容结构与使用限制</summary>\n\n${conditions}\n</details>`;
  }).join('\n\n');
  return `${intro}${nav}\n\n${sections}\n\n## 可选构图与维护\n\nT20 产品截图与 T37 摄影封面有[独立构图示例](GALLERY_VISUAL_VARIANTS.md)，不是额外模板。T37 的黑色品牌历史失败图不用于此目录；当前默认文字策略见[可读性修复](T37_DEFAULT_CONTRAST.md)。\n\n本文件由 \`node scripts/build-template-catalog.mjs\` 生成；更新后用 \`--check\` 校验。名称、用途、条件、画幅来自唯一模板注册表，PNG 来自既有图库证据校验，不重新渲染或生成新验收声明。详细历史与验证入口见[文档导航](DOCUMENTATION.md)。\n`;
}

export async function buildTemplateDocs({ check = false } = {}) {
  const model = await buildGalleryModel();
  const readmePath = path.join(ROOT, 'README.md');
  const current = await readFile(readmePath, 'utf8');
  assert.equal(current.split(START).length, 2, 'README must contain exactly one showcase start');
  assert.equal(current.split(END).length, 2, 'README must contain exactly one showcase end');
  assert.ok(current.indexOf(START) < current.indexOf(END), 'Showcase markers out of order');
  const readme = current.slice(0, current.indexOf(START)) + renderShowcase(model) + current.slice(current.indexOf(END) + END.length);
  const catalog = renderCatalog(model);
  if (check) {
    assert.equal(current, readme, 'README showcase is stale; run docs:build');
    assert.equal(await readFile(path.join(ROOT, CATALOG_PATH), 'utf8'), catalog, 'Template catalogue is stale; run docs:build');
  } else {
    await writeFile(path.join(ROOT, CATALOG_PATH), catalog);
    await writeFile(readmePath, readme);
  }
  return { templates: model.items.length, previews: model.accepted.length, families: model.families.length, featured: FEATURED.length, check };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.slice(2).every(arg => arg === '--check'), 'Usage: node scripts/build-template-catalog.mjs [--check]');
  console.log(JSON.stringify(await buildTemplateDocs({ check: process.argv.includes('--check') })));
}
