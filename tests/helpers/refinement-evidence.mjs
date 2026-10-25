// Protocol fixtures, NOT browser output or visual acceptance. Build a real Git
// source identity and a deliberately synthetic artifact to test the binder's
// byte/provenance contracts without Chromium, Poppler or a downloaded CI ZIP.
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { SEMANTIC_FILES, sha256 } from '../../scripts/evidence-source.mjs';
import { crc32 } from '../../scripts/evidence-archive.mjs';
import { createRefinementCases } from '../../scripts/validate-refinement.mjs';
import { sourceCheck } from '../../scripts/validate-visual-stress.mjs';
import { createAssetResolver } from '../../scripts/assets.mjs';
import { renderCards } from '../../scripts/markdown.mjs';
import { buildDocument, buildPreviewDocument } from '../../scripts/document.mjs';
import { parseOptions } from '../../scripts/render.mjs';
import { zipFixture } from './evidence-zip.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);
const json = value => Buffer.from(JSON.stringify(value));
function blankPng(width, height) {
  const chunk = (name, bytes) => {
    const data = Buffer.concat([Buffer.from(name), bytes]), header = Buffer.alloc(4), tail = Buffer.alloc(4);
    header.writeUInt32BE(bytes.length); tail.writeUInt32BE(crc32(data)); return Buffer.concat([header, data, tail]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}

export async function refinementFixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'md2card-refinement-evidence-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'source'); await mkdir(root);
  const cases = await createRefinementCases(), checked = await Promise.all(cases.map(sourceCheck));
  const names = new Set([...SEMANTIC_FILES, ...cases.flatMap((item, index) => [item.originalInput, ...checked[index].assets.map(asset => asset.reference)].filter(Boolean))]);
  const sourceFiles = [];
  for (const file of [...names].sort()) {
    const bytes = await readFile(path.join(ROOT, file));
    await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), bytes);
    sourceFiles.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
  }
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs/gallery-comparisons.json'), await readFile(path.join(ROOT, 'docs/gallery-comparisons.json')));
  const git = async args => (await exec('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })).stdout.trim();
  await git(['init', '--quiet']); await git(['-c', 'core.autocrlf=false', 'add', '.']);
  const tree = await git(['write-tree']), commit = await git(['-c', 'user.name=Evidence Test', '-c', 'user.email=evidence@example.invalid', 'commit-tree', tree, '-m', 'synthetic binder source']);
  const sourceManifest = { git: { commit, tree, dirty: false }, sha256: sha256(JSON.stringify(sourceFiles)), files: sourceFiles };
  const files = new Map([['refinement/source-files.json', json(sourceManifest)]]);
  const summary = { schemaVersion: 1, mode: 'browser', status: 'browser-checked-visual-review-pending', sourceSha256: sourceManifest.sha256,
    git: sourceManifest.git, sourceManifest: 'source-files.json', browser: 'attempted', visualReview: 'not-performed', designCount: 48, acceptedCountUnchanged: 48, results: [], errors: [] };
  const styles = await Promise.all(['themes', 'layouts', 'templates'].map(name => readFile(path.join(ROOT, `assets/${name}.css`), 'utf8')));
  const cardPng = blankPng(1080, 1440), contactPng = blankPng(310, 400), phones = [blankPng(375, 800), blankPng(390, 800)];
  const add = (file, bytes) => { files.set(file, Buffer.from(bytes)); return { file: path.posix.basename(file), sha256: sha256(bytes) }; };
  for (const [index, item] of cases.entries()) {
    const prefix = `refinement/${item.id}`, source = checked[index];
    files.set(`refinement/inputs/${item.id}.md`, Buffer.from(item.source));
    const result = { id: item.id, template: item.template, density: item.density, length: item.length, group: item.group, expected: item.expected,
      input: `validation/refinement/inputs/${item.id}.md`, inputSha256: sha256(item.source), bodySha256: item.bodySha256,
      manifest: null, visualReview: 'not-performed', source };
    const resolver = await createAssetResolver(root), [card] = renderCards(item.source, { resolveImage: resolver.resolveImage });
    const geometry = overflow => ({ index: 1, available: { width: 900, height: 1200 }, used: { width: 900, height: overflow.length ? 1500 : 1200 }, overflow });
    if (item.expected === 'CONTENT_OVERFLOW') {
      result.status = 'expected-error'; result.code = 'CONTENT_OVERFLOW';
      result.diagnostic = add(`${prefix}/overflow.json`, json({ schemaVersion: 2, status: 'overflow', code: 'CONTENT_OVERFLOW', input: `${item.id}.md`, theme: 'editorial', dimensions: { width: 1080, height: 1440 },
        cards: [{ index: 1, sourceLines: card.sourceLines, screen: geometry(['content-height']), print: geometry(['content-height']) }] }));
    } else {
      result.status = 'rendered-not-visually-reviewed';
      const options = parseOptions([`${item.id}.md`, '--strict', '--preview', '--contact-sheet']);
      const artifacts = [
        ['html', 'cards.html', buildDocument([card], { ...options, preview: false }, ...styles)],
        ['preview', 'preview.html', buildPreviewDocument([card], options, ...styles)],
        ['pdf', 'cards.pdf', `%PDF-1.4\n% SYNTHETIC PROTOCOL FIXTURE ${item.id}, NOT A RENDERED PDF\n%%EOF\n`],
        ['png', 'card-001.png', cardPng], ['contact-sheet', 'contact-sheet.png', contactPng]
      ].map(([format, file, value]) => { const bytes = Buffer.from(value); return { format, ...add(`${prefix}/${file}`, bytes), bytes: bytes.length, ...(format === 'png' ? { card: 1 } : {}) }; });
      const manifest = { schemaVersion: 2, status: 'success', input: `${item.id}.md`, inputSha256: result.inputSha256, theme: 'editorial', footerMode: 'legacy', brand: null,
        dimensions: { width: 1080, height: 1440 }, pngScale: 1, formats: ['html', 'png', 'pdf'], pagination: { mode: 'manual' }, cardCount: 1,
        cards: [{ index: 1, template: item.template, layout: card.metadata.layout, density: 'standard', aspect: 'portrait', sourceSha256: sha256(card.source), sourceLines: card.sourceLines, screen: geometry([]), print: geometry([]) }],
        assets: source.assets, artifacts, styleSha256: Object.fromEntries(['themes', 'layouts', 'templates'].map((key, i) => [key, sha256(styles[i])])),
        qa: { overflow: { screen: 'pass', print: 'pass' }, images: { status: 'pass', count: source.assets.length }, pdf: { status: 'pass', ok: true, pageCount: 1, searchable: true }, visualReview: 'not-performed' } };
      const manifestBytes = json(manifest); files.set(`${prefix}/manifest.json`, manifestBytes);
      result.manifest = { file: `validation/${prefix}/manifest.json`, sha256: sha256(manifestBytes) };
      result.pdfText = ['raw', 'layout'].map(mode => ({ page: 1, mode, ...add(`${prefix}/page-1-${mode}.txt`, Buffer.from(source.segments[0].join('\n'))) }));
      result.mobile = [375, 390].map((viewportWidth, i) => ({ viewportWidth, ...add(`${prefix}/mobile-${viewportWidth}.png`, phones[i]), cards: [{ index: 1, counter: '1 / 1', footer: '', cardWidth: viewportWidth - 24,
        bodySizes: [15], bodyMin: 15, noteMin: 11, headings: source.headingLevels[0].map(level => ({ level })),
        images: source.cardImages[0].map(image => ({ decoded: true, visible: true, fit: 'contain', naturalWidth: image.width, naturalHeight: image.height })) }] }));
    }
    summary.results.push(result);
  }
  files.set('refinement/summary.json', json(summary));
  const expected = { commit, tree, sourceSha256: sourceManifest.sha256, artifactId: 1, runUrl: 'https://github.com/Activer007/md2card-skill/actions/runs/1' };
  return { files, async pack(changed = files) {
    const bytes = zipFixture([...changed].map(([name, bytes]) => ({ name, bytes, method: 8 })));
    const archivePath = path.join(dir, 'synthetic.zip'); await writeFile(archivePath, bytes);
    return { archivePath, sourceRoot: root, gitRepository: root, expected: { ...expected, archiveSha256: sha256(bytes) } };
  } };
}

export function editJson(files, file, change) {
  const value = JSON.parse(files.get(file)); change(value); files.set(file, json(value));
}
export function editManifest(files, id, change) {
  const file = `refinement/${id}/manifest.json`; editJson(files, file, change);
  editJson(files, 'refinement/summary.json', summary => { summary.results.find(r => r.id === id).manifest.sha256 = sha256(files.get(file)); });
}
