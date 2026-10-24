import { createHash } from 'node:crypto';
import { Md2CardError } from './errors.mjs';
import {
  splitCards, parseCardMetadata, validateCardMetadata,
  parseMarkdownTokens, resolveMarkdownTokenImages, renderMarkdownTokens
} from './markdown.mjs';

export const MAX_SEMANTIC_ATOMS = 2000;
export const MAX_EXPLICIT_PARTITIONS = 200;
export const MAX_SOURCE_RECORDS = 10000;
export const AUTO_LAYOUTS = Object.freeze(['explainer', 'steps']);
const hash = source => createHash('sha256').update(source, 'utf8').digest('hex');
// Private parse-time witnesses cannot be rewritten through the public IR.
const integrityRecords = new WeakMap();
const coverageError = (message, details = {}) => new Md2CardError('PAGINATION_COVERAGE', message, details);

/** All offsets are UTF-16 code-unit boundaries, ranges are half-open, and lines
 * are 1-based and inclusive. A normalized boundary maps back to the original
 * input even after a leading BOM or CRLF has been removed. */
function normalizeWithMap(originalSource) {
  if (typeof originalSource !== 'string') throw new Md2CardError('INVALID_MARKDOWN', 'Markdown input must be a string.');
  const bom = originalSource.charCodeAt(0) === 0xfeff ? 1 : 0;
  const source = originalSource.slice(bom).replace(/\r\n?/g, '\n');
  const normalizedToOriginal = new Uint32Array(source.length + 1);
  const transformations = { bom, cr: 0, crlf: 0 };
  const lineStarts = [0];
  let original = bom;
  for (let normalized = 0; normalized < source.length; normalized++) {
    normalizedToOriginal[normalized] = original;
    if (originalSource[original] === '\r') {
      const crlf = originalSource[original + 1] === '\n';
      transformations[crlf ? 'crlf' : 'cr']++;
      original += crlf ? 2 : 1;
    } else original++;
    if (source[normalized] === '\n') lineStarts.push(normalized + 1);
  }
  normalizedToOriginal[source.length] = originalSource.length;
  const sourceMap = {
    offsetUnit: 'utf16', rangeConvention: 'half-open', lineBase: 1,
    originalLength: originalSource.length, normalizedLength: source.length,
    lineCount: lineStarts.length, lineStarts, transformations
  };
  // The dense lookup is internal working storage, not a JSON artifact. Exact
  // original mappings are exported on each atom, partition and accounting span.
  Object.defineProperty(sourceMap, 'normalizedToOriginal', { value: normalizedToOriginal });
  return { source, sourceMap };
}

function sourceMapManifest(sourceMap) {
  const { offsetUnit, rangeConvention, lineBase, originalLength, normalizedLength, lineCount, transformations } = sourceMap;
  return { offsetUnit, rangeConvention, lineBase, originalLength, normalizedLength, lineCount, transformations };
}

function documentFingerprint(document) {
  const map = document.sourceMap.normalizedToOriginal;
  const mappingHash = hash(new Uint8Array(map.buffer, map.byteOffset, map.byteLength));
  return hash(JSON.stringify({ source: document.source, originalSource: document.originalSource, sourceMap: document.sourceMap, mappingHash, references: document.references, sourceAccounting: document.sourceAccounting, nonRendered: document.nonRendered, separators: document.separators }));
}

function atomFingerprint(atom) {
  const { container, ...own } = atom;
  return hash(JSON.stringify({ ...own, ...(container ? { containerId: container.id } : {}) }));
}

function partitionFingerprint(partition) {
  return hash(JSON.stringify({
    ...partition,
    atoms: partition.atoms.map(atom => atom.id),
    groups: partition.groups.map(group => ({ id: group.id, atomIds: group.atomIds, atoms: group.atoms.map(atom => atom.id) }))
  }));
}

function validateAutoMetadata(value, index) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const fields = Object.keys(value).filter(key => key !== 'layout');
    if (fields.length) {
      throw new Md2CardError('PAGINATION_UNSUPPORTED_METADATA', `Partition ${index}: automatic pagination supports only layout metadata. Remove ${fields.join(', ')} or use manual pagination.`, { partitionIndex: index, fields });
    }
    if (typeof value.layout === 'string' && !AUTO_LAYOUTS.includes(value.layout)) {
      throw new Md2CardError('PAGINATION_UNSUPPORTED_LAYOUT', `Partition ${index}: automatic pagination supports explainer and steps, not "${value.layout}". Use manual pagination for this layout.`, { partitionIndex: index, layout: value.layout, supportedLayouts: AUTO_LAYOUTS });
    }
  }
  return validateCardMetadata(value, index);
}

