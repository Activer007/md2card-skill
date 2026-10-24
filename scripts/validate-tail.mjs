#!/usr/bin/env node
// Actual browser/PDF gate. Run only in an authorized browser environment.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseOptions, exportCards } from './render.mjs';
import { renderCards } from './markdown.mjs';

const run = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');
const root = path.resolve('validation/tail');
const cases = [
  { name: 'paragraphs', input: 'examples/pagination-tail.md', height: 650, markers: /TAIL_\d{2}/g, expectedCounts: [5, 1], balancedCounts: [3, 3] },
  { name: 'locked', input: 'examples/pagination-tail-locked.md', height: 650, markers: /LOCK_[AB]\d{2}/g, expectedCounts: [5, 5, 1, 5, 1], balancedCounts: [5, 3, 3, 3, 3] },
  { name: 'lists', input: 'examples/pagination-lists.md', height: 1200, markers: /STEP_A\d{2}/g },
  { name: 'tables', input: 'examples/pagination-tables.md', height: 900, markers: /ROW_A\d{2}/g }
];
const results = [];
await mkdir(root, { recursive: true });
for (const item of cases) {
  try {
    const source = await readFile(item.input, 'utf8'), markers = source.match(item.markers) || [];
    assert.ok(markers.length && new Set(markers).size === markers.length);
    const decks = [];
    for (const balanced of [false, true]) {
      const directory = `${item.name}-${balanced ? 'balanced' : 'greedy'}`;
      const out = path.join(root, directory);
      const args = [item.input, '--out', out, '--paginate', 'auto', '--theme', 'minimal', '--width', '1080', '--height', String(item.height), '--strict', '--preview', '--contact-sheet', ...(balanced ? ['--balance-tail'] : [])];
      const manifest = await exportCards(parseOptions(args));
      assert.equal(manifest.inputSha256, hash(source));
      assert.equal(manifest.pagination.balance.enabled, balanced);
      assert.equal(manifest.pagination.validation.status, 'pass');
      assert.deepEqual(manifest.qa.overflow, { screen: 'pass', print: 'pass' });
      assert.equal(manifest.qa.pdf.status, 'pass');
      assert.equal(manifest.qa.pdf.pageCount, manifest.cardCount);
      assert.equal(manifest.qa.pdf.searchable, true);
      assert.ok(manifest.pagination.probes <= manifest.pagination.limits.probes);
      assert.ok(manifest.pagination.balance.probes <= manifest.pagination.balance.limits.probes);
      assert.deepEqual(manifest.cards.flatMap(card => card.provenance.atomIds), manifest.pagination.atoms.map(atom => atom.id));
      const atoms = new Map(manifest.pagination.atoms.map(atom => [atom.id, atom]));
      for (const card of manifest.cards) assert.ok(card.provenance.atomIds.every(id => atoms.get(id).partitionIndex === card.provenance.partitionIndex));
      const html = await readFile(path.join(out, 'cards.html'), 'utf8');
      const preview = await readFile(path.join(out, 'preview.html'), 'utf8');
      const { stdout: pdf } = await run('pdftotext', ['-enc', 'UTF-8', '-layout', path.join(out, 'cards.pdf'), '-'], { timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
      for (const [kind, text] of Object.entries({ html, preview, pdf })) assert.deepEqual(text.match(item.markers), markers, `${directory} ${kind}: markers must occur once in source order`);
      if (item.name === 'locked') for (const page of pdf.split('\f').filter(page => page.trim())) assert.equal(new Set(page.match(/LOCK_[AB]/g)).size, 1, 'Locked partitions must not share a PDF page');
      if (item.name === 'lists') {
        for (let number = 7; number <= 18; number++) assert.match(pdf, new RegExp(`\\b${String(number).padStart(2, '0')}\\b\\s+STEP_A${String(number).padStart(2, '0')}\\b`));
      }
      if (item.name === 'tables') {
        const original = renderCards(source).map(card => card.html).join('\n').match(/<thead>[\s\S]*?<\/thead>/g);
        const headers = html.match(/<thead>[\s\S]*?<\/thead>/g) || [];
        assert.ok(headers.length > 1 && headers.every(header => header === original[0]));
        assert.equal(manifest.cards.reduce((count, card) => count + card.provenance.repeatedHeaders.length, 0), headers.length - 1);
      }
      for (const artifact of manifest.artifacts) {
        assert.equal(path.basename(artifact.file), artifact.file);
        const bytes = await readFile(path.join(out, artifact.file));
        assert.equal(bytes.length, artifact.bytes);
        assert.equal(hash(bytes), artifact.sha256);
      }
      decks.push({ directory, command: ['node', 'scripts/render.mjs', ...args], manifest });
    }
    const [greedy, balanced] = decks.map(deck => deck.manifest);
    assert.equal(balanced.cardCount, greedy.cardCount);
    assert.deepEqual(balanced.pagination.atoms, greedy.pagination.atoms);
    assert.deepEqual(balanced.pagination.partitions, greedy.pagination.partitions);
    assert.equal(balanced.pagination.greedyProbes, greedy.pagination.probes);
    for (const partition of greedy.pagination.partitions) {
      const before = greedy.cards.filter(card => card.provenance.partitionIndex === partition.index);
      const after = balanced.cards.filter(card => card.provenance.partitionIndex === partition.index);
      assert.equal(after.length, before.length);
      for (let index = 0; index < before.length - 2; index++) {
        assert.deepEqual(after[index].provenance, before[index].provenance, 'Earlier page provenance must stay unchanged');
        const filename = `card-${String(before[index].index).padStart(3, '0')}.png`;
        assert.equal(hash(await readFile(path.join(root, decks[0].directory, filename))), hash(await readFile(path.join(root, decks[1].directory, filename))), 'Earlier PNG must stay byte-identical');
      }
    }
    for (const record of balanced.pagination.balance.partitions.filter(record => record.outcome === 'improved')) for (const media of ['screen', 'print']) {
      assert.ok(record.after[media].right > record.before[media].right);
      assert.ok(record.before[media].gap - record.after[media].gap >= balanced.pagination.balance.policy.minGapImprovement - 1e-9);
    }
    if (['lists', 'tables'].includes(item.name)) {
      assert.ok(balanced.pagination.balance.appliedPartitions > 0, `${item.name}: require a real semantic transfer, not no-op fidelity`);
    }
    if (item.expectedCounts) {
      // These are explicit calibration gates, not inferred success. If real
      // fonts/geometry differ, fail and review the artifacts before changing them.
      assert.deepEqual(greedy.cards.map(card => card.provenance.atomIds.length), item.expectedCounts, 'Fixture geometry needs explicit review/calibration');
      assert.deepEqual(balanced.cards.map(card => card.provenance.atomIds.length), item.balancedCounts);
      assert.equal(balanced.pagination.balance.appliedPartitions, item.name === 'locked' ? 2 : 1);
    }
    results.push({ name: item.name, status: 'pass', input: item.input, inputSha256: hash(source), decks: decks.map(({ manifest, ...deck }) => ({ ...deck, cards: manifest.cardCount, balance: manifest.pagination.balance })) });
  } catch (error) {
    results.push({ name: item.name, status: 'fail', code: error.code || 'VALIDATION_FAILED', message: error.message });
  }
}
const failed = results.filter(result => result.status === 'fail');
await writeFile(path.join(root, 'summary.json'), JSON.stringify({ schemaVersion: 1, status: failed.length ? 'fail' : 'pass', visualAcceptance: 'pending-independent-pixel-review', results }, null, 2) + '\n');
if (failed.length) throw new Error(`${failed.length} tail artifact case(s) failed; see validation/tail/summary.json`);
console.log('Validated four greedy/opt-in pairs; pixel/art-direction review is still required.');
