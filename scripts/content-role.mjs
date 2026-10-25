import { parseMarkdownTokens, validateCardMetadata } from './markdown.mjs';
import { Md2CardError } from './errors.mjs';

export const CONTENT_ROLES = Object.freeze([
  'cover-intro', 'concept-explain', 'steps', 'comparison', 'quote-evidence',
  'metric', 'screenshot-evidence', 'photo-story', 'source-note', 'unknown'
]);
const layoutRoles = Object.freeze({ cover: 'cover-intro', explainer: 'concept-explain',
  steps: 'steps', comparison: 'comparison', quote: 'quote-evidence', 'case-study': 'concept-explain' });
const length = text => [...text].length;
const inlineText = tokens => tokens.map(t => t.type === 'image' ? '' : t.children ? inlineText(t.children)
  : ['text', 'code_inline'].includes(t.type) ? t.content : ['hardbreak', 'softbreak'].includes(t.type) ? '\n' : '').join('');
const imageDescriptions = tokens => tokens.flatMap(t => t.type === 'image'
  ? [inlineText(t.children ?? []) || t.content] : t.children ? imageDescriptions(t.children) : []);

/** Boundary: cards are the unchanged result of renderCards with a trusted local
 * asset resolver. This API is not an alternative parser or an image validator.
 * Reusing the shared token parser preserves reference definitions across cards;
 * it only creates local tokens and never mutates the supplied parse result. */
