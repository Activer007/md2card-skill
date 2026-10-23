import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parseOptions, exportCards } from '../scripts/render.mjs';
import { openRenderer } from '../scripts/browser.mjs';
import { renderCards } from '../scripts/markdown.mjs';
import { createAssetResolver } from '../scripts/assets.mjs';

const run = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const strict = process.env.MD2CARD_REQUIRE_PDF_CHECK === '1' ? ['--strict'] : [];

async function browserReady(t) {
  if (process.env.MD2CARD_SKIP_BROWSER === '1' && process.env.MD2CARD_REQUIRE_BROWSER !== '1') {
    t.skip('Browser launch skipped explicitly in this sandbox; CI requires real pagination QA.');
    return false;
  }
  try {
    const renderer = await openRenderer(parseOptions(['test.md']));
    await renderer.browser.close();
    return true;
  } catch (error) {
    if (process.env.MD2CARD_REQUIRE_BROWSER === '1') throw error;
    t.skip(`Browser unavailable: ${error.message.split('\n')[0]}. Set MD2CARD_REQUIRE_BROWSER=1 in CI.`);
    return false;
  }
}

async function workspace(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'md2card-pagination-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function exportFixture(t, source, args = []) {
  const dir = await workspace(t), input = path.join(dir, 'input.md'), out = path.join(dir, 'out');
  await writeFile(input, source);
  const options = parseOptions([input, '--out', out, '--paginate', 'auto', '--height', '900', '--theme', 'minimal', ...strict, ...args]);
  const manifest = await exportCards(options);
  return { dir, input, out, options, manifest };
}

async function readPdf(t, filename) {
  try { await run('pdftotext', ['-v']); }
  catch (error) {
    if (process.env.MD2CARD_REQUIRE_PDF_CHECK === '1') throw error;
    t.diagnostic('pdftotext unavailable; mandatory PDF coverage runs in CI.');
    return null;
  }
  const { stdout } = await run('pdftotext', ['-enc', 'UTF-8', '-layout', filename, '-']);
  return stdout;
}

async function readPdfUrls(t, filename) {
  try { await run('pdfinfo', ['-v']); }
  catch (error) {
    if (process.env.MD2CARD_REQUIRE_PDF_CHECK === '1') throw error;
    t.diagnostic('pdfinfo unavailable; mandatory PDF link checks run in CI.');
    return null;
  }
  const { stdout } = await run('pdfinfo', ['-url', filename]);
  return stdout.match(/https?:\/\/[^\s]+/g) || [];
}

function exactlyOnce(text, markers, label) {
  for (const marker of markers) assert.equal(text.split(marker).length - 1, 1, `${label}: ${marker} must occur exactly once`);
}

