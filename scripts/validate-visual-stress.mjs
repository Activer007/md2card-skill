#!/usr/bin/env node
// Default mode needs authorized Chromium + fonts + Poppler. --plan never launches a browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createAssetResolver } from './assets.mjs';
import { buildDocument, SIZES } from './document.mjs';
import { parseCardMetadata, parseMarkdownTokens, renderCards } from './markdown.mjs';
import { parseOptions, exportCards } from './render.mjs';
import { openRenderer, closeBrowser } from './browser.mjs';
import { TEMPLATES, DENSITIES } from './templates.mjs';
import { Md2CardError } from './errors.mjs';
import { parseSemanticDocument, renderSemanticCard, validateSemanticCoverage } from './semantic.mjs';

export const repository = fileURLToPath(new URL('..', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => readFile(path.join(repository, file), 'utf8');
const annotate = (metadata, source) => `<!-- card: ${JSON.stringify(metadata)} -->\n${source}`;
const sourceLabel = '原创 QA 压力语料；不是事实报告或视觉验收结果';
const exec = promisify(execFile);
const compact = text => text.normalize('NFC').replace(/\s+/gu, '');

// Compare every source-owned paragraph/list item/table cell/code block and visible
// metadata value, not a marker scraped from output that might already be incomplete.
export function authoredSegments(card) {
  const inline = children => children.map(child => ['text', 'code_inline'].includes(child.type) ? child.content : ['softbreak', 'hardbreak'].includes(child.type) ? '\n' : child.children ? inline(child.children) : '').join('');
  return [...parseMarkdownTokens(card.source).flatMap(token => token.type === 'inline' ? [inline(token.children ?? [])] : ['fence', 'code_block'].includes(token.type) ? [token.content] : []),
    ...['eyebrow', 'source', 'metric', 'label', 'caption'].map(key => card.metadata[key] ?? '')].filter(text => text.trim());
}
export function assertAuthoredSegments(text, segments, label) {
  const actual = compact(text), counts = new Map();
  for (const segment of segments) { const key = compact(segment); counts.set(key, (counts.get(key) ?? 0) + 1); }
  for (const [segment, count] of counts) assert.ok(actual.split(segment).length - 1 >= count, `${label}: missing source segment or occurrence (${[...counts.keys()].indexOf(segment) + 1})`);
}

export async function auditPdfText(out, checkedSource, runCommand = exec) {
  const records = [];
  for (const [index, segments] of checkedSource.segments.entries()) {
    const page = String(index + 1), file = path.join(out, 'cards.pdf');
    const args = ['-f', page, '-l', page, '-enc', 'UTF-8', '-raw', file, '-'];
    const raw = await runCommand('pdftotext', args, { timeout: 20000, maxBuffer: 1024 * 1024 });
    assertAuthoredSegments(raw.stdout, segments, `PDF page ${page}`);
    const layoutArgs = args.map(arg => arg === '-raw' ? '-layout' : arg);
    const layout = await runCommand('pdftotext', layoutArgs, { timeout: 20000, maxBuffer: 1024 * 1024 });
    for (const [mode, text, command] of [['raw', raw.stdout, args], ['layout', layout.stdout, layoutArgs]]) {
      const name = `page-${page}-${mode}.txt`; await writeFile(path.join(out, name), text);
      records.push({ page: index + 1, mode, file: name, sha256: hash(text), command: ['pdftotext', ...command] });
    }
  }
  return records;
}

export async function createCases({ readFixture = read } = {}) {
  const cases = [];
  // Keep a broken fixture attached to its cases instead of aborting the matrix.
  const load = async file => { try { return await readFixture(file); } catch (fixtureError) { return { fixtureError }; } };
  const add = (id, template, source, fields = {}) => cases.push({ id, template, ...(typeof source === 'string' ? { source } : source), density: 'standard', expected: 'success', cards: 1, ...fields });
  const short = await load('examples/template-comparison.md');
  for (const density of DENSITIES) add(`short-${density}`, 'T01', short, { density, length: 'short', group: 'same-short-source' });
  for (const [id, template, density, file] of [
    ['medium-nested-url', 'T04', 'compact', 'medium-nested-url.md'],
    ['medium-code', 'T18', 'standard', 'medium-code.md'],
    ['medium-table', 'T24', 'editorial', 'medium-table.md']
  ]) add(id, template, await load(`examples/visual-stress/${file}`), { density, length: 'medium' });
  const long = '# 完整长段落边界\n\n' + '这是原创合成的容量边界文本，原文、标点与限制必须完整保留，不能缩字、截断或隐藏。'.repeat(80) + '\n';
  for (const density of DENSITIES) add(`long-${density}`, 'T04', long, { density, length: 'long', group: 'same-long-source', expected: 'CONTENT_OVERFLOW' });
  add('notebook-headings', null, await load('examples/visual-stress/notebook-headings.md'), { theme: 'notebook', cards: 2, length: 'medium' });
  for (const [id, template] of [['image-landscape', 'T37'], ['image-portrait', 'T39'], ['image-alpha', 'T45']]) {
    try {
      const { metadata, source } = parseCardMetadata(await readFixture(`examples/templates/${template}.md`));
      add(id, template, source, { metadata: { ...metadata, image: `examples/templates/${metadata.image}` }, length: 'matched-example' });
    } catch (fixtureError) { add(id, template, { fixtureError }, { length: 'matched-example' }); }
  }
  add('image-screenshot', 'T20', '# 真实卡片截图\n\n图中是本项目历史 Chromium 导出，不是产品界面。\n\n## 保全图像\n\n整张截图保留，不自动裁切。\n\n## 阅读边界\n\n图内小字不替代图外正文，也不证明当前版本已验收。\n', {
    length: 'short', metadata: { image: 'docs/images/templates/T17.png', alt: '本项目已验收 T17 卡片的完整历史浏览器截图', caption: '历史截图，非本轮导出；来源见 docs/template-m1-provenance.json。' }
  });
  for (const [id, image, expected] of [
    ['image-extreme-wide', 'extreme-wide.png', 'success'],
    ['image-extreme-tall', 'extreme-tall.png', 'success'],
    ['asset-missing', 'intentionally-missing.png', 'INVALID_ASSET'],
    ['asset-corrupt', 'corrupt.png', 'INVALID_ASSET']
  ]) add(id, 'T37', '# 图片边界\n\n原创测试图案，红蓝边缘用于检查全图保全，不是摄影或渲染成品。\n', {
    expected, length: 'short', metadata: { image: `examples/visual-stress/assets/${image}`, alt: '原创边缘标记测试图案', caption: '不裁切、不变形；极端比例可能留下大量留白。' }
  });
  return cases.map(item => item.fixtureError ? item : ({ ...item, bodySha256: hash(item.source), source: item.template ? annotate({ template: item.template, density: item.density, source: sourceLabel, ...item.metadata }, item.source) : item.source }));
}

export async function sourceCheck(item) {
  const resolver = await createAssetResolver(repository);
  if (item.paginate === 'auto') parseSemanticDocument(item.source, { resolveImage: resolver.resolveImage });
  const cards = renderCards(item.source, { resolveImage: resolver.resolveImage });
  assert.equal(cards.length, item.cards, 'Explicit source boundaries changed');
  for (const card of cards) if (item.template) {
    assert.equal(card.metadata.template, item.template);
    assert.equal(card.metadata.density, item.density);
    assert.equal(card.templateTitleHtml + card.templateIntroHtml + card.sections.map(section => section.html).join(''), card.html, 'Template slots must preserve every parser fragment in order');
  }
  buildDocument(cards, { ...SIZES.portrait, theme: item.theme ?? 'editorial', footerMode: item.footerMode ?? 'legacy', footer: item.footer ?? '' }, '', '', '');
  const assets = resolver.getAssets();
  const cardImages = cards.map(card => [...card.html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match => assets.find(asset => asset.dataUrl === match[1])).concat(card.image ? [card.image] : []).map(({ hash, width, height }) => ({ hash, width, height })));
  return { cardCount: cards.length, assets: assets.map(({ dataUrl, ...asset }) => asset), cardImages,
    headingLevels: cards.map(card => [...card.html.matchAll(/<h([1-6])\b/g)].map(match => Number(match[1]))),
    sourceHashes: cards.map(card => hash(card.source)), segments: cards.map((card, index) => [...authoredSegments(card), ...(item.footer ? [item.footer] : []), ...(item.footerMode === 'poster' && cards.length === 1 ? [] : [item.footerMode === 'series' ? `${String(index + 1).padStart(2,'0')} / ${String(cards.length).padStart(2,'0')}` : `${index + 1} / ${cards.length}`])]) };
}

// Reconstruct final auto pages from original semantic tokens, not exported HTML.
export function checkAutoSource(item, manifest) {
  const document = parseSemanticDocument(item.source);
  const byId = new Map(document.atoms.map(atom => [atom.id, atom]));
  const cards = manifest.cards.map((card, index) => {
    const partition = document.partitions.find(part => part.index === card.provenance.partitionIndex);
    assert.ok(partition);
    const atoms = card.provenance.atomIds.map(id => { assert.ok(byId.has(id)); return byId.get(id); });
    const rendered = renderSemanticCard(document, partition, atoms, index + 1);
    assert.deepEqual(rendered.provenance, card.provenance);
    return rendered;
  });
  validateSemanticCoverage(document, cards);
  assert.equal(manifest.pagination.validation.status, 'pass');
  assert.ok(manifest.pagination.probes > 0 && manifest.pagination.probes <= manifest.pagination.limits.probes);
  assert.ok(cards.length >= item.outputCards[0] && cards.length <= item.outputCards[1], 'Exercise the specified final auto page-count boundary');
  return { cardCount: cards.length, assets: [], cardImages: cards.map(() => []),
    sourceHashes: cards.map(card => hash(card.source)),
    headingLevels: cards.map(card => [...card.html.matchAll(/<h([1-6])\b/g)].map(match => Number(match[1]))),
    segments: cards.map((card, index) => [...authoredSegments(card), item.footer, ...(item.footerMode === 'poster' && cards.length === 1 ? [] : [item.footerMode === 'series' ? `${String(index + 1).padStart(2,'0')} / ${String(cards.length).padStart(2,'0')}` : `${index + 1} / ${cards.length}`])]) };
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(path.join(repository, directory), { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFiles(name));
    else if (entry.isFile()) files.push(name);
  }
  return files;
}
async function sourceIdentity() {
  const names = ['package.json', 'package-lock.json', 'docs/template-m1-provenance.json', 'docs/images/templates/T17.png'];
  for (const directory of ['scripts', 'assets', 'examples', 'tests']) names.push(...await listFiles(directory));
  const files = [];
  for (const file of [...new Set(names)].sort()) { const bytes = await readFile(path.join(repository, file)); files.push({ file, bytes: bytes.length, sha256: hash(bytes) }); }
  let git = null;
  try {
    const run = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (path.resolve(run(['rev-parse', '--show-toplevel'])) === path.resolve(repository)) git = { commit: run(['rev-parse', 'HEAD']), tree: run(['rev-parse', 'HEAD^{tree}']), dirty: Boolean(run(['status', '--porcelain'])) };
  } catch { /* Archives have no Git identity; the full content manifest remains authoritative. */ }
  return { git, sha256: hash(JSON.stringify(files)), files };
}

async function entries(directory) {
  try { return await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

// Every successful card is audited, not just the first page of a deck.
export async function auditMobile(out, item, dependencies = {}) {
  const timeoutMs = dependencies.timeoutMs ?? 30000;
  const renderer = await (dependencies.openRenderer ?? openRenderer)({ ...SIZES.portrait, scale: 1, timeoutMs });
  const records = [];
  let timer, primaryError;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Md2CardError('MOBILE_AUDIT_TIMEOUT', 'Mobile audit exceeded its bounded deadline.')), timeoutMs); });
  void deadline.catch(() => {});
  const bounded = promise => Promise.race([promise, deadline]);
  try {
    for (const file of ['cards.html', 'preview.html']) {
      await bounded(renderer.page.setContent(await readFile(path.join(out, file), 'utf8'), { waitUntil: 'load', timeout: timeoutMs }));
      await bounded(renderer.page.evaluate(() => document.fonts.ready));
      const text = await bounded(renderer.page.evaluate(() => [...document.querySelectorAll('.card')].map(card => card.textContent)));
      assert.equal(text.length, item.cards);
      text.forEach((value, index) => assertAuthoredSegments(value, item.checkedSource.segments[index], `${file}: card ${index + 1}`));
    }
    for (const viewportWidth of [375, 390]) {
      await bounded(renderer.page.setViewportSize({ width: viewportWidth, height: 800 }));
      const cards = await bounded(renderer.page.evaluate(() => [...document.querySelectorAll('.card')].map((card, index) => {
        const width = card.getBoundingClientRect().width, scale = width / card.offsetWidth;
        const visible = element => element.textContent.trim() && element.getBoundingClientRect().width > 0;
        const sizes = selector => [...card.querySelectorAll(selector)].filter(visible).map(element => parseFloat(getComputedStyle(element).fontSize) * scale);
        const bodySizes = sizes('.template-intro p,.template-intro li,.template-section p,.template-section li,.card-body p,.card-body li,td,th,pre code');
        const noteSizes = sizes('.card-source,.card-eyebrow,.card-footer,figcaption');
        return { index: index + 1, counter: card.querySelector('.card-index')?.textContent ?? '', footer: card.querySelector('.footer-text')?.textContent ?? '', cardWidth: width, bodySizes, bodyMin: bodySizes.length ? Math.min(...bodySizes) : null, noteMin: noteSizes.length ? Math.min(...noteSizes) : null,
          images: [...card.querySelectorAll('img')].map(image => ({ decoded: image.complete && image.naturalWidth > 0, fit: getComputedStyle(image).objectFit, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
            visible: image.getBoundingClientRect().width > 0 && image.getBoundingClientRect().height > 0 && getComputedStyle(image).visibility === 'visible', source: image.getAttribute('src') })),
          headings: [...card.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(element => ({ level: Number(element.tagName.slice(1)), background: getComputedStyle(element).backgroundColor })) };
      })));
      assert.equal(cards.length, item.cards);
      for (const card of cards) {
        assert.ok(Math.abs(card.cardWidth - (viewportWidth - 24)) < 1, 'Audit actual mobile inner-card width');
        if (item.footerMode) {
          const expectedCounter = item.footerMode === 'poster' && item.cards === 1 ? '' : item.footerMode === 'series' ? `${String(card.index).padStart(2,'0')} / ${String(item.cards).padStart(2,'0')}` : `${card.index} / ${item.cards}`;
          assert.equal(card.counter, expectedCounter);
          assert.equal(card.footer, item.footer);
        }
        if (item.paginate === 'auto') {
          assert.ok(card.bodySizes.length && card.bodySizes.every(size => Number.isFinite(size) && size > 0));
          assert.ok(Number.isFinite(card.noteMin) && card.noteMin > 0);
          // Legacy layout sizing is unchanged; record it, do not claim the
          // independently calibrated 48-template 14/11px phone floor applies.
        }
        if (item.template) {
          assert.ok(card.bodyMin !== null && card.bodyMin >= 14 - .05, `Card ${card.index}: body ${card.bodyMin}px below mobile floor`);
          assert.ok(card.noteMin !== null && card.noteMin >= 11 - .05, `Card ${card.index}: notes ${card.noteMin}px below mobile floor`);
        }
        const expectedImages = item.checkedSource.cardImages[card.index - 1];
        assert.equal(card.images.length, expectedImages.length, 'Every original image must be present');
        for (const [index, image] of card.images.entries()) {
          assert.ok(image.decoded && image.visible); assert.equal(image.fit, 'contain', 'Default images must remain uncropped');
          assert.deepEqual([image.naturalWidth, image.naturalHeight], [expectedImages[index].width, expectedImages[index].height]);
          const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.source);
          assert.ok(match); assert.equal(hash(Buffer.from(match[1], 'base64')), expectedImages[index].hash, 'Image bytes must remain unchanged');
          delete image.source; // Keep the report bounded; hashes already identify original bytes.
        }
        assert.deepEqual(card.headings.map(heading => heading.level), item.checkedSource.headingLevels[card.index - 1]);
        if (item.theme === 'notebook') for (const heading of card.headings) assert.equal(heading.background, 'rgb(255, 253, 244)', 'Notebook ruling must be masked locally behind every heading level');
      }
      const file = `mobile-${viewportWidth}.png`;
      await bounded(renderer.page.screenshot({ path: path.join(out, file), fullPage: true, animations: 'disabled', timeout: timeoutMs }));
      records.push({ viewportWidth, cards, file, sha256: hash(await readFile(path.join(out, file))) });
    }
  } catch (error) { primaryError = error; throw error; }
  finally {
    clearTimeout(timer);
    try { await closeBrowser(renderer.browser); }
    catch (error) {
      if (!primaryError) throw error;
      if (Object.isExtensible(primaryError)) try { primaryError.details = { ...primaryError.details, cleanupFailure: { code: error.code, message: error.message } }; } catch { /* Never replace the original audit failure. */ }
    }
  }
  return records;
}

