import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runInNewContext } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { ROOT, CSP, buildGalleryModel } from '../scripts/build-template-gallery.mjs';
import { assertPreviewImage, galleryImages, inspectResources, parseGalleryValidationOptions, expectedIds, requestAllowed, prepareOutput, recordCheck, bounded, validateGallery, inspectReflow, evaluateSafely, withPage, activateSkipLink, readyVisibleImages } from '../scripts/validate-gallery.mjs';
const model = await buildGalleryModel();
const source = await readFile(new URL('../scripts/validate-gallery.mjs', import.meta.url), 'utf8');
async function temp(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'md2card-gallery-validator-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function mockDependencies({ launchError, runError, cleanupError } = {}) {
  const calls = [];
  return { calls,
    preflight: async () => {}, // Injected lifecycle tests do not audit the committed page.
    model: async () => model,
    launch: async () => {
      calls.push('launch-stub');
      if (launchError) throw launchError;
      return { browser: { version: () => 'source-test-stub-not-chromium' }, executablePath: '/mock/no-browser', close: async () => { calls.push('close-stub'); if (cleanupError) throw cleanupError; } };
    },
    runChecks: async (_browser, _options, _model, report) => {
      calls.push('checks-stub');
      await recordCheck(report, 'first synthetic failure', () => { throw new Error('deliberate mock failure'); });
      await recordCheck(report, 'next synthetic check still runs', () => ({ synthetic: true }));
      if (runError) throw runError;
    }
  };
}

test('CLI is opt-in and rejects invalid, missing and duplicate arguments before browser work', () => {
  assert.throws(() => parseGalleryValidationOptions([]), /No launch was attempted/);
  assert.equal(parseGalleryValidationOptions(['--help']).help, true);
  assert.deepEqual(parseGalleryValidationOptions(['--allow-browser', '--out', 'validation/check', '--browser', '/local/chrome', '--timeout', '1000']), { allowBrowser: true, out: 'validation/check', browser: '/local/chrome', timeoutMs: 1000 });
  for (const args of [['--allow-browser', '--allow-browser'], ['--allow-browser', '--out'], ['--allow-browser', '--unknown'], ['--allow-browser', '--timeout', '0'], ['--allow-browser', '--timeout', 'Infinity'], ['--allow-browser', '--timeout', '120001']]) assert.throws(() => parseGalleryValidationOptions(args));
});

test('runtime authorization guard executes before writes or injected launch', async () => {
  let launched = false;
  await assert.rejects(validateGallery({ out: '/must-not-write', allowBrowser: false }, { launch: () => { launched = true; } }), /no launch attempted/);
  assert.equal(launched, false);
});

test('allowlist permits exact local resources only, with optional fragment but no query', () => {
  const url = pathToFileURL(path.join(ROOT, 'docs/gallery/index.html')).href;
  const allowed = new Set([url]);
  assert.equal(requestAllowed(url, allowed), true);
  assert.equal(requestAllowed(`${url}#accepted`, allowed), true);
  for (const other of [`${url}?remote=1`, 'https://example.com', 'http://127.0.0.1:8888/', 'data:text/html,x', 'javascript:x', 'file:///etc/passwd', '//example.com/a', 'not a URL', url.replace('index.html', 'unapproved.js')]) assert.equal(requestAllowed(other, allowed), false, other);
});

test('expected filter counts derive from current registry and intersection semantics', () => {
  assert.equal(expectedIds(model).length, model.items.length);
  assert.deepEqual(expectedIds(model, { purpose: '　ｔ０１　' }), ['T01']);
  assert.deepEqual(expectedIds(model, { family: 'film', image: 'inline', density: 'standard', purpose: 'T38' }), ['T38']);
  assert.deepEqual(expectedIds(model, { density: 'compact' }), []);
  assert.deepEqual(expectedIds(model, { purpose: '.*' }), []);
  for (const family of model.families) assert.equal(expectedIds(model, { family: family.value }).length, model.items.filter(item => item.family === family.value).length);
});

test('aggregate recorder continues after independent failed checks', async () => {
  const report = { checks: [] };
  await recordCheck(report, 'failure', () => { throw Object.assign(new Error('mock failure'), { code: 'MOCK_FAILURE' }); });
  await recordCheck(report, 'pass', () => ({ count: 4 }));
  assert.deepEqual(report.checks.map(check => check.status), ['fail', 'pass']);
  assert.equal(report.checks[0].code, 'MOCK_FAILURE');
  assert.deepEqual(report.checks[1].details, { count: 4 });
});

test('bounded lifecycle helper resolves fast operations and rejects stalled ones', async () => {
  assert.equal(await bounded(Promise.resolve('done'), 50, 'mock'), 'done');
  await assert.rejects(bounded(new Promise(() => {}), 5, 'mock close'), /mock close timed out/);
});

