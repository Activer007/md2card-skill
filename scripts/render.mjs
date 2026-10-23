#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, mkdtemp, rm, rename, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { renderCards } from './markdown.mjs';
import { buildDocument, SIZES, THEMES } from './document.mjs';
import { openRenderer, measureCards } from './browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const VERSION = '1.0.0';
const HELP = `md2card-skill ${VERSION} — local Markdown knowledge cards

Usage:
  node scripts/render.mjs input.md --out ./output
  npm run render -- input.md --theme midnight --format png,pdf

Options:
  --out DIR         Output directory (must be absent or empty).
                    Default: ./output/<input-name>
  --theme NAME      editorial (default), minimal, midnight, notebook, bold
  --format LIST     all (default), html, png, pdf, or a comma-separated list
  --size NAME       portrait 1080×1440 (default), square 1080×1080,
                    slide 1600×900. Ratios: 3:4, 1:1, 16:9.
  --width PX        Override card width (integer 200–4096).
  --height PX       Override card height (integer 200–4096).
  --scale N         PNG pixel density, 0.5–3 (default 1); not PDF page size.
  --footer TEXT     Optional footer text. Card indexes are always shown.
  --title TEXT      HTML document title (default: input filename).
  --lang TAG        HTML language tag (default: zh-CN).
  --browser PATH    Chromium executable (or set CHROMIUM_PATH).
  --help, -h        Show this help.
  --version         Show version.

Content and safety:
  A standalone === line starts a new card, except inside code blocks.
  --- remains a Markdown horizontal rule. Empty cards are rejected.
  Supports headings, text, lists, blockquotes, tables, links, fenced code.
  Raw HTML is escaped. Markdown images are rejected. No scripts, external
  image/font requests, AI APIs, auto-shrinking, or automatic pagination.

Overflow is always checked in Chromium, including for HTML-only output.
Overflow exits with code 2 and writes overflow.json, not clipped exports.
Success writes cards.html / card-NNN.png / cards.pdf and manifest.json.
PDF uses native browser printing: text is selectable, not a screenshot.

Setup:
  npm ci
  npx playwright install chromium
  Or use installed Chromium via --browser /path/to/chromium.
`;

export function parseOptions(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    out: { type: 'string' }, theme: { type: 'string', default: 'editorial' }, format: { type: 'string', default: 'all' },
    size: { type: 'string', default: 'portrait' }, width: { type: 'string' }, height: { type: 'string' },
    scale: { type: 'string', default: '1' }, footer: { type: 'string', default: '' }, title: { type: 'string' },
    lang: { type: 'string', default: 'zh-CN' }, browser: { type: 'string' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' }
  } });
  if (values.help || values.version) return { help: values.help, version: values.version };
  if (positionals.length !== 1) throw new Error('Provide one Markdown input file. Run --help for usage.');
  if (!THEMES.includes(values.theme)) throw new Error(`Unknown theme "${values.theme}". Choose ${THEMES.join(', ')}.`);
  if (!(values.size in SIZES)) throw new Error(`Unknown size "${values.size}". Choose portrait, square, or slide.`);
  const size = SIZES[values.size];
  const width = Number(values.width ?? size.width);
  const height = Number(values.height ?? size.height);
  for (const [name, value] of Object.entries({ width, height })) {
    if (!Number.isInteger(value) || value < 200 || value > 4096) throw new Error(`--${name} must be an integer from 200 to 4096 pixels.`);
  }
  const scale = Number(values.scale);
  if (!Number.isFinite(scale) || scale < 0.5 || scale > 3) throw new Error('--scale must be between 0.5 and 3.');
  if (width * height * scale * scale > 40_000_000) throw new Error('PNG size would exceed 40 million pixels per card. Reduce dimensions or --scale.');
  const formats = values.format === 'all' ? ['html', 'png', 'pdf'] : [...new Set(values.format.split(',').map(value => value.trim()))];
  if (!formats.length || formats.some(format => !['html', 'png', 'pdf'].includes(format))) throw new Error('--format accepts html, png, pdf, all, or a comma-separated combination.');
  if (!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(values.lang)) throw new Error('--lang must be a language tag such as zh-CN or en.');
  const input = path.resolve(positionals[0]);
  return { ...values, input, out: path.resolve(values.out || path.join('output', path.parse(input).name)), width, height, scale, formats, title: values.title ?? path.basename(input) };
}

