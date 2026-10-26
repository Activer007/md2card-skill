import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseGateOptions, selectTests, runGate, markdownReport } from '../scripts/local-quality-gate.mjs';
import { aggregate, createRunDirectory, digestFile, inventory, parseTestSummary, prepareBaseline,
  runCommand, sha256, testStatus, VARIANTS, verifyEvidence } from '../scripts/local-quality-support.mjs';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'md2card-gate-test-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}

test('CLI validates modes, target membership, duplicates and baseline scope', () => {
  assert.equal(parseGateOptions([]).mode, 'fast');
  assert.deepEqual(parseGateOptions(['--mode', 'targeted', '--target', 'gallery']).targets, ['gallery']);
  for (const args of [['--mode','unknown'], ['--mode','targeted'], ['--target','gallery'], ['--mode'], ['--bogus'],
    ['--mode','fast','--mode','release'], ['--mode','targeted','--target','unknown'], ['--changed','../outside'],
    ['--mode','release','--changed','a'], ['--baseline-root','x'], ['--mode','targeted','--target','gallery','--baseline-root','x']]) {
    assert.throws(() => parseGateOptions(args), undefined, args.join(' '));
  }
  assert.equal(parseGateOptions(['--mode','targeted','--target','photo-cover','--baseline-root','old']).baselineRoot, 'old');
});

test('every selected non-pass status prevents PASS; unselected NOT-RUN is explicit', () => {
  for (const status of ['FAIL','SKIP','BLOCKED','NOT-RUN']) assert.notEqual(aggregate([{ selected: true, status }]), 'PASS');
  assert.equal(aggregate([{ selected: true, status: 'PASS' }, { selected: false, status: 'NOT-RUN' }]), 'PASS');
  assert.equal(aggregate([]), 'BLOCKED');
});

test('TAP requires complete nonempty summary and rejects hidden skip/todo/cancellation', () => {
  const source = '# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  const summary = parseTestSummary(source); assert.equal(testStatus(0, summary), 'PASS');
  assert.equal(testStatus(1, summary), 'FAIL');
  assert.equal(testStatus(0, { ...summary, skipped: 1 }), 'SKIP');
  assert.equal(testStatus(0, { ...summary, todo: 1 }), 'SKIP');
  assert.equal(testStatus(0, { ...summary, cancelled: 1 }), 'FAIL');
  assert.throws(() => parseTestSummary(source + source));
  assert.throws(() => parseTestSummary('no tests ran'));
  assert.throws(() => parseTestSummary(source.replace('# tests 3', '# tests 4')));
});

test('run directories are unique, contained, and preserve existing evidence', async t => {
  const root = await temporary(t);
  const first = await createRunDirectory(root, 'validation/gate', 'fast');
  await writeFile(path.join(first,'keep.txt'), 'first');
  const second = await createRunDirectory(root, 'validation/gate', 'fast');
  assert.notEqual(first, second); assert.equal(await readFile(path.join(first,'keep.txt'),'utf8'), 'first');
  for (const target of ['../outside','docs/new','validation/../docs/new']) await assert.rejects(createRunDirectory(root,target,'fast'));
});

test('affected test selection follows transitive imports and falls back for shared/unknown input', async t => {
  const root = await temporary(t);
  await mkdir(path.join(root,'scripts')); await mkdir(path.join(root,'tests'));
  await writeFile(path.join(root,'scripts','leaf.mjs'),'export const n=1;');
  await writeFile(path.join(root,'scripts','parent.mjs'),"export {n} from './leaf.mjs';");
  await writeFile(path.join(root,'tests','a.test.mjs'),"import {n} from '../scripts/parent.mjs';");
  await writeFile(path.join(root,'tests','b.test.mjs'),'');
  await writeFile(path.join(root,'tests','export.test.mjs'),'');
  assert.deepEqual((await selectTests(root,['scripts/leaf.mjs'])).files,['tests/a.test.mjs']);
  assert.deepEqual((await selectTests(root,['tests/b.test.mjs'])).files,['tests/b.test.mjs']);
  assert.deepEqual((await selectTests(root,['package.json'])).files,['tests/a.test.mjs','tests/b.test.mjs']);
});

test('cyclic imports cannot cache an incomplete affected-test closure', async t => {
  const root = await temporary(t); await mkdir(path.join(root,'scripts')); await mkdir(path.join(root,'tests'));
  await writeFile(path.join(root,'scripts/a.mjs'),"import './b.mjs';import './leaf.mjs';");
  await writeFile(path.join(root,'scripts/b.mjs'),"import './a.mjs';");
  await writeFile(path.join(root,'scripts/leaf.mjs'),'');
  await writeFile(path.join(root,'tests/a.test.mjs'),"import '../scripts/a.mjs';");
  await writeFile(path.join(root,'tests/b.test.mjs'),"import '../scripts/b.mjs';");
  await writeFile(path.join(root,'tests/unrelated.test.mjs'),'');
  assert.deepEqual((await selectTests(root,['scripts/leaf.mjs'])).files,['tests/a.test.mjs','tests/b.test.mjs']);
});

