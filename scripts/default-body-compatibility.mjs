// Narrow compatibility bridge for historical gallery artifacts. Evidence binders
// still require an exact source snapshot; this does not certify custom body sizes.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readEvidenceFile, sha256 } from './evidence-source.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_BODY_PROOF = 'docs/body-size-default-compatibility.json';
export const DEFAULT_BODY_PROOF_SHA256 = '9db18628183d11a5f58b698ba5b578f752d2ec37150b99de5ff61fece9fc6390';
const FILES = ['scripts/document.mjs', 'scripts/markdown.mjs', 'scripts/render.mjs', 'scripts/body-size.mjs'];

export async function verifyDefaultBodyCompatibility(readRepoFile) {
  const proofBytes = await readRepoFile(DEFAULT_BODY_PROOF);
  assert.equal(sha256(proofBytes), DEFAULT_BODY_PROOF_SHA256, 'default body proof changed');
  const proof = JSON.parse(proofBytes);
  assert.deepEqual(Object.keys(proof.files), FILES);
  for (const file of FILES) {
    const expected = proof.files[file].currentSha256;
    assert.equal(sha256(await readRepoFile(file)), expected, `${file}: source root differs from default body proof`);
    assert.equal(sha256(await readEvidenceFile(ROOT, file)), expected, `${file}: executing semantics differ from default body proof`);
  }
  return Object.freeze({
    files: [DEFAULT_BODY_PROOF, ...FILES],
    accepts(file, historicalHash) {
      return Object.hasOwn(proof.files, file) && proof.files[file].baselineSha256 === (historicalHash ?? null);
    }
  });
}