export async function checkExpectedFailure(item, error, out) {
  assert.ok(error, `${item.id}: expected ${item.expected}, but export succeeded`);
  assert.equal(error.code, item.expected);
  assert.equal(error.exitCode, item.expected === 'CONTENT_OVERFLOW' ? 2 : 1);
  assert.ok(!error.details?.cleanupFailures?.length, 'Cleanup failure cannot count as an expected boundary');
  if (item.expected === 'CONTENT_OVERFLOW') {
    assert.deepEqual(await entries(out), ['overflow.json'], 'Overflow may publish only diagnostics, never clipped assets');
    const bytes = await readFile(path.join(out, 'overflow.json'));
    const report = JSON.parse(bytes);
    assert.equal(report.code, item.expected);
    assert.ok(report.cards.length > 0);
    return { file: 'overflow.json', sha256: hash(bytes) };
  }
  assert.equal((await entries(out)).length, 0, 'Source rejection must publish no files');
  return null;
}

async function checkManifest(manifest, item, out) {
  assert.equal(manifest.status, 'success');
  assert.equal(manifest.inputSha256, hash(item.source));
  assert.equal(manifest.pagination.mode, item.paginate ?? 'manual');
  if (item.footerMode) assert.equal(manifest.footerMode, item.footerMode);
  assert.equal(manifest.cardCount, item.cards);
  assert.deepEqual(manifest.formats, ['html', 'png', 'pdf']);
  assert.deepEqual(manifest.qa.overflow, { screen: 'pass', print: 'pass' });
  assert.equal(manifest.qa.pdf.status, 'pass');
  assert.equal(manifest.qa.pdf.pageCount, item.cards);
  assert.equal(manifest.qa.pdf.searchable, true);
  assert.equal(manifest.qa.images.status, 'pass');
  assert.equal(manifest.qa.images.count, item.checkedSource.cardImages.flat().length);
  assert.deepEqual(manifest.assets, item.checkedSource.assets);
  assert.equal(manifest.cards.length, item.cards);
  for (const [index, card] of manifest.cards.entries()) {
    assert.equal(card.index, index + 1);
    assert.equal(card.sourceSha256, item.checkedSource.sourceHashes[index]);
    assert.equal(card.template ?? null, item.template);
    if (item.template) assert.equal(card.density, item.density);
  }
  for (const name of ['themes', 'layouts', 'templates']) assert.equal(manifest.styleSha256[name], hash(await readFile(path.join(repository, `assets/${name}.css`))));
  for (const file of ['cards.html', 'cards.pdf', 'preview.html', 'contact-sheet.png']) assert.ok(manifest.artifacts.some(artifact => artifact.file === file), `Missing ${file}`);
  assert.equal(manifest.artifacts.filter(artifact => artifact.format === 'png').length, item.cards);
  assert.equal(new Set(manifest.artifacts.map(artifact => artifact.file)).size, manifest.artifacts.length, 'Artifact filenames must be unique');
  assert.deepEqual(manifest.artifacts.filter(artifact => artifact.format === 'png').map(artifact => artifact.file), Array.from({ length: item.cards }, (_, index) => `card-${String(index + 1).padStart(3, '0')}.png`));
  for (const artifact of manifest.artifacts) {
    assert.equal(path.basename(artifact.file), artifact.file);
    const bytes = await readFile(path.join(out, artifact.file));
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(hash(bytes), artifact.sha256, `Artifact hash mismatch: ${artifact.file}`);
  }
  const bytes = await readFile(path.join(out, 'manifest.json'));
  assert.deepEqual(JSON.parse(bytes), manifest);
  return { file: path.relative(repository, path.join(out, 'manifest.json')), sha256: hash(bytes) };
}

