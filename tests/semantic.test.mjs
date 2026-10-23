import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  AUTO_LAYOUTS, MAX_SEMANTIC_ATOMS, parseSemanticDocument,
  renderSemanticCard, validateSemanticCoverage, semanticManifest
} from '../scripts/semantic.mjs';
import { renderCards } from '../scripts/markdown.mjs';
import { buildDocument } from '../scripts/document.mjs';

const asset = Object.freeze({ dataUrl: 'data:image/png;base64,AQID', hash: 'fake', mime: 'image/png', width: 2, height: 3, bytes: 3 });
const wholeCards = document => document.partitions.map((partition, index) => renderSemanticCard(document, partition, partition.atoms, index + 1));
const groupCards = document => document.partitions.flatMap(partition => partition.groups.length
  ? partition.groups.map(group => renderSemanticCard(document, partition, group.atoms))
  : [renderSemanticCard(document, partition, [])]).map((card, index) => ({ ...card, index: index + 1 }));
const occurrences = (source, expression) => [...source.matchAll(expression)].length;

function assertSourceAccounting(document) {
  let offset = 0;
  for (const range of document.sourceAccounting) {
    assert.equal(range.sourceRange[0], offset);
    assert.ok(range.sourceRange[1] > offset);
    assert.ok(range.sourceRange[1] <= document.source.length);
    assert.deepEqual(range.originalRange, range.sourceRange.map(index => document.sourceMap.normalizedToOriginal[index]));
    offset = range.sourceRange[1];
  }
  assert.equal(offset, document.source.length);
  assert.ok(document.sourceAccounting.every(entry => entry.kind !== 'source-only'));
}

test('normalization preserves exact UTF-16 offsets, original mappings, hashes and all source', () => {
  const original = '\uFEFF \r\n<!-- card: {"layout":"steps"} -->\r\n\t\r\n# 中文 😀\r\n\r\nText  \r\n\r\n[ref]: https://example.test\r\n';
  const document = parseSemanticDocument(original);
  assert.equal(document.source, original.slice(1).replace(/\r\n/g, '\n'));
  assert.equal(document.originalSource, original);
  assert.equal(document.originalHash, createHash('sha256').update(original).digest('hex'));
  assert.equal(document.normalizedHash, createHash('sha256').update(document.source).digest('hex'));
  assert.notEqual(document.originalHash, document.normalizedHash);
  assert.equal(document.sourceMap.offsetUnit, 'utf16');
  assert.equal(document.sourceMap.normalizedToOriginal.length, document.source.length + 1);
  assert.equal(document.sourceMap.normalizedToOriginal[0], 1);
  assert.equal(document.sourceMap.normalizedToOriginal.at(-1), original.length);
  const [heading, paragraph] = document.atoms;
  assert.deepEqual(heading.sourceLines, [4, 4]);
  assert.deepEqual(paragraph.sourceLines, [6, 6]);
  assert.equal(document.source.slice(...heading.sourceRange), '# 中文 😀\n');
  assert.equal(original.slice(...heading.originalRange), '# 中文 😀\r\n');
  assert.equal(document.source.slice(...paragraph.sourceRange), 'Text  \n');
  assert.equal(document.partitions[0].metadata.layout, 'steps');
  assert.ok(document.nonRendered.some(entry => entry.kind === 'metadata' && entry.sourceLines[0] === 2));
  assert.ok(document.nonRendered.some(entry => entry.kind === 'reference-definition' && entry.sourceLines[0] === 8));
  assertSourceAccounting(document);
});

test('lone CR normalization and final boundary without newline are exact', () => {
  const document = parseSemanticDocument('\uFEFF# H\r\rBody 😀');
  assert.deepEqual(document.atoms.map(atom => atom.sourceLines), [[1, 1], [3, 3]]);
  assert.deepEqual(Array.from(document.sourceMap.normalizedToOriginal), Array.from({ length: document.source.length + 1 }, (_, index) => index + 1));
  assert.equal(document.atoms.at(-1).sourceRange[1], document.source.length);
  assertSourceAccounting(document);
});

