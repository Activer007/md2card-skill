import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { TEMPLATES } from '../scripts/templates.mjs';
import { ROOT, CSP, GALLERY_PATH, buildGalleryModel, renderGallery, generateGallery, validateRepoPath, escapeHtml } from '../scripts/build-template-gallery.mjs';

const model = await buildGalleryModel();
const html = renderGallery(model);
const script = await readFile(new URL('../docs/gallery/gallery.js', import.meta.url), 'utf8');
const previewCount = value => value.accepted.length + (value.variantEvidence?.entries ?? []).reduce((sum, entry) => sum + entry.views.length, 0) + value.comparisons.reduce((sum, group) => sum + group.previews.length, 0);
const css = await readFile(new URL('../docs/gallery/gallery.css', import.meta.url), 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t, { root: sourceRoot = ROOT, templates = TEMPLATES } = {}) {
  // Validate before copying. Discover every current and historical epoch from the
  // actual evidence graph, including preview directories added by later reviews.
  const sourceModel = await buildGalleryModel({ root: sourceRoot, templates });
  const bindings = JSON.parse(await readFile(path.join(sourceRoot, 'docs/template-gallery-evidence.json'), 'utf8'));
  const files = new Set(['docs/template-gallery-evidence.json', 'docs/TEMPLATE_ASPECTS.md', 'docs/TEMPLATE_GALLERY.md', 'docs/gallery-comparisons.json', 'examples/refinement', 'docs/gallery', 'examples/templates']);
  for (const group of sourceModel.comparisons) for (const file of group.evidenceFiles ?? []) files.add(file);
  for (const file of sourceModel.variantEvidence.evidenceFiles) files.add(file);
  for (const file of sourceModel.aspectEvidence.evidenceFiles) files.add(file);
  for (const batch of bindings.batches) {
    files.add(batch.review);
    files.add(batch.evidence);
  }
  for (const item of sourceModel.items) {
    if (item.preview) files.add(item.preview.path);
    for (const history of item.histories) files.add(history.previewPath);
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'md2card-gallery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relative of files) {
    validateRepoPath(relative);
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(sourceRoot, relative), destination, { recursive: true });
  }
  return root;
}
async function syntheticPending(t, source = {}) {
  const root = await fixture(t, source);
  const sourceTemplates = source.templates ?? TEMPLATES;
  const currentBatches = new Set(sourceTemplates.flatMap(item => item.acceptance === undefined ? [] : [item.acceptance]));
  const historicalBatches = new Set(sourceTemplates.flatMap(item => [
    ...(item.historicalAcceptance === undefined ? [] : [item.historicalAcceptance]),
    ...(item.historicalAcceptances ?? [])
  ]).map(history => history.batch));
  // M2's current batches are separate from v1/M1 v2 history. Fail explicitly if
  // that contract changes rather than silently deleting any historical epoch.
  for (const batch of currentBatches) assert.ok(!historicalBatches.has(batch), `cannot discard historical batch: ${batch}`);
  await editJson(root, 'docs/template-gallery-evidence.json', data => {
    data.batches = data.batches.filter(batch => !currentBatches.has(batch.id));
  });
  const templates = structuredClone(sourceTemplates).map(item => {
    const { acceptance, ...pending } = item;
    const { acceptance: portraitAcceptance, ...portrait } = item.aspectLayouts.portrait;
    return { ...pending, status: 'implemented-awaiting-visual-review', aspectLayouts: {
      ...item.aspectLayouts, portrait: { ...portrait, status: 'implemented-awaiting-visual-review' }
    } };
  });
  // This still runs the production path/hash/orphan checks; only the disposable
  // fixture's current bindings and registry state have been normalized.
  const pending = await buildGalleryModel({ root, templates });
  assert.equal(pending.accepted.length, 0);
  assert.equal(pending.pending.length, sourceTemplates.length);
  return { root, templates };
}
async function editJson(root, relative, edit) {
  const target = path.join(root, relative);
  const data = JSON.parse(await readFile(target, 'utf8'));
  edit(data);
  await writeFile(target, JSON.stringify(data, null, 2) + '\n');
}
async function refreshEvidenceBinding(root) {
  const hash = sha(await readFile(path.join(root, 'docs/template-m1-provenance.json')));
  await editJson(root, 'docs/template-gallery-evidence.json', data => { data.batches[0].evidenceSha256 = hash; });
}

// Minimal DOM deliberately throws on HTML sinks. No browser or network dependency.
function mockDom({ incomplete = false, items = model.items } = {}) {
  const element = (initial = {}) => {
    const listeners = new Map();
    const node = { value: '', hidden: false, textContent: '', ...initial,
      addEventListener(type, listener) { listeners.set(type, listener); },
      fire(type) { listeners.get(type)?.(); }
    };
    for (const key of ['innerHTML', 'outerHTML']) Object.defineProperty(node, key, { set() { throw new Error('HTML injection sink used'); } });
    return node;
  };
  const ids = Object.fromEntries(['filter-result', 'family-filter', 'purpose-filter', 'image-filter', 'density-filter', 'reset-filters'].map(id => [id, element()]));
  const panel = element({ hidden: true });
  const acceptedEmpty = element({ hidden: true });
  const pendingEmpty = element({ hidden: true });
  const cards = items.map(item => element({ dataset: { family: item.family, purpose: `${item.id} ${item.name} ${item.purpose}`, image: item.image, density: item.density, status: item.preview ? 'accepted' : 'pending' }, id: item.id }));
  const selectors = { '[data-filter-panel]': panel, '[data-empty="accepted"]': acceptedEmpty, '[data-empty="pending"]': pendingEmpty };
  const routeLinks = cards.map(card => element({ dataset: { templateTarget: card.id } }));
  const document = {
    getElementById(id) { return incomplete && id === 'family-filter' ? null : ids[id]; },
    querySelector(selector) { return selectors[selector]; },
    querySelectorAll(selector) { if (selector === '[data-template-target]') return routeLinks; assert.equal(selector, '[data-template-card]'); return cards; }
  };
  runInNewContext(script, { document });
  return { ids, panel, cards, acceptedEmpty, pendingEmpty, routeLinks,
    set(id, value, event = 'change') { ids[id].value = value; ids[id].fire(event); },
    visible() { return cards.filter(card => !card.hidden).map(card => card.id); },
    reset() { ids['reset-filters'].fire('click'); }
  };
}

