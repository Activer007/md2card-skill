import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TEMPLATES } from '../scripts/templates.mjs';
import { buildTaskGuide, buildComparisonModel } from '../scripts/gallery-discovery.mjs';
import { COMPARISON_BATCH, comparisonRecordFiles } from '../scripts/comparison-evidence.mjs';
import { sha256 } from '../scripts/evidence-source.mjs';

const read = file => readFile(new URL('../' + file, import.meta.url));
const json = value => Buffer.from(JSON.stringify(value));
const root = COMPARISON_BATCH.root;

test('task-first navigation selects purposes without creating new design identities', () => {
  const tasks = buildTaskGuide(TEMPLATES); assert.equal(tasks.length, 6);
  assert.ok(tasks.every(t => t.templates.length === 4 && t.hint && t.title));
  assert.equal(TEMPLATES.length, 48);
  assert.throws(() => buildTaskGuide(TEMPLATES.filter(t => t.id !== 'T04')), /unknown task template/);
});

test('published same-content groups bind eleven exact previews and one refusal', async () => {
  const groups = await buildComparisonModel(TEMPLATES, read); assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(group => group.previews.length), [4, 3, 4]);
  assert.deepEqual(groups.map(group => group.refusals.map(record => record.template)), [[], ['T13'], []]);
  for (const group of groups) { assert.equal(group.state, 'reviewed-exact-fixtures'); assert.equal(group.templates.length, 4); }
});

test('pending groups cannot expose previews or borrow another group acceptance', async () => {
  const spec = JSON.parse(await read('docs/gallery-comparisons.json'));
  for (const group of spec.groups) { group.state = 'pending'; delete group.evidence; }
  const groups = await buildComparisonModel(TEMPLATES, file => file === 'docs/gallery-comparisons.json' ? Promise.resolve(json(spec)) : read(file));
  assert.ok(groups.every(group => group.previews.length === 0 && group.refusals.length === 0));
});

test('comparison plans reject stale inputs, unknown IDs and forged acceptance', async () => {
  const original = JSON.parse(await read('docs/gallery-comparisons.json'));
  for (const mutation of [g => g.inputSha256 = '0'.repeat(64), g => g.templates[0] = 'T99', g => { g.state = 'reviewed-exact-fixtures'; g.evidence = {}; }, g => g.evidence = { claimed: true }]) {
    const spec = structuredClone(original); mutation(spec.groups[0]);
    await assert.rejects(buildComparisonModel(TEMPLATES, p => p === 'docs/gallery-comparisons.json' ? Promise.resolve(json(spec)) : read(p)), /GALLERY_DISCOVERY_INVALID/);
  }
});

