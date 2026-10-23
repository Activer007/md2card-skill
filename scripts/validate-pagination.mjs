#!/usr/bin/env node
// CI-only acceptance run: real Chromium, all output formats, and strict PDF QA.
// This script deliberately does not treat a missing browser as a passing skip.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseOptions, exportCards } from './render.mjs';
import { renderCards } from './markdown.mjs';
import { inspectPdf } from './qa.mjs';

const run = promisify(execFile);
const repository = fileURLToPath(new URL('..', import.meta.url));
const root = path.join(repository, 'validation', 'pagination');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
const dimensions = { width: 1080, height: 900 };
const examples = [
  { name: 'paragraphs', marker: /PARA_A\d{2}/g, theme: 'editorial' },
  { name: 'lists', marker: /STEP_A\d{2}/g, theme: 'midnight' },
  { name: 'tables', marker: /ROW_A\d{2}/g, theme: 'minimal' },
  { name: 'references', marker: /REF_[ABC]\d{2}/g, theme: 'notebook' }
];

function once(text, marker, context) {
  assert.equal(text.split(marker).length - 1, 1, `${context}: ${marker} must appear exactly once`);
}

async function absent(directory) {
  try { await readdir(directory); return false; }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}

async function validateExample(example) {
  const input = path.join(repository, 'examples', `pagination-${example.name}.md`);
  const out = path.join(root, example.name);
  const source = await readFile(input, 'utf8');
  const markers = source.match(example.marker) || [];
  assert.ok(markers.length > 0, `Missing source markers in ${example.name}`);
  assert.equal(new Set(markers).size, markers.length, 'Source fixture markers must be unique');
  const options = parseOptions([input, '--out', out, '--paginate', 'auto', '--format', 'all', '--width', String(dimensions.width), '--height', String(dimensions.height), '--theme', example.theme, '--strict', '--preview', '--contact-sheet']);
  const manifest = await exportCards(options);
  assert.equal(manifest.pagination.mode, 'auto');
  assert.equal(manifest.pagination.validation.status, 'pass');
  assert.equal(manifest.pagination.hashes.original, manifest.inputSha256);
  assert.equal(manifest.pagination.hashes.algorithm, 'sha256');
  assert.ok(Number.isInteger(manifest.pagination.probes) && manifest.pagination.probes > 0 && manifest.pagination.probes <= manifest.pagination.limits.probes);
  assert.ok(manifest.pagination.atoms.length <= manifest.pagination.limits.atoms);
  assert.ok(manifest.cardCount <= manifest.pagination.limits.cards);
  assert.deepEqual(manifest.cards.flatMap(card => card.provenance.atomIds), manifest.pagination.atoms.map(atom => atom.id), 'Source atoms must be covered exactly once in original order');
  assert.deepEqual([...new Set(manifest.cards.map(card => card.provenance.partitionIndex))], manifest.pagination.partitions.map(partition => partition.index), 'Every explicit source partition must remain separate and in order');
  const byId = new Map(manifest.pagination.atoms.map(atom => [atom.id, atom]));
  for (const [index, card] of manifest.cards.entries()) {
    assert.deepEqual(manifest.pagination.cards[index], { index: card.index, sourceLines: card.sourceLines, ...card.provenance });
    assert.deepEqual(card.provenance.sourceRanges, card.provenance.atomIds.map(id => byId.get(id).sourceRange));
    assert.ok(card.provenance.atomIds.every(id => byId.get(id).partitionIndex === card.provenance.partitionIndex));
    assert.ok(card.provenance.repeatedHeaders.every(header => header.repeated === true));
  }
  assert.equal(manifest.inputSha256, hash(source));
  assert.deepEqual(manifest.dimensions, dimensions);
  assert.deepEqual(manifest.formats, ['html', 'png', 'pdf']);
  assert.ok(manifest.cardCount > 1, `${example.name} must exercise actual pagination`);
  assert.equal(manifest.cards.length, manifest.cardCount);
  assert.deepEqual(manifest.qa.overflow, { screen: 'pass', print: 'pass' });
  assert.equal(manifest.qa.pdf.status, 'pass');
  assert.equal(manifest.qa.pdf.pageCount, manifest.cardCount);
  assert.equal(manifest.qa.pdf.searchable, true);
  assert.equal(manifest.qa.images.status, 'pass');
  for (const card of manifest.cards) {
    assert.deepEqual(card.screen.overflow, []);
    assert.deepEqual(card.print.overflow, []);
    assert.ok(['explainer', 'steps'].includes(card.layout));
    assert.ok(/^[a-f0-9]{64}$/.test(card.sourceSha256));
    assert.equal(card.sourceLines.length, 2);
    assert.ok(card.sourceLines[0] >= 1 && card.sourceLines[1] >= card.sourceLines[0]);
  }
  assert.equal(manifest.artifacts.filter(artifact => artifact.format === 'png').length, manifest.cardCount);
  for (const file of ['cards.html', 'cards.pdf', 'preview.html', 'contact-sheet.png']) {
    assert.ok(manifest.artifacts.some(artifact => artifact.file === file), `${example.name}: missing ${file}`);
  }
  for (const artifact of manifest.artifacts) {
    assert.equal(path.basename(artifact.file), artifact.file, 'Artifacts must remain inside the output directory');
    const bytes = await readFile(path.join(out, artifact.file));
    assert.ok(bytes.length > 0);
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(hash(bytes), artifact.sha256, `Artifact hash mismatch: ${example.name}/${artifact.file}`);
    if (artifact.format === 'png') {
      assert.equal(bytes.readUInt32BE(16), dimensions.width);
      assert.equal(bytes.readUInt32BE(20), dimensions.height);
    }
  }
  const published = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
  assert.deepEqual(published, manifest, 'Published manifest must match the returned, validated export');
  const html = await readFile(path.join(out, 'cards.html'), 'utf8');
  const preview = await readFile(path.join(out, 'preview.html'), 'utf8');
  for (const marker of markers) { once(html, marker, `${example.name} HTML`); once(preview, marker, `${example.name} preview`); }
  assert.ok(!preview.includes('<script'), 'Preview must remain script-free');
  const baseline = renderCards(source).map(card => card.html).join('\n');
  assert.deepEqual(html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) || [], baseline.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) || [], 'Link labels, URLs, and titles must survive unchanged');
  if (example.name === 'tables') {
    const headers = html.match(/<thead>[\s\S]*?<\/thead>/g) || [];
    const original = baseline.match(/<thead>[\s\S]*?<\/thead>/g);
    assert.ok(headers.length > 1, 'The table must split into multiple complete fragments');
    assert.ok(headers.every(header => header === original[0]), 'Each fragment must repeat the exact original table header');
    assert.equal(manifest.cards.reduce((count, card) => count + card.provenance.repeatedHeaders.length, 0), headers.length - 1, 'Every repeated header must have source provenance');
  }
  await inspectPdf(path.join(out, 'cards.pdf'), { expectedPages: manifest.cardCount, requireTools: true, expectedText: markers });
  const { stdout: pdfText } = await run('pdftotext', ['-enc', 'UTF-8', '-layout', path.join(out, 'cards.pdf'), '-'], { timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
  for (const marker of markers) once(pdfText, marker, `${example.name} searchable PDF`);
  if (example.name === 'lists') {
    for (let index = 7; index <= 18; index++) assert.match(pdfText, new RegExp(`\\b${String(index).padStart(2, '0')}\\b\\s+STEP_A${String(index).padStart(2, '0')}\\b`), `Missing PDF step ${index}`);
  }
  if (example.name === 'references') {
    const pages = pdfText.split('\f').filter(page => page.trim());
    assert.ok(pages.every(page => new Set(page.match(/ZONE_[ABC]/g) || []).size === 1), 'Explicit === partitions must never share a PDF page');
    const { stdout: annotations } = await run('pdfinfo', ['-url', path.join(out, 'cards.pdf')], { timeout: 20000 });
    const originalUrls = [...baseline.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, '&'));
    // One wrapped HTML anchor may yield multiple PDF annotation rectangles.
    assert.deepEqual([...new Set(annotations.match(/https?:\/\/[^\s]+/g) || [])].sort(), [...new Set(originalUrls)].sort(), 'Native PDF link annotations must retain exact source reference destinations');
  }
  const result = { input: path.relative(repository, input), directory: example.name, status: 'pass', cards: manifest.cardCount, sourceMarkers: markers.length, theme: example.theme, pdf: 'pass', artifactCount: manifest.artifacts.length };
  results.push(result);
  console.log(`Validated pagination/${example.name}: ${manifest.cardCount} cards, unchanged content, all artifact hashes, native PDF, preview, and contact sheet.`);
}

