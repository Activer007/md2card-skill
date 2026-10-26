import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseRecommendationOptions, RECOMMEND_LIMITS } from '../scripts/recommend-templates.mjs';
import { buildGalleryModel, renderGallery } from '../scripts/build-template-gallery.mjs';
import { buildRoleGuide, describeCandidate } from '../scripts/recommendation-guide.mjs';
import { CONTENT_ROLES } from '../scripts/content-role.mjs';
import { TEMPLATES } from '../scripts/templates.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'scripts/recommend-templates.mjs');
const sample = 'examples/recommendations/input.md';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (args, cwd = root) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
const success = result => { assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, ''); return JSON.parse(result.stdout); };
async function temporary(t) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'md2card-recommend-'));
  t.after(() => rm(folder, { recursive: true, force: true })); return folder;
}

test('CLI emits one stable JSON report with original input hash, conditions and real reviewed links', async () => {
  const before = await readFile(path.join(root, sample));
  const first = run([sample, '--json']), second = run([sample]);
  const report = success(first); success(second); assert.equal(first.stdout, second.stdout);
  assert.equal(report.sourceSha256, hash(before)); assert.equal(report.sourceBytes, before.length);
  assert.equal(report.templateCount, 48); assert.equal(report.automatedRenderingPerformed, false);
  assert.equal(report.recommendationIsRenderGuarantee, false);
  assert.deepEqual(report.cards.map(c => c.role), ['steps', 'comparison', 'metric', 'unknown']);
  for (const candidate of report.cards.flatMap(c => c.candidates)) {
    const template = TEMPLATES.find(t => t.id === candidate.templateId);
    assert.deepEqual(candidate.conditions.supportedAspects, template.aspects);
    assert.equal(candidate.conditions.unsuitable, template.unsuitable);
    assert.equal(candidate.inputRenderability, 'not-verified');
    assert.equal(hash(await readFile(path.join(root, candidate.acceptedExample.png.file))), candidate.acceptedExample.png.sha256);
    assert.equal(hash(await readFile(path.join(root, candidate.acceptedExample.input))), candidate.acceptedExample.inputSha256);
  }
  assert.deepEqual(await readFile(path.join(root, sample)), before);
});

test('text mode explains screenshots and never promises mobile microtext readability', () => {
  const result = run(['examples/templates/T20.md', '--format', 'text']);
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  for (const text of ['推荐 ≠ 渲染保证', 'T20', '理由:', '图片:', '文字:', '支持画幅:', '不适合:', '已验收的精确示例:', '8px', '不保证在手机上可读']) assert.ok(result.stdout.includes(text), text);
});

test('text mode preserves exact-example review limitations and scope from JSON', () => {
  const args = ['examples/aspects/T04-square.md', '--size', 'square'];
  const report = success(run(args));
  const example = report.cards[0].candidates.find(c => c.templateId === 'T04').acceptedExample;
  assert.equal(example.status, 'reviewed-with-layout-limitations');
  assert.ok(example.limitations.length > 0, 'Use a real reviewed example with retained limitations.');
  const text = run([...args, '--format', 'text']);
  assert.equal(text.status, 0, text.stderr);
  for (const limitation of example.limitations) assert.ok(text.stdout.includes(limitation), limitation);
  assert.ok(text.stdout.includes(example.status));
  assert.ok(text.stdout.includes(`${example.aspect} / ${example.scope.density} / ${example.scope.pagination}`));
});

test('requested aspect gets its exact example, while incompatible templates are rejected', () => {
  const report = success(run(['examples/aspects/T05-square.md', '--size', 'square']));
  const candidate = report.cards[0].candidates.find(c => c.templateId === 'T05');
  assert.equal(candidate.acceptedExample.aspect, 'square');
  assert.equal(candidate.acceptedExample.input, 'examples/aspects/T05-square.md');
  assert.ok(candidate.acceptedExample.png.file.includes('/aspects-run-'));
  assert.ok(candidate.caveats.includes('REGISTRY_ASPECT_REVIEW_PENDING'));
  const refused = success(run(['examples/templates/T20.md', '--size', 'square']));
  assert.ok(refused.cards[0].rejected.find(c => c.templateId === 'T20').reasonIds.includes('TEMPLATE_ASPECT_UNSUPPORTED'));
  assert.ok(!refused.cards[0].candidates.some(c => c.templateId === 'T20'));
});

test('pending requested-aspect evidence never borrows a reviewed portrait PNG', async () => {
  const model = await buildGalleryModel(), item = model.items.find(t => t.id === 'T05');
  const candidate = { templateId: 'T05', evidence: { structure: 'test' } };
  const result = describeCandidate(candidate, { ...item, aspectEvidence: [] }, 'square');
  assert.equal(result.acceptedExample, null);
  assert.equal(result.exampleStatus, 'no-reviewed-example-for-requested-aspect');
  assert.equal(result.recommendationIsRenderGuarantee, false);
});

