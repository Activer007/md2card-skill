import { normalizeBodySize, sizeBodyText, bodySizeCss } from './body-size.mjs';
import { escapeHtml, LAYOUTS } from './markdown.mjs';
import { validateTemplateMetadata, validateTemplateCard, resolveTemplateAspect } from './templates.mjs';

export const THEMES = ['editorial', 'minimal', 'midnight', 'notebook', 'bold'];
export const FOOTER_MODES = Object.freeze(['legacy', 'poster', 'series', 'report']);
export { LAYOUTS };
export const SIZES = {
  portrait: { width: 1080, height: 1440 },
  square: { width: 1080, height: 1080 },
  slide: { width: 1600, height: 900 },
  'wechat-wide': { width: 2100, height: 900 }
};

const TEXT_FIELDS = ['eyebrow', 'alt', 'caption', 'source', 'metric', 'label'];
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

// Opaque sRGB only, matching the public brand contract. Do not round a ratio
// before comparing it with 4.5. This is a solid-background rule, not photo QA.
export function textContrastRatio(first, second) {
  const luminance = color => {
    if (typeof color !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) throw new Error('Contrast colors must be opaque #RGB or #RRGGBB.');
    const hex = color.length === 4 ? [...color.slice(1)].map(c => c + c).join('') : color.slice(1);
    const linear = [0, 2, 4].map(offset => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

export function t37DefaultTextPolicy(accent, templateCss) {
  if (accent === undefined || !templateCss) return null;
  // Read the existing trusted template tokens, not a second color registry or
  // arbitrary user CSS. T37's plain text surfaces are paper and quote/code panel.
  const rule = /\.card\.template-T37\s*\{([^}]+)\}/.exec(templateCss)?.[1];
  if (!rule) throw new Error('T37 contrast policy requires its template token rule.');
  const token = name => {
    const value = new RegExp(`--${name}\\s*:\\s*(#[a-f\\d]{3}(?:[a-f\\d]{3})?)\\s*;`, 'i').exec(rule)?.[1];
    if (!value) throw new Error(`T37 contrast policy requires an opaque ${name} token.`);
    return value;
  };
  const backgrounds = [token('paper'), token('panel')], ink = token('ink');
  const minimum = color => Math.min(...backgrounds.map(background => textContrastRatio(color, background)));
  const before = minimum(accent);
  if (before >= 4.5) return null;
  // Preserve the existing foreground language first. Black/white is only a
  // deterministic fallback if a future trusted palette's ink itself is unsafe.
  const foreground = [ink, '#000000', '#ffffff'].find(color => minimum(color) >= 4.5);
  if (!foreground) throw new Error('T37 text surfaces need a jointly readable foreground.');
  return { accent, foreground, backgrounds, minimumBefore: before, minimumAfter: minimum(foreground), target: 4.5 };
}

function t37DefaultTextCss(policy) {
  const selector = '.card.template-T37:not([data-visual-variant="photo-cover"])';
  return `\n/* T37 default: readable text only; authored brand decoration is unchanged. */\n${selector} :is(.card-eyebrow,strong,a) { color: ${policy.foreground}; }\n${selector} li::marker { color: ${policy.foreground}; }\n`;
}

// M4: three exact combinations only. Emitted conditionally so old documents
// retain their stylesheet bytes. These are fixed design scales, never fit-to-text.
const WECHAT_COVER_CSS = `
/* M4 independently composed cover canvases; fixed typography, no automatic fitting. */
.card.template-T01.template-aspect-square { --section-gap: .55em; border-top-width: calc(var(--card-height) * .014); }
.card.template-T01.template-aspect-square .card-content { display: flex; flex-direction: column; gap: .5em; }
.card.template-T01.template-aspect-square .template-heading { padding: .15em 0 .45em; border-bottom: .075em solid var(--ink); }
.card.template-T01.template-aspect-square h1 { font-size: 2.35em; line-height: 1.14; letter-spacing: -.035em; }
.card.template-T01.template-aspect-square .template-main { display: flex; flex-direction: column; gap: .6em; padding-top: 0; }
.card.template-T01.template-aspect-square .template-intro { padding: 0; font-family: var(--font-display); }
.card.template-T01.template-aspect-square .template-intro > p:first-child::first-letter { float: none; margin: 0; font: inherit; color: inherit; }
.card.template-T01.template-aspect-square .template-sections { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: .65em; border-left: 0; padding-left: 0; margin: 0; }
.card.template-T01.template-aspect-square .template-section { padding: .4em 0 0; border-top: 1px solid var(--line); }
.card.template-T01.template-aspect-square .template-section h2 { font-size: 1em; }
.card.template-T01.template-aspect-square .card-source { margin-top: auto; }
.card.template-T01.template-aspect-wechat-wide,
.card.template-T21.template-aspect-wechat-wide { --pad: calc(var(--card-height) * .07); --text-size: calc(var(--card-height) * .06); --note-size: calc(var(--card-height) * .0445); --section-gap: .45em; --paragraph-gap: .35em; }
.card.template-T01.template-aspect-wechat-wide { border-top-width: calc(var(--card-height) * .014); }
.card.template-T01.template-aspect-wechat-wide .card-content { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,.85fr); grid-template-rows: auto 1fr auto; gap: .45em 1em; }
.card.template-T01.template-aspect-wechat-wide .template-heading { grid-column: 1; grid-row: 1; padding: 0 0 .35em; border-bottom: .08em solid var(--ink); }
.card.template-T01.template-aspect-wechat-wide h1 { font-size: 2.6em; line-height: 1.14; letter-spacing: -.035em; }
.card.template-T01.template-aspect-wechat-wide .card-eyebrow { margin-bottom: .4em; }
.card.template-T01.template-aspect-wechat-wide .template-main { display: contents; }
.card.template-T01.template-aspect-wechat-wide .template-intro { grid-column: 1; grid-row: 2; padding-top: .1em; font-family: var(--font-display); }
.card.template-T01.template-aspect-wechat-wide .template-intro > p:first-child::first-letter { float: none; margin: 0; font: inherit; color: inherit; }
.card.template-T01.template-aspect-wechat-wide .template-sections { grid-column: 2; grid-row: 1 / 3; display: flex; flex-direction: column; gap: .6em; margin: 0; padding: .1em 0 0 .8em; border-left: .04em solid var(--accent); }
.card.template-T01.template-aspect-wechat-wide .template-section { padding-top: .15em; }
.card.template-T01.template-aspect-wechat-wide .template-section h2 { font-size: 1.1em; }
.card.template-T01.template-aspect-wechat-wide .card-source { grid-column: 1 / -1; grid-row: 3; }
.card.template-T21.template-aspect-wechat-wide { --pad: calc(var(--card-height) * .05); }
.card.template-T21.template-aspect-wechat-wide .card-content { display: grid; grid-template-columns: minmax(0,.72fr) minmax(0,1.28fr); grid-template-rows: auto 1fr auto; gap: .25em .8em; }
.card.template-T21.template-aspect-wechat-wide .template-heading { grid-column: 1 / -1; grid-row: 1; padding-top: .25em; border-top-width: .1em; }
.card.template-T21.template-aspect-wechat-wide h1 { font-size: 1.95em; line-height: 1.15; max-width: none; }
.card.template-T21.template-aspect-wechat-wide .card-eyebrow { margin-bottom: 0; }
.card.template-T21.template-aspect-wechat-wide .template-metric { grid-column: 1; grid-row: 2; padding: .25em .65em .3em 0; border: 0; }
.card.template-T21.template-aspect-wechat-wide .template-metric .statistic-value { font-size: 4.7em; line-height: 1; letter-spacing: -.045em; }
.card.template-T21.template-aspect-wechat-wide .template-metric .statistic-label { font-size: .9em; line-height: 1.4; margin-top: .3em; }
.card.template-T21.template-aspect-wechat-wide .template-main { grid-column: 2; grid-row: 2; display: flex; flex-direction: column; gap: .35em; padding: .25em 0 0 .65em; border-left: 1px solid var(--line); }
.card.template-T21.template-aspect-wechat-wide .template-sections { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: .65em; }
.card.template-T21.template-aspect-wechat-wide .template-section { padding-top: .3em; }
.card.template-T21.template-aspect-wechat-wide .template-section h2 { font-size: 1em; margin-bottom: .2em; }
.card.template-T21.template-aspect-wechat-wide .card-source { grid-column: 1 / -1; grid-row: 3; padding: .3em 0 0; border-top: 1px solid var(--line); background: transparent; }
.card.template-T01.template-aspect-wechat-wide .card-footer,
.card.template-T21.template-aspect-wechat-wide .card-footer { margin-top: .35em; padding-top: .3em; }
.card.template-T01.template-aspect-wechat-wide .footer-meta,
.card.template-T21.template-aspect-wechat-wide .footer-meta { flex-direction: row; flex-wrap: wrap; gap: .3em 1em; align-items: baseline; }
`;

// Opt-in CSS is emitted only for the validated variant. Legacy documents keep
// their exact bytes, including the stylesheet; no registry version is promoted.
const SCREENSHOT_STAGE_CSS = `
.card.template-T20[data-visual-variant="screenshot-stage"] .image-frame {
  background: #0e141c; outline: 1px solid var(--line);
}
.card.template-T20[data-visual-variant="screenshot-stage"] .card-image {
  width: 100%; height: auto; max-height: calc(var(--card-height) * .52);
  object-fit: contain; object-position: center;
}
`;

// Independent composition; never emitted for default cards. The backing covers
// only the supplied title, and foreground is explicit on every actual text node
// class/inline element so theme ink, links and brand accents cannot turn it black.
const PHOTO_COVER_CSS = `
.card.template-T37[data-visual-variant="photo-cover"] .card-content { grid-template-rows: auto minmax(min-content,1fr) auto; }
.card.template-T37[data-visual-variant="photo-cover"] .template-main { grid-row: 2; }
.card.template-T37[data-visual-variant="photo-cover"] .card-source { grid-row: 3; }
.card.template-T37[data-visual-variant="photo-cover"] .photo-stage { position: relative; height: calc(var(--card-height) * .56); }
.card.template-T37[data-visual-variant="photo-cover"] .card-image { display: block; width: 100%; height: 100%; max-height: none; object-fit: cover; object-position: var(--photo-x) var(--photo-y); }
.card.template-T37[data-visual-variant="photo-cover"] .photo-zone { position: absolute; width: 42%; height: 48%; margin: 0; display: flex; align-items: flex-start; }
.card.template-T37[data-visual-variant="photo-cover"] [data-text-zone^="top-"] { top: 2%; }
.card.template-T37[data-visual-variant="photo-cover"] [data-text-zone^="bottom-"] { bottom: 2%; align-items: flex-end; }
.card.template-T37[data-visual-variant="photo-cover"] [data-text-zone$="left"] { left: 2%; }
.card.template-T37[data-visual-variant="photo-cover"] [data-text-zone$="right"] { right: 2%; }
.card.template-T37[data-visual-variant="photo-cover"] .template-heading { width: 100%; padding: .3em; background: var(--on-media-backing); border: 0; }
.card.template-T37[data-visual-variant="photo-cover"] [data-media-tone="dark"] { --on-media: #fff; --on-media-backing: rgba(0,0,0,.76); }
.card.template-T37[data-visual-variant="photo-cover"] [data-media-tone="light"] { --on-media: #111; --on-media-backing: rgba(255,255,255,.84); }
.card.template-T37[data-visual-variant="photo-cover"] .photo-zone :is(.template-heading,.template-title,.card-eyebrow,h1,strong,em,a,code,s) { color: var(--on-media); }
.card.template-T37[data-visual-variant="photo-cover"] .photo-zone :is(strong,em,a,code,s) { background: transparent; }
.card.template-T37[data-visual-variant="photo-cover"] .photo-zone .card-eyebrow { font-size: .65em; line-height: 1.2; margin: 0 0 .3em; }
.card.template-T37[data-visual-variant="photo-cover"] .photo-zone h1 { margin: 0; }
`;

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

function cardContent(card, layout, template) {
  const metadata = Object.fromEntries(TEXT_FIELDS.map(name => [name, plainText(card.metadata?.[name], `Card ${name}`)]));
  const eyebrow = metadata.eyebrow ? `<p class="card-eyebrow">${metadata.eyebrow}</p>` : '';
  const source = metadata.source ? `<p class="card-source">${metadata.source}</p>` : '';
  if (template) {
    const metric = template.supportedMetadata?.includes('metric') && metadata.metric ? `<p class="statistic-value">${metadata.metric}</p>` : '';
    const label = template.supportedMetadata?.includes('label') && metadata.label ? `<p class="statistic-label">${metadata.label}</p>` : '';
    const metricBlock = metric || label ? `<div class="template-metric">${metric}${label}</div>` : '';
    const imageFigure = figure(card, metadata);
    const figureBeforeMain = template.figureBeforeMain || card.metadata?.visualVariant === 'screenshot-stage';
    const sections = (card.sections ?? []).map((section, index) => `<section class="template-section" data-section="${index + 1}">${section.html}</section>`).join('\n');
    if (card.metadata?.visualVariant === 'photo-cover') {
      const { focalX, focalY, textZone, mediaTone } = card.metadata;
      return `<figure class="card-figure"><div class="photo-stage" style="--photo-x:${focalX}%;--photo-y:${focalY}%"><div class="photo-zone" data-text-zone="${textZone}" data-media-tone="${mediaTone}"><header class="template-heading">${eyebrow}<div class="template-title">${card.templateTitleHtml}</div></header></div>${imageTag(card.image, metadata.alt, 'card-image')}</div><figcaption>${metadata.caption}</figcaption></figure><div class="template-main"><div class="template-intro">${card.templateIntroHtml ?? card.html}</div>${sections ? `<div class="template-sections">${sections}</div>` : ''}</div>${source}`;
    }
    return `<header class="template-heading">${eyebrow}<div class="template-title">${card.templateTitleHtml ?? ''}</div></header>${metricBlock}${figureBeforeMain ? imageFigure : ''}<div class="template-main"><div class="template-intro">${card.templateIntroHtml ?? card.html}</div>${sections ? `<div class="template-sections">${sections}</div>` : ''}</div>${figureBeforeMain ? '' : imageFigure}${source}`;
  }
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

function footerHtml(options, index, count, footerMode) {
  const brandName = plainText(options.brand?.name, 'Brand name');
  const footer = plainText(options.footer, 'Footer');
  const logo = imageTag(options.brand?.logo, brandName ? '' : 'Brand logo', 'brand-logo');
  // A probe reserves the widest permitted page counter. Final exports always
  // replace it with the actual count and undergo full screen/print validation.
  const probe = options.paginationProbe === true;
  const counter = probe ? '200 / 200' : footerMode === 'series' ? `${String(index).padStart(2, '0')} / ${String(count).padStart(2, '0')}` : `${index} / ${count}`;
  // Only a final, single-card poster omits the generated counter. Keep the
  // footer element in flow for measurement, and never remove supplied text.
  const counterHtml = footerMode === 'poster' && count === 1 && !probe ? '' : `<span class="card-index">${counter}</span>`;
  return `<footer class="card-footer"><div class="footer-identity">${logo}<div class="footer-meta">${brandName ? `<span class="brand-name">${brandName}</span>` : ''}${footer ? `<span class="footer-text">${footer}</span>` : ''}</div></div>${counterHtml}</footer>`;
}

/**
 * card.html / introHtml / sections[].html must come from the safe Markdown parser.
 * Metadata is plain text; image and logo objects must come from the asset resolver.
 * themeCss and layoutCss are trusted repository CSS, never user-supplied styles.
 */
export function buildDocument(cards, options, themeCss, layoutCss = '', templateCss = '') {
  const { width, height, theme = 'editorial' } = options;
  const footerMode = options.footerMode === undefined ? 'legacy' : options.footerMode;
  if (!FOOTER_MODES.includes(footerMode)) throw new Error(`Unknown footer mode "${footerMode}". Choose ${FOOTER_MODES.join(', ')}.`);
  if (![width, height].every(value => Number.isInteger(value) && value >= 200 && value <= 4096)) {
    throw new Error('Card dimensions must be integers from 200 to 4096 pixels.');
  }
  if (!THEMES.includes(theme)) throw new Error(`Unknown theme "${theme}".`);
  const accent = options.brand?.accent;
  if (accent !== undefined && (typeof accent !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(accent))) {
    throw new Error('Brand accent must be a hex color such as #126d64 or #0af.');
  }
  const defaultBodySize = normalizeBodySize(options.bodySize);
  let customBodySize = false;
  let screenshotStage = false;
  let photoCover = false;
  let wechatCover = false;
  let defaultT37 = false;
  const preview = options.preview === true;
  const body = cards.map((card, position) => {
    const index = position + 1;
    const bodySize = normalizeBodySize(card.metadata?.bodySize === undefined ? defaultBodySize : card.metadata.bodySize);
    if (bodySize !== 'medium') customBodySize = true;
    const layout = card.metadata?.layout ?? 'explainer';
    if (!LAYOUTS.includes(layout)) throw new Error(`Card ${index} has unknown layout "${layout}".`);
    const template = validateTemplateMetadata(card.metadata ?? {}, { width, height });
    validateTemplateCard(card, template);
    const variant = card.metadata?.visualVariant;
    if (template?.id === 'T37' && variant !== 'photo-cover') defaultT37 = true;
    if (variant === 'screenshot-stage') screenshotStage = true;
    if (variant === 'photo-cover') photoCover = true;
    const aspect = template ? resolveTemplateAspect(template.id, { width, height }) : null;
    if (aspect?.id === 'wechat-wide' || (template?.id === 'T01' && aspect?.id === 'square')) wechatCover = true;
    const templateClass = template ? ` template-card template-${template.id} family-${template.family} density-${card.metadata.density ?? template.density} ${aspect.className}` : '';
    const article = `<article class="card${template ? '' : ` theme-${theme}`} layout-${layout}${templateClass}"${template ? ` data-template="${template.id}" data-template-aspect="${aspect.id}"` : ''}${variant ? ` data-visual-variant="${variant}"` : ''}${footerMode === 'legacy' ? '' : ` data-footer-mode="${footerMode}"`}${bodySize === 'medium' ? '' : ` data-body-size="${bodySize}"`} data-layout="${layout}" aria-label="Card ${index} of ${cards.length}">
    <div class="card-content">${sizeBodyText(cardContent(card, layout, template), bodySize)}</div>
    ${footerHtml(options, index, cards.length, footerMode)}
  </article>`;
    return preview ? `<section class="preview-item" aria-label="Preview card ${index}"><div class="preview-canvas">${article}</div><p class="preview-caption">${index} / ${cards.length} · ${layout} · ${width} × ${height}</p></section>` : article;
  }).join('\n');
  const t37Policy = defaultT37 ? t37DefaultTextPolicy(accent, templateCss) : null;
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
${templateCss}${customBodySize ? `\n${bodySizeCss()}` : ''}${screenshotStage ? SCREENSHOT_STAGE_CSS : ''}${photoCover ? PHOTO_COVER_CSS : ''}${wechatCover ? WECHAT_COVER_CSS : ''}${t37Policy ? t37DefaultTextCss(t37Policy) : ''}
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
export function buildPreviewDocument(cards, options, themeCss, layoutCss = '', templateCss = '') {
  return buildDocument(cards, { ...options, preview: true }, themeCss, layoutCss, templateCss);
}
