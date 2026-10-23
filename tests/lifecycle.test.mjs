import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseOptions, exportCards } from '../scripts/render.mjs';
import { openRenderer, closeBrowser } from '../scripts/browser.mjs';

async function workspace(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'md2card-lifecycle-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'input.md');
  await writeFile(input, '# test');
  const options = parseOptions([input, '--out', path.join(dir, 'output'), '--format', 'html', '--timeout-ms', '1000']);
  return { dir, options };
}

function rendererFixture({ close = async () => {}, version = () => 'stub' } = {}) {
  let closeCalls = 0;
  const renderer = {
    browser: {
      close: async () => { closeCalls += 1; await close(); },
      version
    },
    page: {
      setDefaultTimeout() {},
      async setContent() {},
      async evaluate() {},
      locator: () => ({ evaluateAll: async () => [] }),
      async emulateMedia() {}
    },
    context: {}
  };
  return { renderer, closeCalls: () => closeCalls };
}

function dependencies(renderer, overrides = {}) {
  return {
    openRenderer: async () => renderer,
    inspectEnvironment: async () => ({ ok: true, checks: [], versions: {}, fonts: {} }),
    measureCards: async () => [{ index: 1, available: { width: 1, height: 1 }, used: { width: 0, height: 0 }, overflow: [] }],
    ...overrides
  };
}

async function assertNoOutputOrStaging(dir) {
  assert.deepEqual(await readdir(dir), ['input.md'], 'failed exports must leave neither published output nor .md2card staging directories');
}

test('renderer acquired after the deadline is closed exactly once', async t => {
  const { dir, options } = await workspace(t);
  const fixture = rendererFixture();
  let now = 0;

  await assert.rejects(() => exportCards(options, dependencies(fixture.renderer, {
    now: () => now,
    openRenderer: async () => {
      // Advance the injected clock instead of sleeping or launching Chromium.
      now = options.timeoutMs + 1;
      return fixture.renderer;
    }
  })), { code: 'RENDER_TIMEOUT' });

  assert.equal(fixture.closeCalls(), 1);
  await assertNoOutputOrStaging(dir);
});

test('primary render failure survives cleanup failure and staging is removed', async t => {
  const { dir, options } = await workspace(t);
  const primaryError = Object.assign(new Error('primary render failure'), { code: 'PRIMARY_RENDER_FAILED' });
  const cleanupError = new Error('browser close failure');
  let stagingAtFailure;
  const fixture = rendererFixture({
    close: async () => { throw cleanupError; },
    version: () => {
      stagingAtFailure = readdirSync(dir).filter(name => name.startsWith('.md2card-'));
      throw primaryError;
    }
  });

  await assert.rejects(() => exportCards(options, dependencies(fixture.renderer)), error => error === primaryError);

  assert.equal(stagingAtFailure.length, 1, 'the failure must occur after staging was created');
  assert.equal(fixture.closeCalls(), 1);
  await assertNoOutputOrStaging(dir);
});

test('read-only error details cannot mask the primary failure during cleanup', async t => {
  const { dir, options } = await workspace(t);
  const primaryError = Object.assign(new Error('primary render failure'), { code: 'PRIMARY_RENDER_FAILED' });
  const originalDetails = { diagnostic: 'preserve this value' };
  Object.defineProperty(primaryError, 'details', { value: originalDetails, writable: false });
  assert.equal(Object.isExtensible(primaryError), true, 'an extensible error can still have read-only details');
  const fixture = rendererFixture({
    close: async () => { throw new Error('browser close failure'); },
    version: () => { throw primaryError; }
  });

  await assert.rejects(() => exportCards(options, dependencies(fixture.renderer)), error => error === primaryError);

  assert.equal(primaryError.details, originalDetails);
  assert.equal(fixture.closeCalls(), 1);
  await assertNoOutputOrStaging(dir);
});

