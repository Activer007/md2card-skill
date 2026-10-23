#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, mkdtemp, rm, rename, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { renderCards } from './markdown.mjs';
import { buildDocument, buildPreviewDocument, SIZES, THEMES } from './document.mjs';
import { createAssetResolver } from './assets.mjs';
import { openRenderer, measureCards } from './browser.mjs';
import { inspectEnvironment } from './doctor.mjs';
import { inspectPdf } from './qa.mjs';
import { Md2CardError, normalizeError } from './errors.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const VERSION = '2.0.0';
export const LIMITS = Object.freeze({ inputBytes: 2 * 1024 * 1024, cards: 200, cardPixels: 40_000_000, deckPixels: 200_000_000, outputBytes: 256 * 1024 * 1024 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, message, details = {}) => { throw new Md2CardError(code, message, details); };
const HELP = `md2card-skill ${VERSION} — offline Markdown knowledge cards

Usage: node scripts/render.mjs input.md --out ./output
       node scripts/render.mjs --doctor [--strict] [--json]

  --out DIR         Output directory, absent or empty (never overwrite).
  --theme NAME      editorial (default), minimal, midnight, notebook, bold
  --format LIST     all (default), html, png, pdf or comma-separated list
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
Overflow is mandatory in screen AND print; exit 2 writes overflow.json only.
Native PDF retains text; strict mode verifies pages and searchable text.
No accounts, cloud sync, AI calls, auto-pagination, rewriting or PPTX.
`;

export function parseOptions(argv) {
  let parsed;
  try { parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    out: { type: 'string' }, theme: { type: 'string', default: 'editorial' }, format: { type: 'string', default: 'all' },
    size: { type: 'string', default: 'portrait' }, width: { type: 'string' }, height: { type: 'string' }, scale: { type: 'string', default: '1' },
    footer: { type: 'string', default: '' }, title: { type: 'string' }, lang: { type: 'string', default: 'zh-CN' }, browser: { type: 'string' },
    'asset-root': { type: 'string' }, brand: { type: 'string' }, preview: { type: 'boolean', default: false }, 'contact-sheet': { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false }, doctor: { type: 'boolean', default: false }, json: { type: 'boolean', default: false },
    'timeout-ms': { type: 'string', default: '120000' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' }
  } }); } catch (error) { fail('INVALID_OPTIONS', error.message); }
  const { values, positionals } = parsed;
  if (values.help || values.version) return { help: values.help, version: values.version };
  if (values.doctor && positionals.length === 0) return { ...values, requirePdfCheck: values.strict };
  if (positionals.length !== 1) fail('INVALID_OPTIONS', 'Provide one Markdown input file. Run --help for usage.');
  if (!THEMES.includes(values.theme)) fail('INVALID_OPTIONS', `Unknown theme "${values.theme}". Choose ${THEMES.join(', ')}.`);
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
    contactSheet: values['contact-sheet'], timeoutMs };
}

