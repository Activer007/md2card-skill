#!/usr/bin/env node
// Materialize exact comparison evidence for offline verification. This does not
// create a visual review or change gallery acceptance. Existing output is refused.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { bindRefinementEvidence } from './bind-refinement-evidence.mjs';
import { openEvidenceArchive } from './evidence-archive.mjs';
import { readEvidenceFile, sha256, verifySourceSnapshot } from './evidence-source.mjs';
import { COMPARISON_BATCH, comparisonRecordFiles } from './comparison-evidence.mjs';

export async function packageComparisonEvidence({ archivePath, sourceRoot, gitRepository, outputRoot }) {
  const expected = COMPARISON_BATCH.identity;
  const binding = await bindRefinementEvidence({ archivePath, sourceRoot, gitRepository, expected });
  const bytes = Buffer.from(JSON.stringify(binding, null, 2) + '\n');
  assert.equal(sha256(bytes), COMPARISON_BATCH.bindingSha256, 'binder output differs from the curated batch');
  const archive = await openEvidenceArchive(archivePath, expected.archiveSha256);
  const sourceManifest = JSON.parse(archive.read('refinement/source-files.json'));
  const source = await verifySourceSnapshot({ sourceRoot, gitRepository, sourceManifest, expected });
  const ids = new Set(binding.groups.flatMap(group => group.records));
  const entries = binding.records.filter(record => ids.has(record.id)).flatMap(comparisonRecordFiles);
  const output = new Map([['binding.json', bytes], ['comparison-plan.json', await source.readCommitted('docs/gallery-comparisons.json')],
    ['source-package.json', await readEvidenceFile(sourceRoot, 'package.json')],
    ...['refinement/source-files.json', 'refinement/summary.json'].map(file => [file, archive.read(file)])]);
  for (const entry of entries) { const content = archive.read(entry.file); assert.equal(sha256(content), entry.sha256); output.set(entry.file, content); }
  await mkdir(path.dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot); // Fail on existing evidence; never overwrite a review.
  for (const [file, content] of output) {
    const target = path.join(outputRoot, file);
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content, { flag: 'wx' });
  }
  return { files: output.size, bytes: [...output.values()].reduce((sum, value) => sum + value.length, 0), status: binding.status };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = {};
    while (args.length) {
      const key = args.shift();
      if (!['--archive', '--source-root', '--out'].includes(key) || options[key] || !args[0] || args[0].startsWith('--')) throw new Error(`Invalid option: ${key}`);
      options[key] = path.resolve(args.shift());
    }
    assert.equal(Object.keys(options).length, 3, 'Required: --archive ZIP --source-root DIR --out DIR');
    console.log(JSON.stringify(await packageComparisonEvidence({ archivePath: options['--archive'], sourceRoot: options['--source-root'], outputRoot: options['--out'] })));
  } catch (error) { console.error(error.code ?? 'COMPARISON_PACKAGE_INVALID', error.message, error.details ?? ''); process.exitCode = 1; }
}