test('explicit partitions stay locked and metadata is never rendered or silently lost', () => {
  const input = '\n<!-- card: {"layout":"steps"} -->\n# One\n\nBody\n\n===  \n\n# Two\n\nOther\n';
  const document = parseSemanticDocument(input);
  assert.deepEqual(document.partitions.map(partition => partition.index), [1, 2]);
  assert.deepEqual(document.partitions.map(partition => partition.metadata.layout), ['steps', 'explainer']);
  assert.equal(document.separators.length, 1);
  assert.deepEqual(document.separators[0].sourceLines, [7, 7]);
  assert.equal(document.source.slice(...document.separators[0].sourceRange), '===  \n');
  assert.deepEqual(wholeCards(document).map(card => card.html), renderCards(input).map(card => card.html));
  assert.doesNotMatch(wholeCards(document)[0].html, /card:/);
  assert.throws(() => renderSemanticCard(document, document.partitions[0], [document.atoms[1], document.atoms[2]]), { code: 'PAGINATION_COVERAGE' });
  assertSourceAccounting(document);
});

test('automatic layout and metadata restrictions fail explicitly; malformed metadata stays invalid', () => {
  assert.deepEqual(AUTO_LAYOUTS, ['explainer', 'steps']);
  for (const layout of ['cover', 'comparison', 'image-caption', 'statistic', 'case-study', 'quote', 'unknown']) {
    assert.throws(() => parseSemanticDocument(`<!-- card: {"layout":"${layout}"} -->\nBody`), { code: 'PAGINATION_UNSUPPORTED_LAYOUT' });
  }
  for (const field of ['eyebrow', 'image', 'alt', 'caption', 'source', 'metric', 'label', 'unknown']) {
    assert.throws(() => parseSemanticDocument(`<!-- card: {"${field}":"value"} -->\nBody`), { code: 'PAGINATION_UNSUPPORTED_METADATA' });
  }
  for (const value of ['null', '[]', '{bad}', '{"layout":3}']) {
    assert.throws(() => parseSemanticDocument(`<!-- card: ${value} -->\nBody`), { code: 'INVALID_METADATA' });
  }
  assert.equal(parseSemanticDocument('    <!-- card: {"layout":"cover"} -->').atoms[0].kind, 'code');
});

test('consecutive headings bind to the following indivisible atom', () => {
  const document = parseSemanticDocument('# Main\n\n## Sub\n\nParagraph\n\n## List\n\n- first\n- second\n\n## Quote\n\n> text');
  const partition = document.partitions[0];
  assert.deepEqual(partition.groups.map(group => group.atoms.map(atom => atom.kind)), [['heading', 'heading', 'paragraph'], ['heading', 'list-item'], ['list-item'], ['heading', 'quote']]);
  assert.ok(partition.groups.every(group => group.atomIds.every((id, index) => id === group.atoms[index].id)));
  assert.equal(validateSemanticCoverage(document, groupCards(document)).valid, true);
  const fragmented = partition.atoms.map((atom, index) => renderSemanticCard(document, partition, [atom], index + 1));
  assert.throws(() => validateSemanticCoverage(document, fragmented), /heading group/);
});

test('terminal heading chains fail with actionable original source lines', () => {
  for (const source of ['# Alone', 'Body\n\n# Last\n\n## Sub', 'Body\n===\n## Last']) {
    assert.throws(() => parseSemanticDocument(source), error => error.code === 'PAGINATION_ORPHAN_HEADING' && Array.isArray(error.details.sourceLines) && error.message.includes('Add a paragraph'));
  }
});

