#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, mkdtemp, rm, rename, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { renderCards } from './markdown.mjs';
import { parseSemanticDocument } from './semantic.mjs';
import { paginateSemanticDocument } from './pagination.mjs';
import { buildDocument, buildPreviewDocument, SIZES, THEMES } from './document.mjs';
import { createAssetResolver } from './assets.mjs';
import { openRenderer, measureCards, closeBrowser, BROWSER_CLEANUP_TIMEOUT_MS } from './browser.mjs';
import { inspectEnvironment } from './doctor.mjs';
import { inspectPdf } from './qa.mjs';
import { Md2CardError, normalizeError } from './errors.mjs';
import { getTemplate, TEMPLATES, resolveTemplateAspect } from './templates.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const VERSION = '3.0.0';
export const LIMITS = Object.freeze({ inputBytes: 2 * 1024 * 1024, cards: 200, cardPixels: 40_000_000, deckPixels: 200_000_000, outputBytes: 256 * 1024 * 1024, contactSheetPixels: 40_000_000, contactSheetSide: 32767 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, message, details = {}) => { throw new Md2CardError(code, message, details); };
const HELP = `md2card-skill ${VERSION} — offline Markdown knowledge cards

Usage: node scripts/render.mjs input.md --out ./output
       node scripts/render.mjs --doctor [--strict] [--json]

  --out DIR         Output directory, absent or empty (never overwrite).
  --template ID     Use one composed template; manual, registry-listed aspects only
  --list-templates  Print the supported template contracts as JSON
  --theme NAME      editorial (default), minimal, midnight, notebook, bold
  --format LIST     all (default), html, png, pdf or comma-separated list
  --paginate MODE   manual (default) or auto; measured semantic pagination
  --balance-tail    Opt-in bounded sparse-tail balancing; requires auto
  --size NAME       portrait 1080×1440, square 1080×1080, slide 1600×900
  --width PX        Override width, integer 200–4096
  --height PX       Override height, integer 200–4096
  --scale N         PNG density 0.5–3 (default 1); not PDF page size
  --footer TEXT     Optional footer text
  --title TEXT      Document title, defaults to filename
  --lang TAG        Language tag (default zh-CN)
  --browser PATH    Chromium executable, or CHROMIUM_PATH
  --asset-root DIR  Trusted local asset boundary (default input directory)
  --brand FILE      JSON with name, accent (#RGB/#RRGGBB), logo (asset ref)
  --preview         Include responsive, script-free preview.html
  --contact-sheet   Include contact-sheet.png (4 columns, 270 px cards)
  --strict          Require font preflight and PDF verification tools
  --timeout-ms N    Total render deadline, 1000–600000 (default 120000)
  --json            JSON success/errors for automation
  --doctor          Check browser path, fonts, PDF tools; no rendering
  --help, -h        Show help
  --version         Show version

Standalone === separates cards, except in code. Optional first-line metadata:
<!-- card: {"layout":"cover","eyebrow":"FIELD NOTES"} -->
Layouts: cover, explainer, comparison, steps, image-caption, statistic,
case-study, quote. See references/rendering.md for content conventions.
Only validated PNG/JPEG/WebP inside --asset-root can be embedded, no SVG,
remote/file/data URLs, scripts or external fetches. Raw HTML is escaped.
Overflow checks are mandatory in screen AND print. Final overflow writes
overflow.json only (exit 2); an oversized auto atom exits 2 with source diagnostics.
Native PDF retains text; strict mode verifies pages and searchable text.
Browser cleanup has a separate bounded grace period of at most five seconds.
Auto supports explainer/steps with layout-only metadata; explicit === stays locked.
No accounts, cloud sync, AI calls, rewriting, silent shrinking or PPTX.
`;

export function parseOptions(argv) {
  let parsed;
  try { parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    template: { type: 'string' }, 'list-templates': { type: 'boolean' }, out: { type: 'string' }, theme: { type: 'string', default: 'editorial' }, format: { type: 'string', default: 'all' }, paginate: { type: 'string', default: 'manual' }, 'balance-tail': { type: 'boolean', default: false },
    size: { type: 'string', default: 'portrait' }, width: { type: 'string' }, height: { type: 'string' }, scale: { type: 'string', default: '1' },
    footer: { type: 'string', default: '' }, title: { type: 'string' }, lang: { type: 'string', default: 'zh-CN' }, browser: { type: 'string' },
    'asset-root': { type: 'string' }, brand: { type: 'string' }, preview: { type: 'boolean', default: false }, 'contact-sheet': { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false }, doctor: { type: 'boolean', default: false }, json: { type: 'boolean', default: false },
    'timeout-ms': { type: 'string', default: '120000' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' }
  } }); } catch (error) { fail('INVALID_OPTIONS', error.message); }
  const { values, positionals } = parsed;
  if (values['balance-tail'] && values.paginate !== 'auto') fail('INVALID_OPTIONS', '--balance-tail requires --paginate auto; manual boundaries are never rebalanced.');
  if (values['list-templates']) return { listTemplates: true };
  if (values.template !== undefined) getTemplate(values.template);
  if (values.template !== undefined && values.paginate === 'auto') fail('PAGINATION_UNSUPPORTED_METADATA', 'Templates require manual pagination. Automatic pagination remains restricted to explainer/steps with layout-only metadata.');
  if (values.help || values.version) return { help: values.help, version: values.version };
  if (values.doctor && positionals.length === 0) return { ...values, requirePdfCheck: values.strict };
  if (positionals.length !== 1) fail('INVALID_OPTIONS', 'Provide one Markdown input file. Run --help for usage.');
  if (!THEMES.includes(values.theme)) fail('INVALID_OPTIONS', `Unknown theme "${values.theme}". Choose ${THEMES.join(', ')}.`);
  if (!['manual', 'auto'].includes(values.paginate)) fail('INVALID_OPTIONS', '--paginate accepts manual (default) or auto.');
  if (!(values.size in SIZES)) fail('INVALID_OPTIONS', `Unknown size "${values.size}". Choose portrait, square, or slide.`);
  const width = Number(values.width ?? SIZES[values.size].width), height = Number(values.height ?? SIZES[values.size].height);
  for (const [name, value] of Object.entries({ width, height })) if (!Number.isInteger(value) || value < 200 || value > 4096) fail('INVALID_OPTIONS', `--${name} must be an integer from 200 to 4096 pixels.`);
  const scale = Number(values.scale);
  if (!Number.isFinite(scale) || scale < 0.5 || scale > 3) fail('INVALID_OPTIONS', '--scale must be between 0.5 and 3.');
  if (width * height * scale * scale > LIMITS.cardPixels) fail('RENDER_BUDGET', 'PNG size would exceed 40 million pixels per card. Reduce dimensions or --scale.');
  const formats = values.format === 'all' ? ['html', 'png', 'pdf'] : [...new Set(values.format.split(',').map(value => value.trim()))];
  if (!formats.length || formats.some(format => !['html', 'png', 'pdf'].includes(format))) fail('INVALID_OPTIONS', '--format accepts html, png, pdf, all, or a comma-separated combination.');
  if (!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(values.lang)) fail('INVALID_OPTIONS', '--lang must be a language tag such as zh-CN or en.');
  const timeoutMs = Number(values['timeout-ms']);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) fail('INVALID_OPTIONS', '--timeout-ms must be an integer from 1000 to 600000.');
  const input = path.resolve(positionals[0]);
  return { ...values, input, out: path.resolve(values.out || path.join('output', path.parse(input).name)), width, height, scale, formats,
    title: values.title ?? path.basename(input), assetRoot: path.resolve(values['asset-root'] || path.dirname(input)), brandFile: values.brand ? path.resolve(values.brand) : undefined,
    contactSheet: values['contact-sheet'], balanceTail: values['balance-tail'], timeoutMs };
}

