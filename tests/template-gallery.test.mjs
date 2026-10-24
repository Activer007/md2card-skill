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
const css = await readFile(new URL('../docs/gallery/gallery.css', import.meta.url), 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'md2card-gallery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relative of ['docs/TEMPLATE_ACCEPTANCE.md', 'docs/template-m1-provenance.json', 'docs/TEMPLATE_UPGRADE_ACCEPTANCE.md', 'docs/template-upgrade-provenance.json', 'docs/TEMPLATE_ASPECTS.md', 'docs/template-gallery-evidence.json', 'docs/TEMPLATE_GALLERY.md', 'docs/images/templates', 'docs/gallery', 'examples/templates']) {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(ROOT, relative), destination, { recursive: true });
  }
  return root;
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
  const document = {
    getElementById(id) { return incomplete && id === 'family-filter' ? null : ids[id]; },
    querySelector(selector) { return selectors[selector]; },
    querySelectorAll(selector) { assert.equal(selector, '[data-template-card]'); return cards; }
  };
  runInNewContext(script, { document });
  return { ids, panel, cards, acceptedEmpty, pendingEmpty,
    set(id, value, event = 'change') { ids[id].value = value; ids[id].fire(event); },
    visible() { return cards.filter(card => !card.hidden).map(card => card.id); },
    reset() { ids['reset-filters'].fire('click'); }
  };
}

test('registry-derived counts distinguish implemented from visually accepted', () => {
  assert.equal(model.items.length, TEMPLATES.length);
  assert.ok(model.items.length >= model.accepted.length);
  assert.equal(model.accepted.length, 48);
  assert.deepEqual(model.accepted.map(item => item.id), TEMPLATES.map(item => item.id).sort());
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

test('all 48 previews preserve their own exact provenance, input hashes and dimensions', async () => {
  for (const item of model.accepted) {
    const evidence = JSON.parse(await readFile(path.join(ROOT, item.evidence.path), 'utf8'));
    const record = evidence.records.find(entry => entry.id === item.id);
    assert.equal(item.preview.sha256, record.png);
    assert.equal(item.inputSha256, record.input);
    assert.equal(sha(await readFile(path.join(ROOT, item.preview.path))), record.png);
    assert.equal(item.preview.width, 1080);
    assert.equal(item.preview.height, 1440);
    assert.equal(item.evidence.codeCommit, evidence.codeCommit);
    assert.ok(html.includes(item.preview.sha256));
    assert.ok(html.includes(item.command));
  }
});

test('script-disabled page has every article, input link, detail and real preview', () => {
  assert.equal((html.match(/data-template-card/g) ?? []).length, model.items.length);
  assert.equal((html.match(/<details class="detail">/g) ?? []).length, model.items.length);
  assert.equal((html.match(/<img /g) ?? []).length, model.accepted.length);
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
  assert.equal((safe.match(/<img /g) ?? []).length, model.accepted.length);
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

test('version, state and density changes cannot reuse historical acceptance', async () => {
  for (const changes of [{ version: 2 }, { density: 'compact' }, { aspects: ['square'] }, { status: 'implemented-awaiting-visual-review' }, { acceptance: 'missing-batch' }]) {
    const templates = TEMPLATES.map(item => item.id === 'T01' ? { ...item, ...changes } : item);
    await assert.rejects(buildGalleryModel({ templates }), /scope differs|metadata disagrees|missing acceptance binding|wrong status/);
  }
  await assert.rejects(buildGalleryModel({ templates: TEMPLATES.filter(item => item.id !== 'T01') }), /orphaned acceptance record/);
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
  assert.equal((await generateGallery({ root, check: true })).accepted, 48);
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
  assert.equal(dom.acceptedEmpty.hidden, true);
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
  assert.equal(dom.ids['filter-result'].textContent, '显示 1 个已验收示例，0 个待验收候选。');
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


test('aspect support is shown without promoting extra layouts or reusing portrait pixels', async () => {
  const model = await buildGalleryModel();
  for(const id of ['T04','T21']) {
    const item=model.items.find(item=>item.id===id);
    assert.deepEqual(item.aspects,['portrait','square','slide']);
    assert.equal(item.preview.aspect,'portrait');
    for(const aspect of ['square','slide']) assert.equal(item.aspectLayouts[aspect].status,'visually-reviewed');
  }
  const html=renderGallery(model);
  assert.match(html,/portrait \/ square \/ slide；支持不等于已验收/);
  const bad=TEMPLATES.map(item=>item.id==='T04'?{...item,aspects:['portrait','unknown']}:item);
  await assert.rejects(buildGalleryModel({templates:bad}),/invalid aspect contract/);
});

// A fully accepted registry must still exercise the candidate path, rather than
// let zero pending items make source/evidence separation vacuously pass.
test('a genuinely pending fixture keeps all source details but never inherits a preview', async t => {
  const root = await fixture(t);
  await editJson(root, 'docs/template-upgrade-provenance.json', data => { data.records = data.records.filter(record => record.id !== 'T48'); });
  const digest = sha(await readFile(path.join(root, 'docs/template-upgrade-provenance.json')));
  await editJson(root, 'docs/template-gallery-evidence.json', data => { data.batches.find(batch => batch.id === 'visual-upgrade').evidenceSha256 = digest; });
  const templates = TEMPLATES.map(item => {
    if (item.id !== 'T48') return item;
    const { acceptance, ...pending } = item;
    const { acceptance: portraitAcceptance, ...portrait } = item.aspectLayouts.portrait;
    return { ...pending, status: 'implemented-awaiting-visual-review', aspectLayouts: { portrait: { ...portrait, status: 'implemented-awaiting-visual-review' } } };
  });
  const mixed = await buildGalleryModel({ root, templates });
  assert.equal(mixed.accepted.length, 47);
  assert.deepEqual(mixed.pending.map(item => item.id), ['T48']);
  const pending = mixed.pending[0];
  assert.equal(pending.preview, null);
  const article = renderGallery(mixed).match(/<article id="T48"[\s\S]*?<\/article>/)[0];
  assert.doesNotMatch(article, /<img|preview-link|<canvas|<svg/);
  assert.ok(article.includes(pending.example));
  assert.ok(article.includes(escapeHtml(pending.structure)));
  const dom = mockDom({ items: mixed.items });
  dom.set('purpose-filter', 'T48', 'input');
  assert.equal(dom.ids['filter-result'].textContent, '显示 0 个已验收示例，1 个待验收候选。');
});
