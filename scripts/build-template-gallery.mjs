#!/usr/bin/env node
// Source-only: import registry data, verify existing evidence, and write static HTML.
// This script never imports the renderer, launches Chromium, or uses the network.
import { readFile, realpath, stat, lstat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { TEMPLATES, DENSITIES } from './templates.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const GALLERY_PATH = 'docs/gallery/index.html';
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const FAMILY_NAMES = Object.freeze({ editorial: '科学 / 编辑杂志', swiss: '瑞士极简', bauhaus: '包豪斯几何', brutalist: '新粗野海报', technology: '深色科技', business: '数据与商业', journal: '温暖手账', eastern: '东方书卷', newspaper: '复古报刊', film: '胶片摄影', pop: '糖果波普', nature: '自然生活' });
const IMAGE_NAMES = Object.freeze({ none: '无需图片', required: '必需本地图片', inline: '必需正文图片', optional: '图片可选' });
const DENSITY_NAMES = Object.freeze({ compact: 'compact · 紧凑间距', standard: 'standard · 标准间距', editorial: 'editorial · 宽松间距' });
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const digest = value => createHash('sha256').update(value).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fail = message => { throw new Error(`TEMPLATE_GALLERY_INVALID: ${message}`); };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function validateRepoPath(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(value) || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..')) fail(`unsafe repository path: ${String(value)}`);
  return value;
}

async function readRepoFile(root, relative) {
  validateRepoPath(relative);
  const base = await realpath(root);
  let resolved;
  try { resolved = await realpath(path.join(base, relative)); }
  catch { fail(`missing repository file: ${relative}`); }
  const inside = path.relative(base, resolved);
  if (inside.startsWith(`..${path.sep}`) || inside === '..' || path.isAbsolute(inside)) fail(`file escapes repository: ${relative}`);
  if (!(await stat(resolved)).isFile()) fail(`not a regular file: ${relative}`);
  return readFile(resolved);
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { fail(`invalid JSON: ${label}`); }
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`missing text: ${label}`);
}

function validateScope(scope, label) {
  if (!scope || (!Number.isSafeInteger(scope.version) || scope.version < 1) || scope.density !== 'standard' || scope.aspect !== 'portrait' || scope.width !== 1080 || scope.height !== 1440 || scope.pagination !== 'manual') fail(`unsupported acceptance scope: ${label}`);
}