// Actual curated CI bytes, with a SYNTHETIC in-memory visual attestation. The
// test never writes review files or promotes the production pending groups.
async function fixture(groupIndex = 0) {
  const spec = JSON.parse(await read('docs/gallery-comparisons.json'));
  for (const group of spec.groups) { group.state = 'pending'; delete group.evidence; }
  const binding = JSON.parse(await read(`${root}/binding.json`));
  const group = spec.groups[groupIndex]; group.state = 'reviewed-exact-fixtures';
  const ids = binding.groups.find(item => item.id === group.id).records;
  const records = binding.records.filter(record => ids.includes(record.id));
  const review = { schemaVersion: 1, bindingSha256: COMPARISON_BATCH.bindingSha256, identity: binding.identity,
    scope: binding.scope, reviewer: 'SYNTHETIC UNIT TEST ONLY — NOT VISUAL ACCEPTANCE', records: records.map(record => ({
      id: record.id, status: record.outcome === 'exported' ? 'reviewed-exact-fixture' : 'reviewed-expected-overflow',
      files: comparisonRecordFiles(record).map(({ file, sha256 }) => ({ file, sha256 })), notes: [],
      checks: record.outcome === 'exported' ? { fullPng: 'pass', mobile375: 'pass', mobile390: 'pass', nativePdf: 'pass', sourcePreservation: 'pass' }
        : { exactInput: 'pass', overflowDiagnostic: 'pass', noSuccessClaim: 'pass' }
    })) };
  let prose = `SYNTHETIC UNIT TEST ONLY\n${binding.identity.commit}\n${group.id}\n`;
  for (const record of records) for (const entry of comparisonRecordFiles(record)) prose += `[artifact](${path.posix.relative('docs', `${root}/${entry.file}`)})\n`;
  const files = new Map();
  const state = { spec, group, binding, records, review, prose, files, templates: structuredClone(TEMPLATES), refresh() {
    group.evidence = { batch: COMPARISON_BATCH.id, review: 'docs/unit-comparison-review.md', reviewSha256: sha256(state.prose),
      visualReview: 'docs/unit-comparison-review.json', visualReviewSha256: sha256(json(review)) };
    files.set(group.evidence.review, Buffer.from(state.prose)); files.set(group.evidence.visualReview, json(review));
    files.set('docs/gallery-comparisons.json', json(spec));
  }, read: async file => {
    if (files.has(file)) { const bytes = files.get(file); if (bytes === null) throw new Error('missing evidence file'); return bytes; }
    return read(file);
  } };
  state.refresh(); return state;
}

test('offline gallery reads real input, manifest, PDF, PNG, mobile and diagnostic bytes', async () => {
  const f = await fixture(); const seen = new Set();
  const groups = await buildComparisonModel(TEMPLATES, async file => { seen.add(file); return f.read(file); });
  assert.equal(groups[0].previews.length, 4); assert.equal(groups[0].refusals.length, 0);
  assert.equal(groups[1].previews.length, 0);
  for (const record of f.records) for (const entry of comparisonRecordFiles(record)) assert.ok(seen.has(`${root}/${entry.file}`), entry.file);
  assert.deepEqual(groups[0].previews.map(item => item.version), [2, 3, 3, 2]);
  const { buildGalleryModel, renderGallery } = await import('../scripts/build-template-gallery.mjs');
  const model = await buildGalleryModel(); model.comparisons = groups;
  const html = renderGallery(model);
  assert.equal((html.match(/<img /g) ?? []).length, 52);
  assert.ok(html.includes(`src="../../${root}/refinement/short-T04/card-001.png"`));
  assert.ok(html.includes('同一正文、standard、3:4、manual'));
});

