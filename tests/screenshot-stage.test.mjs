import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCards, validateCardMetadata } from '../scripts/markdown.mjs';
import { createAssetResolver } from '../scripts/assets.mjs';
import { buildDocument, SIZES } from '../scripts/document.mjs';
import { parseSemanticDocument } from '../scripts/semantic.mjs';
import { recommendTemplates } from '../scripts/template-recommender.mjs';
import { describeCandidate } from '../scripts/recommendation-guide.mjs';
import { TEMPLATES } from '../scripts/templates.mjs';
import { STAGE_CASES, selectStageFixtures, defaultStageInput, prepareStageOutput, verifyStageBaseline, validateScreenshotStage } from '../scripts/validate-screenshot-stage.mjs';

const root = fileURLToPath(new URL('../examples/templates/', import.meta.url));
const source = await readFile(new URL('../examples/templates/T20.md', import.meta.url), 'utf8');
const metadata = JSON.parse(source.match(/<!-- card: (.+) -->/)[1]);
const stage = { ...metadata, visualVariant: 'screenshot-stage' };
const input = meta => source.replace(/<!-- card: .+ -->/, `<!-- card: ${JSON.stringify(meta)} -->`);
const cards = async text => renderCards(text, { resolveImage: (await createAssetResolver(root)).resolveImage });
const build = c => buildDocument(c, SIZES.portrait, '');

test('only explicit T20 with the exact enum and a local metadata image is accepted', async () => {
  assert.equal(validateCardMetadata(stage).visualVariant, 'screenshot-stage');
  for (const value of ['', 'Screenshot-stage', 'screenshot-stage ', 'cover', 'url(x)', {}, null, 1]) {
    assert.throws(() => validateCardMetadata({ ...stage, visualVariant: value }), { code: 'INVALID_METADATA' });
  }
  for (const template of [undefined, ...TEMPLATES.filter(t => t.id !== 'T20').map(t => t.id)]) {
    assert.throws(() => validateCardMetadata({ ...stage, template }), { code: 'INVALID_METADATA' });
  }
  for (const field of ['imageRole', 'css', 'crop', 'style']) assert.throws(() => validateCardMetadata({ ...stage, [field]: 'anything' }), { code: 'INVALID_METADATA' });
  for (const field of ['image', 'alt', 'caption']) {
    const bad = { ...stage }; delete bad[field]; assert.throws(() => validateCardMetadata(bad));
  }
  assert.throws(() => parseSemanticDocument(input(stage)), { code: 'PAGINATION_UNSUPPORTED_METADATA' });
  const good = await cards(input(stage));
  assert.throws(() => buildDocument(good, SIZES.square, ''), { code: 'TEMPLATE_ASPECT_UNSUPPORTED' });
  assert.throws(() => buildDocument(good, SIZES.slide, ''), { code: 'TEMPLATE_ASPECT_UNSUPPORTED' });
});

test('the existing local-image security boundary also protects the explicit stage', async () => {
  for (const image of ['https://example.com/a.png', '//example.com/a.png', '../outside.png', 'file:///C:/a.png', 'data:image/png;base64,AA==', 'C:/a.png', 'assets/a.svg']) {
    await assert.rejects(cards(input({ ...stage, image })), e => e.code?.startsWith('ASSET_') || e.code === 'INVALID_ASSET');
  }
  await assert.rejects(async () => build(await cards(input(stage) + '\n\n![extra](assets/original-research-interface.png)')), { code: 'TEMPLATE_IMAGE_COUNT' });
});

test('stage keeps the exact image and text; default DOM and CSS stay untouched', async () => {
  const oldCards = await cards(source), newCards = await cards(input(stage));
  const oldHtml = build(oldCards), newHtml = build(newCards);
  assert.equal(oldCards[0].image.hash, newCards[0].image.hash);
  assert.doesNotMatch(oldHtml, /data-visual-variant|screenshot-stage/);
  assert.ok(oldHtml.indexOf('class="template-main"') < oldHtml.indexOf('<figure'));
  assert.ok(newHtml.indexOf('<figure') < newHtml.indexOf('class="template-main"'));
  assert.match(newHtml, /data-visual-variant="screenshot-stage"/);
  for (const text of [metadata.source, metadata.caption, metadata.alt]) assert.ok(newHtml.includes(text));
  assert.equal(newCards[0].html, oldCards[0].html);
  assert.match(newHtml, /object-fit: contain; object-position: center/);
});