export async function buildGalleryModel({ root = ROOT, templates = TEMPLATES } = {}) {
  const bindings = parseJson(await readRepoFile(root, 'docs/template-gallery-evidence.json'), 'gallery evidence bindings');
  if (!bindings || bindings.schemaVersion !== 1 || !Array.isArray(bindings.batches)) fail('unsupported gallery evidence schema');
  const batches = new Map();
  for (const batch of bindings.batches) {
    if (!batch || !/^[a-z0-9-]+$/.test(batch.id) || batches.has(batch.id)) fail('invalid or duplicate evidence batch');
    validateScope(batch.scope, batch.id);
    if (batch.previewDirectory !== undefined) {
      validateRepoPath(batch.previewDirectory);
      if (!batch.previewDirectory.startsWith('docs/images/')) fail(`invalid preview directory: ${batch.id}`);
    }
    const reviewBytes = await readRepoFile(root, batch.review);
    const evidenceBytes = await readRepoFile(root, batch.evidence);
    if (!SHA256.test(batch.reviewSha256) || digest(reviewBytes) !== batch.reviewSha256 || !SHA256.test(batch.evidenceSha256) || digest(evidenceBytes) !== batch.evidenceSha256) fail(`evidence/review file hash mismatch: ${batch.id}`);
    const evidence = parseJson(evidenceBytes, batch.evidence);
    if (!evidence || evidence.schemaVersion !== 1 || !COMMIT.test(evidence.codeCommit) || !COMMIT.test(evidence.codeTree) || !SHA256.test(evidence.archiveSha256) || !Array.isArray(evidence.records)) fail(`incomplete provenance: ${batch.id}`);
    const review = reviewBytes.toString('utf8');
    if (!review.includes(`## ${batch.id}\n`) || !review.includes(evidence.codeCommit)) fail(`review and source commit disagree: ${batch.id}`);
    const records = new Map();
    for (const record of evidence.records) {
      if (!record || !/^T[0-9]{2}$/.test(record.id) || records.has(record.id) || !SHA256.test(record.input) || !SHA256.test(record.png) || !SHA256.test(record.pdf)) fail(`invalid or duplicate provenance record: ${batch.id}`);
      records.set(record.id, record);
    }
    batches.set(batch.id, { ...batch, reviewText: review, records, provenance: evidence, evidenceSha256: digest(evidenceBytes) });
  }
  const seen = new Set();
  const items = [];
  for (const template of templates) {
    if (!/^T[0-9]{2}$/.test(template.id) || seen.has(template.id)) fail('invalid or duplicate template ID');
    seen.add(template.id);
    for (const key of ['name', 'family', 'layout', 'composition', 'purpose', 'structure', 'unsuitable', 'reading']) requireText(template[key], `${template.id}.${key}`);
    if (!/^[a-z][a-z0-9-]*$/.test(template.family) || !/^[a-z][a-z0-9-]*$/.test(template.layout) || !/^[a-z][a-z0-9-]*$/.test(template.composition) || !Object.hasOwn(IMAGE_NAMES, template.image) || !DENSITIES.includes(template.density) || !Number.isSafeInteger(template.version) || template.version < 1) fail(`invalid registry contract: ${template.id}`);
    if (!Array.isArray(template.length) || template.length.length !== 2 || !template.length.every(Number.isSafeInteger) || template.length[0] < 0 || template.length[1] < template.length[0]) fail(`invalid length guidance: ${template.id}`);
    for (const key of ['design', 'text', 'assets']) requireText(template.provenance?.[key], `${template.id}.provenance.${key}`);
    if (template.example !== `examples/templates/${template.id}.md`) fail(`example path does not match ID: ${template.id}`);
    const input = await readRepoFile(root, template.example);
    const firstLine = input.toString('utf8').trimStart().split(/\r?\n/)[0];
    const metadataMatch = /^<!-- card: (.+) -->$/.exec(firstLine);
    const metadata = metadataMatch ? parseJson(Buffer.from(metadataMatch[1]), `${template.id} metadata`) : null;
    if (metadata?.template !== template.id || (metadata.density ?? 'standard') !== template.density) fail(`example metadata disagrees with registry: ${template.id}`);
    if (!Array.isArray(template.aspects) || !template.aspects.length || new Set(template.aspects).size !== template.aspects.length || template.aspects.some(aspect => !['portrait', 'square', 'slide'].includes(aspect))) fail(`invalid aspect contract: ${template.id}`);
    const item = { ...template, familyLabel: FAMILY_NAMES[template.family] ?? template.family, imageLabel: IMAGE_NAMES[template.image], inputSha256: digest(input), preview: null };
    if (template.acceptance !== undefined) {
      const batch = batches.get(template.acceptance);
      if (!batch || template.status !== 'visually-reviewed') fail(`missing acceptance binding or wrong status: ${template.id}`);
      const record = batch.records.get(template.id);
      if (!record || item.inputSha256 !== record.input) fail(`accepted input hash mismatch or missing record: ${template.id}`);
      if (template.version !== batch.scope.version || template.density !== batch.scope.density || !template.aspects.includes(batch.scope.aspect) || template.aspectLayouts?.[batch.scope.aspect]?.acceptance !== template.acceptance || template.aspectLayouts?.[batch.scope.aspect]?.status !== 'visually-reviewed') fail(`accepted scope differs from registry: ${template.id}`);
      const preview = `${batch.previewDirectory ?? 'docs/images/templates'}/${template.id}.png`;
      const bytes = await readRepoFile(root, preview);
      if (digest(bytes) !== record.png) fail(`accepted PNG hash mismatch: ${template.id}`);
      if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== batch.scope.width || bytes.readUInt32BE(20) !== batch.scope.height) fail(`accepted PNG dimensions or signature mismatch: ${template.id}`);
      const reviewImageLink = path.posix.relative(path.posix.dirname(batch.review), preview);
      if (!batch.reviewText.includes(`(${reviewImageLink})`) || !batch.reviewText.includes(`(../${template.example})`)) fail(`review is missing exact preview/input links: ${template.id}`);
      item.preview = { path: preview, sha256: record.png, ...batch.scope };
      item.evidence = { batch: batch.id, review: batch.review, path: batch.evidence, sha256: batch.evidenceSha256, codeCommit: batch.provenance.codeCommit, codeTree: batch.provenance.codeTree };
    } else if (template.status !== 'implemented-awaiting-visual-review') {
      fail(`unrecognized pending status: ${template.id}`);
    }
    if (template.historicalAcceptances !== undefined && !Array.isArray(template.historicalAcceptances)) fail(`historicalAcceptances must be an array: ${template.id}`);
    const histories = [...(template.historicalAcceptance === undefined ? [] : [template.historicalAcceptance]), ...(template.historicalAcceptances ?? [])];
    const historicalBatches = new Set();
    const historicalVersions = new Set();
    item.histories = [];
    for (const history of histories) {
      const batch = batches.get(history?.batch);
      const record = batch?.records.get(template.id);
      if (!history || Array.isArray(history) || !batch || !record || !Number.isSafeInteger(history.version) || history.version < 1 || history.version >= template.version || history.version !== batch.scope.version) fail(`invalid historical acceptance or missing record: ${template.id}`);
      if (historicalBatches.has(history.batch) || historicalVersions.has(history.version)) fail(`duplicate historical acceptance batch or version: ${template.id}`);
      historicalBatches.add(history.batch);
      historicalVersions.add(history.version);
      // Historical source is deliberately kept unchanged. A changed authored input
      // needs its own archived source, not a silently updated historical digest.
      if (digest(input) !== record.input) fail(`historical accepted input hash mismatch: ${template.id}`);
      const historicalPreview = `${batch.previewDirectory ?? 'docs/images/templates'}/${template.id}.png`;
      const bytes = await readRepoFile(root, historicalPreview);
      if (digest(bytes) !== record.png) fail(`historical PNG hash mismatch: ${template.id}`);
      if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== batch.scope.width || bytes.readUInt32BE(20) !== batch.scope.height) fail(`historical PNG dimensions or signature mismatch: ${template.id}`);
      const reviewImageLink = path.posix.relative(path.posix.dirname(batch.review), historicalPreview);
      if (!batch.reviewText.includes(`(${reviewImageLink})`) || !batch.reviewText.includes(`(../${template.example})`)) fail(`review is missing exact preview/input links: ${template.id}`);
      item.histories.push({ version: history.version, batch: history.batch, review: batch.review, path: batch.evidence, sha256: batch.evidenceSha256, previewPath: historicalPreview, previewSha256: record.png, codeCommit: batch.provenance.codeCommit, codeTree: batch.provenance.codeTree });
    }
    item.histories.sort((a, b) => a.version - b.version);
    // Keep the original single-history model property as an oldest-epoch alias.
    if (item.histories.length) item.history = item.histories[0];
    item.command = `node scripts/render.mjs ${template.example} --out output/${template.id} --size portrait --paginate manual --format all --strict --preview`;
    items.push(item);
  }
  // Evidence may not silently keep an accepted record that disappeared from the registry.
  for (const batch of batches.values()) for (const id of batch.records.keys()) {
    if (!items.some(item => item.id === id && (item.acceptance === batch.id || item.histories.some(history => history.batch === batch.id)))) fail(`orphaned acceptance record: ${batch.id}/${id}`);
  }
  items.sort((a, b) => compare(a.id, b.id));
  return { schemaVersion: 1, items, accepted: items.filter(item => item.preview), pending: items.filter(item => !item.preview), families: [...new Set(items.map(item => item.family))].sort(compare).map(value => ({ value, label: FAMILY_NAMES[value] ?? value })), densities: [...DENSITIES] };
}