async function verifyArtifacts(out, manifest) {
  assert.equal(manifest.pagination.mode, 'auto');
  assert.equal(manifest.pagination.validation.status, 'pass');
  assert.equal(manifest.pagination.hashes.original, manifest.inputSha256);
  assert.ok(Number.isInteger(manifest.pagination.probes) && manifest.pagination.probes > 0);
  assert.ok(manifest.pagination.probes <= manifest.pagination.limits.probes);
  assert.ok(manifest.pagination.atoms.length <= manifest.pagination.limits.atoms);
  assert.ok(manifest.cardCount <= manifest.pagination.limits.cards);
  assert.deepEqual(manifest.cards.flatMap(card => card.provenance.atomIds), manifest.pagination.atoms.map(atom => atom.id), 'Manifest must account for every atom exactly once in source order');
  const byId = new Map(manifest.pagination.atoms.map(atom => [atom.id, atom]));
  for (const [index, card] of manifest.cards.entries()) {
    assert.deepEqual(manifest.pagination.cards[index], { index: card.index, sourceLines: card.sourceLines, ...card.provenance });
    assert.deepEqual(card.provenance.sourceRanges, card.provenance.atomIds.map(id => byId.get(id).sourceRange));
    assert.ok(card.provenance.atomIds.every(id => byId.get(id).partitionIndex === card.provenance.partitionIndex));
    assert.ok(card.provenance.repeatedHeaders.every(header => header.repeated === true));
  }
  assert.deepEqual(manifest.formats, ['html', 'png', 'pdf']);
  assert.ok(manifest.cardCount > 1, 'Fixture must exercise actual pagination');
  assert.equal(manifest.cards.length, manifest.cardCount);
  assert.equal(manifest.artifacts.filter(artifact => artifact.format === 'png').length, manifest.cardCount);
  assert.deepEqual(manifest.qa.overflow, { screen: 'pass', print: 'pass' });
  for (const card of manifest.cards) {
    assert.deepEqual(card.screen.overflow, []);
    assert.deepEqual(card.print.overflow, []);
    assert.equal(card.layout, manifest.cards[0].layout);
    assert.ok(/^[a-f0-9]{64}$/.test(card.sourceSha256));
  }
  for (const artifact of manifest.artifacts) {
    const bytes = await readFile(path.join(out, artifact.file));
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(hash(bytes), artifact.sha256);
    if (artifact.format === 'png') {
      assert.equal(bytes.readUInt32BE(16), manifest.dimensions.width * manifest.pngScale);
      assert.equal(bytes.readUInt32BE(20), manifest.dimensions.height * manifest.pngScale);
    }
  }
  assert.equal((await readFile(path.join(out, 'cards.pdf'))).subarray(0, 5).toString(), '%PDF-');
}

// Compare the exported DOM with the unpaginated renderer, not with the paginator's
// own coverage counters. Containers may split; original semantic units may not.
async function snapshot(page, html) {
  await page.setContent(html, { waitUntil: 'load' });
  return page.locator('.card-body').evaluateAll(bodies => {
    const units = [], links = [], images = [], cards = [];
    for (const body of bodies) {
      const card = [];
      for (const element of body.children) {
        const tag = element.tagName;
        const parts = tag === 'UL' || tag === 'OL' ? [...element.children]
          : tag === 'TABLE' ? [...element.querySelectorAll('tbody > tr')] : [element];
        for (const part of parts) {
          const unit = { tag: part.tagName, text: part.textContent };
          units.push(unit); card.push(unit);
        }
      }
      for (const link of body.querySelectorAll('a')) {
        // Repeated table headers are checked separately, not source body coverage.
        if (!link.closest('thead')) links.push({ text: link.textContent, href: link.getAttribute('href'), title: link.getAttribute('title') });
      }
      for (const image of body.querySelectorAll('img')) images.push({ alt: image.alt, src: image.getAttribute('src') });
      cards.push(card);
    }
    return { units, links, images, cards };
  });
}

async function compareWithSource(t, source, fixture) {
  const renderer = await openRenderer(fixture.options);
  t.after(() => renderer.browser.close());
  const resolver = await createAssetResolver(path.dirname(fixture.input));
  const baseline = renderCards(source, { resolveImage: resolver.resolveImage });
  const expected = await snapshot(renderer.page, baseline.map(card => `<div class="card-body">${card.html}</div>`).join(''));
  const actual = await snapshot(renderer.page, await readFile(path.join(fixture.out, 'cards.html'), 'utf8'));
  assert.deepEqual(actual.units, expected.units, 'Every paragraph, heading, list item, quote, code block, and table row must survive exactly once in source order');
  assert.deepEqual(actual.links, expected.links, 'Link labels, destinations, and titles must be unchanged');
  assert.deepEqual(actual.images, expected.images, 'Images and alternative text must be unchanged');
  return { page: renderer.page, actual, expected };
}