test('recommendations cannot borrow default T20 visual acceptance for the variant', async () => {
  const report = recommendTemplates({ cards: await cards(input(stage)) });
  const candidate = report.cards[0].candidates[0];
  assert.equal(candidate.templateId, 'T20');
  assert.equal(candidate.visualVariant, 'screenshot-stage');
  assert.equal(candidate.evidence.aspectRegistryStatus, 'variant-independent-review-required');
  assert.ok(candidate.caveats.includes('VISUAL_VARIANT_REVIEW_REQUIRED'));
  assert.match(candidate.evidence.structure, /标题、图像与图注、正文、来源/);
  const item = { ...TEMPLATES.find(t => t.id === 'T20'), preview: { path: 'old.png' }, aspectEvidence: [] };
  const described = describeCandidate(candidate, item, 'portrait');
  assert.equal(described.acceptedExample, null);
  assert.equal(described.exampleStatus, 'no-reviewed-example-for-requested-variant');
});

test('real fixture inventory excludes documentation and refuses incomplete/new cases', async () => {
  const files = await readdir(new URL('../examples/visual-upgrade/t20/',import.meta.url));
  const selected = selectStageFixtures(files);
  assert.equal(selected.length,14);
  assert.ok(!selected.includes('README.md'));
  assert.deepEqual(selected,STAGE_CASES.map(id=>`${id}.md`));
  assert.throws(()=>selectStageFixtures(files.filter(file=>file!=='original.md')));
  assert.throws(()=>selectStageFixtures([...files,'extra.md']));
});

test('default counterpart removes the opt-in despite key order/spacing, without rewriting text', () => {
  const text = '<!-- card: { "visualVariant" : "screenshot-stage", "source":"Literal $& $$ $1", "template":"T20" } -->\r\n# Keep $& and 中文\r\n';
  const result = defaultStageInput(text);
  assert.deepEqual(JSON.parse(result.match(/<!-- card: (.+) -->/)[1]),{source:'Literal $& $$ $1',template:'T20'});
  assert.equal(result.slice(result.indexOf('\r\n')),text.slice(text.indexOf('\r\n')));
  assert.throws(()=>defaultStageInput('<!-- card: {"template":"T20"} -->\n# Missing mode'));
});

test('validation refuses nonempty output before overwriting any evidence or launching Chromium', async t => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'md2card-stage-review-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await writeFile(path.join(dir,'original-default.md'),'preserve input');
  await writeFile(path.join(dir,'progress.json'),'preserve report');
  await assert.rejects(validateScreenshotStage({out:dir,browser:'missing-browser'}),/must be empty/);
  assert.equal(await readFile(path.join(dir,'original-default.md'),'utf8'),'preserve input');
  assert.equal(await readFile(path.join(dir,'progress.json'),'utf8'),'preserve report');
  const empty=path.join(dir,'empty'); await mkdir(empty);
  assert.equal(await prepareStageOutput(empty),empty);
  const link=path.join(dir,'link'); await symlink(empty,link,process.platform==='win32'?'junction':'dir');
  await assert.rejects(prepareStageOutput(link),/symlinks/);
  await assert.rejects(prepareStageOutput(fileURLToPath(new URL('../examples/',import.meta.url))),/under validation/);
});

test('mismatched baseline bytes cannot be presented as the pinned historical commit', async () => {
  // No Git history required: Actions uses a shallow checkout. Production runs
  // read the pinned Git blobs; only this isolated negative test supplies bytes.
  await assert.rejects(verifyStageBaseline(fileURLToPath(new URL('../',import.meta.url)),
    async () => Buffer.from('different committed bytes')),/Baseline differs/);
});
