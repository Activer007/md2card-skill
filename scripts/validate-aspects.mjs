#!/usr/bin/env node
// Future authorized real-Chromium validation only. Never run under a known
// browser denial, enable Actions, or treat technical export as visual acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderCards, parseMarkdownTokens, escapeHtml } from './markdown.mjs';
import { parseOptions, exportCards } from './render.mjs';
import { openRenderer, closeBrowser } from './browser.mjs';
import { inspectPdf } from './qa.mjs';
import { SIZES } from './document.mjs';
import { resolveTemplateAspect } from './templates.mjs';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const compact = value => value.normalize('NFC').replace(/\s+/gu, '');
export const MAX_ASPECT_CASES = 22;
const EXPECTATIONS = ['candidate-unmeasured', 'candidate-unmeasured-may-overflow', 'expected-CONTENT_OVERFLOW-unverified'];
const SCOPES = ['aspect-specific-square', 'aspect-specific-slide', 'same-source-short', 'same-source-original', 'same-source-long'];
const unsafeToRetry = error => ['BROWSER_LAUNCH_FAILED', 'BROWSER_CLEANUP_FAILED', 'BROWSER_CLEANUP_TIMEOUT', 'ASPECT_MOBILE_TIMEOUT', 'RENDER_TIMEOUT', 'ASPECT_BROWSER_OPERATION_FAILED'].includes(error.code) ||
  (Array.isArray(error.details?.cleanupFailures) && error.details.cleanupFailures.some(failure => failure.action === 'close-browser'));
const codeError = (code, message) => Object.assign(new Error(message), { code });

/** Source-owned visible segments, never text scraped from incomplete output. */
export function aspectVisibleSegments(card) {
  const inline = children => children.map(child => ['text', 'code_inline'].includes(child.type) ? child.content : ['softbreak', 'hardbreak'].includes(child.type) ? '\n' : child.children ? inline(child.children) : '').join('');
  return [...parseMarkdownTokens(card.source).flatMap(token => token.type === 'inline' ? [inline(token.children ?? [])] : ['fence', 'code_block'].includes(token.type) ? [token.content] : []),
    ...['eyebrow', 'source', 'metric', 'label'].map(key => card.metadata[key] ?? ''), '1 / 1'].filter(text => text.trim());
}

export function validateAspectPlan(plan) {
  assert.equal(plan.schemaVersion, 1);
  assert.ok(Array.isArray(plan.cases) && plan.cases.length === MAX_ASPECT_CASES, 'The reviewed inventory must contain exactly 22 cases; do not expand this runner silently.');
  const identities = new Set();
  for (const item of plan.cases) {
    assert.ok(['T04', 'T21'].includes(item.template));
    assert.ok(SCOPES.includes(item.scope));
    assert.ok(Object.hasOwn(SIZES, item.aspect));
    assert.deepEqual(item.dimensions, [SIZES[item.aspect].width, SIZES[item.aspect].height]);
    assert.equal(resolveTemplateAspect(item.template, SIZES[item.aspect]).id, item.aspect);
    assert.ok(/^examples\/(?:aspects|templates)\/T(?:04|21)(?:-(?:square|slide|long))?\.md$/.test(item.input), 'Input must be a reviewed local aspect/template file.');
    assert.match(item.inputSha256, /^[a-f0-9]{64}$/);
    assert.ok(EXPECTATIONS.includes(item.expected));
    assert.equal(item.expected, item.scope === 'same-source-long' ? EXPECTATIONS[2] : item.scope === 'same-source-original' ? EXPECTATIONS[1] : EXPECTATIONS[0]);
    if (item.scope.startsWith('aspect-specific-')) assert.equal(item.aspect, item.scope.slice('aspect-specific-'.length));
    const identity = `${item.template}/${item.scope}/${item.aspect}`;
    assert.ok(!identities.has(identity), `Duplicate case ${identity}`); identities.add(identity);
  }
  for (const template of ['T04', 'T21']) for (const scope of SCOPES) {
    const group = plan.cases.filter(item => item.template === template && item.scope === scope);
    assert.equal(group.length, scope.startsWith('same-source-') ? 3 : 1);
    if (scope.startsWith('same-source-')) {
      assert.deepEqual(group.map(item => item.aspect).sort(), ['portrait', 'slide', 'square']);
      assert.equal(new Set(group.map(item => `${item.input}:${item.inputSha256}`)).size, 1, 'A same-source comparison cannot substitute shorter text.');
    }
  }
  return plan;
}

