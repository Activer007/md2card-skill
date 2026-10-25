#!/usr/bin/env node
// Bind authenticated CI bytes to the exact source snapshot. This produces a
// technical candidate only: visual review and gallery publication are separate.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEvidenceArchive } from './evidence-archive.mjs';
import { sha256, readEvidenceFile, verifySourceSnapshot } from './evidence-source.mjs';
import { createRefinementCases } from './validate-refinement.mjs';
import { sourceCheck, assertAuthoredSegments } from './validate-visual-stress.mjs';
import { createAssetResolver } from './assets.mjs';
import { renderCards } from './markdown.mjs';
import { getTemplate } from './templates.mjs';
import { parseOptions } from './render.mjs';
import { buildDocument, buildPreviewDocument } from './document.mjs';
import { Md2CardError } from './errors.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SHA = /^[a-f0-9]{64}$/;
const equal = (actual, expected, label) => assert.deepEqual(actual, expected, label);
const dimensions = { width: 1080, height: 1440 };
const artifactNames = { html: 'cards.html', preview: 'preview.html', pdf: 'cards.pdf', png: 'card-001.png', 'contact-sheet': 'contact-sheet.png' };

function pngDimensions(bytes, label) {
  assert.ok(bytes.length >= 33 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && bytes.toString('ascii', 12, 16) === 'IHDR', `${label}: PNG header`);
  const value = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  assert.ok(value.width > 0 && value.height > 0 && value.width * value.height <= 40_000_000, `${label}: PNG dimensions`);
  return value;
}

function checkMobile(result, checkedSource, readBound, prefix) {
  equal(result.mobile?.map(view => view.viewportWidth), [375, 390], `${result.id}: both mobile views`);
  return result.mobile.map(view => {
    equal(view.file, `mobile-${view.viewportWidth}.png`, 'mobile file identity');
    const bytes = readBound(`${prefix}/${view.file}`, view.sha256);
    const size = pngDimensions(bytes, view.file);
    equal(size.width, view.viewportWidth, 'mobile PNG width');
    assert.ok(size.height >= 800, 'full-page mobile screenshot');
    equal(view.cards?.length, 1, 'mobile card count');
    const card = view.cards[0];
    equal(card.index, 1); equal(card.counter, '1 / 1'); equal(card.footer, '');
    assert.ok(Math.abs(card.cardWidth - (view.viewportWidth - 24)) < 1, 'natural mobile card width');
    assert.ok(Array.isArray(card.bodySizes) && card.bodySizes.length && card.bodySizes.every(n => Number.isFinite(n) && n >= 13.95), 'mobile body floor');
    equal(card.bodyMin, Math.min(...card.bodySizes), 'mobile body minimum');
    assert.ok(Number.isFinite(card.noteMin) && card.noteMin >= 10.95, 'mobile note floor');
    equal(card.headings?.map(h => h.level), checkedSource.headingLevels[0], 'mobile headings');
    equal(card.images?.length, checkedSource.cardImages[0].length, 'mobile image count');
    card.images.forEach((image, i) => {
      const expected = checkedSource.cardImages[0][i];
      equal([image.decoded, image.visible, image.fit, image.naturalWidth, image.naturalHeight],
        [true, true, 'contain', expected.width, expected.height], 'uncropped original mobile image');
    });
    return { file: `${prefix}/${view.file}`, sha256: sha256(bytes), ...size, bodyMin: card.bodyMin, noteMin: card.noteMin };
  });
}

function checkRefusal(result, card, readBound, prefix) {
  equal(result.status, 'expected-error', `${result.id}: expected refusal`);
  equal(result.code, 'CONTENT_OVERFLOW'); equal(result.manifest, null);
  for (const key of ['mobile', 'pdfText']) equal(result[key], undefined, `refusal cannot claim ${key}`);
  equal(result.diagnostic?.file, 'overflow.json');
  const bytes = readBound(`${prefix}/overflow.json`, result.diagnostic.sha256), diagnostic = JSON.parse(bytes);
  equal([diagnostic.schemaVersion, diagnostic.status, diagnostic.code, diagnostic.input, diagnostic.theme],
    [2, 'overflow', 'CONTENT_OVERFLOW', `${result.id}.md`, 'editorial'], 'refusal diagnostic identity');
  equal(diagnostic.dimensions, dimensions); equal(diagnostic.cards?.length, 1);
  equal(diagnostic.cards[0].index, 1); equal(diagnostic.cards[0].sourceLines, card.sourceLines);
  const media = ['screen', 'print'].map(name => diagnostic.cards[0][name]);
  assert.ok(media.every(m => m?.index === 1 && Array.isArray(m.overflow) && m.overflow.every(s => typeof s === 'string' && s.length)) && media.some(m => m.overflow.length), 'refusal must record actual overflow');
  return { outcome: 'expected-overflow', diagnostic: { file: `${prefix}/overflow.json`, sha256: sha256(bytes) } };
}

