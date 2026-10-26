// Orchestration helpers only: existing renderer and validators own all QA rules.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { readFile, writeFile, mkdir, mkdtemp, readdir, lstat, realpath, access } from 'node:fs/promises';
import { openEvidenceArchive } from './evidence-archive.mjs';
import { readEvidenceFile } from './evidence-source.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const slash = value => value.replaceAll('\\', '/');
export const json = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
export const environment = () => ({ platform: process.platform, arch: process.arch, release: os.release(), node: process.version,
  executable: process.execPath, cpus: os.availableParallelism?.() ?? os.cpus().length });

export async function digestFile(file) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(file)) { bytes += chunk.length; hash.update(chunk); }
  return { bytes, sha256: hash.digest('hex') };
}

export function within(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

// Refuse symlink/junction components before creating any directory through them.
export async function safeDirectory(root, target) {
  root = await realpath(root); target = path.resolve(target);
  assert.ok(within(root, target), 'Output must be below repository validation/');
  let cursor = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    cursor = path.join(cursor, part);
    try { await mkdir(cursor); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await lstat(cursor);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), `Unsafe directory: ${cursor}`);
    assert.equal(await realpath(cursor), cursor, `Directory resolves elsewhere: ${cursor}`);
  }
  return target;
}

export async function createRunDirectory(root, outputRoot, mode) {
  root = await realpath(root);
  const target = path.resolve(root, outputRoot ?? 'validation/local-quality');
  assert.ok(within(path.join(root, 'validation'), target), 'Output root must be a subdirectory of validation/');
  await safeDirectory(root, target);
  return mkdtemp(path.join(target, `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${mode}-`));
}

export async function inventory(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      assert.ok(!entry.isSymbolicLink(), `Symlink in artifacts: ${file}`);
      if (entry.isDirectory()) await walk(file);
      else { assert.ok(entry.isFile(), `Non-file artifact: ${file}`); files.push({ file: slash(path.relative(root, file)), ...await digestFile(file) }); }
    }
  }
  await walk(root); return files;
}

export function parseTestSummary(output) {
  const values = {};
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const matches = [...output.matchAll(new RegExp(`^# ${key} (\\d+)\\s*$`, 'gm'))];
    if (matches.length !== 1) throw new Error(`Expected one TAP ${key} summary, found ${matches.length}`);
    values[key] = Number(matches[0][1]);
  }
  assert.ok(values.tests > 0, 'No tests executed');
  assert.equal(values.tests, values.pass + values.fail + values.cancelled + values.skipped + values.todo, 'Incomplete TAP summary');
  return values;
}

export function testStatus(exitCode, summary) {
  if (exitCode !== 0 || summary.fail || summary.cancelled) return 'FAIL';
  return summary.skipped || summary.todo ? 'SKIP' : 'PASS';
}

export function aggregate(steps) {
  if (steps.some(s => s.status === 'FAIL' || s.status === 'SKIP')) return 'FAIL';
  if (steps.some(s => s.status === 'BLOCKED' || (s.selected && s.status === 'NOT-RUN'))) return 'BLOCKED';
  return steps.some(s => s.status === 'PASS') ? 'PASS' : 'BLOCKED';
}