export function checkRenderBudget(cardCount, options) {
  if (!Number.isInteger(cardCount) || cardCount < 1 || cardCount > LIMITS.cards) fail('RENDER_BUDGET', 'A deck must contain 1–200 cards. Split it into smaller decks.');
  const cardPixels = cardCount * options.width * options.height * (options.formats.includes('png') ? options.scale ** 2 : 1);
  let contactSheet = null;
  if (options.contactSheet) {
    const columns = Math.min(4, cardCount), rows = Math.ceil(cardCount / 4);
    const width = 40 + columns * 270 + (columns - 1) * 20;
    const height = Math.ceil(40 + rows * 270 * options.height / options.width + (rows - 1) * 20);
    contactSheet = { columns, rows, width, height, pixels: width * height };
    if (width > LIMITS.contactSheetSide || height > LIMITS.contactSheetSide || contactSheet.pixels > LIMITS.contactSheetPixels) {
      fail('RENDER_BUDGET', 'Contact sheet exceeds 40 million pixels or 32767 pixels per side. Split the deck or omit --contact-sheet.', { contactSheet });
    }
  }
  const pixels = cardPixels + (contactSheet?.pixels || 0);
  if (pixels > LIMITS.deckPixels) fail('RENDER_BUDGET', 'Total deck and preview render budget exceeds 200 million pixels. Split the deck or reduce dimensions/scale.', { pixels, limit: LIMITS.deckPixels });
  return { estimatedPixels: pixels, cardPixels, contactSheet, maxPixels: LIMITS.deckPixels, maxOutputBytes: LIMITS.outputBytes, timeoutMs: options.timeoutMs };
}

