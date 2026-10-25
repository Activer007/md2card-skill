import { Md2CardError } from './errors.mjs';

export const BODY_SIZES = Object.freeze({ small: 0.9, medium: 1, large: 1.15, xlarge: 1.3 });
const ALIASES = Object.freeze({ '小': 'small', '中': 'medium', '中等': 'medium', '大': 'large', '特大': 'xlarge' });

export function normalizeBodySize(value = 'medium', code = 'INVALID_OPTIONS') {
  if (typeof value === 'string' && Object.hasOwn(ALIASES, value)) return ALIASES[value];
  if (typeof value === 'string' && Object.hasOwn(BODY_SIZES, value)) return value;
  throw new Md2CardError(code, 'Body size must be small (小), medium (中), large (大), or xlarge (特大).');
}

const BLOCKS = new Set(['p', 'li', 'th', 'td', 'pre']);
const EXCLUDED = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figcaption']);
const VOID = new Set(['img', 'br', 'hr', 'wbr']);
const AUXILIARY = /\b(?:card-eyebrow|card-source|statistic-value|statistic-label)\b/;

/**
 * Input is repository-generated safe Markdown HTML, never arbitrary user HTML.
 * Scale text runs rather than container fonts: nested lists scale only once,
 * headings keep their original em sizing, and images keep their geometry.
 * Preserve entities, inline formatting and preformatted whitespace verbatim.
 */
export function sizeBodyText(html, size) {
  size = normalizeBodySize(size);
  if (size === 'medium') return html;
  const stack = [];
  return html.split(/(<(?:[^>"']|"[^"]*"|'[^']*')*>)/g).map(part => {
    if (part.startsWith('<')) {
      const tag = part.match(/^<(\/)?([a-z][a-z0-9-]*)\b/i);
      if (!tag) return part;
      const name = tag[2].toLowerCase();
      if (tag[1]) {
        if (stack.at(-1)?.name === name) stack.pop();
      } else if (!VOID.has(name) && !part.endsWith('/>')) {
        const classes = part.match(/\bclass="([^"]*)"/)?.[1] ?? '';
        stack.push({ name, body: BLOCKS.has(name), excluded: EXCLUDED.has(name) || AUXILIARY.test(classes) });
      }
      return part;
    }
    return part.trim() && stack.some(item => item.body) && !stack.some(item => item.excluded)
      ? `<span class="body-text-size">${part}</span>` : part;
  }).join('');
}

export function bodySizeCss() {
  return Object.entries(BODY_SIZES).filter(([size]) => size !== 'medium').map(([size, scale]) =>
    `.card[data-body-size="${size}"] .body-text-size { font-size: ${scale}em; line-height: inherit; }\n` +
    `.card[data-body-size="${size}"] .card-content li::marker { font-size: ${scale}em; }`
  ).join('\n');
}