export function assertAspectSourceHtml(html, card, aspect) {
  const articles = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? [];
  assert.equal(articles.length, 1);
  const article = articles[0], slots = [card.templateTitleHtml, card.templateIntroHtml, ...card.sections.map(section => section.html)].filter(Boolean);
  assert.equal(slots.join(''), card.html);
  let cursor = 0;
  for (const slot of slots) { const position = article.indexOf(slot, cursor); assert.ok(position >= cursor, 'Source slot missing or reordered.'); cursor = position + slot.length; }
  for (const slot of new Set(slots)) assert.equal(article.split(slot).length - 1, slots.filter(other => other === slot).length, 'Source slot duplicated.');
  assert.ok(article.includes(`data-template="${card.metadata.template}" data-template-aspect="${aspect}"`));
  for (const [field, className] of [['eyebrow','card-eyebrow'],['source','card-source'],['metric','statistic-value'],['label','statistic-label']]) if (card.metadata[field]) assert.equal(article.split(`class="${className}">${escapeHtml(card.metadata[field])}<`).length - 1, 1, `Missing/duplicated ${field}.`);
}

/** Runs only inside the real page during authorized validation. */
export function measureAspectMobile() {
  return [...document.querySelectorAll('.card')].map(card => {
    const rect = card.getBoundingClientRect(), scale = rect.width / card.offsetWidth;
    const hasText = element => element.textContent.trim();
    // Include nested spans/strong/em, not just their parents: nested em multipliers
    // must not evade the body/notes floor. Headers are hierarchy, not body text.
    const bodyRoots = [...card.querySelectorAll('.template-intro p,.template-intro li,.template-section p,.template-section li,.template-section blockquote,.template-metric .statistic-label,th,td,pre,code')].filter(hasText);
    const noteRoots = [...card.querySelectorAll('.card-source,.card-eyebrow,.brand-name,.footer-text,.card-index,figcaption')].filter(hasText);
    const descendants = roots => [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll('*')]))].filter(hasText);
    const type = element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      const fontSize = parseFloat(style.fontSize); let visible = rect.width > 0 && rect.height > 0, nestedTransform = false;
      for (let node = element; node && node !== card; node = node.parentElement) {
        const ancestor = getComputedStyle(node);
        if (ancestor.display === 'none' || ['hidden','collapse'].includes(ancestor.visibility) || Number(ancestor.opacity) === 0) visible = false;
        if ((ancestor.transform && ancestor.transform !== 'none') || (ancestor.scale && !['none','1'].includes(ancestor.scale)) || (ancestor.zoom && !['normal','1'].includes(String(ancestor.zoom)))) nestedTransform = true;
      }
      return { selector: element.className || element.tagName.toLowerCase(), fontSize, effectiveSize: fontSize * scale, fontFamily: style.fontFamily, lineHeight: style.lineHeight, visible, nestedTransform };
    };
    return { template: card.dataset.template, aspect: card.dataset.templateAspect, cardWidth: rect.width, cardHeight: rect.height, canvasWidth: card.offsetWidth, canvasHeight: card.offsetHeight, scale, counter: card.querySelector('.card-index')?.textContent, body: descendants(bodyRoots).map(type), notes: descendants(noteRoots).map(type) };
  });
}

export function assertAspectMobile(audit, item, viewportWidth) {
  assert.equal(audit.length, 1);
  const card = audit[0], [width, height] = item.dimensions;
  assert.equal(card.template, item.template); assert.equal(card.aspect, item.aspect); assert.equal(card.counter, '1 / 1');
  assert.equal(card.canvasWidth, width); assert.equal(card.canvasHeight, height);
  assert.ok(Math.abs(card.cardWidth - (viewportWidth - 24)) < 1, 'Actual inner card width changed; explicitly review the preview-inset contract.');
  assert.ok(Math.abs(card.scale - card.cardWidth / width) < 1e-6);
  assert.ok(Math.abs(card.cardHeight - height * card.scale) < 1);
  assert.ok(card.body.length && card.notes.length, 'Both body and note text must be measured.');
  for (const [name, types, ratio, mobileFloor] of [['body', card.body, .043, 14], ['notes', card.notes, .0335, 11]]) for (const type of types) {
    assert.equal(type.visible, true, `${name} text is hidden in the actual preview.`);
    assert.equal(type.nestedTransform, false, `${name} has unexpected nested transform/zoom; card scaling alone cannot establish its effective size.`);
    assert.ok(Number.isFinite(type.fontSize) && type.fontSize >= ratio * width - .05, `${name} fell below its canvas-relative floor.`);
    assert.ok(Number.isFinite(type.effectiveSize) && type.effectiveSize >= mobileFloor - .05, `${name} fell below its actual mobile floor.`);
    assert.ok(Math.abs(type.effectiveSize - type.fontSize * card.scale) < .05);
  }
}