export async function loadBrand(filename, resolveImage) {
  if (!filename) return undefined;
  const info = await stat(filename);
  if (!info.isFile() || info.size > 16384) fail('INVALID_BRAND', 'Brand JSON must be a regular file no larger than 16 KiB.');
  let brand;
  try { brand = JSON.parse(await readFile(filename, 'utf8')); } catch { fail('INVALID_BRAND', 'Brand file must contain valid JSON.'); }
  if (!brand || Array.isArray(brand) || typeof brand !== 'object') fail('INVALID_BRAND', 'Brand must be a JSON object.');
  if (Object.keys(brand).some(key => !['name', 'accent', 'logo'].includes(key))) fail('INVALID_BRAND', 'Brand supports only name, accent, and logo.');
  if (brand.name !== undefined && (typeof brand.name !== 'string' || brand.name.length > 100)) fail('INVALID_BRAND', 'Brand name must be a string of at most 100 characters.');
  if (brand.accent !== undefined && (typeof brand.accent !== 'string' || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(brand.accent))) fail('INVALID_BRAND', 'Brand accent must be a #RGB or #RRGGBB color.');
  if (brand.logo !== undefined && (typeof brand.logo !== 'string' || !brand.logo)) fail('INVALID_BRAND', 'Brand logo must be a local asset reference.');
  return { ...brand, ...(brand.logo ? { logo: resolveImage(brand.logo) } : {}) };
}

