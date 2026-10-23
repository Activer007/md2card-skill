import { constants, closeSync, fstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Md2CardError } from './errors.mjs';

export const ASSET_LIMITS = Object.freeze({ maxBytes: 8 * 1024 * 1024, maxPixels: 20_000_000, maxDimension: 8192, maxTotalBytes: 32 * 1024 * 1024, maxEmbeddedBytes: 64 * 1024 * 1024, maxTotalPixels: 100_000_000 });
const EXTENSION_MIME = Object.freeze({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' });

function fail(message) { throw new Md2CardError('INVALID_ASSET', message); }
function dimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) fail('Image dimensions must be positive integers.');
  if (width > ASSET_LIMITS.maxDimension || height > ASSET_LIMITS.maxDimension) fail(`Image dimensions exceed ${ASSET_LIMITS.maxDimension} pixels per side.`);
  if (width * height > ASSET_LIMITS.maxPixels) fail(`Image exceeds ${ASSET_LIMITS.maxPixels.toLocaleString('en-US')} decoded pixels.`);
  return { width, height };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function inspectPng(bytes) {
  let offset = 8;
  let size;
  let color;
  let idat = false;
  let idatEnded = false;
  let palette = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail('Truncated PNG chunk.');
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) fail('Truncated PNG chunk data.');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) fail('Invalid PNG chunk type.');
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) fail('Invalid PNG chunk checksum.');
    const data = bytes.subarray(offset + 8, end - 4);
    if (!size && type !== 'IHDR') fail('PNG must begin with an IHDR chunk.');
    if (type === 'IHDR') {
      if (size || length !== 13) fail('Invalid or repeated PNG IHDR chunk.');
      size = dimensions(data.readUInt32BE(0), data.readUInt32BE(4));
      color = data[9];
      const depth = data[8];
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color]?.includes(depth) || data[10] !== 0 || data[11] !== 0 || data[12] > 1) fail('Invalid PNG pixel format.');
    } else if (type === 'PLTE') {
      if (palette || idat || length === 0 || length % 3 || length > 768) fail('Invalid PNG palette.');
      palette = true;
    } else if (type === 'IDAT') {
      if (idatEnded || (color === 3 && !palette)) fail('Invalid PNG image-data order.');
      if (length > 0) idat = true;
    } else if (type === 'IEND') {
      if (!idat || length !== 0 || end !== bytes.length) fail('Invalid PNG end or missing image data.');
      return size;
    } else {
      if (['acTL', 'fcTL', 'fdAT'].includes(type)) fail('Animated PNG assets are not supported.');
      if (type[0] === type[0].toUpperCase()) fail(`Unsupported PNG critical chunk ${type}.`);
    }
    if (idat && type !== 'IDAT') idatEnded = true;
    offset = end;
  }
  fail('Truncated PNG: missing IEND chunk.');
}

function inspectJpeg(bytes) {
  let offset = 2;
  let size;
  let scans = 0;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) fail('Invalid JPEG marker.');
    while (bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) fail('Truncated JPEG marker.');
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!size || !scans || offset !== bytes.length) fail('Invalid JPEG end or missing frame/scan.');
      return size;
    }
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) fail('Unexpected JPEG marker outside a scan.');
    if (marker === 0x01) continue;
    if (offset + 2 > bytes.length) fail('Truncated JPEG segment.');
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) fail('Truncated or invalid JPEG segment.');
    const data = bytes.subarray(offset + 2, offset + length);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (![0xc0, 0xc1, 0xc2].includes(marker)) fail('Unsupported JPEG frame encoding.');
      if (size || data.length < 6 || data.length !== 6 + 3 * data[5] || ![1, 3, 4].includes(data[5]) || data[0] !== 8) fail('Invalid JPEG frame.');
      size = dimensions(data.readUInt16BE(3), data.readUInt16BE(1));
    }
    offset += length;
    if (marker === 0xda) {
      if (!size || data.length < 4 || data.length !== 4 + 2 * data[0] || data[0] < 1 || data[0] > 4) fail('Invalid JPEG scan header.');
      scans++;
      const start = offset;
      // Entropy-coded scans escape FF as FF00 and may contain restart markers.
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        let next = offset + 1;
        while (bytes[next] === 0xff) next++;
        if (next >= bytes.length) fail('Truncated JPEG scan.');
        if (bytes[next] === 0x00 || (bytes[next] >= 0xd0 && bytes[next] <= 0xd7)) { offset = next + 1; continue; }
        break;
      }
      if (offset === start) fail('JPEG scan contains no image data.');
    }
  }
  fail('Truncated JPEG: missing EOI marker.');
}