const pngSize = bytes => { assert.ok(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Missing real PNG header.'); return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]; };

/** Dependencies are isolated-test seams, never alternate runtime rendering engines. */
export async function validateAspects(options = {}, dependencies = {}) {
  const repository = path.resolve(options.repository ?? ROOT);
  const outputRoot = path.resolve(options.outputRoot ?? path.join(repository, 'validation/aspects'));
  const runCommand = dependencies.runCommand ?? ((command, args) => exec(command, args, { cwd: repository, timeout: 20000, maxBuffer: 1024 * 1024 }));
  const exportDeck = dependencies.exportCards ?? exportCards;
  const acquire = dependencies.openRenderer ?? openRenderer;
  const close = dependencies.closeBrowser ?? closeBrowser;
  const checkPdf = dependencies.inspectPdf ?? inspectPdf;
  const mobileTimeoutMs = options.mobileTimeoutMs ?? 30000;
  assert.ok(Number.isInteger(mobileTimeoutMs) && mobileTimeoutMs >= 1 && mobileTimeoutMs <= 30000);
  const inventory = await readFile(path.join(repository, 'examples/aspects/validation-plan.json'));
  const plan = validateAspectPlan(JSON.parse(inventory));
  const revision = (await runCommand('git', ['rev-parse', 'HEAD'])).stdout.trim();
  assert.match(revision, /^[a-f0-9]{40}$/i, 'Need an exact committed revision.');
  assert.equal((await runCommand('git', ['status', '--porcelain', '--untracked-files=normal'])).stdout.trim(), '', 'Run from a clean exact-commit checkout; validation/ is ignored.');
  if (process.env.MD2CARD_SKIP_BROWSER === '1' && !dependencies.exportCards) throw codeError('ASPECT_BROWSER_DISABLED', 'Real aspect validation is disabled by MD2CARD_SKIP_BROWSER. Do not bypass a known denial.');
  await mkdir(outputRoot, { recursive: true });
  assert.equal((await readdir(outputRoot)).length, 0, 'Use a fresh empty output directory; never mix runs or overwrite evidence.');
  const summary = { schemaVersion: 1, revision, inventorySha256: hash(inventory), status: 'running', visualReview: 'not-performed', results: [], errors: [], sourceHashes: {} };
  for (const file of ['scripts/validate-aspects.mjs','scripts/templates.mjs','scripts/document.mjs','scripts/render.mjs','scripts/qa.mjs','assets/themes.css','assets/layouts.css','assets/templates.css']) summary.sourceHashes[file] = hash(await readFile(path.join(repository, file)));
  let browserBlocked;
  for (const [index, item] of plan.cases.entries()) {
    const id = `${String(index + 1).padStart(2, '0')}-${item.template}-${item.scope}-${item.aspect}`;
    const out = path.join(outputRoot, id);
    const record = { id, template: item.template, scope: item.scope, aspect: item.aspect, input: item.input, inputSha256: item.inputSha256, expected: item.expected, status: 'pending', actualOutcome: 'not-run', visualReview: 'not-performed', artifacts: [], mobile: [], errors: [] };
    summary.results.push(record);
    const problem = (error, phase) => { const detail = { id, phase, code: error.code ?? 'ASPECT_VALIDATION_FAILED', message: error.message, ...(error.details?.cleanupFailures ? { cleanupFailures: error.details.cleanupFailures } : {}) }; record.errors.push(detail); summary.errors.push(detail); if (unsafeToRetry(error) || phase === 'browser-acquire') browserBlocked = detail; };
    if (browserBlocked) { problem(codeError('ASPECT_BROWSER_BLOCKED', `Not attempted after ${browserBlocked.code} in ${browserBlocked.id}; no launch retry or alternate engine.`), 'blocked'); record.status = 'blocked'; continue; }
    let renderer, mobileTimer, phase = 'source';
    try {
      const sourceFile = path.join(repository, item.input), source = await readFile(sourceFile, 'utf8');
      assert.equal(hash(source), item.inputSha256, 'Input hash changed; do not substitute or rewrite comparison text.');
      const cards = renderCards(source); assert.equal(cards.length, 1); const card = cards[0];
      assert.equal(card.metadata.template, item.template); assert.ok(card.metadata.source);
      const argv = [sourceFile, '--out', out, '--paginate', 'manual', '--size', item.aspect, '--scale', '1', '--format', 'all', '--strict', '--preview'];
      record.command = ['node', 'scripts/render.mjs', ...argv];
      phase = 'export';
      let manifest;
      try { manifest = await exportDeck(parseOptions(argv)); }
      catch (error) {
        // The renderer can preserve CONTENT_OVERFLOW while attaching an
        // uncertain close-browser failure. Never call that a safe expected
        // outcome or retry browser acquisition for a later case.
        if (unsafeToRetry(error) || error.code !== 'CONTENT_OVERFLOW') throw error;
        record.actualOutcome = 'overflow'; phase = 'overflow-evidence';
        assert.deepEqual(await readdir(out), ['overflow.json'], 'Overflow must publish only its report, not partial exports.');
        const bytes = await readFile(path.join(out, 'overflow.json')), report = JSON.parse(bytes);
        assert.equal(report.code, 'CONTENT_OVERFLOW'); assert.equal(report.status, 'overflow'); assert.equal(report.input, path.basename(sourceFile));
        assert.deepEqual(report.dimensions, SIZES[item.aspect]); assert.equal(report.cards.length, 1); assert.equal(report.cards[0].index, 1); assert.deepEqual(report.cards[0].sourceLines, card.sourceLines);
        assert.ok(report.cards.some(result => result.screen.overflow.length || result.print.overflow.length));
        record.artifacts.push({ file: 'overflow.json', bytes: bytes.length, sha256: hash(bytes) });
        assert.equal(hash(await readFile(sourceFile)), item.inputSha256);
        if (item.expected === EXPECTATIONS[0]) throw codeError('ASPECT_CANDIDATE_OVERFLOW', 'Short aspect candidate overflowed. Keep the original input and review layout/capacity; do not silently substitute text.');
        record.status = item.expected === EXPECTATIONS[2] ? 'expected-overflow' : 'allowed-overflow';
        continue;
      }
      record.actualOutcome = 'exported'; phase = 'artifacts';
      assert.equal(manifest.inputSha256, item.inputSha256); assert.equal(manifest.cardCount, 1); assert.equal(manifest.pagination.mode, 'manual');
      assert.deepEqual(manifest.dimensions, SIZES[item.aspect]); assert.equal(manifest.cards.length, 1); assert.equal(manifest.cards[0].template, item.template); assert.equal(manifest.cards[0].aspect, item.aspect);
      assert.equal(manifest.cards[0].sourceSha256, hash(card.source)); assert.deepEqual(manifest.qa.overflow, { screen: 'pass', print: 'pass' });
      assert.equal(manifest.qa.pdf.status, 'pass'); assert.equal(manifest.qa.pdf.searchable, true); assert.equal(manifest.qa.pdf.pageCount, 1); assert.equal(manifest.qa.visualReview, 'not-performed');
      assert.deepEqual(manifest.artifacts.map(artifact => artifact.file).sort(), ['card-001.png','cards.html','cards.pdf','preview.html']);
      assert.deepEqual(Object.keys(manifest.styleSha256).sort(), ['layouts','templates','themes']);
      for (const [name, sha256] of Object.entries(manifest.styleSha256)) assert.equal(sha256, summary.sourceHashes[`assets/${name}.css`]);
      for (const artifact of manifest.artifacts) {
        assert.equal(path.basename(artifact.file), artifact.file);
        const bytes = await readFile(path.join(out, artifact.file)); assert.equal(bytes.length, artifact.bytes); assert.equal(hash(bytes), artifact.sha256);
        if (artifact.file.endsWith('.png')) assert.deepEqual(pngSize(bytes), item.dimensions);
        record.artifacts.push({ ...artifact });
      }
      const manifestBytes = await readFile(path.join(out, 'manifest.json')); assert.deepEqual(JSON.parse(manifestBytes), manifest);
      record.manifestSha256 = hash(manifestBytes); record.versions = manifest.versions;
      const html = await readFile(path.join(out, 'cards.html'), 'utf8'), preview = await readFile(path.join(out, 'preview.html'), 'utf8');
      assertAspectSourceHtml(html, card, item.aspect); assertAspectSourceHtml(preview, card, item.aspect);
      phase = 'pdf';
      const expectedText = aspectVisibleSegments(card);
      // -layout extraction can interleave independent columns. Use the existing
      // inspector for native/searchable/page checks, then verify EVERY original
      // segment against per-page logical (-raw) text, not one convenient marker.
      record.pdf = await checkPdf(path.join(out, 'cards.pdf'), { expectedPages: 1, expectedText: expectedText.join('\n'), requireTools: true });
      assert.equal(record.pdf.status, 'pass'); assert.equal(record.pdf.pageCount, 1); assert.equal(record.pdf.searchable, true);
      const { stdout: rawPdfText } = await runCommand('pdftotext', ['-f','1','-l','1','-enc','UTF-8','-raw',path.join(out, 'cards.pdf'),'-']);
      const rawFile = 'pdf-page-001-raw.txt'; await writeFile(path.join(out, rawFile), rawPdfText);
      record.pdf.sourceCheck = { extraction: 'per-page-raw', expectedSegments: expectedText.length, file: rawFile, sha256: hash(rawPdfText) };
      const missing = expectedText.flatMap((segment, index) => compact(rawPdfText).includes(compact(segment)) ? [] : [index]);
      assert.deepEqual(missing, [], 'Native PDF logical text is missing original source/metadata segments.');
      record.pdf.sourceCheck.status = 'pass';
      phase = 'browser-acquire';
      renderer = await acquire({ ...SIZES[item.aspect], scale: 1, timeoutMs: 30000 });
      phase = 'mobile';
      const mobileDeadline = new Promise((_, reject) => { mobileTimer = setTimeout(() => reject(codeError('ASPECT_MOBILE_TIMEOUT', 'Mobile browser audit deadline exceeded; shutdown must be confirmed and later browser cases stay blocked.')), mobileTimeoutMs); });
      void mobileDeadline.catch(() => {});
      const wait = operation => Promise.race([operation, mobileDeadline]).catch(error => {
        if (unsafeToRetry(error)) throw error;
        const wrapped = codeError('ASPECT_BROWSER_OPERATION_FAILED', `Mobile browser operation failed: ${error.message}`);
        wrapped.details = { ...error.details, originalCode: error.code ?? null }; throw wrapped;
      });
      await wait(renderer.page.emulateMedia({ media: 'screen' }));
      await wait(renderer.page.setContent(preview, { waitUntil: 'load', timeout: mobileTimeoutMs }));
      await wait(renderer.page.evaluate(() => document.fonts.ready));
      for (const viewportWidth of [375, 390]) {
        try {
          await wait(renderer.page.setViewportSize({ width: viewportWidth, height: 900 }));
          const audit = await wait(renderer.page.evaluate(measureAspectMobile));
          const entry = { viewportWidth, audit }; record.mobile.push(entry);
          const file = `card-001-mobile-${viewportWidth}.png`;
          await wait(renderer.page.locator('.card').screenshot({ path: path.join(out, file), scale: 'css', animations: 'disabled', timeout: mobileTimeoutMs }));
          const bytes = await readFile(path.join(out, file)); entry.file = file; entry.bytes = bytes.length; entry.sha256 = hash(bytes); entry.pngDimensions = pngSize(bytes);
          assertAspectMobile(audit, item, viewportWidth);
          assert.ok(Math.abs(entry.pngDimensions[0] - audit[0].cardWidth) <= 1 && Math.abs(entry.pngDimensions[1] - audit[0].cardHeight) <= 1);
        } catch (error) { problem(error, `mobile-${viewportWidth}`); if (unsafeToRetry(error)) break; }
      }
      phase = 'final'; assert.equal(hash(await readFile(sourceFile)), item.inputSha256, 'Source changed during export.');
      if (item.expected === EXPECTATIONS[2]) problem(codeError('ASPECT_UNEXPECTED_LONG_FIT', 'Long atomic pressure source unexpectedly exported. Investigate measured containment; this is not accepted fit evidence.'), phase);
    } catch (error) { problem(error, phase); }
    finally {
      clearTimeout(mobileTimer);
      if (renderer) try { await close(renderer.browser); } catch (error) { problem(error, 'cleanup'); }
      if (record.errors.length) record.status = 'fail';
      else if (record.actualOutcome === 'exported') record.status = 'exported-not-visually-reviewed';
    }
  }
  summary.status = summary.errors.length ? 'fail' : 'pass';
  await writeFile(path.join(outputRoot, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  validateAspects().then(summary => {
    console.log(`Recorded ${summary.results.length} aspect cases; ${summary.errors.length} error(s). Human visual acceptance remains pending.`);
    if (summary.errors.length) process.exitCode = 1;
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