const e = escapeHtml;
const href = relative => `../../${validateRepoPath(relative)}`;
const link = (relative, text) => `<a href="${e(href(relative))}">${e(text)}</a>`;
const field = (label, value) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`;

function renderDetails(item) {
  const accepted = item.preview !== null;
  const evidence = accepted ? `<div><dt>验收证据</dt><dd>${link(item.evidence.review, `${item.evidence.batch} 逐图复核记录`)} · ${link(item.evidence.path, '原始产物哈希记录')}<br>源码提交 <code>${e(item.evidence.codeCommit)}</code><br>完整代码树 <code>${e(item.evidence.codeTree)}</code></dd></div>
${field('已验收 PNG SHA-256', item.preview.sha256)}${field('证据文件 SHA-256', item.evidence.sha256)}` : field('验收证据', '尚无当前版本的真实 PNG / 手机 / PDF 视觉验收包；源码实现不等于成品。');
  const history = item.histories.map(entry => `<div><dt>历史版本 v${entry.version}</dt><dd>${e(`v${entry.version} 的 ${entry.batch} 仅为旧设计证据，不证明当前 v${item.version}。`)}<br>${link(entry.previewPath, `v${entry.version} 历史 PNG`)} · ${link(entry.review, `${entry.batch} 逐图复核记录`)} · ${link(entry.path, '历史产物哈希记录')}<br>历史源码提交 <code>${e(entry.codeCommit)}</code></dd></div>`).join('');
  return `<details class="detail"><summary>结构、边界与复现 · ${e(item.id)}</summary>