async function assertEmptyOutput(out) {
  try {
    const entries = await readdir(out);
    if (entries.length) throw new Error(`Output directory is not empty: ${out}. Choose a new directory to avoid overwriting files.`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function publish(staging, out) {
  await assertEmptyOutput(out);
  try { await rmdir(out); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rename(staging, out);
}

export async function exportCards(options) {
  const inputStat = await stat(options.input);
  if (!inputStat.isFile()) throw new Error('The input must be a regular Markdown file.');
  if (inputStat.size > 2 * 1024 * 1024) throw new Error('The input is larger than 2 MiB. Split it into smaller decks.');
  await assertEmptyOutput(options.out);
  const markdown = await readFile(options.input, 'utf8');
  const cards = renderCards(markdown);
  if (cards.length > 200) throw new Error('A deck may contain at most 200 cards. Split it into smaller decks.');
  const css = await readFile(path.join(ROOT, 'assets', 'themes.css'), 'utf8');
  const html = buildDocument(cards, options, css);
  const renderer = await openRenderer(options);
  let staging;
  try {
    const { page } = renderer;
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const screenMeasurements = await measureCards(page);
    await page.emulateMedia({ media: 'print' });
    const printMeasurements = await measureCards(page);
    const affected = screenMeasurements.map((measurement, index) => ({
      index: measurement.index,
      sourceLines: cards[index].sourceLines,
      screen: measurement,
      print: printMeasurements[index]
    })).filter(item => item.screen.overflow.length || item.print.overflow.length);
    await mkdir(path.dirname(options.out), { recursive: true });
    staging = await mkdtemp(path.join(path.dirname(options.out), '.md2card-'));
    if (affected.length) {
      const report = { schemaVersion: 1, status: 'overflow', input: path.basename(options.input), theme: options.theme,
        dimensions: { width: options.width, height: options.height }, cards: affected,
        guidance: 'Shorten affected cards, add explicit === boundaries, or increase dimensions. No clipped exports were produced.' };
      await writeFile(path.join(staging, 'overflow.json'), JSON.stringify(report, null, 2) + '\n');
      await publish(staging, options.out);
      staging = undefined;
      const error = new Error(`Content overflow on card(s) ${affected.map(item => item.index).join(', ')}. No exports produced. See ${path.join(options.out, 'overflow.json')}. Shorten content, add ===, or increase dimensions.`);
      error.exitCode = 2;
      throw error;
    }
    const artifacts = [];
    if (options.formats.includes('html')) {
      await writeFile(path.join(staging, 'cards.html'), html);
      artifacts.push({ format: 'html', file: 'cards.html' });
    }
    if (options.formats.includes('pdf')) {
      await page.pdf({ path: path.join(staging, 'cards.pdf'), printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: false, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
      artifacts.push({ format: 'pdf', file: 'cards.pdf' });
    }
    if (options.formats.includes('png')) {
      await page.emulateMedia({ media: 'screen' });
      for (const card of cards) {
        const filename = `card-${String(card.index).padStart(3, '0')}.png`;
        await page.locator('.card').nth(card.index - 1).screenshot({ path: path.join(staging, filename), type: 'png', animations: 'disabled' });
        artifacts.push({ format: 'png', file: filename, card: card.index });
      }
    }
    const manifest = {
      schemaVersion: 1, status: 'success', generator: { name: 'md2card-skill', version: VERSION }, createdAt: new Date().toISOString(),
      input: path.basename(options.input), title: options.title, theme: options.theme,
      dimensions: { width: options.width, height: options.height }, pngScale: options.scale,
      formats: options.formats, cardCount: cards.length, artifacts,
      cards: cards.map((card, index) => ({ index: card.index, sourceLines: card.sourceLines, screen: screenMeasurements[index], print: printMeasurements[index] })),
      security: { rawHtml: 'escaped', markdownImages: 'rejected', networkRequests: 'blocked', clientScripts: 'disabled' }
    };
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await publish(staging, options.out);
    staging = undefined;
    return manifest;
  } finally {
    await renderer.browser.close();
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}

async function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) { console.log(HELP); return; }
    if (options.version) { console.log(VERSION); return; }
    const manifest = await exportCards(options);
    console.log(`Rendered ${manifest.cardCount} card(s): ${manifest.formats.join(', ')}\n${options.out}\nManifest: ${path.join(options.out, 'manifest.json')}`);
  } catch (error) {
    console.error(`md2card: ${error.message}`);
    process.exitCode = error.exitCode || 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