// Every external process has its own bounded logs. Never use a shell or invoke npm.cmd.
export async function runCommand({ executable, args = [], cwd, env = process.env, logRoot, id, timeoutMs = 45 * 60 * 1000 }) {
  assert.match(id, /^[a-z0-9-]+$/);
  await mkdir(logRoot, { recursive: true });
  const stdout = path.join(logRoot, `${id}.stdout.log`), stderr = path.join(logRoot, `${id}.stderr.log`);
  const out = createWriteStream(stdout, { flags: 'wx' }), err = createWriteStream(stderr, { flags: 'wx' });
  const started = Date.now(); let failure, timedOut = false, logBytes = 0;
  const record = { executable, args, cwd, startedAt: new Date(started).toISOString(), timeoutMs, stdout, stderr };
  let child, timer;
  try {
    child = spawn(executable, args, { cwd, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const consume = stream => chunk => {
      logBytes += chunk.length;
      if (logBytes > 64 * 1024 * 1024) { failure = 'Combined logs exceeded 64 MiB'; child.kill(); }
      else stream.write(chunk);
    };
    child.stdout.on('data', consume(out)); child.stderr.on('data', consume(err));
    out.on('error', error => { failure = error.message; child.kill(); });
    err.on('error', error => { failure = error.message; child.kill(); });
    timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const result = await new Promise(resolve => {
      child.on('error', error => { failure = `${error.code ?? 'SPAWN_ERROR'}: ${error.message}`; });
      child.on('close', (exitCode, signal) => resolve({ exitCode, signal }));
    });
    Object.assign(record, result);
  } finally {
    clearTimeout(timer); out.end(); err.end();
    await Promise.all([finished(out), finished(err)]);
  }
  Object.assign(record, { elapsedMs: Date.now() - started, timedOut, error: failure ?? null });
  record.status = timedOut || failure || record.exitCode !== 0 ? 'FAIL' : 'PASS';
  return record;
}

export async function resolveNpm(explicit) {
  const candidates = explicit ? [explicit] : [process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].filter(Boolean);
  for (const file of candidates) {
    try { await access(file); assert.match(file, /npm-cli\.js$/); return path.resolve(file); } catch { /* Try next known installation layout. */ }
  }
  throw new Error('npm CLI not found. Run through npm run quality, or supply --npm-cli /path/to/npm-cli.js.');
}

export const VARIANTS = Object.freeze({
  'screenshot-stage': { script: 'validate-screenshot-stage.mjs', commit: 'd73f405c4b5a1891b79fbe51fdb009bd55c4cf69', allow: true },
  'photo-cover': { script: 'validate-photo-cover.mjs', commit: '38bd0dbd44c8b85e3875fa70280f6d63167ed1c0', allow: true },
  'visual-audit': { script: 'validate-visual-diagnostics.mjs', commit: '07ff4808dfd8fed73422d240dac5336ad1733566', allow: true },
  'wechat-covers': { script: 'validate-wechat-covers.mjs', commit: '0fff0fd8b625c4b35fac572e5474afa6f7a49118', allow: false },
  gallery: { script: 'validate-gallery.mjs', allow: true }
});

// Export from a pinned Git object, then verify every archive file against its Git blob.
// An optional supplied directory is comparison input only; it is never imported.
export async function prepareBaseline({ root, directory, variant, supplied, command }) {
  const commit = VARIANTS[variant]?.commit;
  assert.match(commit ?? '', /^[a-f0-9]{40}$/);
  await mkdir(directory); const source = path.join(directory, 'source'); await mkdir(source);
  const git = async (suffix, args) => {
    const result = await command(`baseline-${variant}-${suffix}`, 'git', args, 120000);
    assert.equal(result.status, 'PASS', `Baseline Git ${suffix} failed; see ${result.stderr}`);
    return readFile(result.stdout);
  };
  assert.equal((await git('commit', ['rev-parse', `${commit}^{commit}`])).toString().trim(), commit);
  const paths = ['scripts', 'assets', 'package.json', 'package-lock.json'];
  const entries = (await git('tree', ['ls-tree', '-r', '-z', commit, '--', ...paths])).toString('utf8').split('\0').filter(Boolean).map(line => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    assert.ok(match, `Baseline contains unsupported tree entry: ${line}`);
    return { file: match[3], blob: match[2] };
  });
  const zip = path.join(directory, 'source.zip');
  await git('archive', ['archive', '--format=zip', `--output=${zip}`, commit, '--', ...paths]);
  const archiveHash = await digestFile(zip), archive = await openEvidenceArchive(zip, archiveHash.sha256);
  assert.deepEqual([...archive.names].sort(), entries.map(e => e.file).sort(), 'Baseline archive inventory differs from pinned Git tree');
  const verified = [];
  for (const entry of entries) {
    const bytes = archive.read(entry.file), digest = sha256(bytes);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), entry.blob, `Git blob mismatch: ${entry.file}`);
    if (supplied) assert.equal(sha256(await readEvidenceFile(supplied, entry.file)), digest, `Baseline mismatch: ${entry.file}`);
    const file = path.join(source, entry.file); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes, { flag: 'wx' });
    verified.push({ ...entry, bytes: bytes.length, sha256: digest });
  }
  const identity = { commit, archive: archiveHash, supplied: supplied ? path.resolve(supplied) : null, source, files: verified };
  await json(path.join(directory, 'identity.json'), identity); return identity;
}

export async function verifyEvidence(root) {
  const records = [];
  for (const name of ['m2a-evidence.json', 'm2b-evidence.json', 'm3-evidence.json', 'pr30-review-evidence.json', 'm4-evidence.json']) {
    const metadata = `docs/visual-upgrade/${name}`, bytes = await readEvidenceFile(root, metadata), doc = JSON.parse(bytes);
    const reference = typeof doc.archive === 'string' ? { path: doc.archive, bytes: doc.bytes, sha256: doc.sha256 } : doc.archive;
    assert.ok(reference && Number.isSafeInteger(reference.bytes) && /^[a-f0-9]{64}$/.test(reference.sha256), `Invalid archive metadata: ${metadata}`);
    const file = reference.path ?? reference.file;
    // readEvidenceFile enforces realpath containment and bounded regular files.
    const artifact = await readEvidenceFile(root, file, 128 * 1024 * 1024);
    assert.equal(artifact.length, reference.bytes, `Evidence size mismatch: ${file}`);
    assert.equal(sha256(artifact), reference.sha256, `Evidence SHA-256 mismatch: ${file}`);
    records.push({ metadata, metadataSha256: sha256(bytes), file, bytes: artifact.length, sha256: reference.sha256 });
  }
  return records;
}
