import {verifyDefaultBodyCompatibility} from './default-body-compatibility.mjs';
// Offline verification of a curated CI binding. These pins were independently
// checked against GitHub/Git and the original ZIP, not supplied by a gallery row.
// This is a repository review trust anchor, not a signature or proof that a human
// looked at an image. A separate, explicit visual attestation is still required.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEMANTIC_FILES, sha256, evidencePath, readEvidenceFile } from './evidence-source.mjs';
import { buildRefinementTextInput } from './refinement-input.mjs';

export const COMPARISON_BATCH = Object.freeze({
  id: 'refinement-run-40079964688',
  root: 'docs/evidence/refinement-run-40079964688',
  bindingSha256: '647ad2a81847358e4e84ee8eac4cc7f58604b457f665003ba64efa13c876576f',
  equivalenceSha256: '32b31b824947e506c8af5b0b528d8c7b5c60db17c882a5ea05e4b5a82fc65486',
  previousReviewSha256: 'aa376ff4c32bddbfc891ec3eb2f0d05114831fe32ec8d245e60645f67c0130a2',
  identity: Object.freeze({
    commit: '05f6bb6e484cb8887ea037e520a733db9303563d',
    tree: '9dee88002e629b44dbd7e141874fe5388b5e7b9d',
    sourceSha256: '473cd63ff3ff57cacdcf1bee29044d53bf02ce062b4b40bc027db529462859c1',
    runUrl: 'https://github.com/Activer007/md2card-skill/actions/runs/40079964688',
    artifactId: 12554054288,
    archiveSha256: '794985f23429b86be89a8790070ee4f2e4b168d8160239bcb5dfc06761d52d5b'
  })
});
const SHA = /^[a-f0-9]{64}$/;
const EXECUTION_ROOT = fileURLToPath(new URL('../', import.meta.url));
const equal = (actual, expected, label) => assert.deepEqual(actual, expected, label);
const text = value => typeof value === 'string' && value.trim().length > 0;
const runtimePackage = bytes => {
  const pkg = JSON.parse(bytes);
  return Object.fromEntries(['name', 'version', 'type', 'engines', 'dependencies', 'optionalDependencies', 'overrides'].map(key => [key, pkg[key]]));
};

export function comparisonRecordFiles(record) {
  return [record.input, record.manifest, record.diagnostic, ...(record.artifacts ?? []), ...(record.mobile ?? []), ...(record.pdfText ?? [])].filter(Boolean);
}

