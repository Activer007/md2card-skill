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

export const PHOTO_DEFAULT_PROOF = 'docs/visual-upgrade/m2b-default-compatibility.json';
export const PHOTO_DEFAULT_PROOF_SHA256 = '2e290407070df29d08a7e1c997d15e13112a977a4593a50be83f2bdda8083e0b';
export const AUDIT_DEFAULT_PROOF = 'docs/visual-upgrade/m3-default-compatibility.json';
export const AUDIT_DEFAULT_PROOF_SHA256 = '32c09b88664742fe8909dd8aa486ccd816fb0a056aab22e04613f0827afa88d3';
export const AUDIT_REVIEW_PROOF = 'docs/visual-upgrade/pr30-default-compatibility.json';
export const AUDIT_REVIEW_PROOF_SHA256 = 'c00f50d3ee44f323af4272bbc747a133303bf089f2a09ecc3b06114bb9951bc0';
export const COVER_DEFAULT_PROOF = 'docs/visual-upgrade/m4-default-compatibility.json';
export const COVER_DEFAULT_PROOF_SHA256 = '06e237f896158e9cd253deaa693cd19b747548449641a01c236748808401b639';

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
  const photoBytes = await readRepoFile(PHOTO_DEFAULT_PROOF);
  assert.equal(sha256(photoBytes), PHOTO_DEFAULT_PROOF_SHA256, 'photo default proof changed');
  const photo = JSON.parse(photoBytes);
  assert.equal(photo.scope, 'without-photo-cover-only');
  assert.deepEqual(Object.keys(photo.files), [...Object.keys(stage.files), 'scripts/browser.mjs']);
  for (const file of Object.keys(stage.files)) assert.equal(photo.files[file].baselineSha256, stage.files[file].currentSha256, `${file}: photo compatibility chain differs`);
  const auditBytes = await readRepoFile(AUDIT_DEFAULT_PROOF);
  assert.equal(sha256(auditBytes), AUDIT_DEFAULT_PROOF_SHA256, 'audit default proof changed');
  const audit = JSON.parse(auditBytes);
  assert.equal(audit.scope, 'without-visual-audit-only');
  assert.deepEqual(Object.keys(audit.files), [...Object.keys(photo.files), 'scripts/visual-diagnostics.mjs']);
  for (const file of Object.keys(photo.files)) assert.equal(audit.files[file].baselineSha256, photo.files[file].currentSha256, `${file}: audit compatibility chain differs`);
  assert.equal(audit.files['scripts/visual-diagnostics.mjs'].baselineSha256, null);
  const reviewBytes = await readRepoFile(AUDIT_REVIEW_PROOF);
  assert.equal(sha256(reviewBytes), AUDIT_REVIEW_PROOF_SHA256, 'audit review proof changed');
  const review = JSON.parse(reviewBytes);
  assert.equal(review.scope, audit.scope);
  assert.equal(review.baselineCommit, audit.baselineCommit);
  assert.deepEqual(Object.keys(review.files), Object.keys(audit.files));
  for (const file of Object.keys(audit.files)) {
    assert.equal(review.files[file].baselineSha256, audit.files[file].baselineSha256, `${file}: review baseline differs`);
  }
  const coverBytes = await readRepoFile(COVER_DEFAULT_PROOF);
  assert.equal(sha256(coverBytes), COVER_DEFAULT_PROOF_SHA256, 'cover default proof changed');
  const cover = JSON.parse(coverBytes);
  assert.equal(cover.scope, 'existing-combinations-before-M4-only');
  assert.equal(cover.baselineCommit, '0fff0fd8b625c4b35fac572e5474afa6f7a49118');
  assert.deepEqual(Object.keys(cover.files), Object.keys(review.files));
  assert.equal(cover.htmlRecords.length, 108);
  for (const file of Object.keys(review.files)) {
    assert.equal(cover.files[file].baselineSha256, review.files[file].currentSha256, `${file}: cover compatibility chain differs`);
    const expected = cover.files[file].currentSha256;
    assert.equal(sha256(await readRepoFile(file)), expected, `${file}: source root differs from default body proof`);
    assert.equal(sha256(await readEvidenceFile(ROOT, file)), expected, `${file}: executing semantics differ from default body proof`);
  }
  return Object.freeze({
    files: [DEFAULT_BODY_PROOF, STAGE_DEFAULT_PROOF, PHOTO_DEFAULT_PROOF, AUDIT_DEFAULT_PROOF, AUDIT_REVIEW_PROOF, COVER_DEFAULT_PROOF, ...Object.keys(audit.files)],
    accepts(file, historicalHash) {
      return (Object.hasOwn(proof.files, file) && proof.files[file].baselineSha256 === (historicalHash ?? null)) ||
        (file === 'scripts/templates.mjs' && stage.files[file].baselineSha256 === historicalHash) ||
        (file === 'scripts/browser.mjs' && photo.files[file].baselineSha256 === historicalHash) ||
        (file === 'scripts/visual-diagnostics.mjs' && historicalHash == null);
    }
  });
}