test('comparison acceptance rejects rehashed declarations and incomplete visual review', async t => {
  const mutations = [
    ['unknown batch', f => f.group.evidence.batch = 'other-run'],
    ['legacy self-declared SHA', f => f.group.evidence.codeCommit = 'a'.repeat(40)],
    ['review path traversal', f => f.group.evidence.visualReview = '../outside-review.json'],
    ['absolute review path', f => f.group.evidence.review = 'C:/outside-review.md'],
    ['changed template version', f => f.templates.find(item => item.id === 'T04').version++],
    ['changed template membership', f => f.group.templates[0] = 'T05'],
    ['changed source with fresh body hash', f => { const bytes = Buffer.from('different authored content'); f.files.set(f.group.input, bytes); f.group.inputSha256 = sha256(bytes); }],
    ['wrong source commit', f => f.review.identity.commit = 'a'.repeat(40)],
    ['wrong source tree', f => f.review.identity.tree = 'b'.repeat(40)],
    ['wrong archive', f => f.review.identity.archiveSha256 = 'c'.repeat(64)],
    ['wrong artifact ID', f => f.review.identity.artifactId++],
    ['wrong binding', f => f.review.bindingSha256 = 'd'.repeat(64)],
    ['wrong scope', f => f.review.scope.density = 'compact'],
    ['missing reviewer', f => delete f.review.reviewer],
    ['missing record', f => f.review.records.pop()],
    ['duplicate record', f => f.review.records.push(f.review.records[0])],
    ['unknown record', f => f.review.records.push({ id: 'not-a-case' })],
    ['pending record', f => f.review.records[0].status = 'pending'],
    ['missing PDF review', f => delete f.review.records[0].checks.nativePdf],
    ['missing mobile review', f => f.review.records[0].checks.mobile390 = 'not-performed'],
    ['review of other bytes', f => f.review.records[0].files[0].sha256 = 'f'.repeat(64)],
    ['undisclosed limitation', f => f.review.records[0].status = 'reviewed-with-limitations'],
    ['stale review image link', f => f.prose = f.prose.replace('refinement/short-T04/card-001.png', 'refinement/short-T06/card-001.png')],
    ['missing native PDF link', f => f.prose = f.prose.replace('refinement/short-T04/cards.pdf', 'refinement/short-T06/cards.pdf')],
    ['wrong runtime dependency', async f => { const pkg = JSON.parse(await read('package.json')); pkg.dependencies.playwright = '0.0.0'; f.files.set('package.json', json(pkg)); }],
    ['changed parser semantics', f => f.files.set('scripts/markdown.mjs', Buffer.from('different parser'))],
    ['changed styles', f => f.files.set('assets/templates.css', Buffer.from('different styles'))],
    ['forged binding with fresh self-hash', f => { f.binding.identity.commit = '1'.repeat(40); const bytes = json(f.binding); f.files.set(`${root}/binding.json`, bytes); f.review.bindingSha256 = sha256(bytes); }],
    ['forged source manifest', async f => { const manifest = JSON.parse(await read(`${root}/refinement/source-files.json`)); manifest.git.tree = '2'.repeat(40); f.files.set(`${root}/refinement/source-files.json`, json(manifest)); }]
    ,['forged visual equivalence', f => f.files.set(`${root}/visual-equivalence.json`, json({status:'equivalent'}))]
    ,['missing re-rasterized PDF page', f => f.files.set(`${root}/native-pdf-pages/short-T04.png`, null)]
    ,['altered previous visual review', f => f.files.set('docs/comparison-visual-review.json', json({claimed:'reviewed'}))]
  ];
  for (const [name, mutate] of mutations) await t.test(name, async () => {
    const f = await fixture(); await mutate(f);
    // Rehash every editable review declaration; only the independently curated
    // binder and its immutable artifacts can establish provenance.
    f.group.evidence.reviewSha256 = sha256(f.prose);
    f.group.evidence.visualReviewSha256 = sha256(json(f.review));
    f.files.set(f.group.evidence.review, Buffer.from(f.prose)); f.files.set(f.group.evidence.visualReview, json(f.review));
    f.files.set('docs/gallery-comparisons.json', json(f.spec));
    await assert.rejects(buildComparisonModel(f.templates, f.read), /GALLERY_DISCOVERY_INVALID/);
  });
});

test('every published comparison artifact is required, including missing or swapped real PDFs', async t => {
  const base = await fixture();
  const entries = comparisonRecordFiles(base.records[0]);
  for (const entry of entries) for (const missing of [true, false]) await t.test(`${missing ? 'missing' : 'changed'} ${entry.file}`, async () => {
    const f = await fixture(); f.files.set(`${root}/${entry.file}`, missing ? null : Buffer.from('wrong artifact bytes'));
    await assert.rejects(buildComparisonModel(TEMPLATES, f.read), /GALLERY_DISCOVERY_INVALID/);
  });
  await t.test('other actual PDF and old actual thumbnail', async () => {
    for (const [target, source] of [['cards.pdf', `${root}/refinement/short-T06/cards.pdf`], ['card-001.png', 'docs/images/templates/T04.png']]) {
      const f = await fixture(); f.files.set(`${root}/refinement/short-T04/${target}`, await read(source));
      await assert.rejects(buildComparisonModel(TEMPLATES, f.read), /byte digest mismatch/);
    }
  });
});