test('auto pagination exports every original bilingual paragraph and link in all formats', async t => {
  if (!await browserReady(t)) return;
  const source = await readFile(path.join(ROOT, 'examples/pagination-paragraphs.md'), 'utf8');
  const fixture = await exportFixture(t, source, ['--preview', '--contact-sheet']);
  await verifyArtifacts(fixture.out, fixture.manifest);
  const { actual } = await compareWithSource(t, source, fixture);
  for (const card of actual.cards) {
    assert.ok(card.length > 0);
    assert.ok(!/^H[1-6]$/.test(card.at(-1).tag), 'A heading chain cannot be left at a page bottom');
  }
  const markers = source.match(/PARA_[A-Z]\d{2}/g);
  const pdf = await readPdf(t, path.join(fixture.out, 'cards.pdf'));
  if (pdf !== null) {
    exactlyOnce(pdf, markers, 'PDF paragraphs');
    assert.match(pdf, /中文/);
    assert.equal((pdf.match(/\f/g) || []).length, fixture.manifest.cardCount);
  }
  const preview = await readFile(path.join(fixture.out, 'preview.html'), 'utf8');
  assert.ok(!preview.includes('<script'));
  assert.match(preview, /deck-preview/);
  assert.ok(fixture.manifest.artifacts.some(artifact => artifact.file === 'contact-sheet.png'));
});

test('steps continue non-one ordered numbering across pages and keep nested items whole', async t => {
  if (!await browserReady(t)) return;
  const source = await readFile(path.join(ROOT, 'examples/pagination-lists.md'), 'utf8');
  const fixture = await exportFixture(t, source);
  await verifyArtifacts(fixture.out, fixture.manifest);
  const { page } = await compareWithSource(t, source, fixture);
  const lists = await page.locator('.card-body > ol').evaluateAll(elements => elements.map(list => ({
    start: list.start, items: [...list.children].map(item => item.textContent),
    nested: [...list.children].map(item => item.querySelectorAll('ul > li').length)
  })));
  assert.ok(lists.length > 1);
  let next = 7;
  for (const list of lists) {
    assert.equal(list.start, next, 'Continuation must use the original ordered-list number');
    assert.ok(list.nested.every(count => count === 2), 'Nested bullets stay with their parent item');
    next += list.items.length;
  }
  assert.equal(next, 19);
  const pdf = await readPdf(t, path.join(fixture.out, 'cards.pdf'));
  if (pdf !== null) {
    exactlyOnce(pdf, source.match(/STEP_[A-Z]\d{2}/g), 'PDF steps');
    for (let index = 7; index <= 18; index++) {
      assert.match(pdf, new RegExp(`\\b${String(index).padStart(2, '0')}\\b\\s+STEP_A${String(index).padStart(2, '0')}\\b`), `PDF must visibly show step ${index} beside its unchanged item`);
    }
  }
});

test('tables paginate between complete rows and repeat the exact header on every fragment', async t => {
  if (!await browserReady(t)) return;
  const source = await readFile(path.join(ROOT, 'examples/pagination-tables.md'), 'utf8');
  const fixture = await exportFixture(t, source);
  await verifyArtifacts(fixture.out, fixture.manifest);
  const { page } = await compareWithSource(t, source, fixture);
  const tables = await page.locator('.card-body table').evaluateAll(elements => elements.map(table => ({
    header: table.querySelector('thead').textContent,
    rows: table.querySelectorAll('tbody > tr').length,
    widths: [...table.querySelectorAll('tbody > tr')].map(row => row.children.length)
  })));
  assert.ok(tables.length > 1, 'Table must span multiple cards');
  assert.equal(fixture.manifest.cards.reduce((count, card) => count + card.provenance.repeatedHeaders.length, 0), tables.length - 1, 'Repeated header provenance must explain every extra table header');
  assert.equal(tables.reduce((sum, table) => sum + table.rows, 0), 24);
  assert.ok(tables.every(table => table.rows > 0 && table.header === tables[0].header && table.widths.every(width => width === 3)));
  const pdf = await readPdf(t, path.join(fixture.out, 'cards.pdf'));
  if (pdf !== null) {
    exactlyOnce(pdf, source.match(/ROW_A\d{2}/g), 'PDF table rows');
    assert.equal(pdf.split('Record').length - 1, tables.length, 'Each PDF table fragment repeats its searchable header');
  }
});

