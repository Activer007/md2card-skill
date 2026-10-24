import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectLocalTypography } from './typography.mjs';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const PACKAGE_URL = new URL('../package.json', import.meta.url);
const CHINESE_PROBE = '中文汉字';
const COMMAND_OPTIONS = { encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, env: { ...process.env, LC_ALL: 'C' } };

async function readPackage(name) {
  return JSON.parse(await readFile(name ? require.resolve(`${name}/package.json`) : PACKAGE_URL, 'utf8'));
}

function summaryStatus(checks) {
  return checks.some(check => check.status === 'fail') ? 'fail' : checks.some(check => check.status === 'warn') ? 'warn' : 'pass';
}

function versionLine(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`.split(/\r?\n/).find(line => /version|\d+\.\d+/i.test(line))?.trim() ?? null;
}

function parseRanges(charset) {
  return charset.trim().split(/\s+/).filter(Boolean).flatMap(range => {
    if (!/^[\da-f]+(?:-[\da-f]+)?$/i.test(range)) return [];
    const [from, to = from] = range.split('-').map(value => parseInt(value, 16));
    return from <= to ? [[from, to]] : [];
  });
}

function covers(ranges, char) {
  const code = char.codePointAt(0);
  return ranges.some(([from, to]) => code >= from && code <= to);
}

function mergeRanges(ranges) {
  const result = [];
  for (const [from, to] of ranges.sort((a, b) => a[0] - b[0])) {
    const previous = result.at(-1);
    if (previous && from <= previous[1] + 1) previous[1] = Math.max(previous[1], to);
    else result.push([from, to]);
  }
  return result;
}

function parseFontList(output) {
  return output.split(/\r?\n/).filter(Boolean).flatMap(line => {
    const [family, charset] = line.split('\t');
    return family && charset ? [{ family, ranges: parseRanges(charset) }] : [];
  });
}

function requiredGlyphs(lang, requiredText) {
  const found = String(requiredText).match(/[\p{Script=Han}\u3000-\u303f\uff01-\uff60]/gu) ?? [];
  return [...new Set((/^zh(?:-|$)/i.test(lang) ? [...CHINESE_PROBE] : []).concat(found))];
}

/**
 * Read-only preflight. Chromium is located but never launched, including in
 * strict mode. Font coverage is an installed-font guardrail, not visual QA.
 * The second argument provides isolated dependencies for tests only.
 */
export async function inspectEnvironment(options = {}, dependencies = {}) {
  const { browser, requirePdfCheck = false, lang = 'zh-CN', strict = false, requiredText = '' } = options;
  const run = dependencies.runCommand ?? ((command, args) => exec(command, args, COMMAND_OPTIONS));
  const getPackage = dependencies.readPackage ?? readPackage;
  const findBrowser = dependencies.findBrowser ?? (async explicitPath => (await import('./browser.mjs')).findBrowser(explicitPath));
  const nodeVersion = dependencies.nodeVersion ?? process.versions.node;
  const checks = [];
  const add = (id, status, message, details = {}) => checks.push({ id, status, message, details });
  const versions = { node: nodeVersion, md2card: null, markdownIt: null, playwright: null, pdfinfo: null, pdftotext: null };
  const browserInfo = { path: null, launch: 'unverified' };
  const fonts = { scanAvailable: false, families: [], cjkFamilies: [], requiredGlyphCount: 0, missingGlyphs: [], matchedFamily: null };
  const pdfTools = { pdfinfo: false, pdftotext: false };
  const nodeMajor = Number.parseInt(nodeVersion, 10);
  add('node', nodeMajor >= 20 ? 'pass' : 'fail', nodeMajor >= 20 ? `Node.js ${nodeVersion} meets the >=20 requirement.` : `Node.js ${nodeVersion} is unsupported. Install Node.js 20 or newer.`, { actual: nodeVersion, required: '>=20' });

  let manifest;
  try { manifest = await getPackage(); versions.md2card = manifest.version; }
  catch (error) { add('package', 'fail', 'Cannot read the renderer package metadata. Restore the complete skill folder.', { reason: error.code ?? 'READ_FAILED' }); }
  for (const [name, key] of [['markdown-it', 'markdownIt'], ['playwright', 'playwright']]) {
    try {
      const metadata = await getPackage(name);
      versions[key] = metadata.version;
      const required = manifest?.dependencies?.[name] ?? null;
      const exact = required && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(required);
      const matches = !exact || metadata.version === required;
      add(`package:${name}`, matches ? 'pass' : strict ? 'fail' : 'warn', matches ? `${name} ${metadata.version} is installed.` : `${name} ${metadata.version} differs from the pinned ${required}. Run npm ci to restore reproducible dependencies.`, { actual: metadata.version, required });
    } catch (error) {
      add(`package:${name}`, 'fail', `${name} is unavailable. Run npm ci in the skill folder.`, { reason: error.code ?? 'READ_FAILED' });
    }
  }

  try {
    browserInfo.path = await findBrowser(browser);
    add('browser', 'pass', 'Chromium executable is available. Launch compatibility has not been tested.', { path: browserInfo.path, launch: 'unverified' });
  } catch (error) {
    add('browser', 'fail', error.message || 'Chromium was not found. Install Playwright Chromium or set --browser.', { launch: 'unverified' });
  }

  const glyphs = requiredGlyphs(lang, requiredText);
  fonts.requiredGlyphCount = glyphs.length;
  let fontEntries = [];
  try {
    const result = await run('fc-list', ['--format=%{family}\t%{charset}\n']);
    fontEntries = parseFontList(result.stdout || '');
    fonts.scanAvailable = true;
    fonts.families = [...new Set(fontEntries.map(font => font.family))].sort();
    fonts.cjkFamilies = [...new Set(fontEntries.filter(font => [...CHINESE_PROBE].every(char => covers(font.ranges, char))).map(font => font.family))].sort();
    add('fontconfig:list', fontEntries.length ? 'pass' : 'warn', fontEntries.length ? `${fonts.families.length} installed font families were inspected.` : 'Fontconfig found no fonts with readable character coverage.', { fontCount: fontEntries.length });
  } catch (error) {
    add('fontconfig:list', 'warn', 'fc-list is unavailable; installed font coverage could not be scanned. Install Fontconfig or visually verify the exported glyphs.', { reason: error.code ?? 'COMMAND_FAILED' });
  }
  try {
    const result = await run('fc-match', ['--format=%{family}\t%{charset}\n', `sans-serif:lang=${lang}`]);
    const matched = parseFontList(result.stdout || '')[0];
    fonts.matchedFamily = matched?.family ?? null;
    add('fontconfig:match', matched ? 'pass' : 'warn', matched ? `Default sans-serif match: ${matched.family}. Browser fallback must still be visually checked.` : 'Fontconfig did not report a default sans-serif match.');
  } catch (error) {
    add('fontconfig:match', 'warn', 'fc-match is unavailable; default font selection was not verified.', { reason: error.code ?? 'COMMAND_FAILED' });
  }
  fonts.typography = inspectLocalTypography(fonts.families, { scanAvailable: fonts.scanAvailable && fontEntries.length > 0 });
  const genericFallbackStacks = Object.entries(fonts.typography.stacks).filter(([, stack]) => stack.selection === 'generic-fallback').map(([id]) => id);
  add('font-roles', fonts.scanAvailable && fontEntries.length ? 'pass' : 'warn',
    fonts.scanAvailable && fontEntries.length
      ? 'Local display, body, numeric, quote and source font candidates were inspected. Generic fallback is allowed; per-glyph browser selection and visual family distinction remain unverified.'
      : 'Local role-font availability is unverified. No font is downloaded; inspect the rendered output after installing local fonts.',
    { localOnly: true, roleCount: 5, familyCount: 12, genericFallbackStacks, browserSelection: 'unverified' });
  if (glyphs.length) {
    if (!fonts.scanAvailable || !fontEntries.length) {
      add('cjk-glyphs', strict ? 'fail' : 'warn', 'CJK font coverage is unverified. Install a local CJK font and Fontconfig, then rerun --doctor; no web font will be fetched.', { requiredGlyphCount: glyphs.length, coverage: 'unverified' });
    } else {
      const coverage = mergeRanges(fontEntries.flatMap(font => font.ranges));
      fonts.missingGlyphs = glyphs.filter(char => !covers(coverage, char));
      const missing = fonts.missingGlyphs.length;
      add('cjk-glyphs', missing ? strict ? 'fail' : 'warn' : 'pass', missing ? `${missing} required CJK glyph(s) have no installed-font coverage. Install a suitable local CJK font before exporting.` : 'Installed fonts cover the required CJK glyphs. This does not replace visual inspection of browser output.', { requiredGlyphCount: glyphs.length, missingGlyphCount: missing, missingCodepoints: fonts.missingGlyphs.map(char => `U+${char.codePointAt(0).toString(16).toUpperCase()}`) });
    }
  } else {
    add('cjk-glyphs', 'skipped', 'No CJK glyphs were requested for this language and source.');
  }

  for (const command of Object.keys(pdfTools)) {
    try {
      const result = await run(command, ['-v']);
      pdfTools[command] = true;
      versions[command] = versionLine(result);
      add(command, 'pass', `${command} is available for PDF validation.`, { version: versions[command] });
    } catch (error) {
      add(command, requirePdfCheck ? 'fail' : 'warn', `${command} is unavailable. Install Poppler tools to verify PDF ${command === 'pdfinfo' ? 'page counts' : 'searchable text'}.`, { reason: error.code ?? 'COMMAND_FAILED' });
    }
  }
  const status = summaryStatus(checks);
  return { schemaVersion: 1, status, ok: status !== 'fail', checks, versions, browser: browserInfo, fonts, pdfTools };
}
