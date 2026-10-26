// Read data from a pinned source snapshot without executing code from that root.
import path from 'node:path';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Md2CardError } from './errors.mjs';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const reject = (message, details = {}) => { throw new Md2CardError('EVIDENCE_SOURCE_INVALID', message, details); };
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
// These modules and dependencies supply all interpretation/rendering semantics.
// Evidence tools themselves may change without silently changing the source parser.
export const SEMANTIC_FILES = Object.freeze([
  'package.json', 'package-lock.json',
  ...['assets', 'body-size', 'browser', 'doctor', 'document', 'errors', 'markdown', 'pagination',
    'qa', 'refinement-input', 'render', 'semantic', 'tail-balance', 'templates', 'typography', 'visual-diagnostics',
    'validate-refinement', 'validate-visual-stress']
    .map(name => `scripts/${name}.mjs`),
  'assets/themes.css', 'assets/layouts.css', 'assets/templates.css'
]);

export function evidencePath(relative) {
  if (typeof relative !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(relative) ||
      relative.startsWith('/') || relative.split('/').some(part => !part || part === '.' || part === '..')) {
    reject('Evidence paths must be relative repository paths.', { path: relative });
  }
  return relative;
}

export async function readEvidenceFile(root, relative, maxBytes = MAX_FILE_BYTES) {
  evidencePath(relative);
  const base = await realpath(root);
  const resolved = await realpath(path.join(base, relative));
  const inside = path.relative(base, resolved);
  if (inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
    reject('Evidence file escapes its declared root.', { path: relative });
  }
  const info = await stat(resolved);
  if (!info.isFile() || info.size > maxBytes) reject('Evidence must be a bounded regular file.', { path: relative });
  const bytes = await readFile(resolved);
  if (bytes.length > maxBytes) reject('Evidence file exceeded its byte budget.', { path: relative });
  return bytes;
}

/** expected identity must come from independently checked run/commit metadata. */
export async function verifySourceSnapshot({ sourceRoot, gitRepository = ROOT, sourceManifest, expected }) {
  if (!expected || !/^[a-f0-9]{40}$/.test(expected.commit) || !/^[a-f0-9]{40}$/.test(expected.tree) ||
      !/^[a-f0-9]{64}$/.test(expected.sourceSha256)) reject('A pinned commit, tree and source-manifest digest are required.');
  if (!sourceManifest || sourceManifest.git?.commit !== expected.commit || sourceManifest.git?.tree !== expected.tree ||
      sourceManifest.git?.dirty !== false || !Array.isArray(sourceManifest.files) || !sourceManifest.files.length || sourceManifest.files.length > 10000 ||
      sha256(JSON.stringify(sourceManifest.files)) !== expected.sourceSha256 || sourceManifest.sha256 !== expected.sourceSha256) {
    reject('Source manifest disagrees with the pinned clean snapshot.');
  }
  const run = args => exec('git', args, { cwd: gitRepository, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 20000, windowsHide: true });
  const tree = (await run(['rev-parse', `${expected.commit}^{tree}`])).stdout.trim();
  if (tree !== expected.tree) reject('Commit resolves to a different Git tree.');
  const listing = (await run(['ls-tree', '-r', '-z', expected.tree])).stdout;
  const blobs = new Map(listing.split('\0').filter(Boolean).map(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    return match ? [match[3], match[2]] : [entry, null];
  }));
  const files = new Map(), contents = new Map();
  let total = 0;
  for (const item of sourceManifest.files) {
    evidencePath(item?.file);
    if (files.has(item.file) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > MAX_FILE_BYTES || !/^[a-f0-9]{64}$/.test(item.sha256)) reject('Invalid or duplicate source entry.');
    total += item.bytes;
    if (total > MAX_TOTAL_BYTES) reject('Source snapshot exceeds its total byte budget.');
    const bytes = await readEvidenceFile(sourceRoot, item.file);
    const objectId = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256 || blobs.get(item.file) !== objectId) reject('Source bytes disagree with the manifest or committed Git blob.', { path: item.file });
    files.set(item.file, item.sha256);
    contents.set(item.file, bytes);
  }
  for (const file of SEMANTIC_FILES) {
    let matches = files.has(file);
    if (matches && file === 'package.json') {
      const runtime = bytes => {
        const manifest = JSON.parse(bytes);
        return Object.fromEntries(['name', 'version', 'type', 'engines', 'dependencies', 'optionalDependencies', 'overrides'].map(key => [key, manifest[key]]));
      };
      matches = isDeepStrictEqual(runtime(await readEvidenceFile(ROOT, file)), runtime(contents.get(file)));
    } else if (matches) matches = sha256(await readEvidenceFile(ROOT, file)) === files.get(file);
    if (!matches) {
      reject('Local interpretation semantics differ from the verified snapshot; use the matching trusted checkout.', { path: file });
    }
  }
  return Object.freeze({
    commit: expected.commit, tree, sourceSha256: expected.sourceSha256,
    files: Object.freeze(Object.fromEntries(files)), bytes: total,
    read(file) {
      evidencePath(file);
      if (!contents.has(file)) reject('Required source entry is missing.', { path: file });
      return Buffer.from(contents.get(file));
    },
    async readCommitted(file) {
      // Some declarative registries were not in the legacy runner manifest.
      // Read their bytes from the already verified Git tree, never an unbound
      // working copy, and do not pretend they were in sourceSha256.
      evidencePath(file);
      if (!blobs.has(file)) reject('Required committed file is missing.', { path: file });
      const result = await exec('git', ['show', `${tree}:${file}`], { cwd: gitRepository, encoding: 'buffer', maxBuffer: MAX_FILE_BYTES, timeout: 20000, windowsHide: true });
      const bytes = result.stdout;
      if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== blobs.get(file)) reject('Committed file identity changed.', { path: file });
      return bytes;
    }
  });
}