test('staging removal failure preserves the primary error and reports cleanup diagnostics', async t => {
  const { dir, options } = await workspace(t);
  const primaryError = Object.assign(new Error('primary render failure'), {
    code: 'PRIMARY_RENDER_FAILED', details: { diagnostic: 'original detail' }
  });
  const cleanupError = Object.assign(new Error('staging removal failure'), { code: 'REMOVE_FAILED' });
  const fixture = rendererFixture({ version: () => { throw primaryError; } });
  let removalCalls = 0;
  let staging;

  await assert.rejects(() => exportCards(options, dependencies(fixture.renderer, {
    rm: async (filename, options) => {
      removalCalls += 1;
      staging = filename;
      assert.deepEqual(options, { recursive: true, force: true });
      throw cleanupError;
    }
  })), error => error === primaryError);

  assert.equal(removalCalls, 1);
  assert.equal(fixture.closeCalls(), 1);
  assert.equal(primaryError.details.diagnostic, 'original detail');
  assert.deepEqual(primaryError.details.cleanupFailures, [{
    action: 'remove-staging', code: 'REMOVE_FAILED', message: 'staging removal failure'
  }]);
  assert.match(path.basename(staging), /^\.md2card-/);
  assert.deepEqual((await readdir(dir)).sort(), [path.basename(staging), 'input.md'].sort(), 'a failed removal must not publish output');
  // workspace() uses the real rm in t.after, independently of the injected failure.
});

test('artifact write failure survives cleanup failure and staging is removed', async t => {
  const { dir, options } = await workspace(t);
  const primaryError = Object.assign(new Error('artifact write failure'), { code: 'WRITE_FAILED' });
  const fixture = rendererFixture({ close: async () => { throw new Error('browser close failure'); } });
  let attemptedArtifact;

  await assert.rejects(() => exportCards(options, dependencies(fixture.renderer, {
    writeFile: async (filename, ...args) => {
      if (path.basename(filename) === 'cards.html') {
        attemptedArtifact = filename;
        throw primaryError;
      }
      return writeFile(filename, ...args);
    }
  })), error => error === primaryError);

  assert.match(path.basename(path.dirname(attemptedArtifact)), /^\.md2card-/);
  assert.equal(fixture.closeCalls(), 1);
  await assertNoOutputOrStaging(dir);
});

test('cleanup-only failure rejects before publishing and removes staging', async t => {
  const { dir, options } = await workspace(t);
  const fixture = rendererFixture({ close: async () => { throw new Error('browser close failure'); } });

  await assert.rejects(() => exportCards(options, dependencies(fixture.renderer)), { code: 'BROWSER_CLEANUP_FAILED' });

  assert.equal(fixture.closeCalls(), 1);
  await assertNoOutputOrStaging(dir);
});

