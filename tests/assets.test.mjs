import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync, truncateSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { ASSET_LIMITS, createAssetResolver, inspectImage } from '../scripts/assets.mjs';
import { renderCards } from '../scripts/markdown.mjs';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length);
  output.write(type, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, output.length - 4)), output.length - 4);
  return output;
}
function png(width = 2, height = 3, ancillaryBytes = 0) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const chunks = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header)];
  if (ancillaryBytes) chunks.push(chunk('tEXt', Buffer.alloc(ancillaryBytes, 65)));
  chunks.push(chunk('IDAT', deflateSync(Buffer.alloc(27))), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCCiiivrD4U/9k=', 'base64');
const webp = Buffer.from('UklGRjwAAABXRUJQVlA4IDAAAADwAQCdASoCAAMAAUAmJaACdLoB+AAEgwAA/tom/+ema8wf5Of/Yzfp3fp3f2iAAAA=', 'base64');
function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'md2card-assets-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'assets');
  mkdirSync(root);
  writeFileSync(path.join(root, 'photo.png'), png());
  writeFileSync(path.join(root, 'photo.jpg'), jpeg);
  writeFileSync(path.join(root, 'photo.webp'), webp);
  return { directory, root };
}

test('PNG, JPEG and WebP have deterministic dimensions, SHA-256 and data URLs', async t => {
  const { root } = fixture(t);
  const resolver = await createAssetResolver(root);
  for (const [reference, bytes, mime] of [['photo.png', png(), 'image/png'], ['photo.jpg', jpeg, 'image/jpeg'], ['photo.webp', webp, 'image/webp']]) {
    const asset = resolver.resolveImage(reference);
    assert.deepEqual([asset.width, asset.height], [2, 3]);
    assert.equal(asset.mime, mime);
    assert.equal(asset.bytes, bytes.length);
    assert.equal(asset.hash, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(asset.dataUrl, `data:${mime};base64,${bytes.toString('base64')}`);
    assert.ok(Object.isFrozen(asset));
  }
  assert.equal(resolver.getAssets().length, 3);
  resolver.getAssets().pop();
  assert.equal(resolver.getAssets().length, 3);
  assert.equal(resolver.resolveImage('./photo.png'), resolver.resolveImage('photo.png'));
  assert.equal(resolver.getAssets().length, 3);
});

test('Markdown images and metadata embed only trusted assets, including cross-card references', async t => {
  const { root } = fixture(t);
  const resolver = await createAssetResolver(root);
  const cards = renderCards('<!-- card: {"image":"photo.png","layout":"image-caption"} -->\n\n![Photo][image]\n\n===\n\n[image]: photo.webp\n\nText', resolver);
  assert.equal(cards[0].image.mime, 'image/png');
  assert.match(cards[0].html, /src="data:image\/webp;base64,/);
  assert.equal(resolver.getAssets().length, 2);
  assert.throws(() => renderCards('![Remote](https://example.test/track.png)', resolver), /Card 1 image: Remote/);
});

test('asset roots must exist and be directories', async t => {
  const { root } = fixture(t);
  await assert.rejects(createAssetResolver(), /trusted --asset-root/);
  await assert.rejects(createAssetResolver(path.join(root, 'missing')), /Cannot read asset root/);
  await assert.rejects(createAssetResolver(path.join(root, 'photo.png')), /must be a directory/);
});

test('remote, absolute, traversal, schemes and ambiguous references are rejected', async t => {
  const { root } = fixture(t);
  const { resolveImage, getAssets } = await createAssetResolver(root);
  for (const ref of ['https://example.test/a.png', 'HTTP://example.test/a.png', '//example.test/a.png', 'file:///tmp/a.png', 'data:image/png;base64,AQID', '/tmp/a.png', 'C:\\x.png', 'C:/x.png', '\\\\server\\a.png', '../photo.png', './x/../../photo.png', '%2e%2e/photo.png', '%2Ftmp/a.png', 'a%00.png', 'photo.png#x', 'photo.png?x', 'photo%2Epng%3Fx', 'photo.png\n', ' photo.png', 'photo.png ', 'bad%zz.png']) {
    assert.throws(() => resolveImage(ref), undefined, ref);
  }
  assert.equal(getAssets().length, 0);
});

test('symlink escapes fail for files and directories, safe aliases remain cached', async t => {
  const { directory, root } = fixture(t);
  const outside = path.join(directory, 'outside'); mkdirSync(outside);
  writeFileSync(path.join(outside, 'secret.png'), png());
  symlinkSync(path.join(outside, 'secret.png'), path.join(root, 'escape.png'));
  symlinkSync(outside, path.join(root, 'escape-dir'));
  symlinkSync(path.join(root, 'photo.png'), path.join(root, 'alias.png'));
  symlinkSync(path.join(root, 'photo.png'), path.join(root, 'alias.jpg'));
  const resolver = await createAssetResolver(root);
  assert.throws(() => resolver.resolveImage('escape.png'), /outside the trusted asset root/);
  assert.throws(() => resolver.resolveImage('escape-dir/secret.png'), /outside the trusted asset root/);
  assert.equal(resolver.resolveImage('alias.png'), resolver.resolveImage('photo.png'));
  assert.throws(() => resolver.resolveImage('alias.jpg'), /does not match MIME/);
  assert.equal(resolver.getAssets().length, 1);
});

test('valid encoded spaces and Unicode filenames remain local', async t => {
  const { root } = fixture(t);
  writeFileSync(path.join(root, '中文 photo.png'), png());
  const resolver = await createAssetResolver(root);
  assert.equal(resolver.resolveImage('%E4%B8%AD%E6%96%87%20photo.png').width, 2);
  assert.match(renderCards('![中文](<中文 photo.png>)', resolver)[0].html, /alt="中文"/);
  assert.equal(resolver.getAssets().length, 1);
});

test('extension, MIME and missing/nonregular assets fail without caching', async t => {
  const { root } = fixture(t);
  writeFileSync(path.join(root, 'wrong.jpg'), png());
  writeFileSync(path.join(root, 'html.png'), '<html><script>bad</script>');
  writeFileSync(path.join(root, 'vector.svg'), '<svg/>');
  mkdirSync(path.join(root, 'directory.png'));
  const resolver = await createAssetResolver(root);
  assert.throws(() => resolver.resolveImage('wrong.jpg'), /does not match MIME/);
  assert.throws(() => resolver.resolveImage('html.png'), /MIME\/signature/);
  assert.throws(() => resolver.resolveImage('vector.svg'), /extension/);
  assert.throws(() => resolver.resolveImage('missing.png'), /Cannot read local image/);
  assert.throws(() => resolver.resolveImage('directory.png'), /regular file/);
  assert.equal(resolver.getAssets().length, 0);
});

test('oversized compressed bytes, dimensions, pixels and total bytes fail', async t => {
  const { root } = fixture(t);
  writeFileSync(path.join(root, 'huge.png'), 'x');
  truncateSync(path.join(root, 'huge.png'), ASSET_LIMITS.maxBytes + 1);
  const resolver = await createAssetResolver(root);
  assert.throws(() => resolver.resolveImage('huge.png'), /8 MiB/);
  assert.throws(() => inspectImage(png(8193, 1)), /pixels per side/);
  assert.throws(() => inspectImage(png(5000, 4001)), /decoded pixels/);
  assert.throws(() => inspectImage(png(0, 2)), /positive integers/);
  const large = png(2, 3, 7 * 1024 * 1024);
  for (let index = 0; index < 5; index++) writeFileSync(path.join(root, `${index}.png`), large);
  for (let index = 0; index < 4; index++) resolver.resolveImage(`${index}.png`);
  assert.throws(() => resolver.resolveImage('4.png'), /32 MiB/);
  assert.equal(resolver.getAssets().length, 4);
});

test('truncated, corrupt and polyglot PNG/JPEG/WebP data is rejected', () => {
  for (const bytes of [png(), jpeg, webp]) {
    for (const length of [0, 1, 8, Math.floor(bytes.length / 2), bytes.length - 1]) {
      assert.throws(() => inspectImage(bytes.subarray(0, length)), undefined, `length=${length}`);
    }
    assert.throws(() => inspectImage(Buffer.concat([bytes, Buffer.from('<script>')])), undefined, 'trailing payload');
  }
  const corrupt = Buffer.from(png()); corrupt[45] ^= 0xff;
  assert.throws(() => inspectImage(corrupt), /checksum/);
  assert.throws(() => inspectImage(Buffer.from('GIF89a')), /MIME\/signature/);
  const badLength = Buffer.from(png()); badLength.writeUInt32BE(0xffffffff, 8);
  assert.throws(() => inspectImage(badLength), /Truncated/);
});

test('animated PNG and WebP are rejected', () => {
  const normal = png();
  const animated = Buffer.concat([normal.subarray(0, 33), chunk('acTL', Buffer.alloc(8)), normal.subarray(33)]);
  assert.throws(() => inspectImage(animated), /Animated PNG/);
  const vp8x = Buffer.alloc(18); vp8x.write('VP8X'); vp8x.writeUInt32LE(10, 4); vp8x[8] = 2;
  const output = Buffer.concat([webp.subarray(0, 12), vp8x, webp.subarray(12)]); output.writeUInt32LE(output.length - 8, 4);
  assert.throws(() => inspectImage(output), /Animated WebP/);
});

test('cached images still count toward the cumulative 64 MiB embedding budget', async t => {
  const { root } = fixture(t);
  writeFileSync(path.join(root, 'large.png'), png(2, 3, 7 * 1024 * 1024));
  const resolver = await createAssetResolver(root);
  for (let index = 0; index < 6; index++) resolver.resolveImage('large.png');
  assert.equal(resolver.getAssets().length, 1);
  assert.throws(() => resolver.resolveImage('./large.png'), error => {
    assert.equal(error.code, 'INVALID_ASSET');
    assert.match(error.message, /64 MiB embedded asset budget/);
    return true;
  });
});

test('asset validation exposes a stable INVALID_ASSET code', async t => {
  const { root } = fixture(t);
  await assert.rejects(createAssetResolver('/path/that/does/not/exist'), { code: 'INVALID_ASSET' });
  assert.throws(() => inspectImage(Buffer.from('invalid')), { code: 'INVALID_ASSET' });
  const resolver = await createAssetResolver(root);
  assert.throws(() => resolver.resolveImage('missing.png'), { code: 'INVALID_ASSET' });
  assert.throws(() => resolver.resolveImage('../outside.png'), { code: 'INVALID_ASSET' });
});

test('repeated references count decoded pixels and expose immutable usage snapshots', async t => {
  const { root } = fixture(t);
  // Synthetic valid PNG structure isolates header-based resource accounting;
  // final pixel-stream decoding is a separate mandatory browser export check.
  writeFileSync(path.join(root, 'big-dimensions.png'), png(5000, 4000));
  const resolver = await createAssetResolver(root);
  for (let index = 0; index < 5; index++) resolver.resolveImage('big-dimensions.png');
  const before = resolver.getUsage();
  assert.equal(before.occurrences, 5);
  assert.equal(before.pixels, 100_000_000);
  assert.equal(before.loadedBytes, png(5000, 4000).length);
  assert.equal(before.embeddedBytes, 5 * Buffer.byteLength(resolver.getAssets()[0].dataUrl));
  assert.throws(() => resolver.resolveImage('big-dimensions.png'), /cumulative decoded-pixel budget/);
  assert.deepEqual(resolver.getUsage(), before);
  before.occurrences = 42;
  assert.equal(resolver.getUsage().occurrences, 5);
});
