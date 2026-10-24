import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectEnvironment } from '../scripts/doctor.mjs';
import { inspectPdf } from '../scripts/qa.mjs';
import { Md2CardError, normalizeError } from '../scripts/errors.mjs';

const PACKAGES = {
  renderer: { version: '2.0.0', dependencies: { 'markdown-it': '15.0.3', playwright: '1.64.1' } },
  'markdown-it': { version: '15.0.3' },
  playwright: { version: '1.64.1' }
};
const CJK_FONTS = 'Example Sans\t20-7e\nExample CJK\t3000-303f 4e00-9fff ff00-ffef\n';
const missing = () => Object.assign(new Error('not installed'), { code: 'ENOENT' });
const check = (report, id) => report.checks.find(item => item.id === id);

function doctorDependencies(overrides = {}) {
  return {
    nodeVersion: '20.12.0',
    readPackage: async name => PACKAGES[name ?? 'renderer'],
    findBrowser: async () => '/local/chromium',
    runCommand: async (command, args) => {
      if (command === 'fc-list') return { stdout: CJK_FONTS, stderr: '' };
      if (command === 'fc-match') return { stdout: 'Example CJK\t20-7e 4e00-9fff\n', stderr: '' };
      assert.deepEqual(args, ['-v']);
      return { stdout: '', stderr: `${command} version 25.03.0\nCopyright` };
    },
    ...overrides
  };
}

function pdfDependencies(overrides = {}) {
  return {
    stat: async () => ({ isFile: () => true, size: 256 }),
    runCommand: async (command, args) => {
      if (args[0] === '-v') return { stdout: '', stderr: `${command} version 25.03.0` };
      if (command === 'pdfinfo') return { stdout: 'Title: Test\nPages:           2\n', stderr: '' };
      if (command === 'pdftotext') return { stdout: 'Searchable first page\f中文 second page\f', stderr: '' };
      throw new Error(`Unexpected command: ${command}`);
    },
    ...overrides
  };
}

test('doctor reports package versions, font coverage, PDF tools and unprobed browser', async () => {
  const commands = [];
  const defaults = doctorDependencies();
  const report = await inspectEnvironment({ lang: 'zh-CN', requiredText: '中文，汉字。', strict: true, requirePdfCheck: true }, {
    ...defaults,
    runCommand: async (command, args) => { commands.push(command); return defaults.runCommand(command, args); }
  });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.status, 'pass');
  assert.equal(report.ok, true);
  assert.equal(report.versions.markdownIt, '15.0.3');
  assert.equal(report.versions.playwright, '1.64.1');
  assert.equal(report.versions.pdfinfo, 'pdfinfo version 25.03.0');
  assert.deepEqual(report.browser, { path: '/local/chromium', launch: 'unverified' });
  assert.deepEqual(report.fonts.cjkFamilies, ['Example CJK']);
  assert.deepEqual(report.fonts.missingGlyphs, []);
  assert.deepEqual(commands, ['fc-list', 'fc-match', 'pdfinfo', 'pdftotext']);
  assert.ok(!commands.some(command => /chrom|playwright/.test(command)), 'doctor must never start a browser');
});

test('doctor fails unsupported Node, missing dependencies and unavailable browser', async () => {
  const report = await inspectEnvironment({}, doctorDependencies({
    nodeVersion: '18.20.0',
    readPackage: async name => { if (name === 'playwright') throw missing(); return PACKAGES[name ?? 'renderer']; },
    findBrowser: async () => { throw new Error('Chromium is missing; check --browser.'); }
  }));
  assert.equal(report.status, 'fail');
  assert.equal(report.ok, false);
  assert.equal(check(report, 'node').status, 'fail');
  assert.equal(check(report, 'package:playwright').status, 'fail');
  assert.match(check(report, 'package:playwright').message, /npm ci/);
  assert.equal(check(report, 'browser').status, 'fail');
  assert.equal(report.browser.path, null);
});

test('installed dependency version drift warns normally and fails in strict mode', async () => {
  const dependencies = doctorDependencies({ readPackage: async name => name === 'markdown-it' ? { version: '14.0.0' } : PACKAGES[name ?? 'renderer'] });
  assert.equal(check(await inspectEnvironment({}, dependencies), 'package:markdown-it').status, 'warn');
  assert.equal(check(await inspectEnvironment({ strict: true }, dependencies), 'package:markdown-it').status, 'fail');
});