function lineRange(document, first, end) {
  const starts = document.sourceMap.lineStarts;
  return [starts[first] ?? document.source.length, starts[end] ?? document.source.length];
}

function location(document, first, end) {
  const sourceRange = lineRange(document, first, end);
  return {
    sourceRange,
    sourceLines: [first + 1, Math.max(first + 1, end)],
    originalRange: sourceRange.map(offset => document.sourceMap.normalizedToOriginal[offset])
  };
}

function endOfBlock(tokens, start) {
  if (tokens[start].nesting !== 1) return start + 1;
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    depth += tokens[index].nesting;
    if (depth === 0) return index + 1;
  }
  throw new Md2CardError('PAGINATION_STRUCTURE', 'The Markdown parser produced an unbalanced block.');
}

function kindOf(tokens) {
  switch (tokens[0].type) {
    case 'heading_open': return 'heading';
    case 'blockquote_open': return 'quote';
    case 'fence': case 'code_block': return 'code';
    case 'hr': return 'rule';
    case 'paragraph_open': {
      const children = tokens.find(token => token.type === 'inline')?.children ?? [];
      const imageOnly = children.some(token => token.type === 'image') && children.every(token => ['image', 'link_open', 'link_close', 'softbreak', 'hardbreak'].includes(token.type) || token.type === 'text' && !token.content.trim());
      return imageOnly ? 'image' : 'paragraph';
    }
    default: return 'block';
  }
}

function makeAtom(document, partition, kind, tokens, map, extra = {}) {
  if (document.atoms.length >= MAX_SEMANTIC_ATOMS) {
    throw new Md2CardError('PAGINATION_BUDGET', `Automatic pagination is limited to ${MAX_SEMANTIC_ATOMS} semantic atoms. Split the document into smaller inputs.`, { budget: 'atoms', limit: MAX_SEMANTIC_ATOMS, actual: document.atoms.length + 1 });
  }
  const atom = {
    id: `p${partition.index}-a${partition.atoms.length + 1}`,
    partitionIndex: partition.index,
    kind,
    ...location(document, partition.startLine + map[0], partition.startLine + map[1]),
    tokens,
    ...extra
  };
  partition.atoms.push(atom);
  document.atoms.push(atom);
  return atom;
}

function atomize(document, partition, tokens) {
  let containerNumber = 0;
  for (let start = 0; start < tokens.length;) {
    const end = endOfBlock(tokens, start);
    const block = tokens.slice(start, end);
    const first = block[0];
    if (!first.map) throw new Md2CardError('PAGINATION_STRUCTURE', 'A Markdown block has no source location.', { partitionIndex: partition.index });
    if (first.type === 'bullet_list_open' || first.type === 'ordered_list_open') {
      const container = {
        id: `p${partition.index}-list${++containerNumber}`,
        kind: 'list', open: first, close: block.at(-1),
        ordered: first.type === 'ordered_list_open',
        start: Number(first.attrGet('start') ?? 1),
        ...location(document, partition.startLine + first.map[0], partition.startLine + first.map[1])
      };
      let itemIndex = 0;
      for (let itemStart = 1; itemStart < block.length - 1;) {
        const itemEnd = endOfBlock(block, itemStart);
        const item = block.slice(itemStart, itemEnd);
        if (item[0].type !== 'list_item_open') throw new Md2CardError('PAGINATION_STRUCTURE', 'A top-level list contains an unexpected block.');
        makeAtom(document, partition, 'list-item', item, item[0].map, { container, itemIndex, orderedStart: container.ordered ? container.start + itemIndex : undefined });
        itemIndex++;
        itemStart = itemEnd;
      }
    } else if (first.type === 'table_open') {
      const bodyStart = block.findIndex(token => token.type === 'tbody_open');
      if (bodyStart < 0) {
        makeAtom(document, partition, 'table', block, first.map);
      } else {
        const headerEndLine = block[bodyStart].map[0];
        const header = { ...location(document, partition.startLine + first.map[0], partition.startLine + headerEndLine), tokens: block.slice(1, bodyStart) };
        const container = {
          id: `p${partition.index}-table${++containerNumber}`, kind: 'table',
          open: first, close: block.at(-1), header,
          bodyOpen: block[bodyStart], bodyClose: block.at(-2)
        };
        partition.headers.push({ containerId: container.id, ...location(document, partition.startLine + first.map[0], partition.startLine + headerEndLine) });
        let rowIndex = 0;
        for (let rowStart = bodyStart + 1; rowStart < block.length - 2;) {
          const rowEnd = endOfBlock(block, rowStart);
          const row = block.slice(rowStart, rowEnd);
          if (row[0].type !== 'tr_open') throw new Md2CardError('PAGINATION_STRUCTURE', 'A table contains an unexpected body block.');
          makeAtom(document, partition, 'table-row', row, row[0].map, { container, rowIndex });
          rowIndex++;
          rowStart = rowEnd;
        }
      }
    } else {
      makeAtom(document, partition, kindOf(block), block, first.map);
    }
    start = end;
  }
  let pending = [];
  for (const atom of partition.atoms) {
    pending.push(atom);
    if (atom.kind === 'heading') continue;
    partition.groups.push({ id: `p${partition.index}-g${partition.groups.length + 1}`, atoms: pending, atomIds: pending.map(item => item.id) });
    pending = [];
  }
  if (pending.length) {
    throw new Md2CardError('PAGINATION_ORPHAN_HEADING', `Partition ${partition.index} ends with a heading without following content at line ${pending[0].sourceLines[0]}. Add a paragraph or other block after the heading.`, { partitionIndex: partition.index, sourceLines: [pending[0].sourceLines[0], pending.at(-1).sourceLines[1]], atomIds: pending.map(atom => atom.id) });
  }
}

