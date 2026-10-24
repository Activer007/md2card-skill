#!/usr/bin/env node
// Prepared for a future, explicitly authorized real-Chromium CI run only.
// Never run this in the locally sandbox-denied environment or to bypass a denial.
// Success is technical export evidence, never visual acceptance.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { renderCards, parseMarkdownTokens } from './markdown.mjs';
import { createAssetResolver } from './assets.mjs';
import { loadBrand, parseOptions, exportCards } from './render.mjs';
import { openRenderer, closeBrowser } from './browser.mjs';
import { inspectPdf } from './qa.mjs';

const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const compact = text => text.normalize('NFC').replace(/\s+/gu, '');
export function assertPdfSegments(text, segments, label) {
  for (const segment of segments) assert.ok(compact(text).includes(compact(segment)), `${label}: missing source text: ${segment}`);
}

// Source-owned text, rather than text scraped from possibly incomplete output.
export function visibleSegments(card) {
  const inline = children => children.map(child => {
    if (['text', 'code_inline'].includes(child.type)) return child.content;
    if (['softbreak', 'hardbreak'].includes(child.type)) return '\n';
    return child.children ? inline(child.children) : '';
  }).join('');
  return [...parseMarkdownTokens(card.source).flatMap(token => {
    if (token.type === 'inline') return [inline(token.children ?? [])];
    if (['fence', 'code_block'].includes(token.type)) return [token.content];
    return [];
  }), ...['eyebrow', 'source', 'metric', 'label'].map(key => card.metadata[key] ?? '')].filter(text => text.trim());
}