<dl>${field('输入结构', item.structure)}${field('不适用 / 限制', item.unsuitable)}${field('推荐内容量', `${item.length[0]}–${item.length[1]} 字，仅为选型参考，不保证放得下。`)}${field('版本 / 构图', `v${item.version} · ${item.composition} · ${item.layout}`)}${field('注册示例', `${item.density} 密度 · ${item.reading} 阅读预设 · 3:4 · manual`)}${field('源码支持画幅', `${item.aspects.join(' / ')}；支持不等于已验收。当前预览仅绑定上面的默认 3:4 示例；T04 / T21 的四个指定短例保留历史证据；共用字体更新后须重新验收，见画幅说明。`)}${field('其他密度', `${DENSITIES.join(' / ')} 仅改变间距，不缩小字体。当前真实预览只证明 standard 注册示例。`)}${field('设计来源', item.provenance.design)}${field('文字来源', item.provenance.text)}${field('素材来源', item.provenance.assets)}${field('当前示例 SHA-256', item.inputSha256)}${evidence}${history}</dl>
<p class="command-label">在仓库根目录复现${accepted ? '同一输入' : '候选示例'}（需允许的 Chromium、中文字体与 Poppler 环境）：</p><pre><code>${e(item.command)}</code></pre>
<p class="fine-print">输出目录必须为空或不存在。命令使用当前代码；要复现历史截图，还需匹配记录中的代码、字体与环境。这里不执行渲染。</p>
</details>`;
}

function renderItem(item) {
  const accepted = item.preview !== null;
  const image = accepted ? `<a class="preview-link" href="${e(href(item.preview.path))}" aria-label="${e(`${item.id} ${item.name}：打开原始 PNG`)}"><img src="${e(href(item.preview.path))}" width="${item.preview.width}" height="${item.preview.height}" loading="lazy" decoding="async" alt="${e(`${item.id} ${item.name}的真实导出示例；1080 × 1440，standard 密度。`)}"></a>` : '';
  return `<article id="${e(item.id)}" class="template ${accepted ? 'accepted-card' : 'pending-card'}" data-template-card data-status="${accepted ? 'accepted' : 'pending'}" data-family="${e(item.family)}" data-purpose="${e(`${item.id} ${item.name} ${item.purpose}`)}" data-image="${e(item.image)}" data-density="${e(item.density)}" aria-labelledby="heading-${e(item.id)}">