function buildSourceAccounting(document) {
  const lines = document.source.split('\n');
  const roles = lines.map(line => ({ kind: /^[ \t]*$/.test(line) ? 'whitespace' : 'source-only' }));
  const mark = (entry, role) => {
    for (let line = entry.sourceLines[0] - 1; line < entry.sourceLines[1]; line++) roles[line] = role;
  };
  for (const partition of document.partitions) {
    for (const atom of partition.atoms) mark(atom, { kind: 'atom', atomId: atom.id, partitionIndex: partition.index });
    for (const header of partition.headers) mark(header, { kind: 'table-header', containerId: header.containerId, partitionIndex: partition.index });
    for (const definition of partition.referenceDefinitions) mark(definition, { kind: 'reference-definition', label: definition.label, partitionIndex: partition.index });
    if (partition.metadataLocation) mark(partition.metadataLocation, { kind: 'metadata', partitionIndex: partition.index });
  }
  for (const separator of document.separators) mark(separator, { kind: 'separator' });
  const accounting = [];
  for (let first = 0; first < roles.length;) {
    let end = first + 1;
    const key = JSON.stringify(roles[first]);
    while (end < roles.length && JSON.stringify(roles[end]) === key) end++;
    const span = location(document, first, end);
    if (span.sourceRange[0] < span.sourceRange[1]) {
      if (accounting.length >= MAX_SOURCE_RECORDS) throw new Md2CardError('PAGINATION_BUDGET', `Automatic pagination is limited to ${MAX_SOURCE_RECORDS} source-accounting records. Split the document into smaller inputs.`, { budget: 'source-records', limit: MAX_SOURCE_RECORDS, actual: accounting.length + 1 });
      accounting.push({ ...roles[first], ...span });
    }
    first = end;
  }
  const unexplained = accounting.find(entry => entry.kind === 'source-only');
  if (unexplained) throw new Md2CardError('PAGINATION_STRUCTURE', 'Nonblank source is not accounted for by a semantic block or reference definition.', { sourceLines: unexplained.sourceLines });
  document.sourceAccounting = accounting;
  document.nonRendered = accounting.filter(entry => entry.kind !== 'atom' && entry.kind !== 'table-header');
}

/** Parse once with globally shared references, then retain complete parser tokens.
 * Explicit === partitions are never merged by automatic pagination. */
