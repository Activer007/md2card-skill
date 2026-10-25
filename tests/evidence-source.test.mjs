import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SEMANTIC_FILES, sha256, evidencePath, readEvidenceFile, verifySourceSnapshot } from '../scripts/evidence-source.mjs';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const invalid = { code: 'EVIDENCE_SOURCE_INVALID' };
async function fixture(t, mutate) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'md2card-evidence-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [];
  for (const file of SEMANTIC_FILES) {
    let bytes = await readFile(path.join(ROOT, file));
    if (mutate) bytes = mutate(file, bytes);
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), bytes);
    files.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const git = async args => (await exec('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })).stdout.trim();
  await git(['init', '--quiet']);
  await git(['-c', 'core.autocrlf=false', 'add', '.']);
  const tree = await git(['write-tree']);
  // Isolated synthetic test object only: no user branch, hook, remote or signature.
  const commit = await git(['-c', 'user.name=Evidence Test', '-c', 'user.email=evidence@example.invalid', 'commit-tree', tree, '-m', 'synthetic evidence fixture']);
  const sourceSha256 = sha256(JSON.stringify(files));
  const sourceManifest = { git: { commit, tree, dirty: false }, sha256: sourceSha256, files };
  return { sourceRoot: root, gitRepository: root, sourceManifest, expected: { commit, tree, sourceSha256 } };
}

test('snapshot identity verifies real Git objects and all local semantic dependencies', async t => {
  const options = await fixture(t);
  const result = await verifySourceSnapshot(options);
  assert.equal(result.tree, options.expected.tree);
  assert.deepEqual(Object.keys(result.files), SEMANTIC_FILES);
  const file = 'scripts/templates.mjs', original = result.read(file);
  const exposed = result.read(file); exposed.fill(0);
  await writeFile(path.join(options.sourceRoot, file), '// replaced after verification\n');
  assert.deepEqual(result.read(file), original, 'verified snapshot bytes cannot be replaced through the filesystem or caller buffers');
  assert.deepEqual(await result.readCommitted(file), original, 'committed declarations come from the pinned tree');
  assert.throws(() => result.read('not-in-manifest.md'), invalid);
});

test('wrong commit tree, dirty identity, digest, duplicate and missing semantic files reject', async t => {
  const base = await fixture(t);
  for (const change of [
    o => { o.expected.tree = o.sourceManifest.git.tree = 'a'.repeat(40); },
    o => { o.sourceManifest.git.dirty = true; },
    o => { o.expected.sourceSha256 = 'b'.repeat(64); },
    o => { o.sourceManifest.files.push(o.sourceManifest.files[0]); },
    o => { o.sourceManifest.files = o.sourceManifest.files.filter(f => f.file !== 'scripts/templates.mjs'); }
  ]) {
    const options = structuredClone(base); change(options);
    if (options.sourceManifest.files.length !== base.sourceManifest.files.length) {
      options.expected.sourceSha256 = options.sourceManifest.sha256 = sha256(JSON.stringify(options.sourceManifest.files));
    }
    await assert.rejects(verifySourceSnapshot(options), invalid);
  }
});

test('freshly rehashed altered source cannot masquerade as the pinned Git snapshot', async t => {
  const options = await fixture(t);
  const file = 'scripts/templates.mjs';
  const bytes = Buffer.from('// changed semantics\n');
  await writeFile(path.join(options.sourceRoot, file), bytes);
  Object.assign(options.sourceManifest.files.find(f => f.file === file), { bytes: bytes.length, sha256: sha256(bytes) });
  options.expected.sourceSha256 = options.sourceManifest.sha256 = sha256(JSON.stringify(options.sourceManifest.files));
  await assert.rejects(verifySourceSnapshot(options), /committed Git blob/);
});

test('another valid committed root with different semantics is refused without importing it', async t => {
  const options = await fixture(t, (file, bytes) => file === 'scripts/templates.mjs' ? Buffer.from('throw new Error("UNTRUSTED_MODULE_EXECUTED");\n') : bytes);
  await assert.rejects(verifySourceSnapshot(options), error => error.code === invalid.code && /interpretation semantics differ/.test(error.message) && !/UNTRUSTED_MODULE_EXECUTED/.test(error.message));
});

test('test command additions do not change runtime identity; dependency changes do', async t => {
  const changePackage = update => (file, bytes) => {
    if (file !== 'package.json') return bytes;
    const value = JSON.parse(bytes); update(value); return Buffer.from(JSON.stringify(value));
  };
  await verifySourceSnapshot(await fixture(t, changePackage(p => { p.scripts['test:new'] = 'node --test tests/new.test.mjs'; })));
  await assert.rejects(verifySourceSnapshot(await fixture(t, changePackage(p => { p.dependencies['markdown-it'] = '0.0.0'; }))), invalid);
});

test('unsafe paths, prefix-similar roots and Windows junction escapes reject', async t => {
  for (const file of ['../outside', '/absolute', 'C:/absolute', 'a\\b', 'a//b', 'a/./b', 'https://example.com/a']) assert.throws(() => evidencePath(file), invalid);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'md2card-evidence-path-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'root'), outside = path.join(dir, 'root-other');
  await mkdir(root); await mkdir(outside); await writeFile(path.join(outside, 'source.md'), '# authentic bytes\n');
  await writeFile(path.join(root, 'inside.md'), '# safe\n');
  assert.equal((await readEvidenceFile(root, 'inside.md')).toString(), '# safe\n');
  try { await symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`Link creation unavailable: ${error.code}; boundary case was not executed.`); return; } throw error; }
  await assert.rejects(readEvidenceFile(root, 'linked/source.md'), /escapes its declared root/);
});