test('fenced, nested fenced and indented code protect literal === and remain atomic', () => {
  for (const source of [
    '````md\n```\n===\n````\n\n===\nEnd',
    '~~~\n===\n~~~\n\n===\nEnd',
    '    ===\n    code  \n\n===\nEnd',
    '- item\n\n  ```\n  ===\n  ```\n\n===\nEnd',
    '> ```\n> ===\n> ```\n\n===\nEnd'
  ]) {
    const document = parseSemanticDocument(source);
    assert.equal(document.partitions.length, 2);
    assert.deepEqual(wholeCards(document).map(card => card.html), renderCards(source).map(card => card.html));
    assertSourceAccounting(document);
  }
  const document = parseSemanticDocument('A long paragraph\nwith a second line\n\n> A quote\n>\n> - nested\n> - list\n\n```js\nconst tag = "<tag>";\n```');
  assert.deepEqual(document.atoms.map(atom => atom.kind), ['paragraph', 'quote', 'code']);
});

test('tight and loose lists retain complete nested items and original paragraph visibility', () => {
  for (const source of [
    '- first\n- second\n  - nested\n    - deeper\n- third',
    '- first\n\n- second\n\n  another paragraph\n\n  - nested\n  - nested 2\n\n- third',
    '3. first\n\n4. second\n   - nested\n\n5. third',
    '8) first\n9) second\n   > quote\n\n10) third'
  ]) {
    const document = parseSemanticDocument(source);
    const partition = document.partitions[0];
    assert.equal(partition.atoms.length, 3);
    assert.ok(partition.atoms.every(atom => atom.kind === 'list-item'));
    assert.equal(wholeCards(document)[0].html, renderCards(source)[0].html);
    const cards = groupCards(document);
    assert.equal(validateSemanticCoverage(document, cards).valid, true);
    assert.ok(cards[1].html.includes('second'));
    assert.ok(cards[1].html.includes(source.includes('nested') ? 'nested' : 'quote'));
    const originalParagraphs = occurrences(wholeCards(document)[0].html, /<p>/g);
    assert.equal(cards.reduce((sum, card) => sum + occurrences(card.html, /<p>/g), 0), originalParagraphs);
    assertSourceAccounting(document);
  }
});

test('ordered list continuation carries ordinal rather than original marker spelling', () => {
  const document = parseSemanticDocument('3. alpha\n9. beta\n1. gamma\n2. delta');
  const partition = document.partitions[0];
  const cards = groupCards(document);
  assert.match(cards[0].html, /^<ol start="3">/);
  assert.match(cards[1].html, /^<ol start="4">/);
  assert.match(cards[2].html, /^<ol start="5">/);
  assert.match(cards[3].html, /^<ol start="6">/);
  const combined = renderSemanticCard(document, partition, partition.atoms.slice(1, 3));
  assert.equal(occurrences(combined.html, /<ol/g), 1);
  assert.equal(occurrences(combined.html, /<li>/g), 2);
  assert.match(combined.html, /^<ol start="4">/);
  assert.deepEqual(partition.atoms.map(atom => atom.orderedStart), [3, 4, 5, 6]);
});

test('adjacent independent lists stay separate while fragments of one list coalesce', () => {
  const source = '- one\n- two\n\n* three\n* four';
  const document = parseSemanticDocument(source);
  const html = wholeCards(document)[0].html;
  assert.equal(html, renderCards(source)[0].html);
  assert.equal(occurrences(html, /<ul>/g), 2);
  assert.notEqual(document.atoms[1].container.id, document.atoms[2].container.id);
});

