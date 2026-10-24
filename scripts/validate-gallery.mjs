#!/usr/bin/env node
// Future real-browser gate. Importing this module never launches a browser.
// Run only in an explicitly authorized environment; never bypass a denied launch.
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, realpath, writeFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, GALLERY_PATH, CSP, buildGalleryModel, generateGallery } from './build-template-gallery.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const errorRecord = error => ({ code: error?.code ?? 'GALLERY_CHECK_FAILED', message: error?.message ?? String(error) });
export const USAGE = 'node scripts/validate-gallery.mjs --allow-browser [--out validation/gallery] [--browser /absolute/chromium] [--timeout 15000]';
export function parseGalleryValidationOptions(args) {
  const options = { allowBrowser: false, out: 'validation/gallery', timeoutMs: 15000 };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (seen.has(arg)) throw new Error(`Duplicate option: ${arg}`);
    seen.add(arg);
    if (arg === '--allow-browser') options.allowBrowser = true;
    else if (arg === '--help') options.help = true;
    else if (['--out', '--browser', '--timeout'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value: ${arg}`);
      if (arg === '--timeout') {
        options.timeoutMs = Number(value);
        if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120000) throw new Error('--timeout must be 1000–120000 ms');
      } else options[arg === '--out' ? 'out' : 'browser'] = value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.help && !options.allowBrowser) throw new Error('Browser execution requires --allow-browser and an authorized environment. No launch was attempted.');
  return options;
}

export async function bounded(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

// Playwright evaluation does not inherit locator/default action timeouts.
// Bound synchronous AND promise-returning page/locator callbacks explicitly.
export async function evaluateSafely(target, method, callback, argument, timeoutMs = 15000) {
  assert.ok(['evaluate', 'evaluateAll'].includes(method));
  return bounded(Promise.resolve().then(() => target[method](callback, argument)), timeoutMs, `Gallery ${method}`);
}

// Lazy runtime import keeps --help and all source/mock tests browser-free.
async function launchBrowser(options) {
  const [{ chromium }, { findBrowser, closeBrowser }] = await Promise.all([import('playwright'), import('./browser.mjs')]);
  const executablePath = await findBrowser(options.browser);
  const browser = await chromium.launch({ executablePath, headless: true, timeout: options.timeoutMs });
  return { browser, executablePath, close: () => closeBrowser(browser) };
}

export function requestAllowed(url, allowedFiles) {
  try {
    const value = new URL(url);
    value.hash = '';
    return value.protocol === 'file:' && !value.search && allowedFiles.has(value.href);
  } catch { return false; }
}

export async function prepareOutput(out, root = ROOT) {
  const absolute = path.resolve(out);
  const rootReal = await realpath(root);
  // Do not let a diagnostic run overwrite repository inputs/assets/source.
  const relative = path.relative(rootReal, absolute);
  const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (relative === '' || (!outside && relative.split(path.sep)[0] !== 'validation')) throw new Error('Output inside the repository must be under validation/.');
  await mkdir(absolute, { recursive: true });
  if ((await lstat(absolute)).isSymbolicLink() || await realpath(absolute) !== absolute) throw new Error('Validation output must not use symlinks.');
  if ((await readdir(absolute)).length !== 0) throw new Error('Validation output must be empty; existing evidence is never overwritten.');
  return absolute;
}

export function expectedIds(model, filters = {}) {
  const query = String(filters.purpose ?? '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
  return model.items.filter(item => (!filters.family || item.family === filters.family)
    && (!filters.image || item.image === filters.image)
    && (!filters.density || item.density === filters.density)
    && (!query || `${item.id} ${item.name} ${item.purpose}`.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(query))).map(item => item.id);
}

export async function recordCheck(report, name, run) {
  try { const details = await run(); report.checks.push({ name, status: 'pass', ...(details === undefined ? {} : { details }) }); }
  catch (error) { report.checks.push({ name, status: 'fail', ...errorRecord(error) }); }
}

// Runs in the browser via evaluate; intentionally does not change styles or CSP.
export function inspectReflow() {
  const viewport = document.documentElement.clientWidth;
  const body = document.body;
  const offender = element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden' || element.closest('[hidden]')) return false;
    // The unfocused skip link is intentionally offscreen; its focused state is checked separately.
    if (element.classList.contains('skip-link') && element !== document.activeElement) return false;
    return rect.left < -1 || rect.right > viewport + 1 || (element.clientWidth > 0 && ['PRE', 'CODE', 'INPUT', 'SELECT'].includes(element.tagName) && element.scrollWidth > element.clientWidth + 1);
  };
  return { viewport, innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: body.scrollWidth,
    offenders: [...body.querySelectorAll('*')].filter(offender).slice(0, 25).map(element => ({ tag: element.tagName, id: element.id, className: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })) };
}

// A later reload/scroll can expose lazy images after the resource audit.
// Wait for only the currently visible pixels without altering lazy loading.
export async function readyVisibleImages(page, timeoutMs = 15000) {
  return evaluateSafely(page, 'evaluate', async () => {
    const visible = [...document.querySelectorAll('.accepted-card img, .comparison-grid img')].filter(image => {
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
        rect.top < innerHeight && rect.left < innerWidth &&
        style.display !== 'none' && style.visibility !== 'hidden';
    });
    await Promise.all(visible.map(image => image.decode()));
    for (const image of visible) if (!image.complete || !image.naturalWidth || !image.naturalHeight) throw new Error('Visible gallery image is not decoded.');
    return { decodedVisibleImages: visible.length };
  }, undefined, timeoutMs);
}

async function snapshot(page, out, report, name, scope) {
  const file = `${name}.png`;
  await readyVisibleImages(page);
  await page.screenshot({ path: path.join(out, file), fullPage: false, animations: 'disabled' });
  const bytes = await readFile(path.join(out, file));
  report.artifacts.push({ file, bytes: bytes.length, sha256: hash(bytes), scope, viewport: page.viewportSize() });
}

export function galleryImages(model) {
  return [...(model.comparisons ?? []).flatMap(group => group.previews), ...model.accepted.map(item => item.preview)];
}

export function assertPreviewImage(image, preview, root = ROOT) {
  assert.equal(image.width, preview.width);
  assert.equal(image.height, preview.height);
  assert.equal(image.complete, true);
  // The gallery model already validates the exact versioned repository path.
  // Do not pin a historical directory when the accepted design has new pixels.
  assert.equal(image.source, pathToFileURL(path.join(root, preview.path)).href, 'Decoded image must use its accepted preview path.');
}

export async function inspectResources(page, model, { scriptEnabled, root }) {
  // Scroll each actual image into view so lazy loading cannot masquerade as a broken asset.
  const expectedImages = galleryImages(model);
  const images = page.locator('.accepted-card img, .comparison-grid img');
  assert.equal(await images.count(), expectedImages.length);
  for (let index = 0; index < expectedImages.length; index += 1) {
    await images.nth(index).scrollIntoViewIfNeeded();
    await evaluateSafely(images.nth(index), 'evaluate', image => image.decode());
  }
  const state = await evaluateSafely(page, 'evaluate', () => ({
    policy: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
    background: getComputedStyle(document.body).backgroundColor,
    css: [...document.styleSheets].map(sheet => sheet.href),
    scripts: [...document.scripts].map(script => ({ src: script.src, type: script.type })),
    panelHidden: document.querySelector('[data-filter-panel]').hidden,
    visible: [...document.querySelectorAll('[data-template-card]')].filter(card => !card.hidden).map(card => card.id),
    pendingImages: document.querySelectorAll('.pending-card img').length,
    images: [...document.querySelectorAll('.accepted-card img, .comparison-grid img')].map(image => ({ source: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight, complete: image.complete }))
  }));
  assert.equal(state.policy, CSP);
  assert.equal(state.background, 'rgb(245, 244, 238)', 'Local stylesheet must affect computed styles.');
  assert.ok(state.css.some(url => url?.endsWith('/docs/gallery/gallery.css')));
  assert.equal(state.scripts.length, 1);
  assert.ok(state.scripts[0].src.endsWith('/docs/gallery/gallery.js'));
  assert.notEqual(state.scripts[0].type, 'module');
  assert.equal(state.panelHidden, !scriptEnabled, 'Classic local JS must initialize only in the enabled context.');
  assert.deepEqual([...state.visible].sort(), model.items.map(item => item.id));
  assert.equal(state.pendingImages, 0);
  for (const [index, image] of state.images.entries()) {
    assertPreviewImage(image, expectedImages[index], root);
  }
  return state;
}

async function assertFilters(page, model, filters) {
  await page.locator('#family-filter').selectOption(filters.family ?? '');
  await page.locator('#purpose-filter').fill(filters.purpose ?? '');
  await page.locator('#image-filter').selectOption(filters.image ?? '');
  await page.locator('#density-filter').selectOption(filters.density ?? '');
  const expected = expectedIds(model, filters);
  const state = await evaluateSafely(page, 'evaluate', () => ({
    visible: [...document.querySelectorAll('[data-template-card]')].filter(card => !card.hidden).map(card => card.id).sort(),
    text: document.getElementById('filter-result').textContent,
    acceptedEmpty: !document.querySelector('[data-empty="accepted"]').hidden,
    pendingEmpty: !document.querySelector('[data-empty="pending"]').hidden
  }));
  assert.deepEqual(state.visible, expected);
  const accepted = model.accepted.filter(item => expected.includes(item.id)).length;
  const pending = expected.length - accepted;
  assert.equal(state.text, `显示 ${accepted} 个已验收示例，${pending} 个待验收候选。`);
  assert.equal(state.acceptedEmpty, accepted === 0);
  assert.equal(state.pendingEmpty, pending === 0);
  return { filters, accepted, pending };
}

// Enter may return before a same-document navigation commits. Wait for the
// exact local destination, not merely an arbitrary URL ending in the same hash.
export async function activateSkipLink(page, timeoutMs = 15000) {
  const destination = new URL(page.url());
  destination.hash = 'main';
  await page.keyboard.press('Enter');
  await bounded(page.waitForURL(destination.href, { timeout: timeoutMs }), timeoutMs, 'Skip-link navigation');
  assert.equal(page.url(), destination.href);
}

async function keyboardAudit(page, model) {
  await page.reload({ waitUntil: 'load' });
  await page.locator('[data-filter-panel]').waitFor({ state: 'visible' });
  const labels = await evaluateSafely(page, 'evaluate', () => ['family-filter', 'purpose-filter', 'image-filter', 'density-filter'].map(id => ({ id, labels: [...document.getElementById(id).labels].map(label => label.textContent.trim()) })));
  assert.ok(labels.every(item => item.labels.some(label => label.length > 0)), 'Every control needs a native associated label.');
  await evaluateSafely(page, 'evaluate', () => window.scrollTo(0, 0));
  await page.mouse.click(1, 1); // Reset sequential focus to the document, not a restored control.
  await page.keyboard.press('Tab');
  assert.equal(await evaluateSafely(page, 'evaluate', () => document.activeElement.className), 'skip-link');
  const skip = await evaluateSafely(page, 'evaluate', () => ({ left: document.activeElement.getBoundingClientRect().left, top: document.activeElement.getBoundingClientRect().top }));
  assert.ok(skip.left >= 0 && skip.top >= 0, 'Focused skip link must be onscreen.');
  await activateSkipLink(page);
  await page.locator('#family-filter').focus();
  const sequence = [];
  for (const next of ['purpose-filter', 'image-filter', 'density-filter', 'reset-filters']) {
    await page.keyboard.press('Tab');
    const focus = await evaluateSafely(page, 'evaluate', () => ({ id: document.activeElement.id, outline: getComputedStyle(document.activeElement).outlineStyle, width: parseFloat(getComputedStyle(document.activeElement).outlineWidth) }));
    assert.equal(focus.id, next);
    assert.ok(focus.outline !== 'none' && focus.width > 0, `Visible keyboard focus: ${next}`);
    sequence.push(focus.id);
  }
  await page.keyboard.press('Tab');
  const next = await evaluateSafely(page, 'evaluate', () => ({ className: document.activeElement.className, template: document.activeElement.closest('[data-template-card]')?.id, href: document.activeElement.getAttribute('href') }));
  if (model.accepted.length) assert.equal(next.className, 'preview-link');
  else { assert.equal(next.template, model.pending[0].id); assert.equal(next.href, `../../${model.pending[0].example}`); }
  await page.keyboard.press('Shift+Tab');
  assert.equal(await evaluateSafely(page, 'evaluate', () => document.activeElement.id), 'reset-filters');
  const summary = page.locator('[data-template-card] summary').first();
  await summary.focus();
  await page.keyboard.press('Enter');
  assert.equal(await evaluateSafely(summary, 'evaluate', element => element.parentElement.open), true);
  await page.keyboard.press('Enter');
  assert.equal(await evaluateSafely(summary, 'evaluate', element => element.parentElement.open), false);
  return { labels, tabSequence: sequence, skipLink: 'pass', reverseTab: 'pass', nativeDetails: 'pass', scope: 'Automated keyboard checks, not screen-reader or accessibility certification.' };
}

export async function withPage(browser, options, allowed, report, name, javaScriptEnabled, run) {
  let context;
  const requests = [], unexpected = [], failures = [], consoleErrors = [], pageErrors = [];
  try {
    context = await bounded(browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, javaScriptEnabled, serviceWorkers: 'block' }), options.timeoutMs, 'Context initialization');
    context.setDefaultTimeout(options.timeoutMs);
    context.setDefaultNavigationTimeout(options.timeoutMs);
    context.on('request', request => {
      const url = request.url(); requests.push(url);
      if (!requestAllowed(url, allowed)) unexpected.push(url);
    });
    context.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
    await bounded(context.route('**/*', route => requestAllowed(route.request().url(), allowed) ? route.continue() : route.abort('blockedbyclient')), options.timeoutMs, 'Network guard initialization');
    const page = await bounded(context.newPage(), options.timeoutMs, 'Page initialization');
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      window.__galleryCspViolations = [];
      document.addEventListener('securitypolicyviolation', event => window.__galleryCspViolations.push({ blockedURI: event.blockedURI, effectiveDirective: event.effectiveDirective }));
    });
    await page.goto(options.url, { waitUntil: 'load' });
    if (javaScriptEnabled) await page.locator('[data-filter-panel]').waitFor({ state: 'visible' });
    await run(page);
    await recordCheck(report, `${name}: security and resource errors`, async () => {
      const cspViolations = await evaluateSafely(page, 'evaluate', () => window.__galleryCspViolations ?? []);
      assert.deepEqual(unexpected, [], 'Unexpected/remote page requests are blocked and must fail the run.');
      assert.deepEqual(failures, [], 'Local asset loading must not fail.');
      assert.deepEqual(consoleErrors, [], 'Console errors, including CSP rejection, must be reviewed.');
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(cspViolations, []);
      return { pageRequestCount: requests.length, uniqueRequests: [...new Set(requests)], externalRequests: 0, cspViolations: 0 };
    });
  } catch (error) { report.checks.push({ name: `${name}: context/load`, status: 'fail', ...errorRecord(error) }); }
  finally {
    // Preserve observed errors even when navigation/setup or a later check failed.
    report.observations.push({ context: name, javaScriptEnabled, requests: [...new Set(requests)], unexpected, requestFailures: failures, consoleErrors, pageErrors });
    if (context) await recordCheck(report, `${name}: context cleanup`, () => bounded(context.close(), 5000, 'Context cleanup'));
  }
}

async function realBrowserChecks(browser, options, model, report, out) {
  const files = [GALLERY_PATH, 'docs/gallery/gallery.css', 'docs/gallery/gallery.js', ...galleryImages(model).map(image => image.path)];
  const allowed = new Set(files.map(relative => pathToFileURL(path.join(options.root, relative)).href));
  await withPage(browser, options, allowed, report, 'javascript-on', true, async page => {
    await recordCheck(report, 'file URL: real local resources, CSP, images and classic JS', () => inspectResources(page, model, { scriptEnabled: true, root: options.root }));
    const filterCases = [
      ...model.families.map(family => ({ family: family.value })),
      ...[...new Set(model.items.map(item => item.image))].map(image => ({ image })),
      ...model.densities.map(density => ({ density })),
      { purpose: '阅读' }, { purpose: '　ｔ０１　' }, { purpose: '<script>not code</script>' },
      { family: 'film', image: 'inline', density: 'standard', purpose: 'T38' }
    ];
    for (const [index, filters] of filterCases.entries()) await recordCheck(report, `filters ${index + 1}`, () => assertFilters(page, model, filters));
    await recordCheck(report, 'repeat filter, reset twice and restore full catalogue', async () => {
      for (let i = 0; i < 2; i += 1) await assertFilters(page, model, { purpose: 'T01' });
      for (let i = 0; i < 2; i += 1) await page.locator('#reset-filters').click();
      const values = await evaluateSafely(page.locator('.filter-grid input, .filter-grid select'), 'evaluateAll', controls => controls.map(control => control.value));
      assert.ok(values.every(value => value === ''));
      const visible = await page.locator('[data-template-card]:visible').count();
      assert.equal(visible, model.items.length);
      return { visible };
    });
    await recordCheck(report, 'task routes and same-content static navigation', async () => {
      const links = await evaluateSafely(page.locator('.task-route li a'), 'evaluateAll', nodes => nodes.map(node => node.getAttribute('href')));
      assert.deepEqual(links, model.tasks.flatMap(task => task.templates.map(item => `#${item.id}`)));
      assert.equal(await page.locator('.comparison').count(), model.comparisons.length);
      await assertFilters(page, model, { purpose: 'T01' });
      await page.locator('[data-template-target="T04"]').first().click();
      assert.equal(await page.locator('#T04').isVisible(), true);
      assert.equal(await page.locator('[data-template-card]:visible').count(), model.items.length);
      await assertFilters(page, model, { purpose: 'T01' });
      await page.locator('#comparisons [data-template-target="T04"]').first().focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#T04').isVisible(), true);
      assert.equal(await page.locator('[data-template-card]:visible').count(), model.items.length);
      return { taskRoutes: model.tasks.length, comparisons: model.comparisons.length, comparisonPreviews: model.comparisons.reduce((sum, group) => sum + group.previews.length, 0) };
    });
    await recordCheck(report, 'native labels, keyboard focus and details', () => keyboardAudit(page, model));
    for (const scenario of [
      { name: 'desktop-1280', width: 1280, height: 900, zoom: 1 },
      { name: 'mobile-375', width: 375, height: 812, zoom: 1 },
      { name: 'mobile-390', width: 390, height: 844, zoom: 1 },
      { name: 'reflow-200-percent', width: 640, height: 450, zoom: 2 }
    ]) {
      await recordCheck(report, `${scenario.name}: initialize and capture index`, async () => {
        await page.locator('#reset-filters').click();
        await page.setViewportSize({ width: scenario.width, height: scenario.height });
        await evaluateSafely(page, 'evaluate', () => { for (const detail of document.querySelectorAll('details')) detail.open = false; window.scrollTo(0, 0); });
        await snapshot(page, out, report, `${scenario.name}-index`, 'Viewport screenshot: header, counters and filters.');
        return { ...scenario, zoomMethod: scenario.zoom === 2 ? 'Equivalent reflow viewport: 1280×900 CSS viewport / 2. Not browser-UI zoom or pinch zoom.' : 'Default CSS viewport' };
      });
      await recordCheck(report, `${scenario.name}: collapsed reflow`, async () => {
        const geometry = await evaluateSafely(page, 'evaluate', inspectReflow);
        assert.equal(geometry.innerWidth, scenario.width);
        assert.ok(geometry.documentWidth <= geometry.viewport + 1 && geometry.bodyWidth <= geometry.viewport + 1, JSON.stringify(geometry));
        assert.deepEqual(geometry.offenders, []);
        return geometry;
      });
      for (const section of ['tasks', 'comparisons', 'accepted', 'pending']) await recordCheck(report, `${scenario.name}: capture ${section}`, async () => {
        await evaluateSafely(page, 'evaluate', section => {
          const target = document.querySelector(section === 'accepted' ? '.accepted-card' : `#${section}-title`) ?? document.querySelector('#accepted-title');
          target.scrollIntoView({ block: 'start', behavior: 'instant' });
        }, section);
        await snapshot(page, out, report, `${scenario.name}-${section}`, `Viewport screenshot: start of ${section} gallery section; not a full-page capture.`);
      });
      await recordCheck(report, `${scenario.name}: expanded details and reflow`, async () => {
        // Exercise long commands/hashes across every template, without injecting CSS.
        await evaluateSafely(page, 'evaluate', () => { for (const detail of document.querySelectorAll('details')) detail.open = true; });
        const geometry = await evaluateSafely(page, 'evaluate', inspectReflow);
        await page.locator('[data-template-card] summary').first().scrollIntoViewIfNeeded();
        await snapshot(page, out, report, `${scenario.name}-detail`, 'Viewport screenshot: first expanded acceptance/detail block.');
        assert.ok(geometry.documentWidth <= geometry.viewport + 1 && geometry.bodyWidth <= geometry.viewport + 1, JSON.stringify(geometry));
        assert.deepEqual(geometry.offenders, []);
        return geometry;
      });
    }
  });
  await withPage(browser, options, allowed, report, 'javascript-off', false, async page => {
    await recordCheck(report, 'no JS: complete catalogue, real images and static input links', async () => {
      const state = await inspectResources(page, model, { scriptEnabled: false, root: options.root });
      const links = await evaluateSafely(page.locator('[data-template-card] .links a'), 'evaluateAll', anchors => anchors.map(anchor => anchor.getAttribute('href')));
      for (const item of model.items) assert.ok(links.includes(`../../${item.example}`));
      assert.equal(await page.locator('noscript').isVisible(), true);
      const summary = page.locator('[data-template-card] summary').first();
      await summary.focus(); await page.keyboard.press('Enter');
      assert.equal(await evaluateSafely(summary, 'evaluate', element => element.parentElement.open), true);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#pending-title').scrollIntoViewIfNeeded();
      await snapshot(page, out, report, 'no-js-390-catalogue', 'JavaScript disabled: text-only catalogue and native details remain available.');
      return state;
    });
  });
}