test('output must be empty and cannot overwrite source or use symlinks', async t => {
  const directory = await temp(t);
  const root = path.join(directory, 'repo'); await mkdir(root);
  await assert.rejects(prepareOutput(path.join(root, 'docs'), root), /under validation/);
  await assert.rejects(prepareOutput(root, root), /under validation/);
  const out = path.join(root, 'validation/gallery');
  assert.equal(await prepareOutput(out, root), out);
  await writeFile(path.join(out, 'summary.json'), 'existing');
  await assert.rejects(prepareOutput(out, root), /must be empty/);
  assert.equal(await readFile(path.join(out, 'summary.json'), 'utf8'), 'existing');
  const target = path.join(directory, 'target'); await mkdir(target);
  const link = path.join(root, 'validation/link'); await symlink(target, link);
  await assert.rejects(prepareOutput(link, root), /must not use symlinks/);
});

test('source-only injected runtime writes aggregated failures and closes browser once', async t => {
  const out = await temp(t); const dependencies = mockDependencies();
  const result = await validateGallery({ allowBrowser: true, out, timeoutMs: 1000 }, dependencies);
  assert.deepEqual(dependencies.calls, ['launch-stub', 'checks-stub', 'close-stub']);
  assert.equal(result.report.mode, 'test-injected-runtime');
  assert.equal(result.report.status, 'fail');
  assert.equal(result.report.registry.implemented, model.items.length);
  assert.equal(result.report.registry.accepted, model.accepted.length);
  assert.equal(result.report.independentVisualReview, 'pending');
  assert.equal(result.report.assistiveTechnologyReview, 'pending-not-screen-reader-certification');
  assert.ok(result.report.inputs.every(input => /^[a-f0-9]{64}$/.test(input.sha256)));
  assert.equal(result.report.artifacts.length, 0, 'Mocks must not fabricate screenshots.');
  const saved = JSON.parse(await readFile(path.join(out, 'summary.json'), 'utf8'));
  assert.deepEqual(saved.summary, { checks: 3, passed: 2, failed: 1, screenshots: 0 });
});

test('cleanup failure remains distinct from an earlier runner failure', async t => {
  const out = await temp(t);
  const dependencies = mockDependencies({ runError: new Error('runner failed'), cleanupError: Object.assign(new Error('cleanup uncertain'), { code: 'BROWSER_CLEANUP_TIMEOUT' }) });
  const { report } = await validateGallery({ allowBrowser: true, out, timeoutMs: 1000 }, dependencies);
  assert.equal(report.status, 'fail');
  assert.ok(report.checks.some(check => check.name === 'validation runner' && check.message === 'runner failed'));
  assert.ok(report.checks.some(check => check.name === 'browser cleanup' && check.code === 'BROWSER_CLEANUP_TIMEOUT'));
  assert.equal(dependencies.calls.filter(call => call === 'close-stub').length, 1);
});

test('launch failure is recorded without retry and without claiming browser validation', async t => {
  const out = await temp(t); const dependencies = mockDependencies({ launchError: new Error('mock launch denied') });
  const { report } = await validateGallery({ allowBrowser: true, out, timeoutMs: 1000 }, dependencies);
  assert.deepEqual(dependencies.calls, ['launch-stub']);
  assert.equal(report.status, 'fail');
  assert.equal(report.browser, undefined);
  assert.equal(report.checks[0].name, 'preflight/browser initialization');
  assert.equal(report.artifacts.length, 0);
});

test('stale preflight stops before launch and persists its failure report', async t => {
  const out = await temp(t); const dependencies = mockDependencies();
  dependencies.preflight = async () => { throw new Error('generated gallery stale'); };
  const { report } = await validateGallery({ allowBrowser: true, out, timeoutMs: 1000 }, dependencies);
  assert.deepEqual(dependencies.calls, []);
  assert.equal(report.status, 'fail');
  assert.equal(report.checks[0].message, 'generated gallery stale');
});