test('CJK font absence warns normally and blocks strict Chinese rendering', async () => {
  const defaults = doctorDependencies();
  const dependencies = doctorDependencies({ runCommand: async (command, args) => command === 'fc-list' ? { stdout: 'Latin Only\t20-7e\n' } : defaults.runCommand(command, args) });
  const regular = await inspectEnvironment({ lang: 'zh-CN' }, dependencies);
  assert.equal(regular.ok, true);
  assert.equal(check(regular, 'cjk-glyphs').status, 'warn');
  assert.ok(regular.fonts.missingGlyphs.includes('中'));
  const strict = await inspectEnvironment({ lang: 'zh', strict: true }, dependencies);
  assert.equal(strict.ok, false);
  assert.equal(check(strict, 'cjk-glyphs').status, 'fail');
  assert.match(check(strict, 'cjk-glyphs').message, /local CJK font/);
  const english = await inspectEnvironment({ lang: 'en', strict: true }, dependencies);
  assert.equal(check(english, 'cjk-glyphs').status, 'skipped');
});

test('source-specific CJK glyphs are checked even for an English language tag', async () => {
  const report = await inspectEnvironment({ lang: 'en', requiredText: 'Visible glyph 𠮷', strict: true }, doctorDependencies());
  assert.deepEqual(report.fonts.missingGlyphs, ['𠮷']);
  assert.deepEqual(check(report, 'cjk-glyphs').details.missingCodepoints, ['U+20BB7']);
  assert.equal(report.ok, false);
});

test('font coverage can combine fallback fonts and deduplicates required glyphs', async () => {
  const defaults = doctorDependencies();
  const report = await inspectEnvironment({ lang: 'en', requiredText: '中文中文', strict: true }, doctorDependencies({
    runCommand: async (command, args) => command === 'fc-list' ? { stdout: 'Chinese One\t4e2d\nChinese Two\t6587\n' } : defaults.runCommand(command, args)
  }));
  assert.equal(check(report, 'cjk-glyphs').status, 'pass');
  assert.equal(report.fonts.requiredGlyphCount, 2);
});

test('missing Fontconfig remains unverified and does not mistake a fallback name for coverage', async () => {
  const defaults = doctorDependencies();
  const report = await inspectEnvironment({ lang: 'zh-CN', strict: true }, doctorDependencies({
    runCommand: async (command, args) => { if (command === 'fc-list') throw missing(); return defaults.runCommand(command, args); }
  }));
  assert.equal(report.fonts.scanAvailable, false);
  assert.equal(report.fonts.matchedFamily, 'Example CJK');
  assert.equal(check(report, 'fontconfig:list').status, 'warn');
  assert.equal(check(report, 'cjk-glyphs').status, 'fail');
  assert.equal(check(report, 'cjk-glyphs').details.coverage, 'unverified');
});

test('doctor marks missing Poppler optional or required without stopping other checks', async () => {
  const defaults = doctorDependencies();
  const dependencies = doctorDependencies({ runCommand: async (command, args) => { if (command === 'pdfinfo' || command === 'pdftotext') throw missing(); return defaults.runCommand(command, args); } });
  const optional = await inspectEnvironment({ lang: 'en' }, dependencies);
  assert.equal(optional.ok, true);
  assert.equal(check(optional, 'pdfinfo').status, 'warn');
  assert.equal(optional.pdfTools.pdftotext, false);
  const required = await inspectEnvironment({ lang: 'en', requirePdfCheck: true }, dependencies);
  assert.equal(required.ok, false);
  assert.equal(check(required, 'pdfinfo').status, 'fail');
  assert.equal(check(required, 'package:markdown-it').status, 'pass');
});

test('PDF QA validates exact page count and searchable text without returning source text', async () => {
  const report = await inspectPdf('fixture.pdf', { expectedPages: 2, requireTools: true, expectedText: '# Private source content' }, pdfDependencies());
  assert.equal(report.status, 'pass');
  assert.equal(report.pageCount, 2);
  assert.equal(report.searchable, true);
  assert.ok(report.textCharacters > 0);
  assert.deepEqual(report.tools, { pdfinfo: true, pdftotext: true });
  assert.ok(!JSON.stringify(report).includes('Private source content'));
  assert.ok(!JSON.stringify(report).includes('Searchable first page'));
});

