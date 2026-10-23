import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
const originalLinkOpen = parser.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));
parser.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return originalLinkOpen(tokens, index, options, env, self);
};

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

/** Explicit page boundaries, never inside fenced or indented code. */
export function splitCards(markdown) {
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const protectedLines = new Set();
  for (const token of parser.parse(normalized, {})) {
    if ((token.type === 'fence' || token.type === 'code_block') && token.map) {
      for (let line = token.map[0]; line < token.map[1]; line++) protectedLines.add(line);
    }
  }
  const cards = [];
  let start = 0;
  const append = end => {
    const source = lines.slice(start, end).join('\n').trim();
    if (!source) throw new Error(`Empty card near source line ${start + 1}. Remove a leading, trailing, or repeated === separator.`);
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

function rejectImages(tokens, cardNumber) {
  for (const token of tokens) {
    if (token.type === 'image') {
      throw new Error(`Card ${cardNumber} contains a Markdown image. Images are not supported in v1; remove it or replace it with a text description. No local or remote image is loaded.`);
    }
    if (token.children) rejectImages(token.children, cardNumber);
  }
}

export function renderCards(markdown) {
  return splitCards(markdown).map((card, index) => {
    const env = {};
    const tokens = parser.parse(card.source, env);
    rejectImages(tokens, index + 1);
    return { ...card, html: parser.renderer.render(tokens, parser.options, env), index: index + 1 };
  });
}
