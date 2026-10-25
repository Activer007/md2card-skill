import test from 'node:test';
import assert from 'node:assert/strict';
import { bindRefinementEvidence } from '../scripts/bind-refinement-evidence.mjs';
import { sha256 } from '../scripts/evidence-source.mjs';
import { refinementFixture, editJson, editManifest } from './helpers/refinement-evidence.mjs';

test('refinement binding checks the full artifact contract without promoting synthetic output', async t => {
  const fixture = await refinementFixture(t);
  const report = await bindRefinementEvidence(await fixture.pack());
  assert.deepEqual(report.counts, { cases: 22, exports: 17, refusals: 5, boundEntries: 199 });
  assert.equal(report.status, 'artifact-bound-visual-review-pending');
  assert.equal(report.visualReview, 'not-performed');
  assert.equal(report.checks.localPdfExtraction, 'not-performed');
  assert.ok(report.groups.every(group => group.state === 'pending'));
  assert.deepEqual(report.records.slice(0, 4).map(record => record.version), [2, 3, 3, 2]);
  const refusal = report.records.find(record => record.id === 'medium-T13');
  assert.equal(refusal.outcome, 'expected-overflow'); assert.equal(refusal.artifacts, undefined);
  const summaryFile = 'refinement/summary.json';
  const changeResult = (files, id, change) => editJson(files, summaryFile, s => change(s.results.find(r => r.id === id)));
  for (const [name, mutate] of [
    ['missing input digest', files => changeResult(files, 'short-T04', r => { delete r.inputSha256; })],
    ['changed input with a fresh digest', files => {
      const file = 'refinement/inputs/short-T04.md'; files.set(file, Buffer.from(files.get(file).toString().replace('给笔记', '替换原文')));
      changeResult(files, 'short-T04', r => { r.inputSha256 = sha256(files.get(file)); });
    }],
    ['substituted PDF bytes', files => files.set('refinement/short-T04/cards.pdf', files.get('refinement/short-T06/cards.pdf'))],
    ['missing PDF file', files => files.delete('refinement/short-T04/cards.pdf')],
    ['missing PDF digest', files => editManifest(files, 'short-T04', m => { delete m.artifacts.find(a => a.format === 'pdf').sha256; })],
    ['wrong manifest input with fresh hashes', files => editManifest(files, 'short-T04', m => { m.input = 'short-T06.md'; })],
    ['wrong card source with fresh hashes', files => editManifest(files, 'short-T04', m => { m.cards[0].sourceSha256 = '0'.repeat(64); })],
    ['wrong stylesheet with fresh hashes', files => editManifest(files, 'short-T04', m => { m.styleSha256.templates = '0'.repeat(64); })],
    ['wrong template with fresh hashes', files => editManifest(files, 'short-T04', m => { m.cards[0].template = 'T06'; })],
    ['hidden text in freshly hashed HTML', files => {
      const file = 'refinement/short-T04/cards.html'; files.set(file, Buffer.from(files.get(file).toString().replace('</style>', 'p { visibility:hidden }\n</style>')));
      editManifest(files, 'short-T04', m => Object.assign(m.artifacts.find(a => a.format === 'html'), { sha256: sha256(files.get(file)), bytes: files.get(file).length }));
    }],
    ['wrong full PNG dimensions with fresh hashes', files => {
      const file = 'refinement/short-T04/card-001.png', bytes = Buffer.from(files.get(file)); bytes.writeUInt32BE(1081, 16); files.set(file, bytes);
      editManifest(files, 'short-T04', m => { m.artifacts.find(a => a.format === 'png').sha256 = sha256(bytes); });
    }],
    ['source text missing from freshly hashed raw PDF text', files => {
      const file = 'refinement/short-T04/page-1-raw.txt'; files.set(file, Buffer.from('unrelated text'));
      changeResult(files, 'short-T04', r => { r.pdfText[0].sha256 = sha256(files.get(file)); });
    }],
    ['missing mobile record', files => changeResult(files, 'short-T04', r => { r.mobile.pop(); })],
    ['phone text below existing floor', files => changeResult(files, 'short-T04', r => { r.mobile[0].cards[0].noteMin = 9; })],
    ['cropped original image', files => changeResult(files, 'image-landscape', r => { r.mobile[0].cards[0].images[0].fit = 'cover'; })],
    ['source semantics replaced', files => changeResult(files, 'short-T04', r => { r.source.segments[0].pop(); })],
    ['another refusal diagnostic renamed as medium T13', files => {
      const file = 'refinement/medium-T13/overflow.json'; files.set(file, files.get('refinement/long-T13/overflow.json'));
      changeResult(files, 'medium-T13', r => { r.diagnostic.sha256 = sha256(files.get(file)); });
    }],
    ['refusal carries stale successful output', files => files.set('refinement/medium-T13/card-001.png', files.get('refinement/short-T13/card-001.png'))],
    ['duplicate case replaces another', files => editJson(files, summaryFile, s => { s.results[1] = s.results[0]; })],
    ['plan-only run', files => editJson(files, summaryFile, s => { s.mode = 'source-plan'; })],
    ['summary self-promotes visual review', files => editJson(files, summaryFile, s => { s.visualReview = 'accepted'; })]
  ]) await t.test(name, async () => {
    const files = new Map(fixture.files); mutate(files);
    // Re-pin the synthetic ZIP so these attack tests reach the inner contract;
    // real artifact digest substitution is separately refused by archive tests.
    await assert.rejects(bindRefinementEvidence(await fixture.pack(files)), error => ['REFINEMENT_EVIDENCE_INVALID', 'EVIDENCE_ARCHIVE_INVALID'].includes(error.code));
  });
});