export function parseSemanticDocument(markdown, { resolveImage } = {}) {
  const normalized = normalizeWithMap(markdown);
  const document = {
    schemaVersion: 1, source: normalized.source, originalSource: markdown,
    normalizedHash: hash(normalized.source), originalHash: hash(markdown),
    sourceMap: normalized.sourceMap, partitions: [], atoms: [], separators: [],
    references: Object.create(null)
  };
  const lines = document.source.split('\n');
  const split = splitCards(document.source);
  if (split.length > MAX_EXPLICIT_PARTITIONS) throw new Md2CardError('PAGINATION_BUDGET', `Automatic pagination is limited to ${MAX_EXPLICIT_PARTITIONS} explicit partitions. Split the document into smaller inputs.`, { budget: 'partitions', limit: MAX_EXPLICIT_PARTITIONS, actual: split.length });
  for (const [position, card] of split.entries()) {
    const index = position + 1;
    const startLine = card.sourceLines[0] - 1;
    const endLine = card.sourceLines[1];
    const partitionLines = lines.slice(startLine, endLine);
    const rawSource = partitionLines.join('\n');
    const { metadata, source } = parseCardMetadata(rawSource, index, { validateMetadata: validateAutoMetadata });
    const first = partitionLines.findIndex(line => !/^[ \t]*$/.test(line));
    const hasMetadata = first >= 0 && /^ {0,3}<!--\s*card\s*:/.test(partitionLines[first]);
    const partition = {
      index, startLine, endLine, source, metadata, ...location(document, startLine, endLine),
      atoms: [], groups: [], headers: [], referenceDefinitions: [],
      ...(hasMetadata ? { metadataLocation: location(document, startLine + first, startLine + first + 1) } : {})
    };
    if (hasMetadata) partitionLines[first] = '';
    // Preserve every line position while excluding first-line card metadata.
    partition.parseSource = partitionLines.join('\n');
    document.partitions.push(partition);
    if (position < split.length - 1) document.separators.push(location(document, endLine, endLine + 1));
  }
  // Match manual mode exactly: first valid definition wins across all partitions.
  const referenceDefinitionBudget = { count: 0, limit: MAX_SOURCE_RECORDS };
  for (const partition of document.partitions) parseMarkdownTokens(partition.parseSource, { references: document.references, referenceDefinitionBudget });
  const originalHtml = new Map();
  for (const partition of document.partitions) {
    const referenceDefinitions = [];
    const env = { references: document.references, referenceDefinitions, resolveImage, cardNumber: partition.index };
    const tokens = parseMarkdownTokens(partition.parseSource, env);
    resolveMarkdownTokenImages(tokens, env);
    originalHtml.set(partition.index, renderMarkdownTokens(tokens.map(cloneToken), env));
    partition.referenceDefinitions = referenceDefinitions.map(definition => ({ label: definition.label, ...location(document, partition.startLine + definition.sourceLines[0], partition.startLine + definition.sourceLines[1]) }));
    atomize(document, partition, tokens);
    delete partition.parseSource;
  }
  buildSourceAccounting(document);
  // Independent conservation witness: compare atom reconstruction with the full
  // original parser output, not with a second rendering of the same atom IR.
  for (const partition of document.partitions) {
    if (renderSemanticCard(document, partition, partition.atoms).html !== originalHtml.get(partition.index)) {
      throw new Md2CardError('PAGINATION_STRUCTURE', 'Semantic atomization changed the original Markdown rendering.', { partitionIndex: partition.index });
    }
  }
  integrityRecords.set(document, {
    originalHash: document.originalHash, normalizedHash: document.normalizedHash,
    atoms: document.atoms.map(atom => ({ atom, container: atom.container, fingerprint: atomFingerprint(atom) })),
    containers: [...new Set(document.atoms.map(atom => atom.container).filter(Boolean))].map(container => ({ container, fingerprint: hash(JSON.stringify(container)) })),
    documentFingerprint: documentFingerprint(document),
    partitions: document.partitions.map(partition => ({ partition, fingerprint: partitionFingerprint(partition), originalHtml: originalHtml.get(partition.index) }))
  });
  return document;
}

function cloneToken(token) {
  const copy = Object.assign(Object.create(Object.getPrototypeOf(token)), token);
  if (token.attrs) copy.attrs = token.attrs.map(attribute => [...attribute]);
  if (token.children) copy.children = token.children.map(cloneToken);
  if (token.map) copy.map = [...token.map];
  return copy;
}

function assertSelection(document, partition, atoms) {
  if (!document.partitions.includes(partition) || !Array.isArray(atoms) || (!atoms.length && partition.atoms.length)) {
    throw coverageError('A semantic card must contain atoms from one known partition.');
  }
  if (!atoms.length) return;
  const first = partition.atoms.indexOf(atoms[0]);
  if (first < 0 || atoms.some((atom, offset) => partition.atoms[first + offset] !== atom)) {
    throw coverageError('Semantic card atoms must be an unchanged contiguous slice of their original partition.', { partitionIndex: partition.index });
  }
}

/** Render original token slices. Lists keep loose/tight state and ordered starts;
 * table fragments reuse their original header tokens, never Markdown reparsing. */
