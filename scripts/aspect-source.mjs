// Source roots supply data only. Interpretation always uses trusted local imports.
import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { SEMANTIC_FILES, evidencePath, readEvidenceFile, sha256 } from './evidence-source.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const ASPECT_SOURCE_FILES = Object.freeze([...SEMANTIC_FILES,
  'scripts/validate-aspects.mjs', 'scripts/aspect-source.mjs', 'scripts/evidence-source.mjs']);
const fail = (message, file) => { throw Object.assign(new Error(message), { code: 'ASPECT_SOURCE_INVALID', details: { file } }); };
const runtimePackage = bytes => {
  const pkg = JSON.parse(bytes);
  return Object.fromEntries(['name', 'version', 'type', 'engines', 'dependencies', 'optionalDependencies', 'overrides'].map(key => [key, pkg[key]]));
};

// Pin the executing checkout at module initialization, not to a later mutable root.
const executionBytes = new Map(await Promise.all(ASPECT_SOURCE_FILES.map(async file => [file, await readEvidenceFile(ROOT, file)])));

export async function verifyAspectSource(repository) {
  const hashes = {};
  for (const file of ASPECT_SOURCE_FILES) {
    const bytes = await readEvidenceFile(repository, file), trusted = executionBytes.get(file);
    const matches = file === 'package.json' ? isDeepStrictEqual(runtimePackage(bytes), runtimePackage(trusted)) : bytes.equals(trusted);
    if (!matches) fail('Aspect source semantics differ from the executing checkout.', file);
    hashes[file] = sha256(bytes);
  }
  return hashes;
}

export async function resolveAspectPath(repository, relative, kind = 'file') {
  evidencePath(relative);
  const root = await realpath(repository), resolved = await realpath(path.join(root, relative));
  const inside = path.relative(root, resolved);
  if (inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) fail('Aspect input or asset escapes the repository root.', relative);
  const info = await stat(resolved);
  if (kind === 'directory' ? !info.isDirectory() : !info.isFile()) fail(`Aspect ${kind} has the wrong filesystem type.`, relative);
  return resolved;
}