test('registry-derived counts distinguish implemented from visually accepted', () => {
  assert.equal(model.items.length, TEMPLATES.length);
  assert.ok(model.items.length >= model.accepted.length);
  assert.equal(model.accepted.length, TEMPLATES.filter(item => item.acceptance).length);
  assert.deepEqual(model.accepted.map(item => item.id), TEMPLATES.filter(item => item.acceptance).map(item => item.id).sort());
  assert.equal(model.pending.length, model.items.length - model.accepted.length);
  assert.equal(model.families.length, 12);
  assert.equal(model.accepted.length + model.pending.length, model.items.length);
  for (const item of model.pending) assert.equal(item.preview, null);
});

test('build order and HTML are deterministic across registry iteration order', async () => {
  const reversed = await buildGalleryModel({ templates: [...TEMPLATES].reverse() });
  assert.equal(renderGallery(reversed), html);
  assert.deepEqual(model.items.map(item => item.id), model.items.map(item => item.id).sort());
  assert.equal(renderGallery(model), html);
  assert.doesNotMatch(html, /generatedAt|Date\(/);
});

test('any currently bound previews preserve their exact provenance, input hashes and dimensions', async () => {
  for (const item of model.accepted) {
    const evidence = JSON.parse(await readFile(path.join(ROOT, item.evidence.path), 'utf8'));
    const record = evidence.records.find(entry => entry.id === item.id);
    assert.equal(item.preview.sha256, record.png);
    assert.equal(item.inputSha256, record.input);
    assert.equal(sha(await readFile(path.join(ROOT, item.preview.path))), record.png);
    if (item.preview) assert.equal(item.preview.width, 1080);
    if (item.preview) assert.equal(item.preview.height, 1440);
    assert.equal(item.evidence.codeCommit, evidence.codeCommit);
    assert.ok(html.includes(item.preview.sha256));
    assert.ok(html.includes(item.command));
  }
});

test('script-disabled page has every article, input link, detail and real preview', () => {
  assert.equal((html.match(/data-template-card/g) ?? []).length, model.items.length);
  assert.equal((html.match(/<details class="detail">/g) ?? []).length, model.items.length);
  assert.equal((html.match(/<img /g) ?? []).length, previewCount(model));
  for (const item of model.items) {
    const article = html.match(new RegExp(`<article id="${item.id}"[\\s\\S]*?</article>`))[0];
    assert.doesNotMatch(article.split('>')[0], /\bhidden\b/);
    assert.ok(article.includes(`href="../../${item.example}"`));
    assert.ok(article.includes(escapeHtml(item.unsuitable)));
    if (!item.preview) assert.doesNotMatch(article, /<img|preview-link|<canvas|<svg/);
  }
  assert.match(html, /<noscript>/);
  assert.match(html, /data-filter-panel hidden/);
  assert.match(html, /id="purpose-filter"/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /class="skip-link" href="#main"/);
});

test('all resource and document URLs are local with restrictive gallery-only CSP', async () => {
  assert.match(CSP, /default-src 'none'/);
  for (const directive of ['connect-src', 'font-src', 'object-src', 'base-uri', 'form-action']) assert.ok(CSP.includes(`${directive} 'none'`));
  assert.doesNotMatch(CSP, /unsafe-inline|unsafe-eval|https:|data:|\*/);
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.match(url, /^(?:#(?:[A-Za-z0-9-]+)|(?:\.\.\/)*[A-Za-z0-9_./-]+)$/);
    if (!url.startsWith('#')) await readFile(path.resolve(ROOT, 'docs/gallery', url));
  }
  assert.doesNotMatch(html, /<script(?! src=)|\son[a-z]+\s*=|\sstyle=|<iframe|<object|<form/);
  assert.doesNotMatch(css, /url\s*\(|@import|@font-face/);
  assert.doesNotMatch(script, /\bfetch\b|XMLHttpRequest|WebSocket|sendBeacon|innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function|localStorage|sessionStorage|serviceWorker/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /focus-visible/);
  assert.match(css, /forced-colors/);
  assert.doesNotMatch(css, /object-fit:\s*cover/);
});

test('all registry display fields are escaped in text and attribute contexts', async () => {
  const payload = `\"><img src=x onerror=alert(1)><script>alert(1)</script>&'`;
  const poisoned = TEMPLATES.map(item => ({ ...item, name: payload, purpose: payload, structure: payload, unsuitable: payload, provenance: { design: payload, text: payload, assets: payload } }));
  const safe = renderGallery(await buildGalleryModel({ templates: poisoned }));
  assert.ok(safe.includes(escapeHtml(payload)));
  assert.doesNotMatch(safe, /<img src=x|<script>alert|onerror=alert\(1\)>/);
  assert.equal((safe.match(/<img /g) ?? []).length, previewCount(model));
  assert.equal((safe.match(/<script /g) ?? []).length, 1);
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
});

test('path allowlist rejects URLs, traversal, escapes and injection', () => {
  for (const value of ['../a', '/a', 'a/../b', 'a//b', './a', 'https://bad.test/a', '//host/a', 'file:a', 'javascript:alert(1)', 'a?x', 'a#x', 'a%2fb', 'a\\b', 'a" onclick="x', 'a\u0000b']) assert.throws(() => validateRepoPath(value), /unsafe repository path/);
  assert.equal(validateRepoPath('docs/images/templates/T01.png'), 'docs/images/templates/T01.png');
});

test('accepted files missing or modified fail before producing a result', async t => {
  const root = await fixture(t);
  const image = path.join(root, 'docs/images/templates/T01.png');
  await writeFile(image, Buffer.from('not the recorded PNG'));
  await assert.rejects(buildGalleryModel({ root }), /PNG hash mismatch/);
  await rm(image);
  await assert.rejects(buildGalleryModel({ root }), /missing repository file/);
});

test('accepted input modification fails even if metadata still matches', async t => {
  const root = await fixture(t);
  const input = path.join(root, 'examples/templates/T05.md');
  await writeFile(input, `${await readFile(input, 'utf8')}\nUnexpected edit.\n`);
  await assert.rejects(buildGalleryModel({ root }), /accepted input hash mismatch/);
});

test('missing and modified evidence or review files fail closed', async t => {
  const root = await fixture(t);
  const evidence = path.join(root, 'docs/template-m1-provenance.json');
  const bytes = await readFile(evidence);
  await writeFile(evidence, `${bytes.toString('utf8')}\n`);
  await assert.rejects(buildGalleryModel({ root }), /evidence\/review file hash mismatch/);
  await writeFile(evidence, bytes);
  await writeFile(path.join(root, 'docs/TEMPLATE_ACCEPTANCE.md'), 'A claim is not acceptance evidence.');
  await assert.rejects(buildGalleryModel({ root }), /evidence\/review file hash mismatch/);
  await rm(evidence);
  await assert.rejects(buildGalleryModel({ root }), /missing repository file/);
});

test('bad evidence hash, duplicate and missing records are explicit failures', async t => {
  const root = await fixture(t);
  await editJson(root, 'docs/template-m1-provenance.json', data => { data.records[0].png = 'invalid'; });
  await refreshEvidenceBinding(root);
  await assert.rejects(buildGalleryModel({ root }), /invalid or duplicate provenance record/);
  await cp(path.join(ROOT, 'docs/template-m1-provenance.json'), path.join(root, 'docs/template-m1-provenance.json'));
  await editJson(root, 'docs/template-m1-provenance.json', data => { data.records.push(data.records[0]); });
  await refreshEvidenceBinding(root);
  await assert.rejects(buildGalleryModel({ root }), /invalid or duplicate provenance record/);
  await cp(path.join(ROOT, 'docs/template-m1-provenance.json'), path.join(root, 'docs/template-m1-provenance.json'));
  await editJson(root, 'docs/template-m1-provenance.json', data => { data.records = data.records.filter(record => record.id !== 'T01'); });
  await refreshEvidenceBinding(root);
  await assert.rejects(buildGalleryModel({ root }), /missing record/);
});

test('version, state and density changes cannot reuse historical acceptance', async t => {
  const { root, templates: pending } = await syntheticPending(t);
  for (const changes of [{ version: 1 }, { density: 'compact' }, { status: 'visually-reviewed' }, { acceptance: 'missing-batch' }]) {
    const templates = pending.map(item => item.id === 'T01' ? { ...item, ...changes } : item);
    await assert.rejects(buildGalleryModel({ root, templates }), /scope differs|metadata disagrees|missing acceptance binding|wrong status|invalid historical acceptance|unrecognized pending status/);
  }
  await assert.rejects(buildGalleryModel({ root, templates: pending.filter(item => item.id !== 'T01') }), /orphaned acceptance record/);
});

test('invalid and duplicate template IDs and mismatched input paths are rejected', async () => {
  await assert.rejects(buildGalleryModel({ templates: [...TEMPLATES, TEMPLATES[0]] }), /duplicate template ID/);
  for (const changes of [{ id: 'T01" onclick=x' }, { example: 'examples/templates/T05.md' }, { image: '__proto__' }]) await assert.rejects(buildGalleryModel({ templates: TEMPLATES.map((item, i) => i === 0 ? { ...item, ...changes } : item) }), /invalid|does not match/);
});

test('symlink escapes and broken output symlinks cannot read or write outside root', async t => {
  const root = await fixture(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'md2card-gallery-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const input = path.join(root, 'examples/templates/T01.md');
  await cp(input, path.join(outside, 'input.md'));
  await rm(input);
  await symlink(path.join(outside, 'input.md'), input);
  await assert.rejects(buildGalleryModel({ root }), /escapes repository/);
  await rm(input);
  await cp(path.join(ROOT, 'examples/templates/T01.md'), input);
  await rm(path.join(root, GALLERY_PATH));
  await symlink(path.join(outside, 'missing.html'), path.join(root, GALLERY_PATH));
  await assert.rejects(generateGallery({ root }), /output file is a symlink/);
  await assert.rejects(readFile(path.join(outside, 'missing.html')), { code: 'ENOENT' });
});

test('generated check rejects stale output and build repairs only the generated file', async t => {
  const root = await fixture(t);
  // Exercise generation/checking in the disposable fixture. gallery:check remains
  // the separate gate for the committed generated page after source integration.
  await generateGallery({ root });
  assert.equal((await generateGallery({ root, check: true })).accepted, model.accepted.length);
  await writeFile(path.join(root, GALLERY_PATH), 'stale');
  await assert.rejects(generateGallery({ root, check: true }), /gallery is stale/);
  await generateGallery({ root });
  assert.equal(await readFile(path.join(root, GALLERY_PATH), 'utf8'), html);
  await generateGallery({ root, check: true });
});

test('mock DOM progressively enables controls without hiding default results', () => {
  const dom = mockDom();
  assert.equal(dom.panel.hidden, false);
  assert.equal(dom.visible().length, model.items.length);
  assert.equal(dom.ids['filter-result'].textContent, `显示 ${model.accepted.length} 个已验收示例，${model.pending.length} 个待验收候选。`);
  assert.equal(dom.acceptedEmpty.hidden, model.accepted.length > 0);
  assert.equal(dom.pendingEmpty.hidden, model.pending.length > 0);
  const incomplete = mockDom({ incomplete: true });
  assert.equal(incomplete.panel.hidden, true);
  assert.equal(incomplete.visible().length, model.items.length);
});

test('all family and image filters produce exact registry counts', () => {
  const dom = mockDom();
  for (const family of model.families) {
    dom.reset(); dom.set('family-filter', family.value);
    assert.deepEqual(dom.visible(), model.items.filter(item => item.family === family.value).map(item => item.id));
  }
  for (const image of ['none', 'required', 'inline']) {
    dom.reset(); dom.set('image-filter', image);
    assert.deepEqual(dom.visible(), model.items.filter(item => item.image === image).map(item => item.id));
  }
});

test('purpose filter uses literal normalized strings, not regex or HTML', () => {
  const dom = mockDom();
  dom.set('purpose-filter', '　ｔ０１　', 'input');
  assert.deepEqual(dom.visible(), ['T01']);
  dom.set('purpose-filter', '阅读', 'input');
  assert.deepEqual(dom.visible(), model.items.filter(item => `${item.id} ${item.name} ${item.purpose}`.includes('阅读')).map(item => item.id));
  for (const value of ['.*', '<script>alert(1)</script>', '"><img src=x>']) {
    dom.set('purpose-filter', value, 'input');
    assert.deepEqual(dom.visible(), []);
    assert.equal(dom.ids['filter-result'].textContent, '显示 0 个已验收示例，0 个待验收候选。');
  }
});

test('density filtering cannot claim unreviewed variants have accepted previews', () => {
  const dom = mockDom();
  for (const value of ['compact', 'editorial']) {
    dom.set('density-filter', value);
    assert.deepEqual(dom.visible(), []);
    assert.equal(dom.acceptedEmpty.hidden, false);
    assert.equal(dom.pendingEmpty.hidden, false);
  }
  dom.set('density-filter', 'standard');
  assert.equal(dom.visible().length, model.items.length);
});

test('combined filters, repeated events and reset preserve correct counts', () => {
  const dom = mockDom();
  dom.set('family-filter', 'film');
  dom.set('image-filter', 'inline');
  dom.set('density-filter', 'standard');
  dom.set('purpose-filter', 'T38', 'input');
  assert.deepEqual(dom.visible(), ['T38']);
  assert.equal(dom.ids['filter-result'].textContent, model.items.find(item => item.id === 'T38').preview ? '显示 1 个已验收示例，0 个待验收候选。' : '显示 0 个已验收示例，1 个待验收候选。');
  dom.set('family-filter', 'film');
  assert.deepEqual(dom.visible(), ['T38']);
  dom.set('image-filter', 'none');
  assert.deepEqual(dom.visible(), []);
  dom.reset(); dom.reset();
  assert.equal(dom.visible().length, model.items.length);
  for (const id of ['family-filter', 'image-filter', 'density-filter', 'purpose-filter']) assert.equal(dom.ids[id].value, '');
  assert.equal(dom.ids['filter-result'].textContent, `显示 ${model.accepted.length} 个已验收示例，${model.pending.length} 个待验收候选。`);
});

test('wrong PNG dimensions still fail if its recorded digest was updated', async t => {
  const root = await fixture(t);
  const preview = path.join(root, 'docs/images/templates/T01.png');
  const bytes = await readFile(preview);
  bytes.writeUInt32BE(100, 16);
  await writeFile(preview, bytes);
  await editJson(root, 'docs/template-m1-provenance.json', data => { data.records.find(record => record.id === 'T01').png = sha(bytes); });
  await refreshEvidenceBinding(root);
  await assert.rejects(buildGalleryModel({ root }), /PNG dimensions or signature mismatch/);
});

test('evidence bindings cannot omit pinned hashes or smuggle a remote path', async t => {
  const root = await fixture(t);
  await editJson(root, 'docs/template-gallery-evidence.json', data => { delete data.batches[0].evidenceSha256; });
  await assert.rejects(buildGalleryModel({ root }), /evidence\/review file hash mismatch/);
  await editJson(root, 'docs/template-gallery-evidence.json', data => { data.batches[0].evidence = 'https://example.test/evidence.json'; });
  await assert.rejects(buildGalleryModel({ root }), /unsafe repository path/);
});


test('aspect support is shown without promoting extra layouts or reusing portrait pixels', async t => {
  const { root, templates } = await syntheticPending(t);
  const model = await buildGalleryModel({ root, templates });
  for(const id of ['T04','T21']) {
    const item=model.items.find(item=>item.id===id);
    assert.deepEqual(item.aspects,id==='T21'?['portrait','square','slide','wechat-wide']:['portrait','square','slide']);
    assert.equal(item.preview,null);
    assert.equal(item.history.version,1);
    for(const aspect of ['square','slide']) assert.equal(item.aspectLayouts[aspect].status,'implemented-awaiting-visual-review');
  }
  const html=renderGallery(model);
  assert.match(html,/portrait \/ square \/ slide；支持不等于已验收/);
  const bad=templates.map(item=>item.id==='T04'?{...item,aspects:['portrait','unknown']}:item);
  await assert.rejects(buildGalleryModel({root,templates:bad}),/invalid aspect contract/);
});

// A fully accepted registry must still exercise the candidate path, rather than
// let zero pending items make source/evidence separation vacuously pass.
test('a genuinely pending fixture keeps all source details but never inherits a preview', async t => {
  const { root, templates } = await syntheticAcceptedV2(t);
  const mixed = await buildGalleryModel({ root, templates });
  assert.deepEqual(mixed.accepted.map(item => item.id), ['T01']);
  assert.deepEqual(mixed.pending.map(item => item.id), templates.filter(item => item.id !== 'T01').map(item => item.id).sort());
  const pending = mixed.pending.find(item => item.id === 'T48');
  assert.equal(pending.preview, null);
  const article = renderGallery(mixed).match(/<article id="T48"[\s\S]*?<\/article>/)[0];
  assert.doesNotMatch(article, /<img|preview-link|<canvas|<svg/);
  assert.ok(article.includes(pending.example));
  assert.ok(article.includes(escapeHtml(pending.structure)));
  const dom = mockDom({ items: mixed.items });
  dom.set('purpose-filter', 'T48', 'input');
  assert.equal(dom.ids['filter-result'].textContent, '显示 0 个已验收示例，1 个待验收候选。');
});


test('refined versions keep immutable history without displaying old pixels as current', async t => {
  const { root, templates: pending } = await syntheticPending(t);
  const model = await buildGalleryModel({ root, templates: pending });
  const html = renderGallery(model);
  const changed = model.items.filter(item => item.historicalAcceptance);
  assert.ok(changed.length >= 13);
  for (const item of changed) {
    assert.equal(item.version, item.histories.length === 2 ? 3 : 2);
    assert.equal(item.history.version, 1);
    assert.equal(item.preview, null);
    assert.equal(item.status, 'implemented-awaiting-visual-review');
    assert.ok(html.includes(`v1 的 ${item.history.batch} 仅为旧设计证据，不证明当前 v${item.version}`));
  }
  const templates = pending.map(item => item.id === 'T06' ? { ...item, historicalAcceptance: { batch: 'visual-upgrade', version: 2 } } : item);
  await assert.rejects(buildGalleryModel({ root, templates }), /invalid historical acceptance/);
});


test('versioned preview directories require their actual review links, not obsolete pixels', async t => {
  const root = await fixture(t);
  await cp(path.join(root, 'docs/images/templates'), path.join(root, 'docs/images/templates-v2'), { recursive: true });
  await editJson(root, 'docs/template-gallery-evidence.json', data => { data.batches[0].previewDirectory = 'docs/images/templates-v2'; });
  await assert.rejects(buildGalleryModel({ root }), /review is missing exact preview/);
  const reviewPath = path.join(root, 'docs/TEMPLATE_ACCEPTANCE.md');
  const review = (await readFile(reviewPath, 'utf8')).replaceAll('(images/templates/', '(images/templates-v2/');
  await writeFile(reviewPath, review);
  await editJson(root, 'docs/template-gallery-evidence.json', data => { data.batches[0].reviewSha256 = sha(Buffer.from(review)); });
  const custom = await buildGalleryModel({ root });
  assert.equal(custom.items.find(item => item.id === 'T01').history.previewPath, 'docs/images/templates-v2/T01.png');
  await editJson(root, 'docs/template-gallery-evidence.json', data => { data.batches[0].previewDirectory = '../escape'; });
  await assert.rejects(buildGalleryModel({ root }), /unsafe repository path/);
});


async function addSyntheticEpoch(root, version, id = `unit-v${version}`, entries = [TEMPLATES.find(item => item.id === 'T01')], previewDirectory = `docs/images/${id}`) {
  await mkdir(path.join(root, previewDirectory), { recursive: true });
  const records = [];
  const links = [];
  for (const entry of entries) {
    const input = await readFile(path.join(root, entry.example));
    const png = await readFile(path.join(root, `docs/images/templates/${entry.id}.png`));
    const preview = `${previewDirectory}/${entry.id}.png`;
    await writeFile(path.join(root, preview), png);
    records.push({ id: entry.id, input: sha(input), png: sha(png), pdf: 'd'.repeat(64) });
    links.push(`[PNG](${path.posix.relative('docs', preview)}) [input](../${entry.example})`);
  }
  const evidence = { schemaVersion: 1, codeCommit: 'a'.repeat(40), codeTree: 'b'.repeat(40), archiveSha256: 'c'.repeat(64), records };
  const review = `SYNTHETIC UNIT FIXTURE ONLY: not production visual acceptance.\n## ${id}\n${evidence.codeCommit}\n${links.join('\n')}\n`;
  await writeFile(path.join(root, `docs/${id}-proof.json`), JSON.stringify(evidence));
  await writeFile(path.join(root, `docs/${id}-review.md`), review);
  await editJson(root, 'docs/template-gallery-evidence.json', data => data.batches.push({ id, previewDirectory, scope: { version, density: 'standard', aspect: 'portrait', width: 1080, height: 1440, pagination: 'manual' }, review: `docs/${id}-review.md`, reviewSha256: sha(Buffer.from(review)), evidence: `docs/${id}-proof.json`, evidenceSha256: sha(Buffer.from(JSON.stringify(evidence))) }));
}
async function syntheticAcceptedV2(t, source = {}) {
  const { root, templates: pending } = await syntheticPending(t, source);
  await addSyntheticEpoch(root, 2);
  const templates=pending.map(item=>item.id==='T01'?{...item,acceptance:'unit-v2',status:'visually-reviewed',aspectLayouts:{...item.aspectLayouts,portrait:{...item.aspectLayouts.portrait,acceptance:'unit-v2',status:'visually-reviewed'}}}:item);
  return {root,templates};
}
test('synthetic current-v2 acceptance exercises a nonempty accepted path beside 47 pending designs',async t=>{
  const {root,templates}=await syntheticAcceptedV2(t);
  const current=await buildGalleryModel({root,templates});
  assert.equal(current.accepted.length,1);assert.equal(current.pending.length,47);
  const item=current.accepted[0];assert.equal(item.version,2);assert.equal(item.preview.version,2);assert.equal(item.preview.path,'docs/images/unit-v2/T01.png');
  assert.equal(item.history.version,1);
  const output=renderGallery(current);assert.match(output,/src="\.\.\/\.\.\/docs\/images\/unit-v2\/T01.png"/);assert.equal((output.match(/<img /g)||[]).length,previewCount(current));
  const wrong=templates.map(t=>t.id==='T01'?{...t,version:3}:t);
  await assert.rejects(buildGalleryModel({root,templates:wrong}),/accepted scope differs/);
  await writeFile(path.join(root,'docs/images/unit-v2/T01.png'),'altered');
  await assert.rejects(buildGalleryModel({root,templates}),/accepted PNG hash mismatch/);
});
test('synthetic current-v2 acceptance rejects stale input and review links independently',async t=>{
  const {root,templates}=await syntheticAcceptedV2(t);
  const input=path.join(root,'examples/templates/T01.md');const original=await readFile(input);
  await writeFile(input,Buffer.concat([original,Buffer.from('\nUnreviewed text.\n')]));
  await assert.rejects(buildGalleryModel({root,templates}),/accepted input hash mismatch/);await writeFile(input,original);
  const reviewPath=path.join(root,'docs/unit-v2-review.md');const review=(await readFile(reviewPath,'utf8')).replace('images/unit-v2/','images/templates/');await writeFile(reviewPath,review);
  await editJson(root,'docs/template-gallery-evidence.json',data=>{data.batches.find(b=>b.id==='unit-v2').reviewSha256=sha(Buffer.from(review));});
  await assert.rejects(buildGalleryModel({root,templates}),/review is missing exact preview/);
});


test('exact task navigation reveals a filtered target without replacing native links',()=>{
 const dom=mockDom();dom.set('purpose-filter','T01','input');assert.deepEqual(dom.visible(),['T01']);
 dom.routeLinks.find(link=>link.dataset.templateTarget==='T04').fire('click');
 assert.equal(dom.visible().length,48);assert.equal(dom.ids['purpose-filter'].value,'');
 assert.match(html,/href="#T04" data-template-target="T04"/);
 assert.doesNotMatch(script,/preventDefault|innerHTML|outerHTML/);
});

async function syntheticV3(t, { accepted = false, ...source } = {}) {
  const { root, templates } = await syntheticAcceptedV2(t, source);
  if (accepted) await addSyntheticEpoch(root, 3);
  return { root, templates: templates.map(template => {
    if (template.id !== 'T01') return template;
    const { acceptance, ...pending } = template;
    const { acceptance: portraitAcceptance, ...portrait } = template.aspectLayouts.portrait;
    const current = accepted ? { acceptance: 'unit-v3', status: 'visually-reviewed' } : { status: 'implemented-awaiting-visual-review' };
    return { ...pending, ...current, version: 3, historicalAcceptances: [...(template.historicalAcceptances ?? []), { batch: 'unit-v2', version: 2 }], aspectLayouts: { ...template.aspectLayouts, portrait: { ...portrait, ...current, version: 3 } } };
  }) };
}
const changeT01 = (templates, changes) => templates.map(template => template.id === 'T01' ? { ...template, ...changes } : template);
async function refreshBatch(root, id, kind) {
  const file = kind === 'review' ? `docs/${id}-review.md` : `docs/${id}-proof.json`;
  const digest = sha(await readFile(path.join(root, file)));
  await editJson(root, 'docs/template-gallery-evidence.json', data => { data.batches.find(batch => batch.id === id)[`${kind}Sha256`] = digest; });
}

test('synthetic pending v3 retains both v1 and v2 with exact historical links but no thumbnail', async t => {
  const { root, templates } = await syntheticV3(t);
  const current = await buildGalleryModel({ root, templates });
  assert.equal(current.accepted.length, 0);
  assert.equal(current.pending.length, 48);
  const item = current.items.find(item => item.id === 'T01');
  assert.equal(item.preview, null);
  assert.equal(item.history, item.histories[0]);
  assert.deepEqual(item.histories.map(({ version, batch, previewPath }) => ({ version, batch, previewPath })), [
    { version: 1, batch: 'visual-m1', previewPath: 'docs/images/templates/T01.png' },
    { version: 2, batch: 'unit-v2', previewPath: 'docs/images/unit-v2/T01.png' }
  ]);
  const article = renderGallery(current).match(/<article id="T01"[\s\S]*?<\/article>/)[0];
  assert.doesNotMatch(article, /<img|preview-link|<canvas|<svg/);
  for (const history of item.histories) {
    assert.ok(article.includes(`v${history.version} 的 ${history.batch} 仅为旧设计证据，不证明当前 v3。`));
    for (const file of [history.previewPath, history.review, history.path]) assert.ok(article.includes(`href="../../${file}"`));
    assert.equal(sha(await readFile(path.join(root, history.previewPath))), history.previewSha256);
    assert.equal(sha(await readFile(path.join(root, history.path))), history.sha256);
  }
});

test('synthetic accepted v3 keeps all three epochs distinct and only displays current pixels', async t => {
  const { root, templates } = await syntheticV3(t, { accepted: true });
  const current = await buildGalleryModel({ root, templates });
  assert.equal(current.accepted.length, 1);
  assert.equal(current.pending.length, 47);
  const item = current.accepted[0];
  assert.equal(item.preview.version, 3);
  assert.equal(item.evidence.batch, 'unit-v3');
  assert.deepEqual(item.histories.map(history => history.version), [1, 2]);
  const article = renderGallery(current).match(/<article id="T01"[\s\S]*?<\/article>/)[0];
  assert.deepEqual([...article.matchAll(/<img src="([^"]+)"/g)].map(match => match[1]), ['../../docs/images/unit-v3/T01.png']);
  for (const history of item.histories) assert.ok(article.includes(`href="../../${history.previewPath}"`));
  assert.match(article, /v1 历史 PNG/);
  assert.match(article, /v2 历史 PNG/);
});

test('historical array alone is compatible and order-independent while singular history remains supported', async t => {
  const { root, templates } = await syntheticV3(t);
  const mixed = await buildGalleryModel({ root, templates });
  const entry = templates.find(template => template.id === 'T01');
  const arrayOnly = changeT01(templates, { historicalAcceptance: undefined, historicalAcceptances: [...entry.historicalAcceptances, entry.historicalAcceptance] });
  const reordered = await buildGalleryModel({ root, templates: arrayOnly });
  assert.equal(renderGallery(reordered), renderGallery(mixed));
  assert.deepEqual(reordered.items.find(item => item.id === 'T01').histories, mixed.items.find(item => item.id === 'T01').histories);
  assert.ok(model.items.some(item => item.historicalAcceptance));
  for (const item of model.items.filter(item => item.historicalAcceptance)) {
    assert.equal(item.histories.length, 1 + (item.historicalAcceptances?.length ?? 0));
    assert.equal(item.history, item.histories[0]);
    assert.equal(item.history.batch, item.historicalAcceptance.batch);
  }
});

test('multi-history rejects malformed entries, wrong epochs and duplicate batches across both forms', async t => {
  const { root, templates } = await syntheticV3(t);
  const old = templates.find(template => template.id === 'T01').historicalAcceptance;
  for (const historicalAcceptances of [null, {}, 'unit-v2']) {
    await assert.rejects(buildGalleryModel({ root, templates: changeT01(templates, { historicalAcceptances }) }), /historicalAcceptances must be an array/);
  }
  for (const history of [null, [], {}, { batch: 'missing', version: 2 }, ...[0, -1, 1, 3, 4, 2.5, '2'].map(version => ({ batch: 'unit-v2', version }))]) {
    await assert.rejects(buildGalleryModel({ root, templates: changeT01(templates, { historicalAcceptances: [history] }) }), /invalid historical acceptance/);
  }
  for (const historicalAcceptances of [[old], [{ batch: 'unit-v2', version: 2 }, { batch: 'unit-v2', version: 2 }]]) {
    await assert.rejects(buildGalleryModel({ root, templates: changeT01(templates, { historicalAcceptances }) }), /duplicate historical acceptance batch or version/);
  }
  await addSyntheticEpoch(root, 2, 'unit-v2-duplicate');
  await assert.rejects(buildGalleryModel({ root, templates: changeT01(templates, { historicalAcceptances: [{ batch: 'unit-v2', version: 2 }, { batch: 'unit-v2-duplicate', version: 2 }] }) }), /duplicate historical acceptance batch or version/);
});

test('multi-history checks every retained PNG hash and never ignores an older broken epoch', async t => {
  const { root, templates } = await syntheticV3(t);
  for (const relative of ['docs/images/templates/T01.png', 'docs/images/unit-v2/T01.png']) {
    const file = path.join(root, relative), original = await readFile(file);
    await writeFile(file, 'corrupt historical PNG');
    await assert.rejects(buildGalleryModel({ root, templates }), /historical PNG hash mismatch/);
    await rm(file);
    await assert.rejects(buildGalleryModel({ root, templates }), /missing repository file/);
    await writeFile(file, original);
  }
  assert.equal((await buildGalleryModel({ root, templates })).items.find(item => item.id === 'T01').histories.length, 2);
});

test('historical versions must precede current even when each history matches its batch scope', async t => {
  const { root, templates } = await syntheticV3(t);
  await assert.rejects(buildGalleryModel({ root, templates: changeT01(templates, { version: 2 }) }), /invalid historical acceptance/);
  await addSyntheticEpoch(root, 4);
  await assert.rejects(buildGalleryModel({ root, templates: changeT01(templates, { historicalAcceptances: [{ batch: 'unit-v2', version: 2 }, { batch: 'unit-v4', version: 4 }] }) }), /invalid historical acceptance/);
});

test('multi-history checks older input/provenance hashes, PNG dimensions and review links', async t => {
  const { root, templates } = await syntheticV3(t);
  const proof = path.join(root, 'docs/unit-v2-proof.json'), original = await readFile(proof);
  await writeFile(proof, Buffer.concat([original, Buffer.from('\n')]));
  await assert.rejects(buildGalleryModel({ root, templates }), /evidence\/review file hash mismatch/);
  await writeFile(proof, original);
  await editJson(root, 'docs/unit-v2-proof.json', data => { data.records[0].input = '0'.repeat(64); });
  await refreshBatch(root, 'unit-v2', 'evidence');
  await assert.rejects(buildGalleryModel({ root, templates }), /historical accepted input hash mismatch/);
  await writeFile(proof, original);
  const preview = path.join(root, 'docs/images/unit-v2/T01.png'), png = await readFile(preview), bad = Buffer.from(png);
  bad.writeUInt32BE(1, 16);
  await writeFile(preview, bad);
  await editJson(root, 'docs/unit-v2-proof.json', data => { data.records[0].png = sha(bad); });
  await refreshBatch(root, 'unit-v2', 'evidence');
  await assert.rejects(buildGalleryModel({ root, templates }), /historical PNG dimensions or signature mismatch/);
  await writeFile(preview, png);
  await writeFile(proof, original);
  await refreshBatch(root, 'unit-v2', 'evidence');
  const review = path.join(root, 'docs/unit-v2-review.md');
  await writeFile(review, (await readFile(review, 'utf8')).replace('images/unit-v2/', 'images/templates/'));
  await refreshBatch(root, 'unit-v2', 'review');
  await assert.rejects(buildGalleryModel({ root, templates }), /review is missing exact preview/);
});

test('multi-history rejects missing records and orphaned epochs unless individually retained', async t => {
  const { root, templates } = await syntheticV3(t);
  await assert.rejects(buildGalleryModel({ root, templates: changeT01(templates, { historicalAcceptance: undefined }) }), /orphaned acceptance record: visual-m1\/T01/);
  await assert.rejects(buildGalleryModel({ root, templates: changeT01(templates, { historicalAcceptances: [] }) }), /orphaned acceptance record: unit-v2\/T01/);
  await editJson(root, 'docs/unit-v2-proof.json', data => { data.records = []; });
  await refreshBatch(root, 'unit-v2', 'evidence');
  await assert.rejects(buildGalleryModel({ root, templates }), /invalid historical acceptance or missing record/);
});

test('multi-history rejects unsafe historical paths and unreferenced extra provenance records', async t => {
  const { root, templates } = await syntheticV3(t);
  const binding = path.join(root, 'docs/template-gallery-evidence.json'), original = await readFile(binding);
  for (const changes of [{ previewDirectory: '../outside' }, { previewDirectory: 'https://example.test/png' }, { evidence: '../outside.json' }, { review: 'https://example.test/review' }]) {
    await editJson(root, 'docs/template-gallery-evidence.json', data => { Object.assign(data.batches.find(batch => batch.id === 'unit-v2'), changes); });
    await assert.rejects(buildGalleryModel({ root, templates }), /unsafe repository path/);
    await writeFile(binding, original);
  }
  await editJson(root, 'docs/unit-v2-proof.json', data => { data.records.push({ ...data.records[0], id: 'T99' }); });
  await refreshBatch(root, 'unit-v2', 'evidence');
  await assert.rejects(buildGalleryModel({ root, templates }), /orphaned acceptance record: unit-v2\/T99/);
});


test('M1 v2 acceptance is retained as history for exactly 13 current v3 designs', async t => {
  const { root, templates } = await syntheticPending(t);
  const model = await buildGalleryModel({ root, templates });
  assert.equal(model.accepted.length, 0);
  assert.equal(model.pending.length, 48);
  assert.equal(model.items.filter(item => item.version === 3).length, 13);
  for (const item of model.items.filter(item => item.version === 3)) {
    assert.deepEqual(item.histories.map(history => history.version), [1, 2]);
    assert.equal(item.histories[1].batch, 'refinement-m1-v2');
    assert.equal(item.preview, null);
  }
  await writeFile(path.join(root, 'docs/images/refinement-m1-v2/T20.png'), 'tamper');
  await assert.rejects(buildGalleryModel({ root, templates }), /historical PNG hash mismatch: T20/);
});

test('production-shaped current v2/v3 batches normalize independently while every historical epoch survives', async t => {
  // This is deliberately accepted test data in a disposable root, not a change
  // to the real registry or a claim that any current production output passed.
  const source = await syntheticPending(t);
  const before = await buildGalleryModel(source);
  const historicalBindings = JSON.parse(await readFile(path.join(source.root, 'docs/template-gallery-evidence.json'), 'utf8')).batches;
  for (const version of [2, 3]) {
    const entries = source.templates.filter(item => item.version === version);
    assert.equal(entries.length, version === 2 ? 35 : 13);
    await addSyntheticEpoch(source.root, version, `unit-current-v${version}`, entries, 'docs/images/unit-current-previews');
  }
  source.templates = source.templates.map(item => {
    const current = { acceptance: `unit-current-v${item.version}`, status: 'visually-reviewed' };
    return { ...item, ...current, aspectLayouts: { ...item.aspectLayouts, portrait: { ...item.aspectLayouts.portrait, ...current } } };
  });
  const productionShaped = await buildGalleryModel(source);
  assert.equal(productionShaped.accepted.length, 48);
  assert.equal(productionShaped.pending.length, 0);
  assert.deepEqual(productionShaped.items.map(item => item.histories), before.items.map(item => item.histories));
  const sourceTemplates = structuredClone(source.templates);
  const bindingPath = path.join(source.root, 'docs/template-gallery-evidence.json');
  const sourceBindings = await readFile(bindingPath);
  const currentBindings = JSON.parse(sourceBindings).batches.filter(batch => batch.id.startsWith('unit-current-'));
  assert.equal(currentBindings.length, 2);

  // Copying must include the newly introduced evidence, reviews and preview
  // directory, not merely enough old files to build a normalized pending model.
  const copiedRoot = await fixture(t, source);
  const copied = await buildGalleryModel({ root: copiedRoot, templates: source.templates });
  assert.equal(renderGallery(copied), renderGallery(productionShaped));
  for (const item of copied.accepted) {
    assert.equal(item.preview.path, `docs/images/unit-current-previews/${item.id}.png`);
    assert.equal(sha(await readFile(path.join(copiedRoot, item.preview.path))), item.preview.sha256);
  }

  const scenarios = [
    { name: 'all pending', create: () => syntheticPending(t, source), accepted: 0, syntheticBatches: [] },
    { name: 'accepted v2 and pending', create: () => syntheticAcceptedV2(t, source), accepted: 1, currentVersion: 2, syntheticBatches: ['unit-v2'] },
    { name: 'pending v3 with two histories', create: () => syntheticV3(t, source), accepted: 0, syntheticBatches: ['unit-v2'] },
    { name: 'accepted v3 and pending', create: () => syntheticV3(t, { ...source, accepted: true }), accepted: 1, currentVersion: 3, syntheticBatches: ['unit-v2', 'unit-v3'] }
  ];
  for (const scenario of scenarios) await t.test(scenario.name, async () => {
    const independent = await scenario.create();
    const result = await buildGalleryModel(independent);
    assert.equal(result.accepted.length, scenario.accepted);
    assert.equal(result.pending.length, 48 - scenario.accepted);
    if (scenario.currentVersion) {
      assert.deepEqual(result.accepted.map(item => item.id), ['T01']);
      assert.equal(result.accepted[0].version, scenario.currentVersion);
      assert.equal(result.accepted[0].preview.version, scenario.currentVersion);
      assert.equal(result.accepted[0].evidence.batch, `unit-v${scenario.currentVersion}`);
    }
    for (const item of result.items) {
      const originalHistories = before.items.find(original => original.id === item.id).histories;
      assert.deepEqual(item.histories.slice(0, originalHistories.length), originalHistories);
      if (!item.preview) {
        assert.equal(item.status, 'implemented-awaiting-visual-review');
        assert.equal(item.acceptance, undefined);
        assert.equal(item.aspectLayouts.portrait.status, 'implemented-awaiting-visual-review');
        assert.equal(item.aspectLayouts.portrait.acceptance, undefined);
      }
    }
    const bindings = JSON.parse(await readFile(path.join(independent.root, 'docs/template-gallery-evidence.json'), 'utf8')).batches;
    assert.deepEqual(bindings.slice(0, historicalBindings.length), historicalBindings);
    assert.deepEqual(bindings.map(batch => batch.id), [...historicalBindings.map(batch => batch.id), ...scenario.syntheticBatches]);
    // Reintroducing a discarded current batch must still trip orphan validation,
    // demonstrating that normalization removed bindings rather than ignoring them.
    await editJson(independent.root, 'docs/template-gallery-evidence.json', data => { data.batches.push(currentBindings[0]); });
    await assert.rejects(buildGalleryModel(independent), /orphaned acceptance record: unit-current-v2\//);
    assert.deepEqual(source.templates, sourceTemplates);
    assert.deepEqual(await readFile(bindingPath), sourceBindings);
    assert.equal(renderGallery(await buildGalleryModel(source)), renderGallery(productionShaped));
  });

  // Normalization cannot launder invalid source evidence by dropping its binding.
  const invalid = { root: copiedRoot, templates: source.templates };
  await writeFile(path.join(copiedRoot, currentBindings[0].evidence), 'corrupt current evidence');
  await assert.rejects(syntheticPending(t, invalid), /evidence\/review file hash mismatch/);
});

test('actual M2 bindings expose exactly 48 current portraits with 35 v2 and 13 v3 and intact history', async () => {
  const v3 = ['T06','T10','T16','T19','T20','T22','T24','T26','T32','T34','T39','T40','T45'];
  assert.equal(model.accepted.length, 48);
  assert.equal(model.pending.length, 0);
  assert.equal(model.accepted.filter(item => item.version === 2).length, 35);
  assert.deepEqual(model.accepted.filter(item => item.version === 3).map(item => item.id), v3);
  assert.equal((html.match(/<img /g) ?? []).length, previewCount(model));
  for (const item of model.accepted) {
    const version = v3.includes(item.id) ? 3 : 2;
    assert.equal(item.acceptance, `refinement-m2-v${version}`);
    assert.equal(item.evidence.batch, item.acceptance);
    assert.equal(item.aspectLayouts.portrait.acceptance, item.acceptance);
    assert.equal(item.preview.version, version);
    assert.equal(item.preview.path, `docs/images/refinement-m2-run-40074554707/${item.id}.png`);
    assert.deepEqual(item.histories.map(history => history.version), version === 3 ? [1, 2] : [1]);
    const historyPngs = new Set(item.histories.map(history => history.previewPath));
    assert.ok(!historyPngs.has(item.preview.path));
  }
  const bindings = JSON.parse(await readFile(path.join(ROOT, 'docs/template-gallery-evidence.json'), 'utf8'));
  for (const [version, count] of [[2, 35], [3, 13]]) {
    const batch = bindings.batches.find(entry => entry.id === `refinement-m2-v${version}`);
    assert.deepEqual(batch.scope, { version, density: 'standard', aspect: 'portrait', width: 1080, height: 1440, pagination: 'manual' });
    const evidence = JSON.parse(await readFile(path.join(ROOT, batch.evidence), 'utf8'));
    assert.equal(evidence.records.length, count);
    assert.equal(evidence.acceptanceState, 'independently-reviewed');
    assert.deepEqual(evidence.records.map(record => record.id), model.accepted.filter(item => item.version === version).map(item => item.id));
  }
  for (const id of ['T04','T21']) for (const aspect of ['square','slide']) {
    assert.equal(TEMPLATES.find(item => item.id === id).aspectLayouts[aspect].acceptance, undefined);
    assert.equal(TEMPLATES.find(item => item.id === id).aspectLayouts[aspect].status, 'implemented-awaiting-visual-review');
  }
});

test('both actual M2 current PNG epochs fail closed on tampering or missing files', async t => {
  const root = await fixture(t);
  for (const id of ['T01','T06']) {
    const item = model.accepted.find(item => item.id === id);
    const filename = path.join(root, item.preview.path);
    const original = await readFile(filename);
    const tampered = Buffer.from(original);
    tampered[tampered.length - 1] ^= 1;
    await writeFile(filename, tampered);
    await assert.rejects(buildGalleryModel({ root }), new RegExp(`accepted PNG hash mismatch: ${id}`));
    await rm(filename);
    await assert.rejects(buildGalleryModel({ root }), /missing repository file/);
    await writeFile(filename, original);
    assert.equal((await buildGalleryModel({ root })).accepted.length, 48);
  }
});

test('actual current acceptance cannot swap v2 and v3 batches or use historical preview bytes', async t => {
  const root = await fixture(t);
  const templates = TEMPLATES.map(item => item.id === 'T01' ? { ...item, acceptance: 'refinement-m2-v3', aspectLayouts: { ...item.aspectLayouts, portrait: { ...item.aspectLayouts.portrait, acceptance: 'refinement-m2-v3' } } } : item);
  await assert.rejects(buildGalleryModel({ root, templates }), /accepted input hash mismatch or missing record/);
  for (const id of ['T01','T06']) {
    const item = model.accepted.find(item => item.id === id);
    const current = path.join(root, item.preview.path);
    const original = await readFile(current);
    const historical = await readFile(path.join(root, item.histories.at(-1).previewPath));
    assert.notEqual(sha(original), sha(historical), `M2 ${id} must have genuinely new pixels`);
    await writeFile(current, historical);
    await assert.rejects(buildGalleryModel({ root }), new RegExp(`accepted PNG hash mismatch: ${id}`));
    await writeFile(current, original);
  }
});