test('tables split only at complete body rows and repeat their original aligned headers', () => {
  const source = '| Name | Value |\n|:---|---:|\n| *One* | [link](https://example.test) |\n| Two | `code` |\n| Three | & <tag> |';
  const document = parseSemanticDocument(source);
  const partition = document.partitions[0];
  assert.deepEqual(partition.atoms.map(atom => atom.kind), ['table-row', 'table-row', 'table-row']);
  assert.deepEqual(partition.atoms.map(atom => atom.sourceLines), [[3, 3], [4, 4], [5, 5]]);
  assert.equal(wholeCards(document)[0].html, renderCards(source)[0].html);
  const cards = groupCards(document);
  assert.deepEqual(cards.map(card => card.provenance.repeatedHeaders.length), [0, 1, 1]);
  for (const card of cards) {
    assert.equal(occurrences(card.html, /<table>/g), 1);
    assert.equal(occurrences(card.html, /<thead>/g), 1);
    assert.equal(occurrences(card.html, /<tbody>/g), 1);
    assert.equal(occurrences(card.html, /<td /g), 2);
    assert.match(card.html, /<th style="text-align:left">Name<\/th>/);
    assert.match(card.html, /<th style="text-align:right">Value<\/th>/);
    assert.ok(card.source.startsWith('| Name | Value |\n|:---|---:|\n'));
  }
  assert.match(cards[0].html, /href="https:\/\/example.test" rel="noopener noreferrer"/);
  assert.match(cards[1].html, /<code>code<\/code>/);
  assert.match(cards[2].html, /&amp; &lt;tag&gt;/);
  assert.equal(validateSemanticCoverage(document, cards).valid, true);
  const combined = renderSemanticCard(document, partition, partition.atoms.slice(1));
  assert.equal(occurrences(combined.html, /<table>/g), 1);
  assert.equal(occurrences(combined.html, /<thead>/g), 1);
  assert.equal(occurrences(combined.html, /<td /g), 4);
  assert.deepEqual(combined.provenance.repeatedHeaders[0].sourceLines, [1, 2]);
  assertSourceAccounting(document);
});

test('header-only tables stay as one exact-once atomic table', () => {
  const source = '| Header |\n|---|';
  const document = parseSemanticDocument(source);
  assert.deepEqual(document.atoms.map(atom => atom.kind), ['table']);
  const [card] = wholeCards(document);
  assert.equal(card.html, renderCards(source)[0].html);
  assert.deepEqual(card.provenance.repeatedHeaders, []);
  assert.equal(validateSemanticCoverage(document, [card]).atomCount, 1);
  assertSourceAccounting(document);
});

test('HTML escaping and link safety match manual mode before and after splitting', () => {
  const source = '<script>alert(1)</script>\n\n<img src="https://example.test/leak">\n\n[bad](javascript:alert(1))\n\n[good](https://example.test "A & B")';
  const document = parseSemanticDocument(source);
  assert.equal(wholeCards(document)[0].html, renderCards(source)[0].html);
  const html = groupCards(document).map(card => card.html).join('');
  assert.doesNotMatch(html, /<script>|<img|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /title="A &amp; B" rel="noopener noreferrer"/);
});

test('images use the same trusted resolver and remain atomic with reference/linked forms', () => {
  const references = [];
  const source = '![Inline & alt](inline.png "Title")\n\n[![Linked][image]](https://example.test)\n\n===\n\n[image]: linked.webp\n\nBody';
  const document = parseSemanticDocument(source, { resolveImage: reference => { references.push(reference); return asset; } });
  assert.deepEqual(references, ['inline.png', 'linked.webp']);
  assert.deepEqual(document.partitions[0].atoms.map(atom => atom.kind), ['image', 'image']);
  assert.deepEqual(wholeCards(document).map(card => card.html), renderCards(source, { resolveImage: () => asset }).map(card => card.html));
  const cards = groupCards(document);
  assert.equal(cards.reduce((sum, card) => sum + occurrences(card.html, /<img /g), 0), 2);
  assert.match(cards[0].html, /alt="Inline &amp; alt" title="Title" class="markdown-image" width="2" height="3"/);
  assert.equal(validateSemanticCoverage(document, cards).valid, true);
  assert.throws(() => parseSemanticDocument('![A](x.png)'), { code: 'INVALID_ASSET' });
  assert.throws(() => parseSemanticDocument('![A](x.png)', { resolveImage: () => ({ dataUrl: 'https://example.test' }) }), { code: 'INVALID_ASSET' });
});

