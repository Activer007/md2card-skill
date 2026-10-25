// Narrow compatibility bridge for historical gallery artifacts. Evidence binders
// still require an exact source snapshot; this does not certify custom body sizes.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readEvidenceFile, sha256 } from './evidence-source.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_BODY_PROOF = 'docs/body-size-default-compatibility.json';
export const DEFAULT_BODY_PROOF_SHA256 = '9db18628183d11a5f58b698ba5b578f752d2ec37150b99de5ff61fece9fc6390';
const FILES = ['scripts/document.mjs', 'scripts/markdown.mjs', 'scripts/render.mjs', 'scripts/body-size.mjs'];
export const STAGE_DEFAULT_PROOF = 'docs/visual-upgrade/m2a-default-compatibility.json';
export const STAGE_DEFAULT_PROOF_SHA256 = 'f148ae42798c1b71f1c3e39ff42c4dc78acded4766918ce6e2dbfd4da1735bab';

export async function verifyDefaultBodyCompatibility(readRepoFile) {
  const proofBytes = await readRepoFile(DEFAULT_BODY_PROOF);
  assert.equal(sha256(proofBytes), DEFAULT_BODY_PROOF_SHA256, 'default body proof changed');
  const proof = JSON.parse(proofBytes);
  assert.deepEqual(Object.keys(proof.files), FILES);
  const stageBytes = await readRepoFile(STAGE_DEFAULT_PROOF);
  assert.equal(sha256(stageBytes), STAGE_DEFAULT_PROOF_SHA256, 'stage default proof changed');
  const stage = JSON.parse(stageBytes);
  assert.deepEqual(Object.keys(stage.files), [...FILES, 'scripts/templates.mjs']);
  assert.equal(stage.scope, 'without-visualVariant-only');
  for (const file of FILES) {
    assert.equal(stage.files[file].baselineSha256, proof.files[file].currentSha256, `${file}: compatibility chain differs`);
  }
  for (const file of Object.keys(stage.files)) {
    const expected = stage.files[file].currentSha256;
    assert.equal(sha256(await readRepoFile(file)), expected, `${file}: source root differs from default body proof`);
    assert.equal(sha256(await readEvidenceFile(ROOT, file)), expected, `${file}: executing semantics differ from default body proof`);
  }
  return Object.freeze({
    files: [DEFAULT_BODY_PROOF, STAGE_DEFAULT_PROOF, ...Object.keys(stage.files)],
    accepts(file, historicalHash) {
      return (Object.hasOwn(proof.files, file) && proof.files[file].baselineSha256 === (historicalHash ?? null)) ||
        (file === 'scripts/templates.mjs' && stage.files[file].baselineSha256 === historicalHash);
    }
  });
}
