import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseOptions, exportCards, LIMITS } from '../scripts/render.mjs';
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

for (const settlement of ['resolve', 'reject']) {
  test(`a stalled PDF respects the deadline and its late ${settlement} cannot write output`, { timeout: 2000 }, async t => {
    const { dir, options } = await workspace(t);
    const pdf = deferred(), closing = deferred();
    t.after(() => { pdf.resolve(Buffer.from('%PDF-late')); closing.resolve(); });
    const fixture = rendererFixture({ close: () => closing.promise });
    let pdfOptions, textReads = 0;
    const writes = [];
    fixture.renderer.page.pdf = async configuration => {
      pdfOptions = configuration;
      const bytes = await pdf.promise;
      // Match Playwright's path behavior: it writes after generation completes.
      if (configuration.path) {
        await writeFile(configuration.path, bytes);
      }
      return bytes;
    };
    fixture.renderer.page.locator = selector => selector === '.card-content'
      ? { allTextContents: async () => { textReads++; return ['test']; } }
      : { evaluateAll: async () => [] };
    await assert.rejects(() => exportCards({ ...options, formats: ['pdf'], timeoutMs: 100 }, dependencies(fixture.renderer, {
      writeFile: async (filename, ...args) => { writes.push(path.basename(filename)); return writeFile(filename, ...args); }
    })), error => {
      assert.equal(error.code, 'RENDER_TIMEOUT');
      assert.equal(error.details.cleanupFailures[0].code, 'BROWSER_CLEANUP_TIMEOUT');
      return true;
    });
    assert.ok(pdfOptions, 'the fixture must reach PDF generation');
    assert.equal('path' in pdfOptions, false, 'only the export owner may write PDF bytes');
    assert.equal('timeout' in pdfOptions, false, 'Playwright does not implement a PDF timeout');
    assert.equal(fixture.closeCalls(), 1);
    await assertNoOutputOrStaging(dir);
    if (settlement === 'resolve') pdf.resolve(Buffer.from('%PDF-late'));
    else pdf.reject(new Error('late PDF rejection'));
    closing.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(writes, [], 'late PDF settlement must not resume export writes');
    assert.equal(textReads, 0, 'late PDF settlement must not resume validation');
    await assertNoOutputOrStaging(dir);
  });
}

test('PDF bytes use the owned writer and preserve primary write failures', async t => {
  const { dir, options } = await workspace(t);
  const bytes = Buffer.from('%PDF-1.4\nunchanged binary bytes\x00\xff', 'latin1');
  const primaryError = Object.assign(new Error('PDF write failure'), { code: 'PDF_WRITE_FAILED' });
  const fixture = rendererFixture({ close: async () => { throw new Error('browser close failure'); } });
  fixture.renderer.page.pdf = async configuration => {
    assert.equal('path' in configuration, false);
    assert.equal('timeout' in configuration, false);
    return bytes;
  };
  let writes = 0;
  await assert.rejects(() => exportCards({ ...options, formats: ['pdf'] }, dependencies(fixture.renderer, {
    writeFile: async (filename, data) => {
      writes++;
      assert.equal(path.basename(filename), 'cards.pdf');
      assert.equal(data, bytes, 'PDF bytes must pass through without re-encoding');
      throw primaryError;
    }
  })), error => error === primaryError);
  assert.equal(writes, 1);
  assert.equal(fixture.closeCalls(), 1);
  assert.equal(primaryError.details.cleanupFailures[0].code, 'BROWSER_CLEANUP_FAILED');
  await assertNoOutputOrStaging(dir);
});

test('invalid PDF buffers fail before the owned writer or PDF tools run', async t => {
  const { dir, options } = await workspace(t);
  for (const invalid of [undefined, '%PDF-1.4', new Uint8Array([1, 2, 3]), Buffer.alloc(0), Buffer.from('not a PDF')]) {
    const fixture = rendererFixture();
    fixture.renderer.page.pdf = async () => invalid;
    await assert.rejects(() => exportCards({ ...options, formats: ['pdf'] }, dependencies(fixture.renderer, {
      writeFile: async () => assert.fail('an invalid PDF buffer must never be written')
    })), { code: 'PDF_FILE_INVALID' });
    assert.equal(fixture.closeCalls(), 1);
    await assertNoOutputOrStaging(dir);
  }
});