function inspectWebp(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(4) + 8 !== bytes.length) fail('Truncated or invalid WebP RIFF size.');
  let offset = 12;
  let size;
  let canvas;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('Truncated WebP chunk.');
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    const paddedEnd = end + (length & 1);
    if (paddedEnd > bytes.length) fail('Truncated WebP chunk data.');
    if ((length & 1) && bytes[end] !== 0) fail('Invalid WebP chunk padding.');
    const data = bytes.subarray(offset + 8, end);
    if (type === 'ANIM' || type === 'ANMF') fail('Animated WebP assets are not supported.');
    if (type === 'VP8X') {
      if (offset !== 12 || length !== 10 || canvas || (data[0] & 0xc1) || data[1] || data[2] || data[3]) fail('Invalid WebP extended header.');
      if (data[0] & 0x02) fail('Animated WebP assets are not supported.');
      canvas = dimensions(data.readUIntLE(4, 3) + 1, data.readUIntLE(7, 3) + 1);
    } else if (type === 'VP8 ') {
      if (size || length < 10 || (data[0] & 1) || !data.subarray(3, 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) fail('Invalid WebP VP8 frame.');
      size = dimensions(data.readUInt16LE(6) & 0x3fff, data.readUInt16LE(8) & 0x3fff);
    } else if (type === 'VP8L') {
      if (size || length < 5 || data[0] !== 0x2f) fail('Invalid WebP lossless frame.');
      const bits = data.readUInt32LE(1);
      if (bits >>> 29) fail('Unsupported WebP lossless version.');
      size = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    offset = paddedEnd;
  }
  if (!size) fail('WebP contains no image frame.');
  if (canvas && (canvas.width !== size.width || canvas.height !== size.height)) fail('WebP canvas and frame dimensions differ.');
  return size;
}

/** Header/structure validation precedes browser decode validation during export. */
export function inspectImage(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length === 0 || bytes.length > ASSET_LIMITS.maxBytes) fail(`Image must contain 1 to ${ASSET_LIMITS.maxBytes} bytes (8 MiB).`);
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: 'image/png', ...inspectPng(bytes) };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return { mime: 'image/jpeg', ...inspectJpeg(bytes) };
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ...inspectWebp(bytes) };
  fail('Unsupported image MIME/signature; only PNG, JPEG, and WebP are allowed.');
}

