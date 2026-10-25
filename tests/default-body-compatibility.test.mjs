import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BODY_PROOF, verifyDefaultBodyCompatibility } from '../scripts/default-body-compatibility.mjs';
import { readEvidenceFile, sha256 } from '../scripts/evidence-source.mjs';
import { renderCards } from '../scripts/markdown.mjs';
import { buildDocument } from '../scripts/document.mjs';
import { defaultBodyFixtures } from './helpers/body-size-fixtures.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = file => readEvidenceFile(ROOT, file);

test('96 medium/default outputs match independently generated pre-feature HTML hashes', async () => {
  const proof = JSON.parse(await read(DEFAULT_BODY_PROOF));
  await verifyDefaultBodyCompatibility(read);
  const css = await Promise.all(['themes', 'layouts', 'templates'].map(name => readFile(new URL(`../assets/${name}.css`, import.meta.url), 'utf8')));
  const fixtures = await defaultBodyFixtures();
  assert.equal(fixtures.length, 96);
  assert.deepEqual(fixtures.map(f => f.id), proof.records.map(f => f.id));
  for (const [index, fixture] of fixtures.entries()) {
    const expected = proof.records[index];
    assert.equal(sha256(fixture.source), expected.inputSha256, fixture.id);
    const cards = renderCards(fixture.source, { resolveImage: fixture.resolveImage });
    const options = { ...fixture.options, footer: 'Proof footer', title: 'Default compatibility' };
    assert.deepEqual(options, expected.options);
    for (const bodySize of [undefined, 'medium']) {
      assert.equal(sha256(buildDocument(cards, { ...options, bodySize }, ...css)), expected.baselineHtmlSha256, fixture.id);
    }
  }
});

test('default compatibility refuses modified proof, renderer or newly imported body-size code', async () => {
  const good = await verifyDefaultBodyCompatibility(read);
  const proof = JSON.parse(await read(DEFAULT_BODY_PROOF));
  for (const file of good.files) {
    await assert.rejects(verifyDefaultBodyCompatibility(async name => {
      const bytes = await read(name);
      return name === file ? Buffer.concat([bytes, Buffer.from('\n')]) : bytes;
    }));
  }
  for (const [file, pin] of Object.entries(proof.files)) {
    assert.equal(good.accepts(file, pin.baselineSha256), true);
    assert.equal(good.accepts(file, 'f'.repeat(64)), false);
  }
  assert.equal(good.accepts('scripts/semantic.mjs', null), false);
});