async function assertEmptyOutput(out) {
  try { if ((await readdir(out)).length) fail('OUTPUT_EXISTS', `Output directory is not empty: ${out}. Choose a new directory to avoid overwriting files.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
async function publish(staging, out) {
  await assertEmptyOutput(out);
  try { await rmdir(out); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rename(staging, out);
}

/** Count actual final embeddings, including repeated table headers and logos. */
export function countDocumentAssets(cards, loadedAssets, brand) {
  const byUrl = new Map(loadedAssets.map(asset => [asset.dataUrl, asset]));
  const usage = { occurrences: 0, pixels: 0, embeddedBytes: 0, loadedBytes: loadedAssets.reduce((sum, asset) => sum + asset.bytes, 0) };
  const count = asset => {
    if (!asset) fail('INVALID_ASSET', 'A rendered image is not a validated local asset.');
    usage.occurrences++;
    usage.pixels += asset.width * asset.height;
    usage.embeddedBytes += Buffer.byteLength(asset.dataUrl);
  };
  for (const card of cards) {
    for (const match of card.html.matchAll(/<img\b[^>]*\bsrc="(data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2})"/g)) count(byUrl.get(match[1]));
    if (card.image) count(card.image);
    if (brand?.logo) count(brand.logo);
  }
  if (usage.pixels > 100_000_000 || usage.embeddedBytes > 64 * 1024 * 1024) fail('RENDER_BUDGET', 'Repeated images, table headers or brand logos exceed the 100 million decoded pixels / 64 MiB embedding budget. Use smaller images or split the deck.', usage);
  return usage;
}

export async function exportCards(options, dependencies = {}) {
  if (options.balanceTail !== undefined && typeof options.balanceTail !== 'boolean') fail('INVALID_OPTIONS', 'balanceTail must be a boolean.');
  if (options.balanceTail && options.paginate !== 'auto') fail('INVALID_OPTIONS', '--balance-tail requires --paginate auto; manual boundaries are never rebalanced.');
  // Explicit dependency seams support deterministic lifecycle tests, not alternate
  // runtime safety policies. The CLI always uses the real implementations.
  const now = dependencies.now ?? Date.now;
  const write = dependencies.writeFile ?? writeFile;
  const remove = dependencies.rm ?? rm;
  const measure = dependencies.measureCards ?? measureCards;
  const started = now(), deadline = started + options.timeoutMs;
  const remaining = () => { const ms = deadline - now(); if (ms <= 0) fail('RENDER_TIMEOUT', 'Total render deadline exceeded. Split the deck or increase --timeout-ms.'); return ms; };
  const inputStat = await stat(options.input);
  if (!inputStat.isFile()) fail('INVALID_INPUT', 'The input must be a regular Markdown file.');
  if (inputStat.size > LIMITS.inputBytes) fail('RENDER_BUDGET', 'The input is larger than 2 MiB. Split it into smaller decks.');
  await assertEmptyOutput(options.out);
  const markdown = await readFile(options.input, 'utf8');
  const assets = await createAssetResolver(options.assetRoot);
  const semanticDocument = options.paginate === 'auto' ? parseSemanticDocument(markdown, { resolveImage: assets.resolveImage }) : null;
  let cards = semanticDocument ? [] : renderCards(markdown, { resolveImage: assets.resolveImage });
  if (options.template) {
    const template = getTemplate(options.template);
    cards = cards.map(card => {
      if (card.metadata.template && card.metadata.template !== template.id) fail('TEMPLATE_CONFLICT', 'A card template conflicts with --template. Remove the CLI override or choose the same template.');
      // An explicit incompatible layout is not silently reinterpreted.
      if (card.metadataExplicitKeys?.includes('layout') && card.metadata.layout !== template.layout) fail('TEMPLATE_LAYOUT_MISMATCH', 'Explicit card layout conflicts with --template.');
      return { ...card, metadata: { ...card.metadata, template: template.id, layout: template.layout } };
    });
  }
  let budget = checkRenderBudget(semanticDocument?.partitions.length ?? cards.length, options);
  const brand = await loadBrand(options.brandFile, assets.resolveImage);
  options = { ...options, brand };
  const [themeCss, layoutCss, templateCss] = await Promise.all(['themes.css', 'layouts.css', 'templates.css'].map(file => readFile(path.join(ROOT, 'assets', file), 'utf8')));
  const documentHtml = (selectedCards, paginationProbe = false) => {
    countDocumentAssets(selectedCards, assets.getAssets(), brand);
    const embeddedBytes = selectedCards.reduce((sum, card) => sum + Buffer.byteLength(card.html) + (card.image?.bytes || 0) * 4 / 3, 0) + (brand?.logo?.bytes || 0) * selectedCards.length * 4 / 3;
    if (embeddedBytes > 64 * 1024 * 1024) fail('RENDER_BUDGET', 'Embedded document content exceeds 64 MiB. Use smaller images or split the deck.');
    const result = buildDocument(selectedCards, { ...options, preview: false, paginationProbe }, themeCss, layoutCss, templateCss);
    if (Buffer.byteLength(result) > 64 * 1024 * 1024) fail('RENDER_BUDGET', 'Generated HTML exceeds 64 MiB. Use smaller images or split the deck.');
    return result;
  };
  let html = semanticDocument ? null : documentHtml(cards);
  let pagination = { mode: 'manual' };
  const environment = await (dependencies.inspectEnvironment ?? inspectEnvironment)({ browser: options.browser, requirePdfCheck: options.strict && options.formats.includes('pdf'), lang: options.lang, strict: options.strict, requiredText: markdown });
  if (!environment.ok) fail('PREFLIGHT_FAILED', 'Environment preflight failed. Run --doctor --strict for details.', { checks: environment.checks.filter(check => check.status === 'fail') });
  remaining();
  const renderer = await (dependencies.openRenderer ?? openRenderer)({ ...options, timeoutMs: remaining() });
  let staging, timer, closePromise, primaryError, timedOut = false;
  const closeRenderer = () => closePromise ??= closeBrowser(renderer.browser, Math.min(options.timeoutMs, BROWSER_CLEANUP_TIMEOUT_MS));
  const checkTime = () => { if (timedOut) fail('RENDER_TIMEOUT', 'Total render deadline exceeded. Split the deck or increase --timeout-ms.'); return remaining(); };
  // Own the renderer before any post-launch deadline check can throw.
  try {
    const timeoutMs = remaining();
    const deadlineSignal = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        void closeRenderer().catch(() => {});
        reject(new Md2CardError('RENDER_TIMEOUT', 'Total render deadline exceeded.'));
      }, timeoutMs);
    });
    // Some browser APIs (evaluate/newPage/emulateMedia) have no per-call timeout.
    // Only race browser waits, not filesystem writes/publication: a late browser
    // result must never resume the export after staging cleanup has run.
    void deadlineSignal.catch(() => {});
    const withinDeadline = operation => Promise.race([operation, deadlineSignal]);
    const { page } = renderer;
    page.setDefaultTimeout(checkTime());
    const loadDocument = async content => {
      checkTime();
      await withinDeadline(page.emulateMedia({ media: 'screen' }));
      await withinDeadline(page.setContent(content, { waitUntil: 'load', timeout: checkTime() }));
      await withinDeadline(page.evaluate(() => document.fonts.ready));
      const result = await withinDeadline(page.locator('img').evaluateAll(async images => Promise.all(images.map(async image => {
      // complete/naturalWidth can describe a parsed header even when pixel decoding
      // fails. Require the browser's actual decode promise, not only dimensions.
      let decoded = false;
      try { await image.decode(); decoded = true; } catch { /* Report below without exposing source bytes. */ }
      return { alt: image.alt, decoded, valid: decoded && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && image.naturalWidth <= 8192 && image.naturalHeight <= 8192 && image.naturalWidth * image.naturalHeight <= 20_000_000, width: image.naturalWidth, height: image.naturalHeight };
      }))));
      if (result.some(image => !image.valid)) fail('IMAGE_DECODE_FAILED', 'An embedded local image could not be decoded by Chromium. Replace the invalid image.', { images: result.filter(image => !image.valid) });
      checkTime();
      return result;
    };
    if (semanticDocument) {
      const result = await paginateSemanticDocument(semanticDocument, {
        balanceTail: options.balanceTail ?? false,
        checkpoint: checkTime,
        checkBudget: count => checkRenderBudget(count, options),
        measure: async card => {
          await loadDocument(documentHtml([card], true));
          const screen = await withinDeadline(measure(page));
          await withinDeadline(page.emulateMedia({ media: 'print' }));
          const print = await withinDeadline(measure(page));
          if (screen.length !== 1 || print.length !== 1) fail('PAGINATION_MEASUREMENT', 'A pagination probe did not produce exactly one measured card.');
          return { screen: screen[0], print: print[0] };
        }
      });
      cards = result.cards;
      pagination = result.pagination;
      budget = checkRenderBudget(cards.length, options);
      html = documentHtml(cards);
    }
    const assetUsage = countDocumentAssets(cards, assets.getAssets(), brand);
    const imageQa = await loadDocument(html);
    const screenMeasurements = await withinDeadline(measure(page));
    await withinDeadline(page.emulateMedia({ media: 'print' }));
    const printMeasurements = await withinDeadline(measure(page));
    if (screenMeasurements.length !== cards.length || printMeasurements.length !== cards.length) fail('PAGINATION_MEASUREMENT', 'Final browser measurements do not match the output card count. No exports were produced.');
    const affected = screenMeasurements.map((measurement, index) => ({ index: measurement.index, sourceLines: cards[index].sourceLines, screen: measurement, print: printMeasurements[index] })).filter(item => item.screen.overflow.length || item.print.overflow.length);
    await mkdir(path.dirname(options.out), { recursive: true });
    staging = await mkdtemp(path.join(path.dirname(options.out), '.md2card-'));
    if (affected.length) {
      const report = { schemaVersion: 2, status: 'overflow', code: 'CONTENT_OVERFLOW', input: path.basename(options.input), theme: options.theme,
        dimensions: { width: options.width, height: options.height }, cards: affected,
        guidance: 'Shorten affected cards, add explicit === boundaries, or increase dimensions. No clipped exports were produced.' };
      await write(path.join(staging, 'overflow.json'), JSON.stringify(report, null, 2) + '\n');
      await publish(staging, options.out); staging = undefined;
      throw new Md2CardError('CONTENT_OVERFLOW', `Content overflow on card(s) ${affected.map(item => item.index).join(', ')}. No exports produced. See ${path.join(options.out, 'overflow.json')}.`, { cards: affected.map(item => item.index) }, 2);
    }
    const artifacts = [];
    let outputBytes = 0;
    const record = async (format, file, extra = {}) => {
      checkTime(); const data = await readFile(path.join(staging, file)); outputBytes += data.length;
      if (outputBytes > LIMITS.outputBytes) fail('OUTPUT_BUDGET', 'Generated output exceeds 256 MiB. Split the deck or reduce image density.');
      artifacts.push({ format, file, bytes: data.length, sha256: hash(data), ...extra });
    };
    if (options.formats.includes('html')) { await write(path.join(staging, 'cards.html'), html); await record('html', 'cards.html'); }
    if (options.preview) { await write(path.join(staging, 'preview.html'), buildPreviewDocument(cards, options, themeCss, layoutCss, templateCss)); await record('preview', 'preview.html'); }
    let pdfQa = { status: 'not-requested' };
    if (options.formats.includes('pdf')) {
      // Playwright PDF generation has no timeout option. Request bytes only so
      // the deadline can interrupt it without a late result writing to staging.
      checkTime();
      const pdf = await withinDeadline(page.pdf({ printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, margin: { top: 0, bottom: 0, left: 0, right: 0 } }));
      checkTime();
      if (!Buffer.isBuffer(pdf) || pdf.length < 5 || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) fail('PDF_FILE_INVALID', 'Chromium did not return a valid PDF buffer.');
      if (outputBytes + pdf.length > LIMITS.outputBytes) fail('OUTPUT_BUDGET', 'Generated output exceeds 256 MiB. Split the deck or reduce image density.');
      await write(path.join(staging, 'cards.pdf'), pdf);
      const textContent = await withinDeadline(page.locator('.card-content').allTextContents());
      pdfQa = await inspectPdf(path.join(staging, 'cards.pdf'), { expectedPages: cards.length, requireTools: options.strict, expectedText: textContent.join(' ').trim() });
      await record('pdf', 'cards.pdf');
    }
    await withinDeadline(page.emulateMedia({ media: 'screen' }));
    if (options.formats.includes('png')) for (const card of cards) {
      const filename = `card-${String(card.index).padStart(3, '0')}.png`;
      await page.locator('.card').nth(card.index - 1).screenshot({ path: path.join(staging, filename), type: 'png', animations: 'disabled', timeout: checkTime() });
      await record('png', filename, { card: card.index });
    }
    if (options.contactSheet) {
      const { columns, width: sheetWidth } = budget.contactSheet, thumbWidth = 270;
      const sheet = await withinDeadline(renderer.context.newPage());
      await withinDeadline(sheet.setViewportSize({ width: sheetWidth, height: 600 }));
      const sheetCss = `.deck { display:grid; grid-template-columns:repeat(${columns}, ${thumbWidth}px); gap:20px; padding:20px; min-width:0; width:max-content; } .card { zoom:${thumbWidth / options.width}; }`;
      await sheet.setContent(html.replace('</style>', sheetCss + '\n</style>'), { waitUntil: 'load', timeout: checkTime() });
      await withinDeadline(sheet.evaluate(() => document.fonts.ready));
      await sheet.locator('.deck').screenshot({ path: path.join(staging, 'contact-sheet.png'), scale: 'css', animations: 'disabled', timeout: checkTime() });
      await withinDeadline(sheet.close()); await record('contact-sheet', 'contact-sheet.png');
    }
    const loadedAssets = assets.getAssets().map(({ dataUrl, ...asset }) => asset);
    const manifest = {
      schemaVersion: 2, status: 'success', generator: { name: 'md2card-skill', version: VERSION }, createdAt: new Date().toISOString(),
      input: path.basename(options.input), inputSha256: hash(markdown), title: options.title, theme: options.theme,
      styleSha256: { themes: hash(themeCss), layouts: hash(layoutCss), templates: hash(templateCss) }, brand: brand ? { name: brand.name, accent: brand.accent, logoHash: brand.logo?.hash } : null,
      dimensions: { width: options.width, height: options.height }, pngScale: options.scale, formats: options.formats, cardCount: cards.length, artifacts, assets: loadedAssets, assetUsage,
      versions: { ...environment.versions, chromium: renderer.browser.version() }, budget: { ...budget, outputBytes, elapsedMs: now() - started },
      qa: { overflow: { screen: 'pass', print: 'pass' }, images: { status: 'pass', count: imageQa.length }, fonts: environment.fonts, pdf: pdfQa, visualReview: 'not-performed' },
      pagination,
      cards: cards.map((card, index) => ({ index: card.index, layout: card.metadata.layout, ...(card.metadata.template ? { template: card.metadata.template, density: card.metadata.density ?? 'standard', aspect: resolveTemplateAspect(card.metadata.template, options).id } : {}), sourceLines: card.sourceLines, sourceSha256: hash(card.source), ...(card.provenance ? { provenance: card.provenance } : {}), screen: screenMeasurements[index], print: printMeasurements[index] })),
      security: { rawHtml: 'escaped', images: 'validated-local-raster-only', assetBoundary: 'realpath-contained', networkRequests: 'blocked', clientScripts: 'disabled' }
    };
    const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
    if (outputBytes + Buffer.byteLength(manifestJson) > LIMITS.outputBytes) fail('OUTPUT_BUDGET', 'Artifacts and source-provenance manifest exceed the 256 MiB output budget. Split the input.');
    checkTime(); await write(path.join(staging, 'manifest.json'), manifestJson);
    // Finish browser cleanup before atomic publication. A close failure cannot
    // turn an already-published successful render into an apparent failure.
    await closeRenderer(); checkTime();
    await publish(staging, options.out); staging = undefined;
    return manifest;
  } catch (error) {
    primaryError = timedOut ? new Md2CardError('RENDER_TIMEOUT', 'Total render deadline exceeded. No completed exports were published.', {}, 1, { cause: error }) : error;
    throw primaryError;
  } finally {
    clearTimeout(timer);
    const cleanupFailures = [];
    try { await closeRenderer(); } catch (error) { cleanupFailures.push({ action: 'close-browser', code: error.code || 'CLEANUP_FAILED', message: error.message }); }
    // Removal is independent of browser cleanup and must run even when close fails.
    try { if (staging) await remove(staging, { recursive: true, force: true }); }
    catch (error) { cleanupFailures.push({ action: 'remove-staging', code: error.code || 'CLEANUP_FAILED', message: error.message }); }
    if (cleanupFailures.length && primaryError && Object.isExtensible(primaryError)) {
      try { primaryError.details = { ...primaryError.details, cleanupFailures }; } catch { /* Diagnostics must never mask the primary error. */ }
    } else if (cleanupFailures.length && !primaryError) {
      throw new Md2CardError('RENDER_CLEANUP_FAILED', 'Render cleanup failed.', { cleanupFailures });
    }
  }
}

async function main() {
  const json = process.argv.includes('--json');
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.listTemplates) { console.log(JSON.stringify(TEMPLATES, null, 2)); return; }
    if (options.help) { console.log(HELP); return; }
    if (options.version) { console.log(VERSION); return; }
    if (options.doctor) {
      const result = await inspectEnvironment({ ...options, requirePdfCheck: options.strict });
      console.log(json ? JSON.stringify(result, null, 2) : result.checks.map(check => `${check.status.toUpperCase()} ${check.id}: ${check.message}`).join('\n'));
      if (!result.ok) process.exitCode = 1; return;
    }
    const manifest = await exportCards(options);
    console.log(json ? JSON.stringify(manifest, null, 2) : `Rendered ${manifest.cardCount} card(s): ${manifest.formats.join(', ')}\n${options.out}\nManifest: ${path.join(options.out, 'manifest.json')}`);
  } catch (error) {
    const normalized = normalizeError(error);
    console.error(json ? JSON.stringify({ ...normalized, schemaVersion: 2, status: 'error' }) : `md2card [${normalized.code}]: ${normalized.message}`);
    process.exitCode = normalized.exitCode || 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