test('global references preserve first definition, prototype labels, unused and duplicate definitions', () => {
  const source = '[Later][ref]\n\n[constructor]\n\n===\n\n[ref]: https://example.test/first "Title"\n[constructor]: https://example.test/prototype\n[unused]: https://example.test/unused\n\n[Earlier][ref]\n\n===\n\n[ref]: https://example.test/second\n\nEnd';
  const document = parseSemanticDocument(source);
  assert.deepEqual(wholeCards(document).map(card => card.html), renderCards(source).map(card => card.html));
  assert.match(wholeCards(document)[0].html, /href="https:\/\/example.test\/first" title="Title"/);
  assert.match(wholeCards(document)[0].html, /href="https:\/\/example.test\/prototype"/);
  assert.equal(Object.getPrototypeOf(document.references), null);
  assert.equal(document.partitions.flatMap(partition => partition.referenceDefinitions).length, 4);
  assert.deepEqual(document.nonRendered.filter(entry => entry.kind === 'reference-definition').map(entry => entry.label), ['REF', 'CONSTRUCTOR', 'UNUSED', 'REF']);
  assertSourceAccounting(document);
});

test('multiline and nested reference definitions are explicitly accounted, not guessed by regex', () => {
  const source = '[multi]:\n  https://example.test\n  "A title"\n\n- [inside]: https://example.test/inside\n\n- [multi] and [inside]\n\n> [quote]: https://example.test/quote\n>\n> [quote]\n\n```\n[notref]: https://example.test/notref\n```\n\n[unsafe]: javascript:alert(1)';
  const document = parseSemanticDocument(source);
  assert.equal(wholeCards(document)[0].html, renderCards(source)[0].html);
  assert.deepEqual(document.partitions[0].referenceDefinitions.map(definition => definition.label), ['MULTI', 'INSIDE', 'QUOTE']);
  assert.deepEqual(document.partitions[0].referenceDefinitions[0].sourceLines, [1, 3]);
  assert.ok(document.nonRendered.some(entry => entry.label === 'INSIDE'));
  assert.ok(document.nonRendered.some(entry => entry.label === 'QUOTE'));
  assertSourceAccounting(document);
});

test('source-only explicit partitions are retained exactly once as empty cards', () => {
  const source = '[ref]: https://example.test\n\n===\n\n[ref]\n\n===\n\n<!-- card: {"layout":"steps"} -->';
  const document = parseSemanticDocument(source);
  const cards = wholeCards(document);
  assert.deepEqual(cards.map(card => card.html), renderCards(source).map(card => card.html));
  assert.deepEqual(cards.map(card => card.provenance.atomIds.length), [0, 1, 0]);
  assert.equal(cards[2].metadata.layout, 'steps');
  assert.equal(validateSemanticCoverage(document, cards).partitionCount, 3);
  for (const changed of [cards.slice(1), cards.slice(0, -1), [cards[0], ...cards], [cards[1], cards[0], cards[2]]]) {
    assert.throws(() => validateSemanticCoverage(document, changed), { code: 'PAGINATION_COVERAGE' });
  }
  assertSourceAccounting(document);
});

test('coverage rejects missing, duplicated, reordered and invented atoms or partition changes', () => {
  const document = parseSemanticDocument('One\n\nTwo\n\nThree\n\n===\nFour');
  const cards = groupCards(document);
  assert.equal(validateSemanticCoverage(document, cards).atomCount, 4);
  const changes = [cards.slice(1), cards.slice(0, -1), [...cards, cards[0]], [cards[1], cards[0], ...cards.slice(2)]];
  for (const changed of changes) assert.throws(() => validateSemanticCoverage(document, changed), { code: 'PAGINATION_COVERAGE' });
  for (const mutate of [
    card => { card.index = 2; },
    card => { card.index = 0; },
    card => { card.provenance.atomIds[0] = 'invented'; },
    card => { card.provenance.partitionIndex = 2; },
    card => { card.provenance.sourceRanges[0][0]++; },
    card => { card.sourceLines[0]++; },
    card => { card.metadata.layout = 'steps'; },
    card => { card.source = 'Changed'; },
    card => { card.html = '<p>Changed</p>'; }
  ]) {
    const changed = structuredClone(cards);
    mutate(changed[0]);
    assert.throws(() => validateSemanticCoverage(document, changed), { code: 'PAGINATION_COVERAGE' });
  }
});