test('reviewed limitations remain visible and escaped in the comparison caption', async () => {
  const f = await fixture(); f.review.records[0].status = 'reviewed-with-limitations';
  f.review.records[0].notes = ['本例有单字短尾。', '<script>untrusted note</script>']; f.refresh();
  const { buildGalleryModel, renderGallery } = await import('../scripts/build-template-gallery.mjs');
  const model = await buildGalleryModel(); model.comparisons = await buildComparisonModel(TEMPLATES, f.read);
  const html = renderGallery(model);
  assert.ok(html.includes('本例有单字短尾。')); assert.ok(html.includes('&lt;script&gt;untrusted note&lt;/script&gt;'));
  assert.ok(!html.includes('<script>untrusted note</script>'));
});

test('exact T13 refusal cannot be relabelled, swapped or counted as a successful preview', async t => {
  const f = await fixture(1), groups = await buildComparisonModel(TEMPLATES, f.read);
  assert.equal(groups[1].previews.length, 3); assert.equal(groups[1].refusals.length, 1);
  assert.equal(groups[1].refusals[0].template, 'T13');
  const { buildGalleryModel, renderGallery } = await import('../scripts/build-template-gallery.mjs');
  const model = await buildGalleryModel(); model.comparisons = groups; const html = renderGallery(model);
  assert.ok(html.includes('T13 · 本例明确不适配')); assert.ok(html.includes('保留的溢出诊断'));
  assert.equal((html.match(/<img /g) ?? []).length, 51);
  const mutations = [
    ['removed refusal boundary', f => delete f.group.requiredRefusals],
    ['relabeled refusal', f => f.review.records.find(r => r.id === 'medium-T13').status = 'reviewed-exact-fixture'],
    ['success claim', f => f.review.records.find(r => r.id === 'medium-T13').checks.noSuccessClaim = 'not-performed'],
    ['different generated input', f => f.files.set(`${root}/refinement/inputs/medium-T13.md`, Buffer.from('other input'))],
    ['swapped overflow diagnostic', async f => { const file = `${root}/refinement/medium-T13/overflow.json`; const diagnostic = JSON.parse(await read(file)); diagnostic.input = 'medium-T04.md'; f.files.set(file, json(diagnostic)); }],
    ['missing diagnostic link', f => f.prose = f.prose.replace('medium-T13/overflow.json', 'medium-T04/overflow.json')]
  ];
  for (const [name, mutate] of mutations) await t.test(name, async () => {
    const f = await fixture(1); await mutate(f); f.refresh();
    await assert.rejects(buildComparisonModel(TEMPLATES, f.read), /GALLERY_DISCOVERY_INVALID/);
  });
});

test('task-first and comparison sections are static, escaped and do not promote templates', async () => {
  const { buildGalleryModel, renderGallery } = await import('../scripts/build-template-gallery.mjs');
  const model = await buildGalleryModel(), html = renderGallery(model);
  assert.ok(html.indexOf('id="tasks"') < html.indexOf('class="filters"'));
  const taskSection = html.slice(html.indexOf('<section id="tasks"'), html.indexOf('<section id="comparisons"'));
  assert.equal((taskSection.match(/class="task-route"/g) ?? []).length, 6);
  assert.equal((html.match(/data-content-role=/g) ?? []).length, 10);
  assert.equal((html.match(/class="comparison"/g) ?? []).length, 3);
  assert.equal((html.match(/data-template-card/g) ?? []).length, 48);
  const hostile = structuredClone(model); hostile.tasks[0].title = '<img src=x>'; hostile.comparisons[0].title = '<script>alert(1)</script>';
  const escaped = renderGallery(hostile);
  assert.ok(escaped.includes('&lt;img src=x&gt;')); assert.ok(escaped.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!escaped.includes('<img src=x>'));
});
