import MarkdownIt from 'markdown-it';
import { Md2CardError } from './errors.mjs';

const parser = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
// Keep source-only definitions available to semantic provenance before markdown-it
// removes their hidden tokens. Manual rendering is unchanged when no collector is set.
parser.core.ruler.before('strip_references', 'collect_reference_definitions', state => {
  const collector = state.env.referenceDefinitions;
  const budget = state.env.referenceDefinitionBudget;
  if (!Array.isArray(collector) && !budget) return;
  for (const token of state.tokens) {
    if (token.type === 'reference_definition') {
      if (budget) {
        if (budget.count >= budget.limit) throw new Md2CardError('PAGINATION_BUDGET', `Automatic pagination is limited to ${budget.limit} reference definitions. Split the document into smaller inputs.`, { budget: 'reference-definitions', limit: budget.limit, actual: budget.count + 1 });
        budget.count++;
      }
      if (Array.isArray(collector)) collector.push({ sourceLines: [...token.map], label: token.meta.label });
    }
  }
});

const originalLinkOpen = parser.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));
parser.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return originalLinkOpen(tokens, index, options, env, self);
};

export const LAYOUTS = Object.freeze(['cover', 'explainer', 'comparison', 'steps', 'image-caption', 'statistic', 'case-study', 'quote']);
const METADATA_KEYS = new Set(['layout', 'eyebrow', 'image', 'alt', 'caption', 'source', 'metric', 'label']);

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function normalizeSource(markdown) {
  if (typeof markdown !== 'string') throw new Md2CardError('INVALID_MARKDOWN', 'Markdown input must be a string.');
  return markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

// Remove blank lines, not whitespace on meaningful lines (notably indented code).
function trimBlankLines(lines) {
  let first = 0;
  let last = lines.length;
  while (first < last && /^[ \t]*$/.test(lines[first])) first++;
  while (last > first && /^[ \t]*$/.test(lines[last - 1])) last--;
  return lines.slice(first, last).join('\n');
}

/** Explicit page boundaries, never inside fenced or indented code. */
export function splitCards(markdown) {
  const normalized = normalizeSource(markdown);
  const lines = normalized.split('\n');
  const protectedLines = new Set();
  for (const token of parser.parse(normalized, { references: Object.create(null) })) {
    if ((token.type === 'fence' || token.type === 'code_block') && token.map) {
      for (let line = token.map[0]; line < token.map[1]; line++) protectedLines.add(line);
    }
  }
  const cards = [];
  let start = 0;
  const append = end => {
    const source = trimBlankLines(lines.slice(start, end));
    if (!source) throw new Md2CardError('INVALID_MARKDOWN', `Empty card near source line ${start + 1}. Remove a leading, trailing, or repeated === separator.`, { sourceLine: start + 1 });
    cards.push({ source, sourceLines: [start + 1, Math.max(start + 1, end)] });
  };
  lines.forEach((line, index) => {
    if (/^ {0,3}===[ \t]*$/.test(line) && !protectedLines.has(index)) {
      append(index);
      start = index + 1;
    }
  });
  append(lines.length);
  return cards;
}

export function validateCardMetadata(value, cardNumber = 1) {
  const fail = detail => { throw new Md2CardError('INVALID_METADATA', `Card ${cardNumber} metadata: ${detail}`, { cardNumber }); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected a JSON object.');
  for (const [key, item] of Object.entries(value)) {
    if (!METADATA_KEYS.has(key)) fail(`unknown key "${key}". Allowed keys: ${[...METADATA_KEYS].join(', ')}.`);
    if (typeof item !== 'string') fail(`"${key}" must be a plain string.`);
    if (/[\u0000-\u001f\u007f]/.test(item)) fail(`"${key}" must be a single-line plain string without control characters.`);
  }
  const metadata = { layout: 'explainer', ...value };
  if (!LAYOUTS.includes(metadata.layout)) fail(`unknown layout "${metadata.layout}". Choose ${LAYOUTS.join(', ')}.`);
  if ('image' in metadata && !metadata.image.trim()) fail('"image" must be a nonempty local asset reference.');
  return Object.freeze(metadata);
}

/** Metadata is recognized only on the first nonblank, non-code line of a card. */
export function parseCardMetadata(source, cardNumber = 1, { validateMetadata = validateCardMetadata } = {}) {
  const lines = normalizeSource(source).split('\n');
  const first = lines.findIndex(line => !/^[ \t]*$/.test(line));
  if (first < 0 || !/^ {0,3}<!--\s*card\s*:/.test(lines[first])) {
    return { source, metadata: validateMetadata({}, cardNumber) };
  }
  const match = lines[first].match(/^ {0,3}<!--\s*card\s*:\s*(.*?)\s*-->[ \t]*$/);
  if (!match) throw new Md2CardError('INVALID_METADATA', `Card ${cardNumber} metadata must be one line: <!-- card: {"layout":"explainer"} -->`, { cardNumber });
  let value;
  try { value = JSON.parse(match[1]); } catch {
    throw new Md2CardError('INVALID_METADATA', `Card ${cardNumber} metadata contains invalid JSON. Use a JSON object with double-quoted keys and strings.`, { cardNumber });
  }
  const metadata = validateMetadata(value, cardNumber);
  lines.splice(first, 1);
  return { source: trimBlankLines(lines), metadata };
}

function resolveCardImage(reference, resolveImage, cardNumber) {
  if (typeof resolveImage !== 'function') {
    throw new Md2CardError('INVALID_ASSET', `Card ${cardNumber} contains a Markdown image or image metadata. Pass --asset-root with a trusted local PNG, JPEG, or WebP asset directory. No image is fetched.`, { cardNumber });
  }
  let result;
  try { result = resolveImage(reference); } catch (error) {
    throw new Md2CardError(error.code ?? 'INVALID_ASSET', `Card ${cardNumber} image: ${error.message}`, { ...error.details, cardNumber }, error.exitCode ?? 1, { cause: error });
  }
  if (!result || typeof result.dataUrl !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(result.dataUrl)) {
    throw new Md2CardError('INVALID_ASSET', `Card ${cardNumber} image resolver must synchronously return a trusted PNG, JPEG, or WebP data URL.`, { cardNumber });
  }
  return result;
}

function resolveTokenImages(tokens, env) {
  for (const token of tokens) {
    if (token.type === 'image') {
      const asset = resolveCardImage(token.attrGet('src'), env.resolveImage, env.cardNumber);
      token.attrSet('src', asset.dataUrl);
      token.attrSet('class', 'markdown-image');
      for (const dimension of ['width', 'height']) {
        if (Number.isSafeInteger(asset[dimension]) && asset[dimension] > 0) token.attrSet(dimension, String(asset[dimension]));
      }
    }
    if (token.children) resolveTokenImages(token.children, env);
  }
}

function sectionHtml(tokens, env) {
  const starts = [];
  tokens.forEach((token, index) => {
    if (token.type === 'heading_open' && token.tag === 'h2' && token.level === 0) starts.push(index);
  });
  const render = selected => parser.renderer.render(selected, parser.options, env);
  return {
    introHtml: render(tokens.slice(0, starts[0] ?? tokens.length)),
    sections: starts.map((start, index) => ({
      heading: parser.renderer.renderInlineAsText(tokens[start + 1]?.children ?? [], parser.options, env),
      html: render(tokens.slice(start, starts[index + 1] ?? tokens.length))
    }))
  };
}

/** Synchronous rendering; resolveImage must be a synchronous trusted local resolver. */
export function renderCards(markdown, { resolveImage } = {}) {
  const cards = splitCards(markdown).map((card, index) => ({ ...card, ...parseCardMetadata(card.source, index + 1), index: index + 1 }));
  // Collect definitions from every card first. Shared null-prototype references retain
  // Markdown's first-definition-wins rule without prototype-label collisions.
  const references = Object.create(null);
  for (const card of cards) parser.parse(card.source, { references });
  return cards.map(card => {
    const env = { references, resolveImage, cardNumber: card.index };
    const tokens = parser.parse(card.source, env);
    resolveTokenImages(tokens, env);
    const image = card.metadata.image ? resolveCardImage(card.metadata.image, resolveImage, card.index) : undefined;
    return { ...card, ...(image ? { image } : {}), html: parser.renderer.render(tokens, parser.options, env), ...sectionHtml(tokens, env) };
  });
}

// Narrow shared-parser interface: semantic pagination must render these tokens,
// not reparse slices that lose list looseness, references, or table structure.
export function parseMarkdownTokens(source, env = {}) {
  return parser.parse(source, env);
}

export function resolveMarkdownTokenImages(tokens, env) {
  resolveTokenImages(tokens, env);
}

export function renderMarkdownTokens(tokens, env = {}) {
  return parser.renderer.render(tokens, parser.options, env);
}