function relativeReference(reference) {
  if (typeof reference !== 'string' || !reference || reference !== reference.trim()) fail('Image reference must be a nonempty relative local path.');
  let decoded;
  try { decoded = decodeURIComponent(reference); } catch { fail('Image reference contains invalid percent encoding.'); }
  if (/[\u0000-\u001f\u007f]/.test(decoded) || /[\\?#]/.test(decoded)) fail('Image paths cannot contain control characters, backslashes, query strings, or fragments.');
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded) || path.isAbsolute(decoded) || path.win32.isAbsolute(decoded)) fail('Remote, file:, data:, and absolute image paths are forbidden; use a path relative to --asset-root.');
  if (decoded.split('/').includes('..')) fail('Image path traversal is forbidden.');
  return decoded;
}
function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Initialize once; resolveImage is deliberately synchronous for Markdown rendering. */
export async function createAssetResolver(assetRoot) {
  if (typeof assetRoot !== 'string' || !assetRoot.trim()) fail('A trusted --asset-root directory is required for local images.');
  let root;
  try { root = realpathSync(assetRoot); } catch (error) { throw new Md2CardError('INVALID_ASSET', `Cannot read asset root: ${error.code ?? error.message}`, {}, 1, { cause: error }); }
  try {
    if (!statSync(root).isDirectory()) fail('Asset root must be a directory.');
  } catch (error) {
    if (error instanceof Md2CardError) throw error;
    throw new Md2CardError('INVALID_ASSET', `Cannot inspect asset root: ${error.code ?? error.message}`, {}, 1, { cause: error });
  }
  const loaded = new Map();
  let totalBytes = 0;
  let embeddedBytes = 0;
  let pixels = 0;
  let occurrences = 0;
  const reserveEmbedding = asset => {
    const bytes = Buffer.byteLength(asset.dataUrl);
    if (embeddedBytes + bytes > ASSET_LIMITS.maxEmbeddedBytes) fail('Repeated images exceed the 64 MiB embedded asset budget. Use smaller images or split the deck.');
    const decodedPixels = asset.width * asset.height;
    if (pixels + decodedPixels > ASSET_LIMITS.maxTotalPixels) fail('Repeated images exceed the 100,000,000 cumulative decoded-pixel budget. Use smaller images or split the deck.');
    embeddedBytes += bytes;
    pixels += decodedPixels;
    occurrences++;
    return asset;
  };
  const resolve = reference => {
    const relative = relativeReference(reference);
    const expectedMime = EXTENSION_MIME[path.extname(relative).toLowerCase()];
    if (!expectedMime) fail('Image extension must be .png, .jpg, .jpeg, or .webp. SVG and GIF are not supported.');
    let resolved;
    try { resolved = realpathSync(path.resolve(root, relative)); } catch (error) { throw new Md2CardError('INVALID_ASSET', `Cannot read local image "${relative}": ${error.code ?? error.message}`, {}, 1, { cause: error }); }
    if (!insideRoot(root, resolved)) fail('Image resolves outside the trusted asset root (including symlink escapes).');
    // Cache by real file path so aliases never multiply memory or the total-byte budget.
    if (loaded.has(resolved)) {
      const cached = loaded.get(resolved);
      if (cached.mime !== expectedMime) fail(`Image extension does not match MIME/signature ${cached.mime}.`);
      return reserveEmbedding(cached);
    }
    let fd;
    let bytes;
    try {
      fd = openSync(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
      const info = fstatSync(fd);
      if (!info.isFile()) fail('Image asset must be a regular file.');
      if (info.size < 1 || info.size > ASSET_LIMITS.maxBytes) fail('Image exceeds the 8 MiB per-asset byte limit or is empty.');
      if (totalBytes + info.size > ASSET_LIMITS.maxTotalBytes) fail('Images exceed the 32 MiB total asset byte limit.');
      // Check the opened file, not only the path checked before opening. Linux /proc
      // closes parent-directory symlink races; the realpath recheck covers other OSes.
      let openedPath;
      try { openedPath = realpathSync(`/proc/self/fd/${fd}`); } catch { openedPath = realpathSync(resolved); }
      if (!insideRoot(root, openedPath)) fail('Opened image resolves outside the trusted asset root.');
      // Never allocate/read an unbounded amount if the file grows after stat.
      const buffer = Buffer.alloc(info.size + 1);
      let count = 0;
      while (count < buffer.length) {
        const read = readSync(fd, buffer, count, buffer.length - count, null);
        if (!read) break;
        count += read;
      }
      bytes = buffer.subarray(0, count);
      if (bytes.length !== info.size || bytes.length > ASSET_LIMITS.maxBytes) fail('Image changed while being read or exceeds the byte limit.');
    } finally { if (fd !== undefined) closeSync(fd); }
    const inspected = inspectImage(bytes);
    if (inspected.mime !== expectedMime) fail(`Image extension does not match MIME/signature ${inspected.mime}.`);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const asset = Object.freeze({ reference: relative, hash, ...inspected, bytes: bytes.length, dataUrl: `data:${inspected.mime};base64,${bytes.toString('base64')}` });
    reserveEmbedding(asset);
    loaded.set(resolved, asset);
    totalBytes += bytes.length;
    return asset;
  };
  const resolveImage = reference => {
    try { return resolve(reference); } catch (error) {
      if (error instanceof Md2CardError) throw error;
      throw new Md2CardError('INVALID_ASSET', `Cannot load local image: ${error.code ?? error.message}`, {}, 1, { cause: error });
    }
  };
  return Object.freeze({ resolveImage, getAssets: () => [...loaded.values()], getUsage: () => ({ occurrences, pixels, embeddedBytes, loadedBytes: totalBytes }) });
}
