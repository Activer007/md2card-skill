import { escapeHtml, LAYOUTS } from './markdown.mjs';

export const THEMES = ['editorial', 'minimal', 'midnight', 'notebook', 'bold'];
export { LAYOUTS };
export const SIZES = {
  portrait: { width: 1080, height: 1440 },
  square: { width: 1080, height: 1080 },
  slide: { width: 1600, height: 900 }
};

const TEXT_FIELDS = ['eyebrow', 'alt', 'caption', 'source', 'metric', 'label'];
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function plainText(value, name) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(`${name} must be plain text.`);
  return escapeHtml(value);
}

/** Accept only embedded raster assets already verified by the local asset resolver. */
function imageTag(asset, alt, className) {
  if (!asset) return '';
  if (!IMAGE_MIMES.has(asset.mime) || typeof asset.dataUrl !== 'string' ||
      !asset.dataUrl.startsWith(`data:${asset.mime};base64,`) ||
      !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.dataUrl)) {
    throw new Error('Images must be resolver-validated, embedded PNG, JPEG, or WebP assets.');
  }
  if (![asset.width, asset.height].every(value => Number.isInteger(value) && value > 0 && value <= 16384)) {
    throw new Error('Embedded images must have valid pixel dimensions.');
  }
  return `<img class="${className}" src="${asset.dataUrl}" width="${asset.width}" height="${asset.height}" alt="${alt}" decoding="sync">`;
}

function figure(card, metadata, hero = false) {
  if (!card.image) return '';
  const image = imageTag(card.image, metadata.alt || metadata.caption, 'card-image');
  return `<figure class="card-figure${hero ? ' card-figure-hero' : ' card-figure-inline'}"><div class="image-frame">${image}</div>${metadata.caption ? `<figcaption>${metadata.caption}</figcaption>` : ''}</figure>`;
}

function sectionedBody(card, layout) {
  if (!Array.isArray(card.sections) || card.sections.length === 0) return `<div class="card-body">${card.html}</div>`;
  const intro = card.introHtml ? `<div class="card-intro">${card.introHtml}</div>` : '';
  if (layout === 'comparison') {
    const panels = card.sections.slice(0, 2).map((section, index) => `<section class="comparison-panel comparison-panel-${index + 1}">${section.html}</section>`).join('\n');
    const notes = card.sections.slice(2).map(section => `<section class="comparison-note">${section.html}</section>`).join('\n');
    return `${intro}<div class="comparison-grid">${panels}</div>${notes ? `<div class="comparison-notes">${notes}</div>` : ''}`;
  }
  return `${intro}<div class="case-study-stages">${card.sections.map((section, index) => `<section class="case-stage case-stage-${index + 1}">${section.html}</section>`).join('\n')}</div>`;
}

function cardContent(card, layout) {
  const metadata = Object.fromEntries(TEXT_FIELDS.map(name => [name, plainText(card.metadata?.[name], `Card ${name}`)]));
  const eyebrow = metadata.eyebrow ? `<p class="card-eyebrow">${metadata.eyebrow}</p>` : '';
  const source = metadata.source ? `<p class="card-source">${metadata.source}</p>` : '';
  let body;
  if (layout === 'comparison' || layout === 'case-study') {
    body = sectionedBody(card, layout);
  } else if (layout === 'statistic') {
    const statistic = metadata.metric || metadata.label ? `<div class="statistic-block">${metadata.metric ? `<p class="statistic-value">${metadata.metric}</p>` : ''}${metadata.label ? `<p class="statistic-label">${metadata.label}</p>` : ''}</div>` : '';
    body = `${statistic}<div class="card-body">${card.html}</div>`;
  } else {
    body = `<div class="card-body">${card.html}</div>`;
  }
  return `${eyebrow}${layout === 'image-caption' ? figure(card, metadata, true) : ''}${body}${layout !== 'image-caption' ? figure(card, metadata) : ''}${source}`;
}

function footerHtml(options, index, count) {
  const brandName = plainText(options.brand?.name, 'Brand name');
  const footer = plainText(options.footer, 'Footer');
  const logo = imageTag(options.brand?.logo, brandName ? '' : 'Brand logo', 'brand-logo');
  return `<footer class="card-footer"><div class="footer-identity">${logo}<div class="footer-meta">${brandName ? `<span class="brand-name">${brandName}</span>` : ''}${footer ? `<span class="footer-text">${footer}</span>` : ''}</div></div><span class="card-index">${index} / ${count}</span></footer>`;
}