export async function runStress({ plan = false, root = path.join(repository, 'validation/visual-stress') } = {}, dependencies = {}) {
  // Refuse stale evidence; never delete or silently overwrite previous runs.
  assert.equal((await entries(root)).length, 0, `Output is not empty: ${root}. Use a fresh --out directory.`);
  await mkdir(path.join(root, 'inputs'), { recursive: true });
  const identity = await sourceIdentity();
  await writeFile(path.join(root, 'source-files.json'), JSON.stringify(identity, null, 2) + '\n');
  const cases = await (dependencies.createCases ?? createCases)();
  const summary = { schemaVersion: 1, mode: plan ? 'source-plan' : 'browser', status: 'running', sourceSha256: identity.sha256, git: identity.git,
    sourceManifest: 'source-files.json', browser: plan ? 'not-run' : 'attempted', visualReview: 'not-performed', designCount: TEMPLATES.length, acceptedCountUnchanged: TEMPLATES.filter(template => template.acceptance).length, results: [], errors: [] };
  const save = () => writeFile(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  await save();
  for (const item of cases) {
    const input = path.join(root, 'inputs', `${item.id}.md`), out = path.join(root, item.id);
    const args = [input, '--asset-root', repository, '--out', out, '--strict', '--preview', '--contact-sheet', ...(item.paginate ? ['--paginate', item.paginate] : []), ...(item.theme ? ['--theme', item.theme] : []), ...(item.footerMode ? ['--footer-mode', item.footerMode] : []), ...(item.footer ? ['--footer', item.footer] : [])];
    const result = { id: item.id, template: item.template, density: item.template ? item.density : null, length: item.length, group: item.group,
      expected: item.expected, input: path.relative(repository, input), inputSha256: item.source === undefined ? null : hash(item.source), bodySha256: item.bodySha256,
      command: ['node', 'scripts/render.mjs', ...args], manifest: null, status: 'pending', visualReview: 'not-performed' };
    summary.results.push(result);
    try {
      if (item.fixtureError) throw item.fixtureError;
      await writeFile(input, item.source);
      let sourceError;
      try { result.source = await sourceCheck(item); } catch (error) { sourceError = error; }
      if (item.expected === 'INVALID_ASSET') { assert.equal(sourceError?.code, item.expected); result.source = { status: 'expected-error', code: sourceError.code }; }
      else if (sourceError) throw sourceError;
      if (plan) result.status = 'source-checked-browser-pending';
      else {
        let manifest, failure;
        try { manifest = await (dependencies.exportCards ?? exportCards)(parseOptions(args)); } catch (error) { failure = error; }
        if (item.expected !== 'success') {
          result.diagnostic = await checkExpectedFailure(item, failure, out);
          result.status = 'expected-error'; result.code = failure.code;
        } else {
          if (failure) throw failure;
          const checked = item.paginate === 'auto' ? { ...item, cards: manifest.cardCount, checkedSource: checkAutoSource(item, manifest) } : { ...item, checkedSource: result.source };
          if (item.paginate === 'auto') result.finalSource = checked.checkedSource;
          result.manifest = await checkManifest(manifest, checked, out);
          result.pdfText = await (dependencies.auditPdfText ?? auditPdfText)(out, checked.checkedSource);
          result.mobile = await (dependencies.auditMobile ?? auditMobile)(out, checked);
          result.status = 'rendered-not-visually-reviewed';
        }
      }
    } catch (error) {
      result.status = 'failed';
      const failure = { id: item.id, code: error.code ?? 'VALIDATION_FAILED', message: error.message, ...(error.details?.cleanupFailure ? { cleanupFailure: error.details.cleanupFailure } : {}) };
      result.failure = failure; summary.errors.push(failure);
    }
    await save(); // Preserve completed cases even if a later case fails or the job is interrupted.
  }
  if (!plan) {
    const group = summary.results.filter(result => result.group === 'same-short-source' && result.mobile);
    for (const result of group.slice(1)) {
      try { assert.deepEqual(result.mobile.map(view => view.cards.map(card => card.bodySizes)), group[0].mobile.map(view => view.cards.map(card => card.bodySizes)), 'Density must not reduce computed text sizes'); }
      catch (error) { summary.errors.push({ id: result.id, code: 'DENSITY_FONT_DRIFT', message: error.message }); result.status = 'failed'; }
    }
  }
  summary.status = summary.errors.length ? 'failed' : plan ? 'source-checked-browser-pending' : 'browser-checked-visual-review-pending';
  await save();
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2); let plan = false, root;
    while (args.length) { const arg = args.shift(); if (arg === '--plan') plan = true; else if (arg === '--out' && args[0] && !args[0].startsWith('--')) root = path.resolve(args.shift()); else throw new Error(`Unknown or incomplete option: ${arg}`); }
    const summary = await runStress({ plan, root });
    console.log(`${summary.results.length} cases: ${summary.status}; ${summary.errors.length} errors. No human visual acceptance is implied.`);
    if (summary.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