export async function validateSeries() {
  const outputRoot = path.resolve('validation/series');
  const inventoryFile = 'examples/series/recipes.json';
  const inventoryBytes = await readFile(inventoryFile);
  const inventory = JSON.parse(inventoryBytes);
  // The future run must identify a real clean checkout, not label a draft snapshot as HEAD.
  const revision = (await exec('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const dirty = (await exec('git', ['status', '--porcelain', '--untracked-files=normal'])).stdout.trim();
  assert.equal(dirty, '', 'Run from a clean exact-commit checkout, with validation/ ignored.');
  await mkdir(outputRoot, { recursive: true });
  const summary = { schemaVersion: 1, revision, inventorySha256: hash(inventoryBytes), visualReview: 'not-performed', results: [], errors: [] };
  for (const recipe of inventory.recipes) {
    let renderer;
    try {
      const source = await readFile(recipe.input, 'utf8');
      const cards = renderCards(source);
      const resolver = await createAssetResolver(path.resolve(recipe.assetRoot));
      const brand = await loadBrand(path.resolve(recipe.brandFile), resolver.resolveImage);
      const out = path.join(outputRoot, recipe.id);
      const argv = [recipe.input, '--out', out, '--paginate', 'manual', '--size', 'portrait', '--asset-root', recipe.assetRoot, '--brand', recipe.brandFile, '--footer', recipe.footer, '--title', recipe.title, '--format', 'all', '--strict', '--preview', '--contact-sheet'];
      const manifest = await exportCards(parseOptions(argv));
      assert.equal(manifest.inputSha256, hash(source));
      assert.equal(manifest.cardCount, recipe.cardCount);
      assert.equal(cards.length, recipe.cardCount);
      assert.deepEqual(manifest.cards.map(card => card.template), recipe.templates);
      assert.equal(manifest.pagination.mode, 'manual');
      assert.deepEqual(manifest.dimensions, { width: 1080, height: 1440 });
      assert.equal(manifest.brand.name, brand.name);
      assert.equal(manifest.brand.accent, brand.accent);
      assert.equal(manifest.brand.logoHash, brand.logo.hash);
      assert.equal(manifest.qa.overflow.screen, 'pass');
      assert.equal(manifest.qa.overflow.print, 'pass');
      assert.equal(manifest.qa.pdf.status, 'pass');
      assert.equal(manifest.qa.visualReview, 'not-performed');
      const expectedFiles = ['cards.html', 'preview.html', 'cards.pdf', 'contact-sheet.png', ...cards.map((_, index) => `card-${String(index + 1).padStart(3, '0')}.png`)];
      assert.deepEqual(manifest.artifacts.map(artifact => artifact.file).sort(), expectedFiles.sort());
      for (const name of ['themes', 'layouts', 'templates']) assert.equal(manifest.styleSha256[name], hash(await readFile(`assets/${name}.css`)));
      for (const [index, card] of manifest.cards.entries()) {
        assert.equal(card.index, index + 1);
        assert.equal(card.sourceSha256, hash(cards[index].source));
      }
      for (const artifact of manifest.artifacts) assert.equal(hash(await readFile(path.join(out, artifact.file))), artifact.sha256, artifact.file);
      const expected = cards.map((card, index) => [...visibleSegments(card), brand.name, recipe.footer, `${index + 1} / ${cards.length}`]);
      const pdf = await inspectPdf(path.join(out, 'cards.pdf'), { expectedPages: cards.length, requireTools: true });
      for (const [index, segments] of expected.entries()) {
        const { stdout } = await exec('pdftotext', ['-f', String(index + 1), '-l', String(index + 1), '-enc', 'UTF-8', '-raw', path.join(out, 'cards.pdf'), '-'], { timeout: 20000, maxBuffer: 1024 * 1024 });
        assertPdfSegments(stdout, segments, `${recipe.id}: PDF page ${index + 1}`);
        const layout = await exec('pdftotext', ['-f', String(index + 1), '-l', String(index + 1), '-enc', 'UTF-8', '-layout', path.join(out, 'cards.pdf'), '-'], { timeout: 20000, maxBuffer: 1024 * 1024 });
        await writeFile(path.join(out, `page-${index + 1}-layout.txt`), layout.stdout);
      }
      renderer = await openRenderer({ width: 1080, height: 1440, scale: 1, timeoutMs: 30000 });
      await renderer.page.setContent(await readFile(path.join(out, 'preview.html'), 'utf8'), { waitUntil: 'load', timeout: 30000 });
      await renderer.page.evaluate(() => document.fonts.ready);
      const mobile = [];
      for (const viewportWidth of [375, 390]) {
        await renderer.page.setViewportSize({ width: viewportWidth, height: 800 });
        const audit = await renderer.page.evaluate(() => [...document.querySelectorAll('.card')].map(card => {
          const rect = card.getBoundingClientRect(), scale = rect.width / card.offsetWidth;
          const visible = element => element.textContent.trim() && element.getBoundingClientRect().width > 0;
          const body = [...card.querySelectorAll('.template-intro p,.template-intro li,.template-section p,.template-section li,.template-metric .statistic-label,th,td,pre code')].filter(visible);
          const notes = [...card.querySelectorAll('.card-source,.card-eyebrow,.brand-name,.footer-text,.card-index,figcaption')].filter(visible);
          const type = element => ({ selector: element.className || element.tagName.toLowerCase(), fontSize: parseFloat(getComputedStyle(element).fontSize), effectiveSize: parseFloat(getComputedStyle(element).fontSize) * scale });
          return { template: card.dataset.template, cardWidth: rect.width, cardHeight: rect.height, canvasWidth: card.offsetWidth, scale, counter: card.querySelector('.card-index')?.textContent, brand: card.querySelector('.brand-name')?.textContent, footer: card.querySelector('.footer-text')?.textContent, body: body.map(type), notes: notes.map(type), listStarts: [...card.querySelectorAll('ol')].map(list => list.start) };
        }));
        assert.equal(audit.length, cards.length);
        for (const [index, item] of audit.entries()) {
          assert.equal(item.template, recipe.templates[index]);
          assert.equal(item.counter, `${index + 1} / ${cards.length}`);
          assert.equal(item.brand, brand.name);
          assert.equal(item.footer, recipe.footer);
          assert.equal(item.canvasWidth, 1080);
          assert.ok(Math.abs(item.cardWidth - (viewportWidth - 24)) < 1, 'Measure actual card width; update the contract explicitly if preview insets change.');
          assert.ok(item.body.length && item.notes.length, 'Both body and note text must be measured.');
          assert.ok(item.body.every(type => type.effectiveSize >= 13.95), `${recipe.id}: body below 14px on card ${index + 1}`);
          assert.ok(item.notes.every(type => type.effectiveSize >= 10.95), `${recipe.id}: note below 11px on card ${index + 1}`);
          assert.deepEqual(item.listStarts, cards[index].orderedLists.map(list => list.start));
          const file = `card-${String(index + 1).padStart(3, '0')}-mobile-${viewportWidth}.png`;
          await renderer.page.locator('.card').nth(index).screenshot({ path: path.join(out, file), animations: 'disabled', timeout: 30000 });
          mobile.push({ viewportWidth, index: index + 1, ...item, file, sha256: hash(await readFile(path.join(out, file))) });
        }
      }
      await closeBrowser(renderer.browser); renderer = undefined;
      summary.results.push({ id: recipe.id, status: 'exported-not-visually-reviewed', argv, inputSha256: hash(source), brandFile: recipe.brandFile, brandFileSha256: hash(await readFile(recipe.brandFile)), manifestSha256: hash(await readFile(path.join(out, 'manifest.json'))), cardCount: cards.length, pdf, mobile });
    } catch (error) {
      summary.errors.push({ id: recipe.id, code: error.code ?? 'SERIES_VALIDATION_FAILED', message: error.message });
    } finally {
      if (renderer) try { await closeBrowser(renderer.browser); } catch (error) { summary.errors.push({ id: recipe.id, code: error.code ?? 'BROWSER_CLEANUP_FAILED', message: error.message }); }
    }
  }
  await writeFile(path.join(outputRoot, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  assert.equal(summary.errors.length, 0, JSON.stringify(summary.errors));
  console.log('Rendered both authored series, every phone card, and searchable PDFs. Independent pixel review is still required.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  validateSeries().catch(error => { console.error(error); process.exitCode = 1; });
}