export function summarizeContentRoles(cards) {
  if (!Array.isArray(cards) || !cards.length) throw new Md2CardError('INVALID_RECOMMENDATION_INPUT', 'Expected nonempty parsed cards.');
  const references = Object.create(null);
  for (const card of cards) {
    if (!card || typeof card.source !== 'string' || typeof card.html !== 'string'
      || !Number.isSafeInteger(card.index) || card.index < 1 || !Array.isArray(card.sections)
      || !Array.isArray(card.orderedLists) || !Array.isArray(card.sourceLines)) {
      throw new Md2CardError('INVALID_RECOMMENDATION_INPUT', 'Use the existing renderCards parse result, not a hand-written summary.');
    }
    validateCardMetadata(card.metadata, card.index);
    if (card.metadata.image && !card.image) throw new Md2CardError('INVALID_ASSET', 'Recommendation requires the existing resolver-validated metadata image.');
    parseMarkdownTokens(card.source, { references });
  }
  return cards.map(card => {
    const tokens = parseMarkdownTokens(card.source, { references });
    const headings = tokens.flatMap((t, i) => t.type === 'heading_open' && t.level === 0
      ? [{ level: Number(t.tag.slice(1)), text: inlineText(tokens[i + 1]?.children ?? []), bodyLines: t.map ? [t.map[0] + 1, t.map[1]] : null }] : []);
    const codes = tokens.filter(t => ['fence', 'code_block'].includes(t.type));
    const codeLines = codes.flatMap(t => t.content.replace(/\n$/, '').split('\n'));
    let rowColumns = 0, rowText = '', tableColumns = 0, maxTableRowCharacters = 0;
    for (const token of tokens) {
      if (token.type === 'tr_open') { rowColumns = 0; rowText = ''; }
      if (['td_open', 'th_open'].includes(token.type)) rowColumns++;
      if (token.type === 'inline' && rowColumns) rowText += inlineText(token.children ?? []);
      if (token.type === 'tr_close') { tableColumns = Math.max(tableColumns, rowColumns); maxTableRowCharacters = Math.max(maxTableRowCharacters, length(rowText)); rowColumns = 0; }
    }
    const text = tokens.filter(t => t.type === 'inline').map(t => inlineText(t.children ?? [])).join('\n');
    const explicitKeys = [...(card.metadataExplicitKeys ?? [])];
    const features = {
      characters: length((text + codeLines.join('\n')).replace(/\s/gu, '')),
      h1Count: headings.filter(h => h.level === 1).length,
      h2Count: card.sections.length,
      paragraphCount: tokens.filter(t => t.type === 'paragraph_open').length,
      orderedItems: card.orderedLists.reduce((n, list) => n + list.count, 0),
      bulletLists: tokens.filter(t => t.type === 'bullet_list_open').length,
      quoteBlocks: tokens.filter(t => t.type === 'blockquote_open').length,
      inlineImages: (card.html.match(/<img\b/g) ?? []).length,
      metadataImage: Boolean(card.image),
      codeBlocks: codes.length, codeLines: codeLines.length,
      maxCodeLineCharacters: codeLines.reduce((maximum, line) => Math.max(maximum, length(line)), 0),
      tableCount: tokens.filter(t => t.type === 'table_open').length, tableColumns, maxTableRowCharacters,
      hasMetric: Boolean(card.metadata.metric?.trim()), hasLabel: Boolean(card.metadata.label?.trim()),
      hasSource: Boolean(card.metadata.source?.trim())
    };
    const evidence = [], caveats = [];
    const imagePresent = features.metadataImage || features.inlineImages > 0;
    const imageDescription = [card.metadata.alt, card.metadata.caption, ...imageDescriptions(tokens)].filter(Boolean).join(' ');
    let role = 'unknown';
    if (features.hasMetric && features.hasLabel) { role = 'metric'; evidence.push('AUTHOR_METRIC_AND_LABEL'); }
    else if (imagePresent && /截图|界面|screenshot|user interface/i.test(imageDescription)) { role = 'screenshot-evidence'; evidence.push('VALIDATED_IMAGE_AND_AUTHOR_SCREENSHOT_DESCRIPTION'); }
    else if (imagePresent && /照片|摄影|影像|静物|photo(?:graph)?|still.life/i.test(imageDescription)) { role = 'photo-story'; evidence.push('VALIDATED_IMAGE_AND_AUTHOR_PHOTO_DESCRIPTION'); }
    else if (explicitKeys.includes('layout') && layoutRoles[card.metadata.layout]) { role = layoutRoles[card.metadata.layout]; evidence.push('AUTHOR_LAYOUT'); }
    else if (features.quoteBlocks) { role = 'quote-evidence'; evidence.push('QUOTE_BLOCKS'); }
    else if (features.orderedItems || features.bulletLists) { role = 'steps'; evidence.push('LIST_BLOCKS'); }
    else if (explicitKeys.includes('template') && layoutRoles[card.metadata.layout]) { role = layoutRoles[card.metadata.layout]; evidence.push('AUTHOR_TEMPLATE_LAYOUT'); }
    else if (features.h2Count || features.codeBlocks || features.tableCount) { role = 'concept-explain'; evidence.push('EXPLANATORY_BLOCKS'); }
    else if (!features.h1Count && features.hasSource) { role = 'source-note'; evidence.push('AUTHOR_SOURCE_WITHOUT_TITLE'); }
    else evidence.push('INSUFFICIENT_ROLE_EVIDENCE');
    if (imagePresent) caveats.push('IMAGE_SEMANTICS_NOT_VERIFIED');
    if (role === 'screenshot-evidence') caveats.push('SCREENSHOT_TEXT_REQUIRES_VISUAL_REVIEW');
    if (imagePresent && !['screenshot-evidence', 'photo-story'].includes(role)) caveats.push('IMAGE_ROLE_UNKNOWN');
    if (features.codeLines > 6 || features.maxCodeLineCharacters > 80) caveats.push('LONG_CODE');
    if (features.tableColumns > 4 || features.maxTableRowCharacters > 80) caveats.push('WIDE_TABLE');
    if (role === 'unknown') caveats.push('UNKNOWN_ROLE');
    if (features.hasMetric !== features.hasLabel) caveats.push('INCOMPLETE_METRIC_METADATA');
    caveats.push(features.hasSource ? 'SOURCE_NOT_FACT_CHECKED' : 'SOURCE_NOT_PROVIDED');
    return { index: card.index, sourceLines: [...card.sourceLines], role, reasonIds: evidence,
      authorMetadataKeys: explicitKeys, headings, features, caveats };
  });
}