async function validateAtomicFailure() {
  const input = path.join(repository, 'examples', 'pagination-atomic-error.md');
  const out = path.join(root, 'atomic-error');
  assert.ok(await absent(out), 'Atomic-error output must be absent before validation');
  let failure;
  try {
    await exportCards(parseOptions([input, '--out', out, '--paginate', 'auto', '--format', 'all', '--height', String(dimensions.height), '--strict', '--preview', '--contact-sheet']));
  } catch (error) { failure = error; }
  assert.ok(failure, 'An oversized code block must not be exported or silently truncated');
  assert.equal(failure.code, 'PAGINATION_ATOMIC_OVERFLOW');
  assert.equal(failure.exitCode, 2);
  assert.ok(await absent(out), 'An atomic overflow must publish no output directory, including no clipped files');
  const report = { status: 'expected-error', code: failure.code, exitCode: failure.exitCode, message: failure.message, details: failure.details, publishedOutput: false };
  await writeFile(path.join(root, 'atomic-error.json'), JSON.stringify(report, null, 2) + '\n');
  results.push({ input: path.relative(repository, input), directory: null, status: 'expected-error', code: failure.code, exitCode: failure.exitCode, publishedOutput: false });
  console.log('Validated pagination/atomic-error: explicit exit 2 and no clipped or partial exports.');
}

await mkdir(root, { recursive: true });
try {
  for (const example of examples) await validateExample(example);
  await validateAtomicFailure();
  await writeFile(path.join(root, 'summary.json'), JSON.stringify({ schemaVersion: 1, status: 'pass', strict: true, dimensions, results }, null, 2) + '\n');
  console.log(`Validated ${examples.length} automatic pagination decks and one expected atomic failure.`);
} catch (error) {
  await writeFile(path.join(root, 'summary.json'), JSON.stringify({ schemaVersion: 1, status: 'fail', strict: true, dimensions, results, failure: { code: error.code || 'VALIDATION_FAILED', message: error.message } }, null, 2) + '\n');
  throw error;
}