test('browser-path source contains no bypass flags, CSP changes, fake rendering or eager launch', () => {
  assert.doesNotMatch(source, /--no-sandbox|disable-web-security|bypassCSP|setContent\(|addStyleTag|setPageScaleFactor|page\.route\(.*https/);
  assert.match(source, /import\('playwright'\)/);
  assert.match(source, /closeBrowser\(browser\)/);
  assert.match(source, /serviceWorkers: 'block'/);
  assert.match(source, /route\.abort\('blockedbyclient'\)/);
  assert.match(source, /javaScriptEnabled, serviceWorkers/);
  assert.match(source, /width: 375/);
  assert.match(source, /width: 390/);
  assert.match(source, /width: 640, height: 450, zoom: 2/);
  assert.match(source, /Not browser-UI zoom or pinch zoom/);
  assert.match(source, /fullPage: false/);
  assert.match(source, /sha256: hash\(bytes\)/);
  assert.doesNotMatch(inspectReflow.toString(), /\.style\s*=|innerHTML|style\.zoom|transform\s*=/);
});


test('reflow probe detects visible overflow without mistaking hidden or unfocused skip links', () => {
  const node = ({ right = 375, left = 0, width = 375, height = 10, tag = 'DIV', skip = false, hidden = false, scrollWidth = width, clientWidth = width } = {}) => ({
    tagName: tag, id: '', className: skip ? 'skip-link' : '', clientWidth, scrollWidth,
    classList: { contains: name => skip && name === 'skip-link' },
    closest: () => hidden,
    getBoundingClientRect: () => ({ left, right, width, height })
  });
  const good = node(), wide = node({ right: 410, width: 410 }), hidden = node({ right: 500, hidden: true }), skip = node({ left: -100, right: 50, skip: true });
  const document = { documentElement: { clientWidth: 375, scrollWidth: 375 }, activeElement: good, body: { scrollWidth: 375, querySelectorAll: () => [good, wide, hidden, skip] } };
  const result = runInNewContext(`(${inspectReflow.toString()})()`, { document, innerWidth: 375, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) });
  assert.equal(result.offenders.length, 1);
  assert.equal(result.offenders[0].right, 410);
  assert.equal(result.viewport, 375);
});


test('stalled page/image evaluation records failure and closes context and browser', async t => {
  const out = await temp(t), calls = [];
  const page = { on() {}, async addInitScript() {}, async goto() {}, locator: () => ({ async waitFor() {} }) };
  const context = { setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, on() {}, async route() {}, async newPage() { return page; }, async close() { calls.push('context-close'); } };
  const browser = { version: () => 'source-stall-test', async newContext() { return context; } };
  const dependencies = {
    preflight: async () => {},
    model: async () => model,
    launch: async () => ({ browser, executablePath: '/mock/no-browser', close: async () => { calls.push('browser-close'); } }),
    runChecks: async (_browser, options, _model, report) => withPage(browser, options, new Set(), report, 'stalled-evaluation', true, async () => {
      await evaluateSafely({ evaluate: () => new Promise(() => {}) }, 'evaluate', () => {}, undefined, 5);
    })
  };
  const { report } = await validateGallery({ allowBrowser: true, out, timeoutMs: 1000 }, dependencies);
  assert.deepEqual(calls, ['context-close', 'browser-close']);
  assert.equal(report.status, 'fail');
  assert.ok(report.checks.some(check => check.status === 'fail' && /Gallery evaluate timed out/.test(check.message)));
  assert.ok(report.checks.some(check => check.name.endsWith('context cleanup') && check.status === 'pass'));
  assert.ok(report.checks.some(check => check.name === 'browser cleanup' && check.status === 'pass'));
  await assert.rejects(evaluateSafely({ evaluateAll: () => new Promise(() => {}) }, 'evaluateAll', () => {}, undefined, 5), /evaluateAll timed out/);
  assert.doesNotMatch(source, /\.(?:evaluate|evaluateAll)\(/, 'Every browser evaluation goes through the explicit deadline wrapper');
});


test('skip-link audit waits for delayed same-document navigation to the exact local destination', async () => {
  let current = 'file:///repo/docs/gallery/index.html';
  let pressed = false, waited = false;
  const page = {
    url: () => current,
    keyboard: { press: async key => { assert.equal(key, 'Enter'); pressed = true; } },
    waitForURL: async (destination, options) => {
      assert.equal(pressed, true);
      assert.equal(current, 'file:///repo/docs/gallery/index.html');
      assert.equal(destination, 'file:///repo/docs/gallery/index.html#main');
      assert.equal(options.timeout, 100);
      await new Promise(resolve => setTimeout(resolve, 5));
      current = destination; waited = true;
    }
  };
  await activateSkipLink(page, 100);
  assert.equal(waited, true);
  assert.equal(current, 'file:///repo/docs/gallery/index.html#main');
});

test('skip-link audit still rejects a stalled navigation or a wrong destination', async () => {
  const page = { url: () => 'file:///repo/docs/gallery/index.html', keyboard: { press: async () => {} }, waitForURL: () => new Promise(() => {}) };
  await assert.rejects(activateSkipLink(page, 5), /Skip-link navigation timed out/);
  page.waitForURL = async () => {};
  await assert.rejects(activateSkipLink(page, 100), { code: 'ERR_ASSERTION' });
});


test('snapshot readiness decodes every intersecting image, not hidden or offscreen entries', async () => {
  const calls = [];
  const image = (name, rect, style = {}) => ({
    complete: true, naturalWidth: 1080, naturalHeight: 1440, style,
    getBoundingClientRect: () => ({ width: 200, height: 267, left: 0, right: 200, top: 0, bottom: 267, ...rect }),
    decode: async () => { await new Promise(resolve => setTimeout(resolve, 2)); calls.push(name); }
  });
  const images = [image('full', {}), image('partial', { top: 790, bottom: 1057 }), image('below', { top: 900, bottom: 1167 }), image('hidden', {}, { visibility: 'hidden' })];
  const page = { evaluate: callback => runInNewContext(`(${callback.toString()})()`, {
    document: { querySelectorAll: selector => { assert.equal(selector, '.accepted-card img, .comparison-grid img'); return images; } },
    innerWidth: 375, innerHeight: 812, getComputedStyle: image => ({ display: 'block', visibility: 'visible', ...image.style })
  }) };
  const result = await readyVisibleImages(page, 100);
  assert.equal(result.decodedVisibleImages, 2);
  assert.deepEqual(calls.sort(), ['full', 'partial']);
  images[0].naturalWidth = 0;
  await assert.rejects(readyVisibleImages(page, 100), /not decoded/);
});

test('snapshot readiness keeps a finite deadline for stalled lazy-image decoding', async () => {
  await assert.rejects(readyVisibleImages({ evaluate: () => new Promise(() => {}) }, 5), /Gallery evaluate timed out/);
});

test('resource model includes current comparison paths, never assumed v1 template directories', async()=>{
  const comparison={path:'docs/images/comparisons/unit/T04.png',width:1080,height:1440};
  const current={path:'docs/images/templates-v2/T05.png',width:1080,height:1440};
  assert.deepEqual(galleryImages({comparisons:[{previews:[comparison]},{previews:[]}],accepted:[{preview:current}]}),[comparison,current]);
});

test('browser image identity follows validated versioned previews without accepting historical or unrelated files', () => {
  for (const relative of ['docs/images/templates/T01.png', 'docs/images/refinement-m1-v2/T20.png', 'docs/images/comparisons/short-reading/T06.png']) {
    const preview = { path: relative, width: 1080, height: 1440 };
    const image = { source: `file:///repo/${relative}`, width: 1080, height: 1440, complete: true };
    assert.doesNotThrow(() => assertPreviewImage(image, preview, '/repo'));
    for (const source of ['file:///repo/docs/images/templates/T20.png', 'file:///repo/docs/images/other/T20.png', image.source + '?stale=1', `https://example.com/${relative}`, `file:///other-repo/${relative}`]) {
      if (source !== image.source) assert.throws(() => assertPreviewImage({ ...image, source }, preview, '/repo'), /accepted preview path/);
    }
    for (const changes of [{ width: 1079 }, { height: 1439 }, { complete: false }]) assert.throws(() => assertPreviewImage({ ...image, ...changes }, preview, '/repo'));
  }
});


test('source-only resource audit binds nonempty comparisons and accepted previews in DOM order', async () => {
  const comparison = { path: 'docs/images/comparisons/short-reading/T06.png', width: 1080, height: 1440 };
  const accepted = { path: 'docs/images/unit-v2/T01.png', width: 1080, height: 1440 };
  const fixture = { comparisons: [{ previews: [comparison] }, { previews: [] }], accepted: [{ preview: accepted }], items: [{ id: 'T01' }, { id: 'T06' }] };
  const calls = [];
  const state = {
    policy: CSP, background: 'rgb(245, 244, 238)', css: ['file:///repo/docs/gallery/gallery.css'],
    scripts: [{ src: 'file:///repo/docs/gallery/gallery.js', type: '' }], panelHidden: false,
    visible: ['T06', 'T01'], pendingImages: 0,
    images: galleryImages(fixture).map(preview => ({ source: `file:///repo/${preview.path}`, width: preview.width, height: preview.height, complete: true }))
  };
  const page = {
    locator(selector) {
      assert.equal(selector, '.accepted-card img, .comparison-grid img');
      return { count: async () => state.images.length, nth: index => ({
        scrollIntoViewIfNeeded: async () => { calls.push(`scroll-${index}`); },
        evaluate: async callback => callback({ decode: async () => { calls.push(`decode-${index}`); } })
      }) };
    },
    evaluate: async () => structuredClone(state)
  };
  await inspectResources(page, fixture, { scriptEnabled: true, root: '/repo' });
  assert.deepEqual(calls, ['scroll-0', 'decode-0', 'scroll-1', 'decode-1']);
  state.images.reverse();
  await assert.rejects(inspectResources(page, fixture, { scriptEnabled: true, root: '/repo' }), /accepted preview path/);
  state.images.reverse();
  state.images[0].source += '?stale=1';
  await assert.rejects(inspectResources(page, fixture, { scriptEnabled: true, root: '/repo' }), /accepted preview path/);
  state.images[0].source = `file:///repo/${comparison.path}`;
  state.panelHidden = true;
  await inspectResources(page, fixture, { scriptEnabled: false, root: '/repo' });
});
