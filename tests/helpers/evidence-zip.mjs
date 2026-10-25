// Synthetic protocol archives only; these bytes never certify rendered output.
import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../../scripts/evidence-archive.mjs';

export function zipFixture(entries) {
  const locals = [], central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), bytes = Buffer.from(entry.bytes);
    const method = entry.method ?? 0, flags = entry.descriptor ? 8 : 0;
    const payload = method === 8 ? deflateRawSync(bytes) : bytes;
    const crc = crc32(bytes), local = Buffer.alloc(30), record = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    if (!flags) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(payload.length, 18); local.writeUInt32LE(bytes.length, 22); }
    local.writeUInt16LE(name.length, 26);
    const descriptor = Buffer.alloc(flags ? entry.descriptor === 'unsigned' ? 12 : 16 : 0);
    if (flags) {
      const start = descriptor.length === 16 ? 4 : 0;
      if (start) descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(crc, start); descriptor.writeUInt32LE(payload.length, start + 4); descriptor.writeUInt32LE(bytes.length, start + 8);
    }
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(0x0314, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(flags, 8); record.writeUInt16LE(method, 10);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(payload.length, 20); record.writeUInt32LE(bytes.length, 24);
    record.writeUInt16LE(name.length, 28); record.writeUInt32LE(0x81a40000, 38); record.writeUInt32LE(offset, 42);
    const chunk = Buffer.concat([local, name, payload, descriptor]);
    locals.push(chunk); central.push(record, name); offset += chunk.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