/**
 * card.html / introHtml / sections[].html must come from the safe Markdown parser.
 * Metadata is plain text; image and logo objects must come from the asset resolver.
 * themeCss and layoutCss are trusted repository CSS, never user-supplied styles.
 */
export function buildDocument(cards, options, themeCss, layoutCss = '') {
  const { width, height, theme = 'editorial' } = options;
  if (![width, height].every(value => Number.isInteger(value) && value >= 200 && value <= 4096)) {
    throw new Error('Card dimensions must be integers from 200 to 4096 pixels.');
  }
  if (!THEMES.includes(theme)) throw new Error(`Unknown theme "${theme}".`);
  const accent = options.brand?.accent;
  if (accent !== undefined && (typeof accent !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(accent))) {
    throw new Error('Brand accent must be a hex color such as #126d64 or #0af.');
  }
  const preview = options.preview === true;
  const body = cards.map((card, position) => {
    const index = position + 1;
    const layout = card.metadata?.layout ?? 'explainer';
    if (!LAYOUTS.includes(layout)) throw new Error(`Card ${index} has unknown layout "${layout}".`);
    const article = `<article class="card theme-${theme} layout-${layout}" data-layout="${layout}" aria-label="Card ${index} of ${cards.length}">
    <div class="card-content">${cardContent(card, layout)}</div>
    ${footerHtml(options, index, cards.length)}
  </article>`;
    return preview ? `<section class="preview-item" aria-label="Preview card ${index}"><div class="preview-canvas">${article}</div><p class="preview-caption">${index} / ${cards.length} · ${layout} · ${width} × ${height}</p></section>` : article;
  }).join('\n');
  return `<!doctype html>
<html lang="${plainText(options.lang ?? 'zh-CN', 'Language')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; script-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${plainText(options.title ?? 'Knowledge cards', 'Title')}</title>
<style>
:root { --card-width: ${width}px; --card-height: ${height}px;${accent ? ` --brand-accent: ${accent};` : ''} }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: #e5e7eb; }
.deck { display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 32px; width: max-content; min-width: 100%; }
.card { flex: none; }
${layoutCss}
${themeCss}
${preview ? `
/* Preview transforms only the display; every .card retains its export canvas. */
.deck-preview { width: 100%; min-width: 0; padding: 24px; gap: 24px; }
.preview-item { width: min(100%, ${width}px); min-width: 0; container-type: inline-size; }
.preview-canvas { position: relative; width: 100%; aspect-ratio: ${width} / ${height}; }
.preview-canvas > .card { position: absolute; top: 0; left: 0; transform-origin: top left; transform: scale(calc(100cqw / ${width}px)); }
.preview-caption { margin: 10px 0 0; color: #475569; text-align: center; font: 12px/1.5 system-ui, sans-serif; }
@media (max-width: 480px) { .deck-preview { padding: 12px; gap: 20px; } }
` : ''}
@page { size: ${width}px ${height}px; margin: 0; }
@media print {
  html, body { width: ${width}px; margin: 0 !important; padding: 0 !important; background: transparent; }
  .deck { display: block; width: ${width}px; min-width: 0; margin: 0; padding: 0; }
  .card { margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; break-after: page; break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .deck > .card:last-child { break-after: auto; }
  .preview-item, .preview-canvas { width: ${width}px; height: ${height}px; container-type: normal; }
  .preview-item { break-after: page; break-inside: avoid; }
  .preview-item:last-child { break-after: auto; }
  .preview-canvas > .card { position: relative; transform: none; break-after: auto; }
  .preview-caption { display: none; }
}
</style>
</head>
<body><main class="deck${preview ? ' deck-preview' : ''}">
${body}
</main></body>
</html>\n`;
}

/** Responsive, script-free reading preview; never use it for overflow measurements. */
export function buildPreviewDocument(cards, options, themeCss, layoutCss = '') {
  return buildDocument(cards, { ...options, preview: true }, themeCss, layoutCss);
}