test('repeated table-header images and per-card brand logos have exact final asset accounting', async t => {
  if (!await browserReady(t)) return;
  const dir = await workspace(t), input = path.join(dir, 'header-images.md'), out = path.join(dir, 'out');
  const imageBytes = await readFile(path.join(ROOT, 'examples/assets/demo-logo.png'));
  await writeFile(path.join(dir, 'mark.png'), imageBytes);
  const brand = path.join(dir, 'brand.json');
  await writeFile(brand, JSON.stringify({ name: 'Pagination QA', logo: 'mark.png' }));
  const rows = Array.from({ length: 24 }, (_, index) => `| IMAGE_ROW_${String(index + 1).padStart(2, '0')} | 原始记录 / Original record |`).join('\n');
  await writeFile(input, '# 表头图片 / Header image\n\n| ![Original header mark](mark.png) | Record / 记录 |\n| --- | --- |\n' + rows + '\n');
  const options = parseOptions([input, '--out', out, '--paginate', 'auto', '--height', '900', '--theme', 'minimal', '--brand', brand, ...strict]);
  const manifest = await exportCards(options);
  await verifyArtifacts(out, manifest);
  const renderer = await openRenderer(options);
  t.after(() => renderer.browser.close());
  await renderer.page.setContent(await readFile(path.join(out, 'cards.html'), 'utf8'), { waitUntil: 'load' });
  const cards = await renderer.page.locator('.card').evaluateAll(elements => elements.map(card => ({
    tables: card.querySelectorAll('table').length,
    headerImages: card.querySelectorAll('table thead img').length,
    logos: card.querySelectorAll('.card-footer .brand-logo').length,
    rows: card.querySelectorAll('table tbody > tr').length
  })));
  assert.ok(cards.length > 1, 'The table must paginate before repeated-asset accounting can be checked');
  assert.ok(cards.every(card => card.tables === 1 && card.headerImages === 1 && card.logos === 1 && card.rows > 0));
  assert.equal(cards.reduce((sum, card) => sum + card.rows, 0), 24);
  assert.equal(manifest.cards.reduce((sum, card) => sum + card.provenance.repeatedHeaders.length, 0), cards.length - 1, 'Every repeated image-bearing header must be attributed');
  const images = await renderer.page.locator('img').evaluateAll(async elements => Promise.all(elements.map(async image => {
    await image.decode();
    return { valid: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0, pixels: image.naturalWidth * image.naturalHeight, embeddedBytes: new TextEncoder().encode(image.getAttribute('src')).length };
  })));
  assert.ok(images.every(image => image.valid), 'All repeated header images and logos must actually decode');
  assert.equal(images.length, cards.length * 2);
  assert.equal(manifest.assets.length, 1, 'One shared local file must be loaded once, not once per repeated use');
  assert.equal(manifest.qa.images.status, 'pass');
  assert.equal(manifest.qa.images.count, images.length);
  assert.deepEqual(manifest.assetUsage, {
    occurrences: images.length,
    pixels: images.reduce((sum, image) => sum + image.pixels, 0),
    embeddedBytes: images.reduce((sum, image) => sum + image.embeddedBytes, 0),
    loadedBytes: imageBytes.length
  });
});