test('output directory junctions/symlinks are rejected before writing outside validation', async t => {
  const root = await temporary(t), outside = await temporary(t);
  await mkdir(path.join(root,'validation'));
  await symlink(outside,path.join(root,'validation/link'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(createRunDirectory(root,'validation/link/new','fast'),/Unsafe directory/);
  assert.deepEqual(await inventory(outside),[]);
});

test('real failed command records exit, stdout, stderr and timeout', async t => {
  const root = await temporary(t), options = { executable: process.execPath, cwd: root, logRoot: root };
  const result = await runCommand({ ...options, id: 'failure', args: ['-e', 'console.log("observed");console.error("injected failure");process.exit(7)'] });
  assert.equal(result.exitCode, 7); assert.equal(result.status, 'FAIL');
  assert.match(await readFile(result.stderr,'utf8'), /injected failure/);
  assert.match(await readFile(result.stdout,'utf8'), /observed/);
  const timeout = await runCommand({ ...options, id: 'timeout', args: ['-e','setInterval(()=>{},1000)'], timeoutMs: 150 });
  assert.equal(timeout.timedOut, true); assert.equal(timeout.status, 'FAIL');
  const absent = await runCommand({ ...options, id: 'missing', executable: path.join(root,'missing-program'), args: [] });
  assert.equal(absent.status,'FAIL'); assert.match(absent.error,/ENOENT/);
});

test('full fast runner catches an injected unit failure, preserves sources and repeat history', async t => {
  const root = await temporary(t);
  await mkdir(path.join(root,'tests'));
  await writeFile(path.join(root,'.gitignore'),'validation/\n');
  await writeFile(path.join(root,'tests','failure.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';test('injected failure',()=>assert.fail('intentional'));\n");
  const git = args => exec('git',args,{cwd:root,windowsHide:true});
  await git(['init']); await git(['add','.']);
  await git(['-c','user.name=Gate Test','-c','user.email=gate-test@example.invalid','-c','commit.gpgsign=false','commit','-m','fixture']);
  const options = parseGateOptions(['--mode','fast','--base','HEAD','--changed','tests/failure.test.mjs']);
  const first = await runGate(options,{root}), digest = await digestFile(path.join(first.out,'report.json'));
  assert.equal(first.report.status,'FAIL');
  assert.equal(first.report.steps.find(s=>s.id==='unit').tests.fail,1);
  assert.equal(first.report.steps.find(s=>s.id==='source-unchanged').status,'PASS');
  const second = await runGate(options,{root}); assert.notEqual(first.out,second.out);
  assert.deepEqual(await digestFile(path.join(first.out,'report.json')),digest);
  const artifacts = JSON.parse(await readFile(path.join(first.out,'artifacts.json'),'utf8'));
  for (const item of artifacts.files) assert.deepEqual(await digestFile(path.join(first.out,item.file)),{bytes:item.bytes,sha256:item.sha256});
  assert.match(await readFile(path.join(first.out,'report.md'),'utf8'), /FAIL/);
});

test('fixed baseline archive validates every Git blob; corrupt supplied source cannot execute', async t => {
  const root = await temporary(t);
  let serial = 0;
  const command = (id, executable, args, timeoutMs) => runCommand({ id: `${++serial}-${id}`, executable, args, cwd: ROOT, logRoot: path.join(root,'logs'), timeoutMs });
  const baseline = await prepareBaseline({ root: ROOT, directory: path.join(root,'trusted'), variant:'screenshot-stage', command });
  assert.equal(baseline.commit, VARIANTS['screenshot-stage'].commit); assert.ok(baseline.files.length > 20);
  for (const file of baseline.files) assert.equal((await digestFile(path.join(baseline.source,file.file))).sha256, file.sha256);
  await writeFile(path.join(baseline.source, baseline.files[0].file),'corrupted source');
  await assert.rejects(prepareBaseline({ root: ROOT, directory: path.join(root,'rejected'), variant:'screenshot-stage', supplied:baseline.source, command }), /Baseline mismatch/);
});

test('archive integrity accepts authenticated bytes and rejects tampering', async t => {
  const root = await temporary(t); await mkdir(path.join(root,'docs/visual-upgrade'),{recursive:true});
  const bytes = Buffer.from('archive fixture'); await writeFile(path.join(root,'data.zip'),bytes);
  for (const name of ['m2a-evidence.json','m2b-evidence.json','m3-evidence.json','pr30-review-evidence.json','m4-evidence.json']) {
    await writeFile(path.join(root,'docs/visual-upgrade',name),JSON.stringify({archive:'data.zip',bytes:bytes.length,sha256:sha256(bytes)}));
  }
  assert.equal((await verifyEvidence(root)).length,5);
  await writeFile(path.join(root,'data.zip'),'archive fixturE');
  await assert.rejects(verifyEvidence(root),/Evidence SHA-256 mismatch/);
});

test('Markdown distinguishes unselected checks and does not claim human signoff', () => {
  const report = markdownReport({status:'PASS',mode:'fast',steps:[{id:'release',status:'NOT-RUN',reason:'Outside scope'}]});
  assert.match(report,/NOT-RUN/); assert.match(report,/not-performed/); assert.match(report,/selected scope/);
});