export function renderSemanticCard(document, partition, atoms, index = 1) {
  assertSelection(document, partition, atoms);
  const tokens = [];
  const headers = [];
  for (let offset = 0; offset < atoms.length;) {
    const atom = atoms[offset];
    if (!atom.container) {
      tokens.push(...atom.tokens.map(cloneToken));
      offset++;
      continue;
    }
    const container = atom.container;
    let end = offset + 1;
    while (end < atoms.length && atoms[end].container === container) end++;
    const open = cloneToken(container.open);
    if (container.kind === 'list') {
      if (container.ordered) {
        const start = container.start + atom.itemIndex;
        if (start !== 1 || open.attrGet('start') !== null) open.attrSet('start', String(start));
      }
      tokens.push(open, ...atoms.slice(offset, end).flatMap(item => item.tokens.map(cloneToken)), cloneToken(container.close));
    } else {
      const header = container.header;
      headers.push({ containerId: container.id, sourceRange: [...header.sourceRange], sourceLines: [...header.sourceLines], originalRange: [...header.originalRange], repeated: atom.rowIndex > 0 });
      tokens.push(open, ...header.tokens.map(cloneToken), cloneToken(container.bodyOpen), ...atoms.slice(offset, end).flatMap(item => item.tokens.map(cloneToken)), cloneToken(container.bodyClose), cloneToken(container.close));
    }
    offset = end;
  }
  const sourceRange = atoms.length ? [atoms[0].sourceRange[0], atoms.at(-1).sourceRange[1]] : partition.sourceRange;
  // Include an original header preceding the first selected row, but never the
  // skipped body rows between a repeated header and a continuation fragment.
  const prefix = headers.filter(header => header.sourceRange[0] < sourceRange[0]).map(header => document.source.slice(...header.sourceRange)).join('');
  const provenance = {
    partitionIndex: partition.index,
    atomIds: atoms.map(atom => atom.id),
    sourceRanges: atoms.map(atom => [...atom.sourceRange]),
    headers,
    repeatedHeaders: headers.filter(header => header.repeated)
  };
  return {
    index,
    source: atoms.length ? prefix + document.source.slice(...sourceRange) : partition.source,
    sourceLines: atoms.length ? [atoms[0].sourceLines[0], atoms.at(-1).sourceLines[1]] : [...partition.sourceLines],
    metadata: partition.metadata,
    html: renderMarkdownTokens(tokens, { references: document.references, cardNumber: partition.index }),
    provenance
  };
}

/** Prove ordered exact-once atom coverage, locked partitions, heading groups,
 * source provenance and actual safe rendered output. Repeated headers are the
 * only repeated visual source and are explicitly attributed, not counted atoms. */