test('PDF bytes are checked against remaining output budget before writing', async t => {
  const { dir, options } = await workspace(t);
  const fixture = rendererFixture();
  const pdf = Buffer.from('%PDF-1.4');
  // Simulate the returned buffer's size without allocating 256 MiB in a unit test.
  Object.defineProperty(pdf, 'length', { value: LIMITS.outputBytes });
  fixture.renderer.page.pdf = async () => pdf;
  const writes = [];
  await assert.rejects(() => exportCards({ ...options, formats: ['html', 'pdf'] }, dependencies(fixture.renderer, {
    writeFile: async (filename, ...args) => {
      writes.push(path.basename(filename));
      assert.notEqual(path.basename(filename), 'cards.pdf', 'the PDF would exceed the budget after cards.html');
      return writeFile(filename, ...args);
    }
  })), { code: 'OUTPUT_BUDGET' });
  assert.deepEqual(writes, ['cards.html']);
  assert.equal(fixture.closeCalls(), 1);
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


test('template export and preview embed identical template CSS without a real browser', async t => {
  const { dir, options } = await workspace(t);
  await writeFile(options.input, '<!-- card: {"template":"T01"} -->\n# Title\n\nAn original lead.\n\n## Sidebar\n\nRead this.');
  const fixture = rendererFixture();
  const manifest = await exportCards({ ...options, preview: true }, dependencies(fixture.renderer));
  const cards = await readFile(path.join(options.out, 'cards.html'), 'utf8');
  const preview = await readFile(path.join(options.out, 'preview.html'), 'utf8');
  const templateCss = await readFile(new URL('../assets/templates.css', import.meta.url), 'utf8');
  assert.ok(cards.includes(templateCss));
  assert.ok(preview.includes(templateCss));
  assert.match(preview, /data-template="T01"/);
  assert.ok(manifest.styleSha256.templates);
  assert.equal(manifest.cards[0].template, 'T01');
  assert.equal(fixture.closeCalls(), 1);
});

test('CLI template conflicts reject before acquiring a renderer and never remove images', async t => {
  const { options } = await workspace(t);
  let called = false;
  const deps = { openRenderer: async () => { called = true; throw new Error('must not acquire'); } };
  await writeFile(options.input, '<!-- card: {"layout":"quote"} -->\n# Title');
  await assert.rejects(() => exportCards({ ...options, template: 'T01' }, deps), { code: 'TEMPLATE_LAYOUT_MISMATCH' });
  await writeFile(options.input, '<!-- card: {"template":"T05"} -->\n# Title');
  await assert.rejects(() => exportCards({ ...options, template: 'T01' }, deps), { code: 'TEMPLATE_CONFLICT' });
  assert.equal(called, false);
});

test('direct export rejects invalid footer modes before file access or renderer acquisition', async () => {
  for (const footerMode of ['', 'none', 'Poster', 'report" onclick="bad', null, false, 3, {}]) {
    await assert.rejects(() => exportCards({ footerMode }, {
      openRenderer: async () => assert.fail('invalid footer mode must reject before launch')
    }), { code: 'INVALID_OPTIONS' });
  }
});

test('default export records legacy and emits the same HTML as explicit legacy', async t => {
  const { dir, options } = await workspace(t);
  const fixture = rendererFixture();
  const implicit = { ...options };
  delete implicit.footerMode;
  const manifest = await exportCards(implicit, dependencies(fixture.renderer));
  assert.equal(manifest.footerMode, 'legacy');
  const explicit = { ...options, footerMode: 'legacy', out: path.join(dir, 'explicit') };
  const secondFixture = rendererFixture();
  const secondManifest = await exportCards(explicit, dependencies(secondFixture.renderer));
  assert.equal(secondManifest.footerMode, 'legacy');
  assert.equal(await readFile(path.join(options.out, 'cards.html'), 'utf8'), await readFile(path.join(explicit.out, 'cards.html'), 'utf8'));
  assert.equal(fixture.closeCalls(), 1);
  assert.equal(secondFixture.closeCalls(), 1);
});

test('all footer modes export retained attribution and caveats in manual and measured auto paths', async t => {
  for (const footerMode of ['legacy', 'poster', 'series', 'report']) for (const paginate of ['manual', 'auto']) {
    await t.test(`${footerMode} / ${paginate}`, async subtest => {
      const { dir, options } = await workspace(subtest);
      const body = '# Original title\n\nBODY_ONE.\n\nSource: original paper <2026> & limitations.\n\nAI-assisted illustration; sample data, not a factual claim.';
      const metadata = '<!-- card: {"source":"Metadata source <paper> & author; verify facts."} -->\n';
      const source = (paginate === 'manual' ? metadata : '') + body;
      const footer = 'Footer <caveat> & AI notice: independently verify facts.';
      const brandFile = path.join(dir, 'brand.json');
      await writeFile(path.join(dir, 'logo.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
      await writeFile(brandFile, JSON.stringify({ name: 'Author <team> & company', logo: 'logo.png' }));
      await writeFile(options.input, source);
      const fixture = rendererFixture();
      let content = '', media = 'screen';
      const loads = [], measurements = [];
      fixture.renderer.page.setContent = async html => { content = html; loads.push(html); };
      fixture.renderer.page.emulateMedia = async value => { media = value.media; };
      const result = await exportCards({ ...options, footerMode, paginate, footer, brandFile, preview: true }, dependencies(fixture.renderer, {
        measureCards: async () => {
          measurements.push({ media, content });
          return [...content.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((match, index) => {
            const paragraphs = (match[0].match(/<p>/g) || []).length;
            return { index: index + 1, available: { width: 500, height: 500 }, used: { width: 500, height: 500 }, occupied: { height: 100 * paragraphs },
              overflow: paginate === 'auto' && paragraphs > 2 ? ['content-height'] : [] };
          });
        }
      }));
      assert.equal(result.footerMode, footerMode);
      assert.equal(result.pagination.mode, paginate);
      assert.equal(result.qa.visualReview, 'not-performed');
      assert.equal(result.cardCount, paginate === 'auto' ? 2 : 1);
      assert.equal(result.assetUsage.occurrences, result.cardCount, 'brand logo must remain on every card');
      assert.equal(fixture.closeCalls(), 1);
      assert.equal(JSON.parse(await readFile(path.join(options.out, 'manifest.json'), 'utf8')).footerMode, footerMode);
      assert.deepEqual(measurements.slice(-2).map(item => item.media), ['screen', 'print']);
      assert.equal(measurements.at(-2).content, loads.at(-1));
      assert.equal(measurements.at(-1).content, loads.at(-1));
      if (paginate === 'auto') {
        assert.ok(loads.length > 1);
        for (const probe of loads.slice(0, -1)) {
          assert.match(probe, /class="card-index">200 \/ 200/);
          assert.match(probe, /class="footer-text">Footer &lt;caveat&gt; &amp; AI notice: independently verify facts\./);
          assert.match(probe, /class="brand-logo"/);
        }
        assert.equal(result.pagination.validation.status, 'pass');
      }
      for (const filename of ['cards.html', 'preview.html']) {
        const html = await readFile(path.join(options.out, filename), 'utf8');
        const articles = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map(match => match[0]);
        assert.equal(articles.length, result.cardCount);
        assert.equal(html.split('Source: original paper &lt;2026&gt; &amp; limitations.').length - 1, 1);
        assert.equal(html.split('AI-assisted illustration; sample data, not a factual claim.').length - 1, 1);
        assert.equal(html.split('BODY_ONE.').length - 1, 1);
        if (paginate === 'manual') assert.match(html, /class="card-source">Metadata source &lt;paper&gt; &amp; author; verify facts\.<\/p>/);
        assert.doesNotMatch(html, /class="card-index">200 \/ 200/);
        for (const [index, article] of articles.entries()) {
          assert.match(article, /class="footer-text">Footer &lt;caveat&gt; &amp; AI notice: independently verify facts\.<\/span>/);
          assert.match(article, /class="brand-name">Author &lt;team&gt; &amp; company<\/span>/);
          assert.match(article, /class="brand-logo"/);
          if (footerMode === 'poster' && result.cardCount === 1) assert.doesNotMatch(article, /class="card-index"/);
          else {
            const expected = footerMode === 'series' ? `${String(index + 1).padStart(2, '0')} / ${String(result.cardCount).padStart(2, '0')}` : `${index + 1} / ${result.cardCount}`;
            assert.ok(article.includes(`<span class="card-index">${expected}</span>`));
          }
        }
      }
      assert.equal(await readFile(options.input, 'utf8'), source);
    });
  }
});

test('poster auto keeps widest probes even when the final deck is one card', async t => {
  const { options } = await workspace(t);
  await writeFile(options.input, '# One card\n\nSource and AI caveat remain here.');
  const fixture = rendererFixture();
  const loads = [];
  fixture.renderer.page.setContent = async html => { loads.push(html); };
  const result = await exportCards({ ...options, paginate: 'auto', footerMode: 'poster', footer: 'Retain this caveat.' }, dependencies(fixture.renderer));
  assert.equal(result.cardCount, 1);
  assert.ok(loads.length > 1);
  for (const probe of loads.slice(0, -1)) assert.match(probe, /class="card-index">200 \/ 200/);
  assert.doesNotMatch(loads.at(-1), /class="card-index"/);
  assert.match(loads.at(-1), /class="footer-text">Retain this caveat\./);
  assert.match(loads.at(-1), /Source and AI caveat remain here\./);
});

test('footer modes never strip unsupported auto metadata to make input render', async t => {
  const { options } = await workspace(t);
  await writeFile(options.input, '<!-- card: {"source":"Original attribution; do not remove."} -->\n# Title\n\nBody.');
  for (const footerMode of ['legacy', 'poster', 'series', 'report']) {
    await assert.rejects(() => exportCards({ ...options, paginate: 'auto', footerMode }, {
      openRenderer: async () => assert.fail('unsupported source metadata must reject before launch')
    }), { code: 'PAGINATION_UNSUPPORTED_METADATA' });
  }
});

test('opt-in footer modes still reject final print overflow rather than publish clipped output', async t => {
  for (const footerMode of ['poster', 'series', 'report']) await t.test(footerMode, async subtest => {
    const { options } = await workspace(subtest);
    const fixture = rendererFixture();
    let media;
    fixture.renderer.page.emulateMedia = async value => { media = value.media; };
    await assert.rejects(() => exportCards({ ...options, footerMode, footer: 'Must not be hidden to fit.' }, dependencies(fixture.renderer, {
      measureCards: async () => [{ index: 1, available: { width: 1, height: 1 }, used: { width: 1, height: 1 }, overflow: media === 'print' ? ['footer'] : [] }]
    })), { code: 'CONTENT_OVERFLOW' });
    assert.deepEqual(await readdir(options.out), ['overflow.json']);
    assert.equal(fixture.closeCalls(), 1);
  });
});