function checkExport(result, item, checkedSource, card, snapshot, readBound, prefix) {
  equal(result.status, 'rendered-not-visually-reviewed', `${result.id}: export status`);
  equal(result.diagnostic, undefined, 'successful output cannot retain a refusal');
  equal(result.manifest?.file, `validation/${prefix}/manifest.json`, 'manifest path');
  const manifestBytes = readBound(`${prefix}/manifest.json`, result.manifest.sha256), manifest = JSON.parse(manifestBytes);
  equal([manifest.schemaVersion, manifest.status, manifest.input, manifest.inputSha256, manifest.theme, manifest.footerMode, manifest.brand],
    [2, 'success', `${item.id}.md`, sha256(item.source), 'editorial', 'legacy', null], 'manifest identity');
  equal(manifest.dimensions, dimensions); equal(manifest.pngScale, 1); equal(manifest.formats, ['html', 'png', 'pdf']);
  equal(manifest.pagination, { mode: 'manual' }); equal(manifest.cardCount, 1); equal(manifest.cards?.length, 1);
  const rendered = manifest.cards[0];
  equal([rendered.index, rendered.template, rendered.layout, rendered.density, rendered.aspect, rendered.sourceSha256, rendered.sourceLines],
    [1, item.template, card.metadata.layout, 'standard', 'portrait', sha256(card.source), card.sourceLines], 'manifest card provenance');
  for (const medium of ['screen', 'print']) { equal(rendered[medium]?.index, 1); equal(rendered[medium]?.overflow, [], `${medium} overflow`); }
  equal(manifest.assets, checkedSource.assets, 'manifest original assets');
  equal(manifest.qa?.overflow, { screen: 'pass', print: 'pass' });
  equal(manifest.qa?.images, { status: 'pass', count: checkedSource.assets.length });
  equal([manifest.qa?.pdf?.status, manifest.qa?.pdf?.ok, manifest.qa?.pdf?.pageCount, manifest.qa?.pdf?.searchable], ['pass', true, 1, true]);
  equal(manifest.qa?.visualReview, 'not-performed');
  const styles = ['themes', 'layouts', 'templates'].map(name => {
    const bytes = snapshot.read(`assets/${name}.css`); equal(manifest.styleSha256?.[name], sha256(bytes), `${name} stylesheet`); return bytes.toString('utf8');
  });
  const options = parseOptions([`${item.id}.md`, '--strict', '--preview', '--contact-sheet']);
  const documents = { html: buildDocument([card], { ...options, preview: false }, ...styles), preview: buildPreviewDocument([card], options, ...styles) };
  equal(manifest.artifacts?.length, 5, 'complete artifact inventory');
  equal(manifest.artifacts.map(a => a.format).sort(), Object.keys(artifactNames).sort(), 'unique artifact formats');
  const artifacts = manifest.artifacts.map(artifact => {
    equal(artifact.file, artifactNames[artifact.format], 'exact artifact filename');
    const file = `${prefix}/${artifact.file}`, bytes = readBound(file, artifact.sha256);
    equal(artifact.bytes, bytes.length, `${file}: byte size`);
    if (documents[artifact.format] !== undefined) equal(bytes.toString('utf8'), documents[artifact.format], `${file}: exact source-derived HTML`);
    if (artifact.format === 'pdf') assert.ok(bytes.subarray(0, 5).toString() === '%PDF-' && /%%EOF\s*$/.test(bytes.subarray(-1024).toString()), `${file}: PDF envelope`);
    if (artifact.format === 'png') { equal(artifact.card, 1); equal(pngDimensions(bytes, file), dimensions); }
    if (artifact.format === 'contact-sheet') equal(pngDimensions(bytes, file), { width: 310, height: 400 });
    return { format: artifact.format, file, bytes: bytes.length, sha256: sha256(bytes) };
  });
  equal(result.pdfText?.map(record => [record.page, record.mode]), [[1, 'raw'], [1, 'layout']], 'both per-page PDF text modes');
  const pdfText = result.pdfText.map(record => {
    equal(record.file, `page-1-${record.mode}.txt`);
    const file = `${prefix}/${record.file}`, bytes = readBound(file, record.sha256);
    // Raw extraction preserves all authored segments. Layout extraction may
    // interleave columns; retain its exact bytes for independent PDF review.
    if (record.mode === 'raw') assertAuthoredSegments(bytes.toString('utf8'), checkedSource.segments[0], file);
    return { file, sha256: sha256(bytes), mode: record.mode, page: 1 };
  });
  const mobile = checkMobile(result, checkedSource, readBound, prefix);
  return { outcome: 'exported', manifest: { file: `${prefix}/manifest.json`, sha256: sha256(manifestBytes) }, artifacts, pdfText, mobile };
}