test('explicit boundaries remain separate and shared reference links preserve exact destinations', async t => {
  if (!await browserReady(t)) return;
  const source = await readFile(path.join(ROOT, 'examples/pagination-references.md'), 'utf8');
  const fixture = await exportFixture(t, source);
  await verifyArtifacts(fixture.out, fixture.manifest);
  const { page, expected } = await compareWithSource(t, source, fixture);
  const partitions = await page.locator('.card-body').evaluateAll(elements => elements.map(body => [...new Set(body.textContent.match(/ZONE_[ABC]/g) || [])]));
  assert.ok(partitions.every(partition => partition.length === 1), 'No output card may mix text from different explicit === partitions');
  assert.deepEqual([...new Set(partitions.flat())], ['ZONE_A', 'ZONE_B', 'ZONE_C']);
  const pdf = await readPdf(t, path.join(fixture.out, 'cards.pdf'));
  if (pdf !== null) {
    exactlyOnce(pdf, source.match(/REF_[ABC]\d{2}/g), 'PDF references');
    const pages = pdf.split('\f').filter(pageText => pageText.trim());
    assert.ok(pages.every(pageText => new Set(pageText.match(/ZONE_[ABC]/g) || []).size === 1));
  }
  const urls = await readPdfUrls(t, path.join(fixture.out, 'cards.pdf'));
  // A wrapped inline link can produce several PDF annotation rectangles, so
  // occurrence equality is checked in the DOM and destination equality in PDF.
  if (urls !== null) assert.deepEqual([...new Set(urls)].sort(), [...new Set(expected.links.map(link => link.href))].sort(), 'PDF annotations must preserve every original destination without adding others');
});

test('paragraphs, code, quotes, and local images remain whole at page boundaries', async t => {
  if (!await browserReady(t)) return;
  const dir = await workspace(t), input = path.join(dir, 'atoms.md'), out = path.join(dir, 'out');
  await writeFile(path.join(dir, 'colors.png'), await readFile(path.join(ROOT, 'examples/assets/retrieval-pipeline.png')));
  const source = '# Whole units / 完整单元\n\n' + Array.from({ length: 5 }, (_, n) => [
    `ATOM_P${n}: 中文段落与原始标点。 Keep this paragraph whole, including its [exact link](https://example.org/atoms/${n}?a=1&b=2 "Original title").`,
    `> ATOM_Q${n}: A quotation stays intact.\n> 中文引文不能拆开。`,
    `\`\`\`text\nATOM_C${n}\n===\nkeep <literal> & text\n\`\`\``,
    `![ATOM_I${n} original local diagram](colors.png)`
  ].join('\n\n')).join('\n\n');
  await writeFile(input, source);
  const options = parseOptions([input, '--out', out, '--paginate', 'auto', '--height', '1000', '--theme', 'minimal', ...strict]);
  const manifest = await exportCards(options);
  await verifyArtifacts(out, manifest);
  const { page } = await compareWithSource(t, source, { input, out, options });
  assert.equal(await page.locator('.card-body pre').count(), 5);
  assert.equal(await page.locator('.card-body blockquote').count(), 5);
  assert.equal(await page.locator('.card-body img').count(), 5);
  assert.equal(manifest.qa.images.count, 5);
  assert.equal(manifest.qa.images.status, 'pass');
});

test('an oversized atomic unit fails with exit 2 and never publishes clipped exports', async t => {
  if (!await browserReady(t)) return;
  const dir = await workspace(t), out = path.join(dir, 'out');
  const options = parseOptions([path.join(ROOT, 'examples/pagination-atomic-error.md'), '--out', out, '--paginate', 'auto', '--height', '900', '--preview', '--contact-sheet', ...strict]);
  await assert.rejects(() => exportCards(options), error => {
    assert.equal(error.code, 'PAGINATION_ATOMIC_OVERFLOW');
    assert.equal(error.exitCode, 2);
    return true;
  });
  await assert.rejects(() => readdir(out), { code: 'ENOENT' });
  assert.ok(!(await readdir(dir)).some(file => file.startsWith('.md2card-')), 'No staging directory may leak');
  try {
    await run(process.execPath, [path.join(ROOT, 'scripts/render.mjs'), options.input, '--out', out, '--paginate', 'auto', '--height', '900', '--json', ...strict]);
    assert.fail('The CLI must reject an oversized atomic unit');
  } catch (error) {
    assert.equal(error.code, 2, 'CLI exit status must identify content overflow');
    const diagnostic = JSON.parse(error.stderr.trim());
    assert.equal(diagnostic.code, 'PAGINATION_ATOMIC_OVERFLOW');
    assert.equal(diagnostic.exitCode, 2);
    assert.equal(diagnostic.status, 'error');
  }
  await assert.rejects(() => readdir(out), { code: 'ENOENT' });
});