${image}<div class="card-content"><p class="eyebrow"><span>${e(item.id)} · ${e(item.familyLabel)}</span><span class="status ${accepted ? 'accepted' : 'pending'}">${accepted ? '已验收示例' : '待视觉验收'}</span></p>
<h3 id="heading-${e(item.id)}">${e(item.name)}</h3><p class="purpose">${e(item.purpose)}</p><p class="tags">${e(item.imageLabel)} · ${e(item.density)} · v${item.version}</p>
${accepted ? '<p class="preview-note">原始 PNG，未裁切；缩略图不是手机阅读验收。</p>' : '<p class="preview-note">仅列源码契约；没有缩略图，不代表成品。</p>'}
<p class="links">${link(item.example, `${item.id} 完整 Markdown 输入`)}${accepted ? ` · ${link(item.preview.path, '原始 PNG')}` : ''} · <a href="#${e(item.id)}">定位此模板</a></p>
${renderDetails(item)}</div></article>`;
}

export function renderGallery(model) {
  const options = entries => entries.map(({ value, label }) => `<option value="${e(value)}">${e(label)}</option>`).join('');
  return `<!doctype html>
<!-- Generated by scripts/build-template-gallery.mjs. Do not edit by hand. -->
<html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${e(CSP)}"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>真实模板图库 · md2card</title><link rel="stylesheet" href="gallery.css"><script src="gallery.js" defer></script></head>
<body><a class="skip-link" href="#main">跳到模板内容</a><header class="masthead"><a class="wordmark" href="../../README.md">md2card<span> / TEMPLATE LIBRARY</span></a><nav aria-label="图库导航"><a href="#accepted">真实预览</a><a href="#pending">候选目录</a><a href="#about">使用说明</a></nav></header>
<main id="main"><section class="intro" aria-labelledby="page-title"><div><p class="kicker">本地静态图库 · 原创构图</p><h1 id="page-title">先看真实输出，<br>再选合适的表达。</h1><p class="lead">不用概念图代替成品。每张预览都对应真实导出、完整输入和可核对的验收记录。</p></div><dl class="totals"><div><dt>已验收示例</dt><dd>${model.accepted.length}<span>套</span></dd></div><div><dt>源码已实现</dt><dd>${model.items.length}<span>套</span></dd></div><div><dt>已实现家族</dt><dd>${model.families.length}<span>类</span></dd></div></dl></section>
<p class="scope-note">已验收 ${model.accepted.length} 套与源码已实现 ${model.items.length} 套分开计数。真实预览仅限各条目标明的已验收版本、standard、3:4、manual，不表示所有内容、密度或环境已通过。</p>
<section class="filters" aria-labelledby="filter-title" data-filter-panel hidden><h2 id="filter-title">找一个合适的起点</h2><div class="filter-grid"><label for="family-filter">家族 / 风格<select id="family-filter"><option value="">全部家族</option>${options(model.families)}</select></label><label for="purpose-filter">用途 / 名称关键词<input id="purpose-filter" type="search" placeholder="例如：阅读、机制、T01" autocomplete="off" maxlength="160"></label><label for="image-filter">图片需求<select id="image-filter"><option value="">全部图片需求</option>${options(Object.entries(IMAGE_NAMES).filter(([value]) => model.items.some(item => item.image === value)).map(([value, label]) => ({ value, label })))}</select></label><label for="density-filter">注册示例密度<select id="density-filter" aria-describedby="density-help"><option value="">全部示例密度</option>${options(model.densities.map(value => ({ value, label: DENSITY_NAMES[value] ?? value })))}</select></label><button type="button" id="reset-filters">重置筛选</button></div><p id="density-help" class="fine-print">密度按注册示例筛选，不把 standard 的截图冒充其他密度。compact / editorial 只是间距选项，目前没有对应验收预览；选中可能没有结果。</p><p id="filter-result" role="status" aria-live="polite" aria-atomic="true">显示 ${model.accepted.length} 个已验收示例，${model.pending.length} 个待验收候选。</p></section>
<noscript><p class="scope-note">脚本未启用：下方保留完整静态索引、原图、输入和详情。可用浏览器查找模板名称或 ID。</p></noscript>
<section id="accepted" aria-labelledby="accepted-title"><div class="section-heading"><div><p class="kicker">01 / 已有可追溯的真实产物</p><h2 id="accepted-title">真实预览 <span>${model.accepted.length}</span></h2></div><p>点图查看完整 PNG；展开详情查看适用边界。</p></div><p class="empty-state" data-empty="accepted" hidden>没有匹配的已验收示例。可放宽筛选；下方候选不等于已验收替代品。</p><div class="accepted-grid">${model.accepted.map(renderItem).join('\n')}</div></section>
<section id="pending" aria-labelledby="pending-title"><div class="section-heading"><div><p class="kicker">02 / 只列已实现的源码契约</p><h2 id="pending-title">候选目录 <span>${model.pending.length}</span></h2></div><p>尚待真实渲染与逐图验收，不使用色板或假预览。</p></div><p class="empty-state" data-empty="pending" hidden>没有匹配的待验收候选。</p><div class="pending-grid">${model.pending.map(renderItem).join('\n')}</div></section>
<section id="about" class="about" aria-labelledby="about-title"><h2 id="about-title">选模板，不牺牲内容。</h2><ol><li>先看用途、输入结构和不适用场景。推荐字数是引导，不是放得下的保证。</li><li>打开完整 Markdown，再在允许的本地环境复现。所有渲染仍强制检查溢出，不静默改写、缩字、裁切或删出处。</li><li>这是离线索引，不含账号、在线字体、远程资源、模型调用或在线渲染。禁用脚本也可浏览所有条目。</li></ol><p>${link('docs/TEMPLATE_UPGRADE_ACCEPTANCE.md', '48 套模板验收记录')} · ${link('docs/TEMPLATE_ASPECTS.md', '独立画幅证据')} · ${link('docs/template-gallery-evidence.json', '图库证据绑定')} · ${link('docs/TEMPLATE_GALLERY.md', '生成与验证边界')} · ${link('scripts/templates.mjs', '唯一模板注册表')}</p><p class="fine-print">图库已检查实际 file:// 资源、筛选、键盘、手机与等效 200% reflow；完整读屏辅助技术和原生浏览器菜单缩放未认证。新增预览后的当前页面仍以最终精确提交检查为准。</p></section></main><footer>md2card · 原创模板，诚实呈现能力边界。</footer></body></html>\n`;
}