// Memoized per gallery build, never across builds or source-root changes.
export function comparisonEvidenceReader(readRepoFile) {
  let batchPromise;
  const readHash = async (file, expected, bytes) => {
    evidencePath(file); assert.match(expected, SHA, `${file}: required digest`);
    const result = await readRepoFile(file);
    equal(sha256(result), expected, `${file}: byte digest mismatch`);
    if (bytes !== undefined) equal(result.length, bytes, `${file}: byte count mismatch`);
    return result;
  };
  const load = async () => {
    const root = COMPARISON_BATCH.root;
    const binding = JSON.parse(await readHash(`${root}/binding.json`, COMPARISON_BATCH.bindingSha256));
    equal(binding.identity, COMPARISON_BATCH.identity, 'pinned CI identity');
    equal(binding.status, 'artifact-bound-visual-review-pending');
    equal(binding.visualReview, 'not-performed', 'technical binding cannot grant visual acceptance');
    const manifest = JSON.parse(await readHash(`${root}/refinement/source-files.json`, binding.sourceManifestFileSha256));
    equal(sha256(JSON.stringify(manifest.files)), binding.identity.sourceSha256, 'source manifest identity');
    await readHash(`${root}/refinement/summary.json`, binding.summarySha256);
    // The legacy manifest excludes the comparison plan. Preserve the exact plan
    // read by the binder from the independently pinned Git tree as a separate file.
    const plan = JSON.parse(await readHash(`${root}/comparison-plan.json`, binding.comparisonSpecSha256));
    const files = new Map(manifest.files.map(entry => [entry.file, entry]));
    const compatibility = await verifyDefaultBodyCompatibility(readRepoFile);
    for (const file of SEMANTIC_FILES) {
      if (compatibility.accepts(file, files.get(file)?.sha256)) continue;
      assert.ok(files.has(file), `missing source semantics: ${file}`);
      if (file === 'package.json') {
        const original = await readHash(`${root}/source-package.json`, files.get(file).sha256);
        equal(runtimePackage(await readRepoFile(file)), runtimePackage(original), 'runtime package differs from evidence');
        equal(runtimePackage(await readEvidenceFile(EXECUTION_ROOT, file)), runtimePackage(original), 'executing runtime package differs from evidence');
      } else {
        await readHash(file, files.get(file).sha256, files.get(file).bytes);
        equal(sha256(await readEvidenceFile(EXECUTION_ROOT, file)), files.get(file).sha256, `executing semantics differ: ${file}`);
      }
    }
    // Current CI source differs from PR20. Retain the prior visual observation
    // only with pinned evidence of identical pixels, not a declared equivalence.
    const equivalenceFile = `${root}/visual-equivalence.json`;
    const equivalence = JSON.parse(await readHash(equivalenceFile, COMPARISON_BATCH.equivalenceSha256));
    equal(equivalence.newIdentity, binding.identity, 'equivalence source identity');
    equal(equivalence.newBindingSha256, COMPARISON_BATCH.bindingSha256);
    equal(equivalence.previousReview, { file: 'docs/comparison-visual-review.json', sha256: COMPARISON_BATCH.previousReviewSha256 });
    const previous = JSON.parse(await readHash(equivalence.previousReview.file, COMPARISON_BATCH.previousReviewSha256));
    equal(previous.identity, equivalence.oldIdentity);
    const ids = binding.groups.flatMap(group => group.records);
    equal(equivalence.records.map(record => record.id).sort(), [...ids].sort(), 'complete equivalence inventory');
    const equivalenceFiles = [equivalenceFile, equivalence.previousReview.file, ...compatibility.files];
    for (const id of ids) {
      const record = binding.records.find(record => record.id === id), proof = equivalence.records.find(record => record.id === id);
      const old = previous.records.find(record => record.id === id); assert.ok(old, 'missing previous pixel review');
      equal(proof.previousReviewSha256, COMPARISON_BATCH.previousReviewSha256);
      const unchanged = [record.input, ...(record.mobile ?? []), ...(record.artifacts ?? []).filter(a => ['png', 'contact-sheet'].includes(a.format)), ...(record.pdfText ?? []), ...(record.diagnostic ? [record.diagnostic] : [])];
      equal(proof.equalFiles, unchanged.map(({ file, sha256 }) => ({ file, sha256 })), 'exact equivalent files');
      for (const entry of unchanged) equal(old.files.find(file => file.file === entry.file)?.sha256, entry.sha256, 'previously reviewed byte identity');
      if (record.outcome === 'exported') {
        const rasterFile = `${root}/native-pdf-pages/${id}.png`;
        equal(proof.nativePdf, { previousPdfSha256: old.pdfPageInspection.pdfSha256, newPdfSha256: record.artifacts.find(a => a.format === 'pdf').sha256,
          equalRasterSha256: old.pdfPageInspection.rasterSha256, rasterFile, pageCount: 1, pagePoints: [810, 1080] });
        await readHash(rasterFile, old.pdfPageInspection.rasterSha256); equivalenceFiles.push(rasterFile);
      }
    }
    return { binding, plan, equivalenceFiles };
  };
  return async (group, versions) => {
    try {
      equal(group.evidence?.batch, COMPARISON_BATCH.id, 'unknown comparison batch');
      // Reject the old self-declared identity/record contract rather than silently
      // ignoring conflicting fields that could mislead reviewers.
      equal(Object.keys(group.evidence).sort(), ['batch', 'review', 'reviewSha256', 'visualReview', 'visualReviewSha256'].sort(), 'comparison evidence fields');
      batchPromise ??= load();
      const { binding, plan, equivalenceFiles } = await batchPromise;
      const original = plan.groups.find(item => item.id === group.id);
      assert.ok(original, 'unknown bound group');
      for (const field of ['input', 'inputSha256', 'templates']) equal(group[field], original[field], `bound group ${field}`);
      equal(group.requiredRefusals ?? {}, original.requiredRefusals ?? {}, 'bound refusal boundary');
      const body = await readHash(group.input, group.inputSha256);
      const selected = binding.groups.find(item => item.id === group.id).records.map(id => binding.records.find(record => record.id === id));
      const proof = group.evidence;
      const prose = (await readHash(proof.review, proof.reviewSha256)).toString('utf8');
      const review = JSON.parse(await readHash(proof.visualReview, proof.visualReviewSha256));
      equal(review.schemaVersion, 1); equal(review.bindingSha256, COMPARISON_BATCH.bindingSha256, 'review binding');
      equal(review.identity, binding.identity, 'review source identity'); equal(review.scope, binding.scope, 'review scope');
      assert.ok(text(review.reviewer), 'reviewer is required');
      assert.ok(prose.includes(binding.identity.commit) && prose.includes(group.id), 'review must identify commit and group');
      assert.ok(Array.isArray(review.records), 'visual records required');
      equal(new Set(review.records.map(r => r.id)).size, review.records.length, 'duplicate visual review');
      assert.ok(review.records.every(r => binding.records.some(item => item.id === r.id)), 'unknown visual review case');
      const previews = [], refusals = [];
      for (const record of selected) {
        equal(record.version, versions.get(record.template), 'current template version');
        equal(record.bodySha256, group.inputSha256, 'authored body');
        const input = await readHash(`${COMPARISON_BATCH.root}/${record.input.file}`, record.input.sha256, record.input.bytes);
        equal(input, Buffer.from(buildRefinementTextInput(record.template, body.toString('utf8'))), 'exact generated input');
        const reviewed = review.records.find(item => item.id === record.id);
        assert.ok(reviewed, `missing visual review: ${record.id}`);
        equal(reviewed.files, comparisonRecordFiles(record).map(({ file, sha256 }) => ({ file, sha256 })), 'reviewed bytes must be the bound input and all artifacts');
        assert.ok(Array.isArray(reviewed.notes) && reviewed.notes.every(text), 'review notes');
        // Re-read every bound file, including the native PDF and mobile images.
        // The trusted binder already checked their semantics against this source.
        for (const entry of comparisonRecordFiles(record)) await readHash(`${COMPARISON_BATCH.root}/${entry.file}`, entry.sha256, entry.bytes);
        const requireLink = file => assert.ok(prose.includes(`(${path.posix.relative(path.posix.dirname(proof.review), `${COMPARISON_BATCH.root}/${file}`)})`), `missing review artifact link: ${file}`);
        requireLink(record.input.file);
        if (record.outcome === 'expected-overflow') {
          equal(reviewed.status, 'reviewed-expected-overflow', 'refusal review status');
          equal(reviewed.checks, { exactInput: 'pass', overflowDiagnostic: 'pass', noSuccessClaim: 'pass' }, 'refusal checks');
          requireLink(record.diagnostic.file);
          refusals.push({ template: record.template, reason: group.requiredRefusals[record.template], path: `${COMPARISON_BATCH.root}/${record.diagnostic.file}`, sha256: record.diagnostic.sha256 });
        } else {
          assert.ok(['reviewed-exact-fixture', 'reviewed-with-limitations'].includes(reviewed.status), 'visual review incomplete');
          equal(reviewed.checks, { fullPng: 'pass', mobile375: 'pass', mobile390: 'pass', nativePdf: 'pass', sourcePreservation: 'pass' }, 'complete visual checks');
          if (reviewed.status === 'reviewed-with-limitations') assert.ok(reviewed.notes.length, 'limitations must be visible');
          const png = record.artifacts.find(a => a.format === 'png'), pdf = record.artifacts.find(a => a.format === 'pdf');
          for (const entry of [png, pdf, ...record.mobile]) requireLink(entry.file);
          previews.push({ template: record.template, version: record.version, path: `${COMPARISON_BATCH.root}/${png.file}`, width: 1080, height: 1440, sha256: png.sha256, notes: reviewed.notes });
        }
      }
      const evidenceFiles = [...new Set([
        `${COMPARISON_BATCH.root}/binding.json`, `${COMPARISON_BATCH.root}/comparison-plan.json`, `${COMPARISON_BATCH.root}/source-package.json`,
        `${COMPARISON_BATCH.root}/refinement/source-files.json`, `${COMPARISON_BATCH.root}/refinement/summary.json`,
        ...SEMANTIC_FILES, ...equivalenceFiles, proof.review, proof.visualReview,
        ...selected.flatMap(record => comparisonRecordFiles(record).map(entry => `${COMPARISON_BATCH.root}/${entry.file}`))
      ])];
      return { previews, refusals, evidenceFiles };
    } catch (error) {
      throw new Error(`GALLERY_DISCOVERY_INVALID: ${error.message.split('\n')[0].slice(0, 300)}`);
    }
  };
}