export async function validateGallery(options, dependencies = {}) {
  if (options.allowBrowser !== true) throw new Error('Browser execution not authorized by invocation; no launch attempted.');
  const root = path.resolve(options.root ?? ROOT);
  const out = await prepareOutput(options.out, root);
  const report = { schemaVersion: 1, status: 'running', mode: dependencies.launch ? 'test-injected-runtime' : 'actual-chromium-file-url', startedAt: new Date().toISOString(), checks: [], artifacts: [], observations: [],
    independentVisualReview: 'pending', assistiveTechnologyReview: 'pending-not-screen-reader-certification',
    zoomBoundary: '200% equivalent reflow is automated at half the desktop CSS viewport; actual browser-UI zoom remains pending.' };
  let runtime;
  try {
    await (dependencies.preflight ?? generateGallery)({ root, check: true });
    const model = await (dependencies.model ?? buildGalleryModel)({ root });
    report.registry = { implemented: model.items.length, accepted: model.accepted.length, pending: model.pending.length };
    report.inputs = [];
    for (const relative of new Set([GALLERY_PATH, 'docs/gallery/gallery.css', 'docs/gallery/gallery.js', 'scripts/templates.mjs', 'scripts/build-template-gallery.mjs', 'scripts/gallery-discovery.mjs', 'docs/gallery-comparisons.json', ...model.comparisons.flatMap(group => [group.input, ...(group.evidence ? [group.evidence.review, ...group.previews.map(image => image.path)] : [])]), 'scripts/validate-gallery.mjs', 'scripts/browser.mjs', 'package-lock.json', 'docs/template-gallery-evidence.json', ...model.accepted.flatMap(item => [item.preview.path, item.example, item.evidence.path, item.evidence.review])])) {
      const bytes = await readFile(path.join(root, relative));
      report.inputs.push({ file: relative, sha256: hash(bytes), bytes: bytes.length });
    }
    runtime = await (dependencies.launch ?? launchBrowser)(options);
    report.browser = { version: runtime.browser.version(), executablePath: runtime.executablePath };
    await (dependencies.runChecks ?? realBrowserChecks)(runtime.browser, { ...options, root, url: pathToFileURL(path.join(root, GALLERY_PATH)).href }, model, report, out);
  } catch (error) { report.checks.push({ name: runtime ? 'validation runner' : 'preflight/browser initialization', status: 'fail', ...errorRecord(error) }); }
  finally {
    if (runtime) await recordCheck(report, 'browser cleanup', runtime.close);
    report.completedAt = new Date().toISOString();
    report.status = report.checks.some(check => check.status === 'fail') ? 'fail' : 'pass';
    report.summary = { checks: report.checks.length, passed: report.checks.filter(check => check.status === 'pass').length, failed: report.checks.filter(check => check.status === 'fail').length, screenshots: report.artifacts.length };
    await writeFile(path.join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return { report, out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseGalleryValidationOptions(process.argv.slice(2));
    if (options.help) console.log(USAGE);
    else {
      const { report, out } = await validateGallery(options);
      console.log(`${report.status}: ${report.summary.passed}/${report.summary.checks} automated checks; ${out}/summary.json. Independent visual and assistive-technology review remain pending.`);
      if (report.status !== 'pass') process.exitCode = 1;
    }
  } catch (error) { console.error(error.message); console.error(USAGE); process.exitCode = 1; }
}