export function validateSemanticCoverage(document, cards) {
  if (!Array.isArray(cards)) throw coverageError('Semantic coverage requires an array of cards.');
  const record = integrityRecords.get(document);
  if (!record || record.originalHash !== document.originalHash || record.normalizedHash !== document.normalizedHash || record.documentFingerprint !== documentFingerprint(document) || record.atoms.length !== document.atoms.length || record.partitions.length !== document.partitions.length) {
    throw coverageError('The original parsed semantic document or its source accounting was modified.');
  }
  for (const [index, original] of record.atoms.entries()) {
    if (document.atoms[index] !== original.atom || original.atom.container !== original.container || atomFingerprint(original.atom) !== original.fingerprint) throw coverageError('An original semantic atom or its parser tokens were modified.', { atomIndex: index });
  }
  for (const original of record.containers) {
    if (hash(JSON.stringify(original.container)) !== original.fingerprint) throw coverageError('An original shared list or table container was modified.', { containerId: original.container.id });
  }
  for (const [index, original] of record.partitions.entries()) {
    const partition = document.partitions[index];
    if (partition !== original.partition || original.fingerprint !== partitionFingerprint(partition)) throw coverageError('An original explicit partition or heading group was modified.', { partitionIndex: index + 1 });
    if (renderSemanticCard(document, partition, partition.atoms).html !== original.originalHtml) throw coverageError('Semantic atoms no longer conserve the original full Markdown rendering.', { partitionIndex: partition.index });
  }
  const expected = document.atoms;
  const byId = new Map(expected.map(atom => [atom.id, atom]));
  const seen = new Map();
  let cursor = 0;
  let lastPartition = 0;
  const partitionCards = new Map();
  for (const [cardIndex, card] of cards.entries()) {
    if (card?.index !== cardIndex + 1) throw coverageError('Semantic card indexes must be consecutive and match their output order.', { cardIndex: cardIndex + 1, actualIndex: card?.index });
    const provenance = card?.provenance;
    const ids = provenance?.atomIds;
    const partition = document.partitions.find(item => item.index === provenance?.partitionIndex);
    if (!partition || !Array.isArray(ids) || (!ids.length && partition.atoms.length)) throw coverageError('A card has missing or invalid atom provenance.', { cardIndex: cardIndex + 1 });
    if (partition.index < lastPartition || partition.index > lastPartition + 1) throw coverageError('Explicit partitions were lost, reordered, or duplicated.', { cardIndex: cardIndex + 1, partitionIndex: partition.index });
    lastPartition = partition.index;
    const count = (partitionCards.get(partition.index) ?? 0) + 1;
    partitionCards.set(partition.index, count);
    if (!partition.atoms.length && count !== 1) throw coverageError('A source-only partition must appear exactly once.', { partitionIndex: partition.index });
    const atoms = ids.map(id => byId.get(id));
    for (const [offset, atom] of atoms.entries()) {
      if (!atom || atom !== expected[cursor] || atom.partitionIndex !== partition.index) {
        throw coverageError('Semantic atoms were lost, duplicated, reordered, or moved across an explicit partition.', { cardIndex: cardIndex + 1, atomIndex: cursor, expectedAtomId: expected[cursor]?.id ?? null, actualAtomId: ids[offset] });
      }
      seen.set(atom.id, cardIndex);
      cursor++;
    }
    const rendered = renderSemanticCard(document, partition, atoms, card.index);
    if (JSON.stringify(rendered.provenance) !== JSON.stringify(provenance) || rendered.html !== card.html || rendered.source !== card.source || JSON.stringify(rendered.sourceLines) !== JSON.stringify(card.sourceLines) || JSON.stringify(rendered.metadata) !== JSON.stringify(card.metadata)) {
      throw coverageError('A card no longer matches its original semantic tokens or source provenance.', { cardIndex: cardIndex + 1 });
    }
  }
  if (partitionCards.size !== document.partitions.length) throw coverageError('An explicit partition is missing from the final cards.', { expected: document.partitions.length, actual: partitionCards.size });
  if (cursor !== expected.length) throw coverageError('Semantic atoms are missing from the final cards.', { expected: expected.length, actual: cursor, nextAtomId: expected[cursor]?.id });
  for (const partition of document.partitions) {
    for (const group of partition.groups) {
      if (new Set(group.atomIds.map(id => seen.get(id))).size !== 1) throw coverageError('A heading group was split across cards.', { partitionIndex: partition.index, groupId: group.id });
    }
  }
  return { valid: true, scope: 'semantic-tokens-and-html', atomCount: expected.length, cardCount: cards.length, partitionCount: document.partitions.length };
}

function atomManifest(atom) {
  const { id, partitionIndex, kind, sourceRange, sourceLines, originalRange, itemIndex, orderedStart, rowIndex } = atom;
  return { id, partitionIndex, kind, sourceRange, sourceLines, originalRange, ...(atom.container ? { containerId: atom.container.id } : {}), ...(itemIndex !== undefined ? { itemIndex, ...(orderedStart !== undefined ? { orderedStart } : {}) } : {}), ...(rowIndex !== undefined ? { rowIndex } : {}) };
}

/** JSON-safe audit record; never serializes parser internals or embedded images. */
export function semanticManifest(document, cards) {
  const coverage = validateSemanticCoverage(document, cards);
  return {
    schemaVersion: 1,
    mode: 'auto',
    hashes: { algorithm: 'sha256', encoding: 'utf8', original: document.originalHash, normalized: document.normalizedHash },
    originalHash: document.originalHash,
    normalizedHash: document.normalizedHash,
    sourceMap: sourceMapManifest(document.sourceMap),
    sourceAccounting: document.sourceAccounting,
    nonRendered: document.nonRendered,
    separators: document.separators,
    partitions: document.partitions.map(partition => ({ index: partition.index, metadata: partition.metadata, sourceRange: partition.sourceRange, sourceLines: partition.sourceLines, originalRange: partition.originalRange, atomIds: partition.atoms.map(atom => atom.id), groups: partition.groups.map(group => ({ id: group.id, atomIds: group.atomIds })), referenceDefinitions: partition.referenceDefinitions })),
    atoms: document.atoms.map(atomManifest),
    cards: cards.map(card => ({ index: card.index, sourceLines: card.sourceLines, ...card.provenance })),
    coverage
  };
}
