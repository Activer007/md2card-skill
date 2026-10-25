import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openEvidenceArchive, crc32 } from '../scripts/evidence-archive.mjs';
import { sha256 } from '../scripts/evidence-source.mjs';
import { zipFixture } from './helpers/evidence-zip.mjs';

async function archive(t, bytes, digest = sha256(bytes)) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'md2card-zip-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'fixture.zip'); await writeFile(file, bytes);
  return { file, open: () => openEvidenceArchive(file, digest) };
}
const invalid = { code: 'EVIDENCE_ARCHIVE_INVALID' };
const entries = [{ name: 'refinement/summary.json', bytes: '{"synthetic":true}' }];

test('classic ZIP stored, deflated and both data descriptors decode checked bytes', async t => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926, 'standard CRC vector');
  for (const descriptor of [undefined, 'signed', 'unsigned']) {
    const bytes = zipFixture([...entries, { name: 'refinement/input.md', bytes: '中文\n'.repeat(100), method: 8, descriptor }]);
    const fixture = await archive(t, bytes), reader = await fixture.open();
    assert.equal(reader.read('refinement/input.md').toString(), '中文\n'.repeat(100));
    assert.equal(reader.sha256, sha256(bytes));
    assert.deepEqual(reader.names, ['refinement/summary.json', 'refinement/input.md']);
    assert.throws(() => reader.read('missing.md'), invalid);
  }
});

test('external digest gates parsing and later filesystem changes cannot substitute entries', async t => {
  const bytes = zipFixture(entries);
  await assert.rejects((await archive(t, bytes, '0'.repeat(64))).open(), /authenticated digest/);
  const fixture = await archive(t, bytes), reader = await fixture.open();
  await writeFile(fixture.file, zipFixture([{ ...entries[0], bytes: 'replaced' }]));
  const value = reader.read(entries[0].name); value.fill(0);
  assert.equal(reader.read(entries[0].name).toString(), entries[0].bytes, 'callers cannot mutate authenticated storage');
});

test('traversal, absolute, malformed, duplicate and case-alias names reject', async t => {
  for (const name of ['../escape', '/absolute', 'C:/absolute', 'a\\b', 'a//b', 'a/./b']) {
    await assert.rejects((await archive(t, zipFixture([{ name, bytes: 'x' }]))).open(), /Evidence paths/);
  }
  for (const name of [entries[0].name, entries[0].name.toUpperCase()]) {
    await assert.rejects((await archive(t, zipFixture([...entries, { name, bytes: 'other' }]))).open(), /Duplicate/);
  }
});

test('corrupt central/local headers, descriptors and unsupported entry kinds reject', async t => {
  for (const mutate of [
    (b, c) => b.writeUInt16LE(1, c + 8), // encryption
    (b, c) => b.writeUInt16LE(99, c + 10),
    (b, c) => b.writeUInt32LE(0xa1ff0000, c + 38), // symlink
    (b, c) => b.writeUInt32LE(33 * 1024 * 1024, c + 24),
    b => { b[30] ^= 1; }, // local name disagrees
    b => b.writeUInt16LE(1, b.length - 18), // multidisk
    b => b.writeUInt32LE(0xffffffff, b.length - 6), // ZIP64 sentinel
    (b, c) => { b[c - 8] ^= 1; } // signed descriptor size disagrees
  ]) {
    const b = zipFixture([{ ...entries[0], descriptor: 'signed' }]);
    mutate(b, b.readUInt32LE(b.length - 6));
    await assert.rejects((await archive(t, b)).open(), invalid);
  }
  const localCrc = zipFixture(entries); localCrc.writeUInt32LE(0, 14);
  await assert.rejects((await archive(t, localCrc)).open(), invalid);
  await assert.rejects((await archive(t, zipFixture(entries).subarray(0, 30))).open(), invalid);
});

test('payload corruption and deflate expansion beyond declared size fail on read', async t => {
  const stored = zipFixture(entries); stored[30 + Buffer.byteLength(entries[0].name)] ^= 1;
  const corrupt = await (await archive(t, stored)).open();
  assert.throws(() => corrupt.read(entries[0].name), /checksum mismatch/);
  const compressed = zipFixture([{ name: 'a.txt', bytes: 'x'.repeat(100000), method: 8 }]);
  const central = compressed.readUInt32LE(compressed.length - 6);
  compressed.writeUInt32LE(1, 22); compressed.writeUInt32LE(1, central + 24);
  const bomb = await (await archive(t, compressed)).open();
  assert.throws(() => bomb.read('a.txt'), /within its budget/);
});

test('overlapping local entries and extra deflate payload cannot hide in an authenticated archive', async t => {
  const inner = zipFixture([{ name: 'inner.txt', bytes: 'payload' }]);
  const innerLocal = inner.subarray(0, inner.readUInt32LE(inner.length - 6));
  const overlapping = zipFixture([{ name: 'outer.bin', bytes: innerLocal }, { name: 'inner.txt', bytes: 'payload' }]);
  const directory = overlapping.readUInt32LE(overlapping.length - 6);
  const second = directory + 46 + Buffer.byteLength('outer.bin');
  overlapping.writeUInt32LE(30 + Buffer.byteLength('outer.bin'), second + 42);
  await assert.rejects((await archive(t, overlapping)).open(), /Overlapping/);

  const compressed = zipFixture([{ name: 'a.txt', bytes: 'payload', method: 8 }]);
  const central = compressed.readUInt32LE(compressed.length - 6);
  const extra = Buffer.concat([compressed.subarray(0, central), Buffer.from([0]), compressed.subarray(central)]);
  extra.writeUInt32LE(compressed.readUInt32LE(18) + 1, 18);
  extra.writeUInt32LE(compressed.readUInt32LE(central + 20) + 1, central + 1 + 20);
  extra.writeUInt32LE(central + 1, extra.length - 6);
  const reader = await (await archive(t, extra)).open();
  assert.throws(() => reader.read('a.txt'), invalid);
});