export function checkRenderBudget(cardCount, options) {
  if (cardCount > LIMITS.cards) fail('RENDER_BUDGET', 'A deck may contain at most 200 cards. Split it into smaller decks.');
  const pixels = cardCount * options.width * options.height * (options.formats.includes('png') ? options.scale ** 2 : 1);
  if (pixels > LIMITS.deckPixels) fail('RENDER_BUDGET', 'Total deck render budget exceeds 200 million pixels. Split the deck or reduce dimensions/scale.', { pixels, limit: LIMITS.deckPixels });
  return { estimatedPixels: pixels, maxPixels: LIMITS.deckPixels, maxOutputBytes: LIMITS.outputBytes, timeoutMs: options.timeoutMs };
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

export async function exportCards(options) {
  const started = Date.now(), deadline = started + options.timeoutMs;
  const remaining = () => { const ms = deadline - Date.now(); if (ms <= 0) fail('RENDER_TIMEOUT', 'Total render deadline exceeded. Split the deck or increase --timeout-ms.'); return ms; };
  const inputStat = await stat(options.input);
  if (!inputStat.isFile()) fail('INVALID_INPUT', 'The input must be a regular Markdown file.');
  if (inputStat.size > LIMITS.inputBytes) fail('RENDER_BUDGET', 'The input is larger than 2 MiB. Split it into smaller decks.');
  await assertEmptyOutput(options.out);
  const markdown = await readFile(options.input, 'utf8');
  const assets = await createAssetResolver(options.assetRoot);
  const cards = renderCards(markdown, { resolveImage: assets.resolveImage });
  const budget = checkRenderBudget(cards.length, options);
  const brand = await loadBrand(options.brandFile, assets.resolveImage);
  const assetUsage = assets.getUsage();
  if (brand?.logo) {
    const repeats = cards.length - 1;
    assetUsage.occurrences += repeats;
    assetUsage.pixels += repeats * brand.logo.width * brand.logo.height;
    assetUsage.embeddedBytes += repeats * Buffer.byteLength(brand.logo.dataUrl);
  }
  if (assetUsage.pixels > 100_000_000 || assetUsage.embeddedBytes > 64 * 1024 * 1024) fail('RENDER_BUDGET', 'Repeated images or brand logos exceed the 100 million decoded pixels / 64 MiB embedding budget. Use smaller images or split the deck.', assetUsage);
  options = { ...options, brand };
  const [themeCss, layoutCss] = await Promise.all(['themes.css', 'layouts.css'].map(file => readFile(path.join(ROOT, 'assets', file), 'utf8')));
  const embeddedBytes = cards.reduce((sum, card) => sum + Buffer.byteLength(card.html) + (card.image?.bytes || 0) * 4 / 3, 0) + (brand?.logo?.bytes || 0) * cards.length * 4 / 3;
  if (embeddedBytes > 64 * 1024 * 1024) fail('RENDER_BUDGET', 'Embedded document content exceeds 64 MiB. Use smaller images or split the deck.');
  const html = buildDocument(cards, { ...options, preview: false }, themeCss, layoutCss);
  if (Buffer.byteLength(html) > 64 * 1024 * 1024) fail('RENDER_BUDGET', 'Generated HTML exceeds 64 MiB. Use smaller images or split the deck.');
  const environment = await inspectEnvironment({ browser: options.browser, requirePdfCheck: options.strict && options.formats.includes('pdf'), lang: options.lang, strict: options.strict, requiredText: markdown });
  if (!environment.ok) fail('PREFLIGHT_FAILED', 'Environment preflight failed. Run --doctor --strict for details.', { checks: environment.checks.filter(check => check.status === 'fail') });
  remaining();
  const renderer = await openRenderer({ ...options, timeoutMs: remaining() });
  let staging, timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void renderer.browser.close().catch(() => {}); }, remaining());
  const checkTime = () => { if (timedOut) fail('RENDER_TIMEOUT', 'Total render deadline exceeded. Split the deck or increase --timeout-ms.'); return remaining(); };
  try {
    const { page } = renderer;
    page.setDefaultTimeout(checkTime());
    await page.setContent(html, { waitUntil: 'load', timeout: checkTime() });
    await page.evaluate(() => document.fonts.ready);
    const imageQa = await page.locator('img').evaluateAll(images => images.map(image => ({ alt: image.alt, valid: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && image.naturalWidth <= 8192 && image.naturalHeight <= 8192 && image.naturalWidth * image.naturalHeight <= 20_000_000, width: image.naturalWidth, height: image.naturalHeight })));
    if (imageQa.some(image => !image.valid)) fail('IMAGE_DECODE_FAILED', 'An embedded local image could not be decoded by Chromium. Replace the invalid image.', { images: imageQa.filter(image => !image.valid) });
    const screenMeasurements = await measureCards(page);
    await page.emulateMedia({ media: 'print' });
    const printMeasurements = await measureCards(page);
    const affected = screenMeasurements.map((measurement, index) => ({ index: measurement.index, sourceLines: cards[index].sourceLines, screen: measurement, print: printMeasurements[index] })).filter(item => item.screen.overflow.length || item.print.overflow.length);
    await mkdir(path.dirname(options.out), { recursive: true });
    staging = await mkdtemp(path.join(path.dirname(options.out), '.md2card-'));
    if (affected.length) {
      const report = { schemaVersion: 2, status: 'overflow', code: 'CONTENT_OVERFLOW', input: path.basename(options.input), theme: options.theme,
        dimensions: { width: options.width, height: options.height }, cards: affected,
        guidance: 'Shorten affected cards, add explicit === boundaries, or increase dimensions. No clipped exports were produced.' };
      await writeFile(path.join(staging, 'overflow.json'), JSON.stringify(report, null, 2) + '\n');
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
    if (options.formats.includes('html')) { await writeFile(path.join(staging, 'cards.html'), html); await record('html', 'cards.html'); }
    if (options.preview) { await writeFile(path.join(staging, 'preview.html'), buildPreviewDocument(cards, options, themeCss, layoutCss)); await record('preview', 'preview.html'); }
    let pdfQa = { status: 'not-requested' };
    if (options.formats.includes('pdf')) {
      await page.pdf({ path: path.join(staging, 'cards.pdf'), printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, timeout: checkTime(), margin: { top: 0, bottom: 0, left: 0, right: 0 } });
      const textContent = await page.locator('.card-content').allTextContents();
      pdfQa = await inspectPdf(path.join(staging, 'cards.pdf'), { expectedPages: cards.length, requireTools: options.strict, expectedText: textContent.join(' ').trim() });
      await record('pdf', 'cards.pdf');
    }
    await page.emulateMedia({ media: 'screen' });
    if (options.formats.includes('png')) for (const card of cards) {
      const filename = `card-${String(card.index).padStart(3, '0')}.png`;
      await page.locator('.card').nth(card.index - 1).screenshot({ path: path.join(staging, filename), type: 'png', animations: 'disabled', timeout: checkTime() });
      await record('png', filename, { card: card.index });
    }
    if (options.contactSheet) {
      const columns = Math.min(4, cards.length), thumbWidth = 270;
      const sheet = await renderer.context.newPage();
      await sheet.setViewportSize({ width: columns * (thumbWidth + 20) + 20, height: 600 });
      const sheetCss = `.deck { display:grid; grid-template-columns:repeat(${columns}, ${thumbWidth}px); gap:20px; padding:20px; min-width:0; width:max-content; } .card { zoom:${thumbWidth / options.width}; }`;
      await sheet.setContent(html.replace('</style>', sheetCss + '\n</style>'), { waitUntil: 'load', timeout: checkTime() });
      await sheet.evaluate(() => document.fonts.ready);
      await sheet.screenshot({ path: path.join(staging, 'contact-sheet.png'), fullPage: true, scale: 'css', animations: 'disabled', timeout: checkTime() });
      await sheet.close(); await record('contact-sheet', 'contact-sheet.png');
    }
    const loadedAssets = assets.getAssets().map(({ dataUrl, ...asset }) => asset);
    const manifest = {
      schemaVersion: 2, status: 'success', generator: { name: 'md2card-skill', version: VERSION }, createdAt: new Date().toISOString(),
      input: path.basename(options.input), inputSha256: hash(markdown), title: options.title, theme: options.theme,
      styleSha256: { themes: hash(themeCss), layouts: hash(layoutCss) }, brand: brand ? { name: brand.name, accent: brand.accent, logoHash: brand.logo?.hash } : null,
      dimensions: { width: options.width, height: options.height }, pngScale: options.scale, formats: options.formats, cardCount: cards.length, artifacts, assets: loadedAssets, assetUsage,
      versions: { ...environment.versions, chromium: renderer.browser.version() }, budget: { ...budget, outputBytes, elapsedMs: Date.now() - started },
      qa: { overflow: { screen: 'pass', print: 'pass' }, images: { status: 'pass', count: imageQa.length }, fonts: environment.fonts, pdf: pdfQa, visualReview: 'not-performed' },
      cards: cards.map((card, index) => ({ index: card.index, layout: card.metadata.layout, sourceLines: card.sourceLines, sourceSha256: hash(card.source), screen: screenMeasurements[index], print: printMeasurements[index] })),
      security: { rawHtml: 'escaped', images: 'validated-local-raster-only', assetBoundary: 'realpath-contained', networkRequests: 'blocked', clientScripts: 'disabled' }
    };
    checkTime(); await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await publish(staging, options.out); staging = undefined;
    return manifest;
  } catch (error) { if (timedOut) fail('RENDER_TIMEOUT', 'Total render deadline exceeded. No completed exports were published.'); throw error; }
  finally { clearTimeout(timer); await renderer.browser.close(); if (staging) await rm(staging, { recursive: true, force: true }); }
}

async function main() {
  const json = process.argv.includes('--json');
  try {
    const options = parseOptions(process.argv.slice(2));
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
