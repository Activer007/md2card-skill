// Read the authenticated ZIP bytes directly. Never trust a mutable extraction.
// Deliberately bounded: classic single-disk ZIP, stored/deflated regular files.
import { open } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { sha256, evidencePath } from './evidence-source.mjs';
import { Md2CardError } from './errors.mjs';

const fail = message => { throw new Md2CardError('EVIDENCE_ARCHIVE_INVALID', message); };
const ARCHIVE_LIMIT = 512 * 1024 * 1024;
const ENTRY_LIMIT = 32 * 1024 * 1024;
const TOTAL_LIMIT = 2 * 1024 * 1024 * 1024;
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

/** expectedDigest must be obtained from authenticated artifact metadata. */
export async function openEvidenceArchive(filename, expectedDigest) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) fail('An independently obtained archive SHA-256 is required.');
  const handle = await open(filename, 'r');
  let bytes;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 22 || info.size > ARCHIVE_LIMIT) fail('Archive must be a regular ZIP within the 512 MiB budget.');
    bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesRead) fail('Archive was truncated while reading.');
      offset += result.bytesRead;
    }
    if ((await handle.stat()).size !== bytes.length) fail('Archive changed size while reading.');
  } finally { await handle.close(); }
  if (sha256(bytes) !== expectedDigest) fail('Archive bytes do not match the authenticated digest.');
  // Parse the same immutable buffer that was hashed, not a second file read.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0) fail('ZIP end directory is missing.');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count ||
      count < 1 || count > 10000 || start === 0xffffffff || size === 0xffffffff || start + size !== end) fail('Unsupported ZIP directory, ZIP64, or multidisk archive.');
  const entries = new Map(), foldedNames = new Set(), ranges = [];
  let cursor = start, total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) fail('Invalid central directory entry.');
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16), compressed = bytes.readUInt32LE(cursor + 20), length = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28), extraLength = bytes.readUInt16LE(cursor + 30), commentLength = bytes.readUInt16LE(cursor + 32);
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16, local = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & ~0x080e || ![0, 8].includes(method) || bytes.readUInt16LE(cursor + 34) ||
        compressed > ENTRY_LIMIT || length > ENTRY_LIMIT || local === 0xffffffff || ![0, 0x8000, 0x4000].includes(mode & 0xf000)) fail('Unsupported or oversized ZIP entry.');
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString('utf8'), directory = name.endsWith('/');
    evidencePath(directory ? name.slice(0, -1) : name);
    if (!Buffer.from(name).equals(nameBytes) || foldedNames.has(name.toLowerCase())) fail('Duplicate or invalid ZIP entry name.');
    foldedNames.add(name.toLowerCase());
    if (directory && (length || compressed)) fail('Directory entry contains data.');
    if ((total += length) > TOTAL_LIMIT) fail('ZIP decompressed size exceeds its total budget.');
    if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) fail('Local header disagrees with the directory.');
    const localNameLength = bytes.readUInt16LE(local + 26), localExtraLength = bytes.readUInt16LE(local + 28);
    const data = local + 30 + localNameLength + localExtraLength;
    if (data + compressed > start || !bytes.subarray(local + 30, local + 30 + localNameLength).equals(nameBytes)) fail('Local entry name or data boundary is invalid.');
    if (!(flags & 8) && (bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== length)) fail('Local sizes or checksum disagree.');
    let entryEnd = data + compressed;
    if (flags & 8) {
      // The optional descriptor is part of this entry, not space another local
      // header may overlap. Both signed and unsigned classic descriptors occur.
      const signed = entryEnd + 4 <= start && bytes.readUInt32LE(entryEnd) === 0x08074b50;
      const descriptor = entryEnd + (signed ? 4 : 0);
      if (descriptor + 12 > start || bytes.readUInt32LE(descriptor) !== crc ||
          bytes.readUInt32LE(descriptor + 4) !== compressed || bytes.readUInt32LE(descriptor + 8) !== length) fail('Data descriptor disagrees with the directory.');
      entryEnd = descriptor + 12;
    }
    ranges.push([local, entryEnd]);
    if (!directory) entries.set(name, { method, crc, compressed, length, data });
    cursor = next;
  }
  if (cursor !== end) fail('Unaccounted central directory bytes.');
  ranges.sort((a, b) => a[0] - b[0]);
  if (ranges.some((range, i) => i && range[0] < ranges[i - 1][1])) fail('Overlapping ZIP entries.');
  return Object.freeze({
    sha256: expectedDigest, bytes: bytes.length, names: Object.freeze([...entries.keys()]),
    read(name) {
      evidencePath(name);
      const entry = entries.get(name);
      if (!entry) fail(`Required ZIP entry is missing: ${name}`);
      const compressed = bytes.subarray(entry.data, entry.data + entry.compressed);
      let result;
      try {
        if (entry.method === 0) result = Buffer.from(compressed);
        else {
          const decoded = inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.length), info: true });
          if (decoded.engine.bytesWritten !== entry.compressed) fail('Deflate payload contains trailing bytes.');
          result = decoded.buffer;
        }
      }
      catch { fail(`ZIP entry could not be decoded within its budget: ${name}`); }
      if (result.length !== entry.length || crc32(result) !== entry.crc) fail(`ZIP entry length or checksum mismatch: ${name}`);
      return result;
    }
  });
}