test('context initialization failure is not masked by browser cleanup failure', async () => {
  const primaryError = Object.assign(new Error('context initialization failure'), { code: 'CONTEXT_FAILED' });
  const cleanupError = new Error('browser close failure');
  let closeCalls = 0;
  let contextCalls = 0;
  const browser = {
    async newContext() { contextCalls += 1; throw primaryError; },
    async close() { closeCalls += 1; throw cleanupError; }
  };
  const options = parseOptions(['input.md', '--format', 'html', '--timeout-ms', '1000']);

  await assert.rejects(() => openRenderer(options, {
    findBrowser: async () => '/stub/chromium',
    launch: async () => browser
  }), error => error === primaryError);

  assert.equal(contextCalls, 1);
  assert.equal(closeCalls, 1);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('context, route and page initialization share the startup deadline', { timeout: 3000 }, async () => {
  for (const stalledStep of ['context', 'route', 'page']) {
    const pending = deferred();
    const calls = [];
    let closeCalls = 0;
    const step = async name => { calls.push(name); if (name === stalledStep) await pending.promise; };
    const browser = {
      async newContext() {
        await step('context');
        return {
          async route() { await step('route'); },
          async newPage() { await step('page'); return {}; }
        };
      },
      async close() { closeCalls += 1; }
    };
    try {
      await assert.rejects(() => openRenderer({ width: 200, height: 200, scale: 1, timeoutMs: 30 }, {
        findBrowser: async () => '/stub/chromium', launch: async () => browser
      }), { code: 'RENDER_TIMEOUT' });
      assert.equal(closeCalls, 1);
    } finally {
      pending.resolve();
    }
    // Late completion cannot advance to another initialization operation.
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['context', 'route', 'page'].slice(0, ['context', 'route', 'page'].indexOf(stalledStep) + 1));
  }
});

test('initialization failure survives a close timeout and late close rejection', { timeout: 2000 }, async () => {
  const primaryError = Object.assign(new Error('initialization failed'), { code: 'CONTEXT_FAILED' });
  const pending = deferred();
  let closeCalls = 0;
  const browser = {
    async newContext() { throw primaryError; },
    close() { closeCalls += 1; return pending.promise; }
  };
  await assert.rejects(() => openRenderer({ width: 200, height: 200, scale: 1, timeoutMs: 30 }, {
    findBrowser: async () => '/stub/chromium', launch: async () => browser
  }), error => error === primaryError);
  assert.equal(closeCalls, 1);
  assert.equal(primaryError.details.cleanupFailures[0].code, 'BROWSER_CLEANUP_TIMEOUT');
  assert.match(primaryError.details.cleanupFailures[0].message, /could not be confirmed/);
  pending.reject(new Error('late close rejection'));
  await new Promise(resolve => setImmediate(resolve));
});

test('startup timeout also settles when Chromium shutdown cannot be confirmed', { timeout: 2000 }, async () => {
  const context = deferred(), closing = deferred();
  let closeCalls = 0;
  try {
    await assert.rejects(() => openRenderer({ width: 200, height: 200, scale: 1, timeoutMs: 30 }, {
      findBrowser: async () => '/stub/chromium',
      launch: async () => ({ newContext: () => context.promise, close: () => { closeCalls += 1; return closing.promise; } })
    }), error => {
      assert.equal(error.code, 'RENDER_TIMEOUT');
      assert.equal(error.details.cleanupFailures[0].code, 'BROWSER_CLEANUP_TIMEOUT');
      return true;
    });
    assert.equal(closeCalls, 1);
  } finally {
    context.reject(new Error('late context rejection'));
    closing.resolve();
  }
  await new Promise(resolve => setImmediate(resolve));
});

test('a pending browser close cannot block primary-error reporting or staging removal', { timeout: 2000 }, async t => {
  const { dir, options } = await workspace(t);
  const pending = deferred();
  t.after(() => pending.resolve());
  const primaryError = Object.assign(new Error('primary render failure'), { code: 'PRIMARY_RENDER_FAILED' });
  const fixture = rendererFixture({ close: () => pending.promise, version: () => { throw primaryError; } });
  await assert.rejects(() => exportCards({ ...options, timeoutMs: 100 }, dependencies(fixture.renderer)), error => error === primaryError);
  assert.equal(fixture.closeCalls(), 1);
  assert.equal(primaryError.details.cleanupFailures[0].code, 'BROWSER_CLEANUP_TIMEOUT');
  await assertNoOutputOrStaging(dir);
});

test('render deadline interrupts a pending browser evaluation even when close hangs', { timeout: 2000 }, async t => {
  const { dir, options } = await workspace(t);
  const evaluation = deferred(), closing = deferred();
  t.after(() => { evaluation.resolve(); closing.resolve(); });
  const fixture = rendererFixture({ close: () => closing.promise });
  fixture.renderer.page.evaluate = () => evaluation.promise;
  let measurements = 0;
  await assert.rejects(() => exportCards({ ...options, timeoutMs: 100 }, dependencies(fixture.renderer, {
    measureCards: async () => { measurements += 1; return [{ index: 1, overflow: [] }]; }
  })), error => {
    assert.equal(error.code, 'RENDER_TIMEOUT');
    assert.equal(error.details.cleanupFailures[0].code, 'BROWSER_CLEANUP_TIMEOUT');
    return true;
  });
  assert.equal(fixture.closeCalls(), 1);
  evaluation.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(measurements, 0, 'late browser completion must not resume export or publish output');
  await assertNoOutputOrStaging(dir);
});

test('a close timeout cannot publish an otherwise successful export', { timeout: 2000 }, async t => {
  const { dir, options } = await workspace(t);
  const closing = deferred();
  t.after(() => closing.resolve());
  const fixture = rendererFixture({ close: () => closing.promise });
  await assert.rejects(() => exportCards({ ...options, timeoutMs: 100 }, dependencies(fixture.renderer)), error => {
    assert.equal(error.code, 'RENDER_TIMEOUT');
    assert.equal(error.details.cleanupFailures[0].code, 'BROWSER_CLEANUP_TIMEOUT');
    return true;
  });
  assert.equal(fixture.closeCalls(), 1);
  closing.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await assertNoOutputOrStaging(dir);
});

test('successful browser cleanup and publication remain unchanged', async t => {
  const { dir, options } = await workspace(t);
  const fixture = rendererFixture();
  const manifest = await exportCards(options, dependencies(fixture.renderer));
  assert.equal(manifest.status, 'success');
  assert.equal(fixture.closeCalls(), 1);
  assert.deepEqual((await readdir(dir)).sort(), ['input.md', 'output']);
  assert.deepEqual((await readdir(options.out)).sort(), ['cards.html', 'manifest.json']);
  await closeBrowser({ close: async () => {} }, 30);
});