/** expected must come from independently checked CI/artifact/Git metadata. */
export async function bindRefinementEvidence({ archivePath, sourceRoot, gitRepository = ROOT, expected }) {
  try {
    assert.match(expected?.runUrl ?? '', /^https:\/\/github\.com\/Activer007\/md2card-skill\/actions\/runs\/[1-9][0-9]*$/);
    assert.ok(Number.isSafeInteger(expected.artifactId) && expected.artifactId > 0, 'pinned artifact id');
    const archive = await openEvidenceArchive(archivePath, expected.archiveSha256);
    const consumed = new Set();
    const readBound = function (file, digest) {
      const bytes = archive.read(file); consumed.add(file);
      if (arguments.length > 1) { assert.match(digest, SHA, `${file}: digest required`); equal(sha256(bytes), digest, `${file}: digest mismatch`); }
      return bytes;
    };
    const sourceManifestBytes = readBound('refinement/source-files.json'), sourceManifest = JSON.parse(sourceManifestBytes);
    const snapshot = await verifySourceSnapshot({ sourceRoot, gitRepository, sourceManifest, expected });
    // The legacy recipe builder reads from this trusted checkout. Refuse mixing
    // its example bytes with a different source root; never import that root.
    for (const file of Object.keys(snapshot.files).filter(file => file.startsWith('examples/'))) {
      equal(sha256(await readEvidenceFile(ROOT, file)), snapshot.files[file], `${file}: local recipe data differs from snapshot`);
    }
    const summaryBytes = readBound('refinement/summary.json'), summary = JSON.parse(summaryBytes);
    equal([summary.schemaVersion, summary.mode, summary.status, summary.sourceManifest, summary.sourceSha256, summary.visualReview, summary.browser],
      [1, 'browser', 'browser-checked-visual-review-pending', 'source-files.json', snapshot.sourceSha256, 'not-performed', 'attempted'], 'completed CI summary');
    equal(summary.git, sourceManifest.git); equal(summary.errors, []);
    equal([summary.designCount, summary.acceptedCountUnchanged], [48, 48]);
    const cases = await createRefinementCases();
    equal(cases.length, 22, 'bounded refinement inventory');
    equal(summary.results?.map(r => r.id).sort(), cases.map(c => c.id).sort(), 'complete unique case inventory');
    const records = [];
    for (const item of cases) {
      const result = summary.results.find(r => r.id === item.id), prefix = `refinement/${item.id}`;
      equal([result.template, result.density, result.length, result.group, result.expected, result.visualReview, result.bodySha256],
        [item.template, item.density, item.length, item.group, item.expected, 'not-performed', item.bodySha256], `${item.id}: case identity`);
      equal(result.input, `validation/refinement/inputs/${item.id}.md`);
      const inputFile = `refinement/inputs/${item.id}.md`, input = readBound(inputFile, result.inputSha256);
      equal(input, Buffer.from(item.source), `${item.id}: generated input bytes`);
      const checkedSource = await sourceCheck(item);
      equal(result.source, checkedSource, `${item.id}: source semantics`);
      if (item.originalInput) equal(sha256(snapshot.read(item.originalInput)), item.bodySha256, 'original body identity');
      for (const asset of checkedSource.assets) equal(sha256(snapshot.read(asset.reference)), asset.hash, 'original asset identity');
      const resolver = await createAssetResolver(sourceRoot), cards = renderCards(item.source, { resolveImage: resolver.resolveImage });
      equal(cards.length, 1); equal(resolver.getAssets().map(({ dataUrl, ...a }) => a), checkedSource.assets);
      const checked = item.expected === 'CONTENT_OVERFLOW'
        ? checkRefusal(result, cards[0], readBound, prefix)
        : checkExport(result, item, checkedSource, cards[0], snapshot, readBound, prefix);
      records.push({ id: item.id, template: item.template, version: getTemplate(item.template).version,
        bodySha256: item.bodySha256, input: { file: inputFile, bytes: input.length, sha256: sha256(input) },
        sourceSha256: sha256(cards[0].source), ...checked });
    }
    equal(archive.names.filter(name => name.startsWith('refinement/')).sort(), [...consumed].sort(), 'no unbound or stale refinement entries');
    const comparisonBytes = await snapshot.readCommitted('docs/gallery-comparisons.json'), spec = JSON.parse(comparisonBytes);
    equal(spec.schemaVersion, 1); equal(spec.groups?.map(g => g.id), ['short-reading', 'medium-reading', 'mixed-reading']);
    const groups = spec.groups.map(group => {
      equal(sha256(snapshot.read(group.input)), group.inputSha256, 'comparison body identity');
      const selected = group.templates.map(template => records.find(record => record.id === `${group.id.replace('-reading', '')}-${template}`));
      assert.ok(selected.length === 4 && selected.every(record => record?.bodySha256 === group.inputSha256), 'comparison inventory');
      equal(selected.filter(record => record.outcome === 'expected-overflow').map(record => record.template).sort(), Object.keys(group.requiredRefusals ?? {}).sort());
      return { id: group.id, state: 'pending', input: group.input, bodySha256: group.inputSha256, records: selected.map(record => record.id) };
    });
    return { schemaVersion: 1, status: 'artifact-bound-visual-review-pending', visualReview: 'not-performed',
      identity: { commit: snapshot.commit, tree: snapshot.tree, sourceSha256: snapshot.sourceSha256, runUrl: expected.runUrl, artifactId: expected.artifactId, archiveSha256: archive.sha256 },
      summarySha256: sha256(summaryBytes), sourceManifestFileSha256: sha256(sourceManifestBytes), comparisonSpecSha256: sha256(comparisonBytes),
      scope: { density: 'standard', aspect: 'portrait', pagination: 'manual', ...dimensions },
      counts: { cases: records.length, exports: records.filter(r => r.outcome === 'exported').length, refusals: records.filter(r => r.outcome === 'expected-overflow').length, boundEntries: consumed.size },
      checks: { sourceSnapshot: 'verified', artifactBytes: 'verified', sourceDerivedHtml: 'verified', pdfText: 'verified-ci-records', localPdfExtraction: 'not-performed', browserReplay: 'not-performed' },
      groups, records };
  } catch (error) {
    if (error instanceof Md2CardError) throw error;
    // Bound the message: deep equality of HTML must not dump megabytes of data.
    throw new Md2CardError('REFINEMENT_EVIDENCE_INVALID', 'Refinement evidence does not match the pinned source or artifact contract.',
      { reason: error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0].slice(0, 300) : String(error.message).slice(0, 300) });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = {};
    while (args.length) {
      const flag = args.shift();
      if (!['--archive', '--source-root', '--identity', '--out'].includes(flag) || options[flag] || !args[0] || args[0].startsWith('--')) throw new Error(`Unknown, duplicate or incomplete option: ${flag}`);
      options[flag] = path.resolve(args.shift());
    }
    if (Object.keys(options).length !== 4) throw new Error('Required: --archive ZIP --source-root DIR --identity JSON --out JSON');
    const report = await bindRefinementEvidence({ archivePath: options['--archive'], sourceRoot: options['--source-root'], expected: JSON.parse(await readFile(options['--identity'], 'utf8')) });
    await mkdir(path.dirname(options['--out']), { recursive: true });
    await writeFile(options['--out'], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: report.status, counts: report.counts, output: options['--out'] }));
  } catch (error) { console.error(JSON.stringify({ code: error.code ?? 'INVALID_OPTIONS', message: error.message, details: error.details })); process.exitCode = 1; }
}