test('PDF QA handles tool absence explicitly and strict checks cannot silently pass', async () => {
  const dependencies = pdfDependencies({ runCommand: async () => { throw missing(); } });
  const report = await inspectPdf('fixture.pdf', { expectedPages: 2 }, dependencies);
  assert.equal(report.status, 'warn');
  assert.equal(report.pageCount, null);
  assert.equal(report.searchable, null);
  await assert.rejects(() => inspectPdf('fixture.pdf', { requireTools: true }, dependencies), error => error instanceof Md2CardError && error.code === 'PDF_TOOLS_MISSING' && error.details.missingTools.length === 2);
});

test('PDF QA throws for page mismatch and missing searchable text', async () => {
  await assert.rejects(() => inspectPdf('fixture.pdf', { expectedPages: 3 }, pdfDependencies()), error => error.code === 'PDF_PAGE_COUNT_MISMATCH' && error.details.actualPages === 2);
  const defaults = pdfDependencies();
  const noText = pdfDependencies({ runCommand: async (command, args) => command === 'pdftotext' && args[0] !== '-v' ? { stdout: '\n\f\n\f' } : defaults.runCommand(command, args) });
  await assert.rejects(() => inspectPdf('fixture.pdf', { expectedText: '# Nonempty source' }, noText), error => error.code === 'PDF_TEXT_MISSING');
  const emptySource = await inspectPdf('fixture.pdf', { expectedText: '' }, noText);
  assert.equal(emptySource.searchable, false);
});

test('PDF QA optionally validates visible snippets without leaking missing snippets', async () => {
  const report = await inspectPdf('fixture.pdf', { expectedText: ['Searchable first\npage', '中文'] }, pdfDependencies());
  assert.equal(report.status, 'pass');
  await assert.rejects(() => inspectPdf('fixture.pdf', { expectedText: ['private absent phrase'] }, pdfDependencies()), error => {
    assert.equal(error.code, 'PDF_TEXT_MISMATCH');
    assert.deepEqual(error.details.missingSnippetIndexes, [0]);
    assert.ok(!JSON.stringify(normalizeError(error)).includes('private absent phrase'));
    return true;
  });
});

test('PDF QA validates arguments and file errors before invoking external tools', async () => {
  const shouldNotRun = pdfDependencies({ runCommand: async () => assert.fail('Must not invoke tools') });
  await assert.rejects(() => inspectPdf('fixture.pdf', { expectedPages: 0 }, shouldNotRun), error => error.code === 'PDF_QA_OPTIONS');
  await assert.rejects(() => inspectPdf('fixture.pdf', { expectedText: [42] }, shouldNotRun), error => error.code === 'PDF_QA_OPTIONS');
  await assert.rejects(() => inspectPdf('fixture.pdf', {}, { ...shouldNotRun, stat: async () => ({ isFile: () => true, size: 0 }) }), error => error.code === 'PDF_FILE_INVALID');
  await assert.rejects(() => inspectPdf('fixture.pdf', {}, { ...shouldNotRun, stat: async () => { throw missing(); } }), error => error.code === 'PDF_FILE_INVALID');
});

test('PDF QA passes paths as one absolute argument, never shell expressions', async () => {
  const calls = [];
  const defaults = pdfDependencies();
  const filename = '-odd name;$(do-not-execute).pdf';
  await inspectPdf(filename, { expectedPages: 2 }, pdfDependencies({ runCommand: async (command, args) => { calls.push([command, args]); return defaults.runCommand(command, args); } }));
  assert.deepEqual(calls[2], ['pdfinfo', [path.resolve(filename)]]);
  assert.deepEqual(calls[3], ['pdftotext', ['-enc', 'UTF-8', '-layout', path.resolve(filename), '-']]);
});

test('PDF QA normalizes command failure and malformed tool output', async () => {
  const defaults = pdfDependencies();
  const failing = pdfDependencies({ runCommand: async (command, args) => {
    if (command === 'pdfinfo' && args[0] !== '-v') throw Object.assign(new Error('internal stderr'), { code: 'ETIMEDOUT', killed: true });
    return defaults.runCommand(command, args);
  } });
  await assert.rejects(() => inspectPdf('fixture.pdf', {}, failing), error => error.code === 'PDF_INFO_FAILED' && error.details.timedOut === true);
  const malformed = pdfDependencies({ runCommand: async (command, args) => command === 'pdfinfo' && args[0] !== '-v' ? { stdout: 'Unrecognized output' } : defaults.runCommand(command, args) });
  await assert.rejects(() => inspectPdf('fixture.pdf', {}, malformed), error => error.code === 'PDF_PAGE_COUNT_UNREADABLE');
});

