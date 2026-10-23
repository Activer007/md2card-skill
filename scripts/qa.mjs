import path from 'node:path';
import { stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Md2CardError } from './errors.mjs';

const exec = promisify(execFile);
const COMMAND_OPTIONS = { encoding: 'utf8', timeout: 20000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: { ...process.env, LC_ALL: 'C' } };
const compact = value => String(value).normalize('NFC').replace(/\s+/gu, '');

/**
 * Verify an existing PDF without launching a browser. expectedText is source
 * text used to require nonempty searchable text; an array additionally requires
 * every supplied visible-text snippet. No source or extracted text is returned.
 * The second argument's required tools are pdfinfo and pdftotext (Poppler).
 * The third argument is dependency injection for isolated tests.
 */
export async function inspectPdf(file, options = {}, dependencies = {}) {
  const { expectedPages, requireTools = false, expectedText } = options;
  if (expectedPages !== undefined && (!Number.isInteger(expectedPages) || expectedPages < 1)) {
    throw new Md2CardError('PDF_QA_OPTIONS', 'expectedPages must be a positive integer.');
  }
  if (expectedText !== undefined && typeof expectedText !== 'string' && !(Array.isArray(expectedText) && expectedText.every(text => typeof text === 'string'))) {
    throw new Md2CardError('PDF_QA_OPTIONS', 'expectedText must be source text or an array of visible-text snippets.');
  }
  const absoluteFile = path.resolve(file);
  const getStat = dependencies.stat ?? stat;
  try {
    const info = await getStat(absoluteFile);
    if (!info.isFile() || info.size === 0) throw new Error('The file must be a nonempty regular file.');
  } catch (error) {
    throw new Md2CardError('PDF_FILE_INVALID', 'Cannot validate the PDF: the file is missing, empty, or not a regular file.', { reason: error.code ?? 'INVALID_FILE' }, 1, { cause: error });
  }
  const run = dependencies.runCommand ?? ((command, args) => exec(command, args, COMMAND_OPTIONS));
  const checks = [];
  const tools = { pdfinfo: false, pdftotext: false };
  for (const command of Object.keys(tools)) {
    try { await run(command, ['-v']); tools[command] = true; }
    catch (error) {
      checks.push({ id: command, status: requireTools ? 'fail' : 'warn', message: `${command} is unavailable. Install Poppler tools to validate exported PDFs.`, details: { reason: error.code ?? 'COMMAND_FAILED' } });
    }
  }
  const missingTools = Object.keys(tools).filter(command => !tools[command]);
  if (requireTools && missingTools.length) {
    throw new Md2CardError('PDF_TOOLS_MISSING', 'Strict PDF validation requires pdfinfo and pdftotext. Install Poppler tools and rerun.', { missingTools, checks });
  }

  let pageCount = null;
  let textCharacters = null;
  let searchable = null;
  if (tools.pdfinfo) {
    let result;
    try { result = await run('pdfinfo', [absoluteFile]); }
    catch (error) { throw new Md2CardError('PDF_INFO_FAILED', 'pdfinfo could not inspect the exported PDF.', { tool: 'pdfinfo', reason: error.code ?? 'COMMAND_FAILED', timedOut: Boolean(error.killed) }, 1, { cause: error }); }
    const match = /^Pages:\s+(\d+)\s*$/m.exec(result.stdout || '');
    pageCount = match ? Number(match[1]) : null;
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
      throw new Md2CardError('PDF_PAGE_COUNT_UNREADABLE', 'pdfinfo did not report a valid PDF page count.');
    }
    if (expectedPages !== undefined && pageCount !== expectedPages) {
      throw new Md2CardError('PDF_PAGE_COUNT_MISMATCH', `PDF has ${pageCount} page(s), but ${expectedPages} card(s) were expected. No validated export should be published.`, { expectedPages, actualPages: pageCount });
    }
    checks.push({ id: 'pdf-pages', status: 'pass', message: `PDF contains ${pageCount} page(s).`, details: { expectedPages: expectedPages ?? null, actualPages: pageCount } });
  }
  if (tools.pdftotext) {
    let result;
    try { result = await run('pdftotext', ['-enc', 'UTF-8', '-layout', absoluteFile, '-']); }
    catch (error) { throw new Md2CardError('PDF_TEXT_EXTRACTION_FAILED', 'pdftotext could not extract text from the exported PDF.', { tool: 'pdftotext', reason: error.code ?? 'COMMAND_FAILED', timedOut: Boolean(error.killed) }, 1, { cause: error }); }
    const extracted = compact(result.stdout || '');
    textCharacters = [...extracted].length;
    searchable = textCharacters > 0;
    const snippets = Array.isArray(expectedText) ? expectedText.map(compact).filter(Boolean) : [];
    const textRequired = expectedText === undefined || (Array.isArray(expectedText) ? snippets.length > 0 : compact(expectedText).length > 0);
    if (textRequired && !searchable) {
      throw new Md2CardError('PDF_TEXT_MISSING', 'The PDF has no extractable text although the source contains text. Re-export as a searchable-text PDF, not page screenshots.', { textCharacters: 0 });
    }
    const missingSnippetIndexes = snippets.flatMap((snippet, index) => extracted.includes(snippet) ? [] : [index]);
    if (missingSnippetIndexes.length) {
      throw new Md2CardError('PDF_TEXT_MISMATCH', 'Required visible text was not found in the PDF text extraction.', { missingSnippetIndexes, expectedSnippetCount: snippets.length });
    }
    checks.push({ id: 'pdf-text', status: 'pass', message: searchable ? 'PDF contains extractable, searchable text.' : 'No searchable text was expected or extracted.', details: { textCharacters, expectedSnippetCount: snippets.length } });
  }
  const status = checks.some(check => check.status === 'warn') ? 'warn' : 'pass';
  return { schemaVersion: 1, status, ok: true, pageCount, textCharacters, searchable, checks, tools };
}