test('coverage rejects omitted or fabricated repeated-header provenance', () => {
  const document = parseSemanticDocument('| H |\n|---|\n| a |\n| b |');
  const cards = groupCards(document);
  for (const mutate of [
    changed => { changed[1].provenance.repeatedHeaders = []; },
    changed => { changed[0].provenance.repeatedHeaders = changed[1].provenance.repeatedHeaders; },
    changed => { changed[1].html = changed[1].html.replace('<th>H</th>', '<th>Other</th>'); }
  ]) {
    const changed = structuredClone(cards);
    mutate(changed);
    assert.throws(() => validateSemanticCoverage(document, changed), { code: 'PAGINATION_COVERAGE' });
  }
});

test('parse-time independent witnesses reject tampered IR rather than validating its own changed tokens', () => {
  for (const mutate of [
    document => { document.atoms[0].tokens[1].children[0].content = 'changed'; },
    document => { document.atoms.pop(); },
    document => { document.partitions[0].groups.pop(); },
    document => { document.source = 'different source'; },
    document => { document.sourceMap.normalizedToOriginal[0] = 9; },
    document => { document.nonRendered.push({ kind: 'whitespace' }); },
    document => { document.partitions[0].atoms.reverse(); }
  ]) {
    const document = parseSemanticDocument('First\n\nSecond');
    const cards = wholeCards(document);
    mutate(document);
    assert.throws(() => validateSemanticCoverage(document, cards), { code: 'PAGINATION_COVERAGE' });
  }
});

test('rendering, validation and manifest generation never mutate source tokens or input', () => {
  const input = '# H\n\n[link](https://example.test)\n\n![A](a.png)\n\n3. a\n4. b\n\n| H |\n|---|\n| x |\n| y |';
  const document = parseSemanticDocument(input, { resolveImage: () => asset });
  const before = JSON.stringify(document);
  const cards = groupCards(document);
  validateSemanticCoverage(document, cards);
  const manifest = semanticManifest(document, cards);
  wholeCards(document);
  assert.equal(JSON.stringify(document), before);
  assert.equal(document.originalSource, input);
  assert.equal(manifest.coverage.scope, 'semantic-tokens-and-html');
  assert.doesNotMatch(JSON.stringify(manifest), /data:image|"tokens"|"html"/);
  assert.deepEqual(manifest.cards.flatMap(card => card.atomIds), manifest.atoms.map(atom => atom.id));
  assert.equal(manifest.hashes.original, document.originalHash);
  assert.equal(manifest.hashes.normalized, document.normalizedHash);
});

test('semantic cards fit buildDocument without extra adapters', () => {
  const document = parseSemanticDocument('<!-- card: {"layout":"steps"} -->\n# Steps\n\n1. First\n2. Second');
  const html = buildDocument(groupCards(document), { width: 600, height: 800, theme: 'minimal' }, '');
  assert.match(html, /layout-steps/);
  assert.match(html, /<ol start="2">/);
  assert.match(html, /default-src 'none'/);
});

test('at most 2000 semantic atoms are accepted and budget errors are explicit', () => {
  assert.equal(MAX_SEMANTIC_ATOMS, 2000);
  const accepted = parseSemanticDocument(Array.from({ length: 2000 }, (_, index) => `- item ${index}`).join('\n'));
  assert.equal(accepted.atoms.length, 2000);
  assert.throws(() => parseSemanticDocument(Array.from({ length: 2001 }, (_, index) => `- item ${index}`).join('\n')), error => error.code === 'PAGINATION_BUDGET' && error.details.limit === 2000 && error.details.actual === 2001);
});