test('structured errors serialize stable metadata, not stack, cause or arbitrary properties', () => {
  const details = { expectedPages: 2, count: 2n };
  details.self = details;
  const error = new Md2CardError('EXAMPLE', 'Actionable message.', details, 2, { cause: new Error('private cause') });
  error.source = 'private input';
  const report = normalizeError(error);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.status, 'error');
  assert.equal(report.code, 'EXAMPLE');
  assert.equal(report.exitCode, 2);
  assert.equal(report.details.count, '2');
  assert.equal(report.details.self, '[Circular]');
  assert.ok(!('stack' in report));
  assert.ok(!JSON.stringify(report).includes('private'));
  assert.equal(normalizeError(new Error('plain')).code, 'INTERNAL_ERROR');
  assert.equal(normalizeError('plain string').message, 'plain string');
});

function minimalPdf() {
  const stream = 'BT /F1 12 Tf 40 80 Td (SEARCHABLE_MARKER_2026) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

test('PDF QA verifies a real tiny searchable PDF with Poppler when available, without Chromium', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md2card-pdf-qa-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'small fixture.pdf');
  await writeFile(file, minimalPdf());
  const report = await inspectPdf(file, { expectedPages: 1, expectedText: ['SEARCHABLE_MARKER_2026'] });
  if (!report.tools.pdfinfo || !report.tools.pdftotext) { t.skip('Poppler tools are not both installed; mocked strict-mode checks remain mandatory.'); return; }
  assert.equal(report.status, 'pass');
  assert.equal(report.pageCount, 1);
  assert.equal(report.searchable, true);
  assert.equal(report.textCharacters, 22);
});

test('doctor reports local role-font candidates without claiming browser selection', async () => {
  const defaults = doctorDependencies();
  const report = await inspectEnvironment({ lang: 'en' }, doctorDependencies({
    runCommand: async (command, args) => command === 'fc-list'
      ? { stdout: 'Noto Serif CJK SC,思源宋体\t20-7e 4e00-9fff\nLiberation Mono\t20-7e\n' }
      : defaults.runCommand(command, args)
  }));
  assert.equal(check(report, 'font-roles').status, 'pass');
  assert.equal(report.fonts.typography.localOnly, true);
  assert.equal(report.fonts.typography.stacks.literary.firstInstalledCandidate, 'Noto Serif CJK SC');
  assert.equal(report.fonts.typography.stacks.mono.firstInstalledCandidate, 'Liberation Mono');
  assert.equal(report.fonts.typography.stacks.sans.selection, 'generic-fallback');
  assert.equal(report.fonts.typography.stacks.sans.firstInstalledCandidate, null);
  assert.equal(report.fonts.typography.stacks.sans.fallback, 'sans-serif');
  assert.equal(report.fonts.typography.stacks.serif.browserSelection, 'unverified');
  assert.equal(Object.keys(report.fonts.typography.families).length, 12);
  assert.equal(report.fonts.typography.families.eastern.roles.quote, 'literary');
  assert.equal(report.fonts.typography.families.technology.roles.numeric, 'mono');
});

test('doctor does not mistake unknown role inventory or similar font names for installation', async () => {
  const defaults = doctorDependencies();
  for (const fonts of [null, '', 'Not Noto Serif CJK SC\t20-7e\n']) {
    const report = await inspectEnvironment({ lang: 'en' }, doctorDependencies({
      runCommand: async (command, args) => {
        if (command !== 'fc-list') return defaults.runCommand(command, args);
        if (fonts === null) throw missing();
        return { stdout: fonts };
      }
    }));
    assert.equal(report.fonts.typography.stacks.literary.firstInstalledCandidate, null);
    assert.equal(report.fonts.typography.stacks.literary.selection, fonts ? 'generic-fallback' : 'unverified');
    assert.equal(check(report, 'font-roles').status, fonts ? 'pass' : 'warn');
  }
});