export async function generateGallery({ root = ROOT, check = false } = {}) {
  const model = await buildGalleryModel({ root });
  // Load these too: a generated index must not knowingly link missing assets.
  await readRepoFile(root, 'docs/gallery/gallery.css');
  await readRepoFile(root, 'docs/gallery/gallery.js');
  await readRepoFile(root, 'docs/TEMPLATE_GALLERY.md');
  const html = renderGallery(model);
  const output = path.join(root, GALLERY_PATH);
  if (check) {
    const saved = await readRepoFile(root, GALLERY_PATH);
    if (saved.toString('utf8') !== html) fail('generated gallery is stale; run node scripts/build-template-gallery.mjs');
  } else {
    await mkdir(path.dirname(output), { recursive: true });
    // Reject symlink outputs/directories rather than write outside the repository.
    const rootReal = await realpath(root);
    const directoryReal = await realpath(path.dirname(output));
    if (directoryReal !== path.join(rootReal, 'docs', 'gallery')) fail('gallery output directory is a symlink');
    try { if ((await lstat(output)).isSymbolicLink()) fail('gallery output file is a symlink'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writeFile(output, html, 'utf8');
  }
  return { implemented: model.items.length, accepted: model.accepted.length, pending: model.pending.length, families: model.families.length, output: GALLERY_PATH };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    console.error('Usage: node scripts/build-template-gallery.mjs [--check]');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await generateGallery({ check: args[0] === '--check' }))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
