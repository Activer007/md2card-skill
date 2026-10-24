#!/usr/bin/env node
// Original edge-marker test patterns, not photographs or browser screenshots.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = new URL('../examples/visual-stress/assets/', import.meta.url);
await mkdir(root, { recursive: true });
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const name = Buffer.from(type), size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
  return Buffer.concat([size, name, bytes, checksum]);
}
const assets = [];
for (const [name, width, height] of [['extreme-wide.png', 1600, 80], ['extreme-tall.png', 80, 1600]]) {
  const header = Buffer.alloc(13), pixels = Buffer.alloc((width * 3 + 1) * height);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = x < 8 || y < 8 ? [180, 40, 40] : x >= width - 8 || y >= height - 8 ? [20, 70, 180] : [235, 225, 195];
    for (let c = 0; c < 3; c++) pixels[y * (width * 3 + 1) + 1 + x * 3 + c] = color[c];
  }
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  await writeFile(new URL(name, root), bytes);
  assets.push({ file: name, width, height, sha256: createHash('sha256').update(bytes).digest('hex'), type: 'original-edge-marker-test-pattern', license: 'MIT', source: 'scripts/create-visual-stress-assets.mjs' });
}
// Deliberately invalid signature, not a corrupted version of anyone else's art.
const corrupt = Buffer.from('This is an original invalid PNG fixture.\n');
await writeFile(new URL('corrupt.png', root), corrupt);
assets.push({ file: 'corrupt.png', type: 'intentional-invalid-signature', sha256: createHash('sha256').update(corrupt).digest('hex'), license: 'MIT', source: 'scripts/create-visual-stress-assets.mjs' });
await writeFile(new URL('provenance.json', root), JSON.stringify({ assets }, null, 2) + '\n');
console.log(`Wrote original stress assets to ${fileURLToPath(root)}`);