test('empty inputs retain manual validation and selection rejects copied or reordered atom objects', () => {
  for (const source of ['', '===\nBody', 'Body\n===', 'Body\n===\n===\nEnd', null]) assert.throws(() => parseSemanticDocument(source), { code: 'INVALID_MARKDOWN' });
  const document = parseSemanticDocument('A\n\nB');
  const partition = document.partitions[0];
  assert.throws(() => renderSemanticCard(document, partition, []), { code: 'PAGINATION_COVERAGE' });
  assert.throws(() => renderSemanticCard(document, partition, [...partition.atoms].reverse()), { code: 'PAGINATION_COVERAGE' });
  assert.throws(() => renderSemanticCard(document, partition, [{ ...partition.atoms[0] }]), { code: 'PAGINATION_COVERAGE' });
});


test('large CRLF and blank-line inputs produce compact manifests with exact span mappings', () => {
  const input = '\uFEFFBody\r\n' + '\r\n'.repeat(100_000);
  const document = parseSemanticDocument(input);
  const manifest = semanticManifest(document, wholeCards(document));
  assert.equal(manifest.sourceMap.transformations.bom, 1);
  assert.equal(manifest.sourceMap.transformations.crlf, 100_001);
  assert.equal(manifest.sourceMap.originalLength, input.length);
  assert.equal(manifest.sourceMap.normalizedLength, document.source.length);
  assert.equal(manifest.sourceMap.lineCount, 100_002);
  assert.equal(manifest.sourceMap.normalizedToOriginal, undefined);
  assert.equal(manifest.sourceMap.lineStarts, undefined);
  assert.ok(JSON.stringify(manifest, null, 2).length < 12_000);
  assertSourceAccounting(document);
});

test('large shared table headers are fingerprinted without duplicating embedded data in manifest', () => {
  const largeAsset = { ...asset, dataUrl: 'data:image/png;base64,' + 'AAAA'.repeat(262_144) };
  const source = '| ![header](large.png) |\n|---|\n' + Array.from({ length: 500 }, (_, index) => `| row ${index} |`).join('\n');
  const document = parseSemanticDocument(source, { resolveImage: () => largeAsset });
  assert.equal(new Set(document.atoms.map(atom => atom.container)).size, 1);
  const cards = wholeCards(document);
  assert.equal(validateSemanticCoverage(document, cards).valid, true);
  const manifest = semanticManifest(document, cards);
  assert.doesNotMatch(JSON.stringify(manifest), /data:image/);
  document.atoms[0].container.header.tokens[3].children[0].attrSet('alt', 'modified');
  assert.throws(() => validateSemanticCoverage(document, cards), { code: 'PAGINATION_COVERAGE' });
});


test('explicit partition and non-rendered source budgets reject manifest amplification', () => {
  const definitions = Array.from({ length: 10_001 }, (_, index) => `[ref${index}]: https://example.test/${index}`).join('\n');
  assert.throws(() => parseSemanticDocument(definitions + '\n\nBody'), error => error.code === 'PAGINATION_BUDGET' && error.details.budget === 'reference-definitions' && error.details.limit === 10_000);
  const spacedDefinitions = Array.from({ length: 5001 }, (_, index) => `[ref${index}]: https://example.test/${index}`).join('\n\n');
  assert.throws(() => parseSemanticDocument(spacedDefinitions + '\n\nBody'), error => error.code === 'PAGINATION_BUDGET' && error.details.budget === 'source-records' && error.details.limit === 10_000);
  const sourceOnly = Array.from({ length: 201 }, (_, index) => `[ref${index}]: https://example.test/${index}`).join('\n===\n');
  assert.throws(() => parseSemanticDocument(sourceOnly), error => error.code === 'PAGINATION_BUDGET' && error.details.budget === 'partitions' && error.details.limit === 200 && error.details.actual === 201);
  assert.equal(renderCards(definitions + '\n\nBody')[0].html, '<p>Body</p>\n');
  const atLimit = Array.from({ length: 200 }, (_, index) => `[ref${index}]: https://example.test/${index}`).join('\n===\n');
  const document = parseSemanticDocument(atLimit);
  assert.equal(validateSemanticCoverage(document, wholeCards(document)).partitionCount, 200);
});