test('auto mode describes manual partitions but assigns no templates or output files', async t => {
  const folder = await temporary(t), input = path.join(folder, 'input.md');
  await writeFile(input, '# Steps\n\n1. Keep source\n2. Check evidence\n');
  const report = success(run([input, '--paginate', 'auto'], folder));
  assert.ok(report.cards.every(c => c.candidates.length === 0 && c.selectionStatus === 'manual-templates-only'));
  assert.deepEqual(await readdir(folder), ['input.md']);
});

test('CLI works outside repository cwd and accepts explicit bounded asset roots', async t => {
  const folder = await temporary(t);
  const result = success(run([path.join(root, 'examples/aspects/T37-slide.md'), '--asset-root', path.join(root, 'examples/templates'), '--size', 'slide'], folder));
  assert.equal(result.cards[0].candidates[0].templateId, 'T37');
  assert.deepEqual(await readdir(folder), []);
});

test('bad options and unsafe/unsupported inputs fail with clean JSON stderr and empty stdout', () => {
  for (const args of [[], [sample, '--out', 'should-not-exist'], [sample, '--size', 'wechat-unknown'],
    [sample, '--format', 'text', '--json'], [sample, '--size', 'square', '--size', 'portrait'],
    ['https://example.invalid/input.md'], ['//example.invalid/share/input.md'], [sample, '--asset-root', '//example.invalid/share'], ['missing-file.md'], ['examples'],
    ['tests/fixtures/visual-upgrade/remote-image.md'], ['tests/fixtures/visual-upgrade/invalid-metadata.md']]) {
    const result = run(args);
    assert.equal(result.status, 1, JSON.stringify(args)); assert.equal(result.stdout, '');
    const error = JSON.parse(result.stderr); assert.equal(error.status, 'error'); assert.ok(error.code); assert.ok(!error.stack);
  }
  assert.equal(parseRecommendationOptions(['--help']).help, true);
});

test('bounded UTF-8 and card-count validation rejects malformed or oversized sources', async t => {
  const folder = await temporary(t), input = path.join(folder, 'input.md');
  for (const [data, code] of [[Buffer.from([0xff, 0xfe]), 'INVALID_INPUT'],
    [Buffer.alloc(RECOMMEND_LIMITS.inputBytes + 1, 65), 'RECOMMENDATION_BUDGET'],
    [Array.from({ length: 201 }, () => '# One').join('\n\n===\n\n'), 'RECOMMENDATION_BUDGET'],
    ['', 'INVALID_MARKDOWN'], ['# Local\n\n![image](../outside.png)', 'INVALID_ASSET']]) {
    await writeFile(input, data);
    const result = run([input]); assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).code, code);
  }
});

test('CLI report path runs with writes/process spawning denied and all networking trapped', () => {
  const permission = process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
  const script = `import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
    import {syncBuiltinESMExports} from 'node:module';
    const deny = () => {throw Error('Network forbidden')};
    net.Socket.prototype.connect=deny; http.get=http.request=https.get=https.request=deny;
    globalThis.fetch=deny; syncBuiltinESMExports();
    const {createRecommendationReport,parseRecommendationOptions}=await import('./scripts/recommend-templates.mjs');
    const report=await createRecommendationReport(parseRecommendationOptions(['examples/templates/T20.md']));
    process.stdout.write(JSON.stringify(report));`;
  const result = execFileSync(process.execPath, [permission, '--allow-fs-read=*', '--input-type=module', '-e', script], { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(JSON.parse(result).cards[0].candidates[0].templateId, 'T20');
});

test('static role routes derive from registry fields, survive no JS and add no preview identities', async () => {
  const model = await buildGalleryModel(), routes = buildRoleGuide(model.items), html = renderGallery(model);
  assert.deepEqual(routes.map(r => r.id), CONTENT_ROLES);
  assert.equal(routes.find(r => r.id === 'unknown').templates.length, 0);
  const changed = model.items.map(item => ({ ...item, id: `new-${item.id}` }));
  assert.ok(buildRoleGuide(changed).flatMap(r => r.templates).every(t => t.id.startsWith('new-')), 'no hard-coded IDs');
  for (const route of routes) assert.ok(html.includes(`data-content-role="${route.id}"`));
  assert.equal(model.items.length, 48);
  const evidenceImages = model.accepted.length + model.comparisons.reduce((sum, group) => sum + group.previews.length, 0)
    + model.variantEvidence.entries.reduce((sum, entry) => sum + entry.views.length, 0);
  assert.equal((html.match(/<img /g) ?? []).length, evidenceImages, 'role routes add no images beyond the existing evidence');
  assert.ok(html.includes('references/recommendations.md')); assert.ok(html.includes('推荐 ≠ 渲染保证'));
});

test('checked-in CLI JSON and text reports are reproducible', async () => {
  assert.equal(run([sample]).stdout, await readFile(path.join(root, 'examples/recommendations/cli-report.json'), 'utf8'));
  assert.equal(run([sample, '--format', 'text']).stdout, await readFile(path.join(root, 'examples/recommendations/cli-report.txt'), 'utf8'));
});
