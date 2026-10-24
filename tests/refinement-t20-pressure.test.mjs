import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAssetResolver } from '../scripts/assets.mjs';
import { renderCards, escapeHtml } from '../scripts/markdown.mjs';
import { buildDocument, SIZES } from '../scripts/document.mjs';
import { createCases } from '../scripts/validate-visual-stress.mjs';

const css = await readFile(new URL('../assets/templates.css', import.meta.url), 'utf8');
const selected = css.slice(css.indexOf('/* T20 —'), css.indexOf('/* T23 —'));
const rules = [...selected.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const rule = selector => rules.find(([, selectors]) => selectors.trim().endsWith(selector))?.[2];
const number = (selector, pattern) => Number(rule(selector).match(pattern)[1]);

test('T20 pressure calibration keeps the dark instrument, open columns and original type rhythm', () => {
  assert.match(rule('.card.template-T20'), /--paper: #131a24; --ink: #f0f5f7; --muted: #b8c9cf/);
  assert.match(rule('.card.template-T20'), /--accent: var\(--brand-accent, #99d7c6\)/);
  assert.match(rule('.card.template-T20 .template-sections'), /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); gap: \.7em/);
  assert.match(rule('.card.template-T20 .template-section'), /border-top: 1px solid var\(--line\); border-radius: 0; background: transparent/);
  assert.match(rule('.card.template-T20 h1'), /font-family: var\(--font-display\); font-size: 1\.9em; font-weight: 800; line-height: 1\.14/);
  assert.match(rule('.card.template-T20 .card-eyebrow'), /font-family: var\(--font-source\)/);
  assert.doesNotMatch(selected, /--text-size\s*:|--note-size\s*:|--body-leading\s*:|--quote-leading\s*:|object-fit:\s*cover|overflow:\s*hidden|line-clamp|text-overflow|transform:/);
  for (const [, selector, declarations] of rules) {
    if (!selector.trim().endsWith(' h1')) assert.doesNotMatch(declarations, /line-height\s*:/, selector);
    if (selector.includes('density-')) assert.doesNotMatch(declarations, /font|line-height|scale|zoom/);
  }
});

test('T20 keeps the complete .40h image and unchanged meaningful landscape scale at 351px', async () => {
  const { width, height } = SIZES.portrait;
  const innerWidth = width * (1 - 2 * .052), phoneScale = 351 / width;
  assert.match(rule('.card.template-T20'), /padding: calc\(var\(--pad\) \* \.4\) var\(--pad\)/);
  assert.match(rule('.card.template-T20 .image-frame'), /height: auto; padding: 0; border: 0/);
  assert.match(rule('.card.template-T20 .card-image'), /width: 100%; height: auto; max-height: calc\(var\(--card-height\) \* \.40\); object-fit: contain/);
  for (const [file, kind] of [['examples/templates/assets/original-research-interface.png', 'landscape'], ['docs/images/templates/T17.png', 'portrait']]) {
    const png = await readFile(new URL(`../${file}`, import.meta.url));
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    const shownWidth = Math.min(innerWidth, height * .40 * w / h) * phoneScale;
    if (kind === 'landscape') assert.ok(shownWidth >= 240 && shownWidth > 290);
    else assert.equal(shownWidth, 140.4, 'The complete portrait stays centered, not cropped or falsely claimed as 240px wide');
  }
});

test('spacing-only follow-on covers the no-eyebrow pressure residual with a conservative budget', () => {
  const body = 1080 * .043, note = 1080 * .0335, pad = 1080 * .052;
  const gap = number('.card.template-T20', /--section-gap: ([.\d]+)em/);
  const factor = number('.card.template-T20 .card-content', /--section-gap\) \* ([.\d]+)/);
  const inset = number('.card.template-T20', /--pad\) \* ([.\d]+)/);
  const compact = number('.card.template-T20.density-compact', /--section-gap: ([.\d]+)em/);
  const editorial = number('.card.template-T20.density-editorial', /--section-gap: ([.\d]+)em/);
  assert.ok(compact < gap && gap < editorial);
  assert.match(rule('.card.template-T20 .template-section'), /padding: \.1em 0 \.05em/);
  assert.match(rule('.card.template-T20 .template-section h2'), /margin-bottom: \.15em/);
  assert.match(rule('.card.template-T20 .card-figure'), /margin: \.1em 0 0/);
  assert.match(rule('.card.template-T20 .card-figure figcaption'), /margin: \.15em 0 0/);
  assert.match(rule('.card.template-T20 .card-source'), /padding-top: \.1em/);
  assert.match(rule('.card.template-T20 .card-footer'), /margin-top: \.15em; padding-top: \.15em/);
  // Actual CI 40068790583 before either correction: occupied 1429.75, available
  // 1247. The pressure fixture has no eyebrow. It must not receive the landscape
  // example's eyebrow-margin saving. Deltas below are CSS geometry estimates,
  // not new browser bounds or a visual acceptance claim.
  const firstOccupiedSaving = 1440 * (.44 - .40) + 3 * .38 * (1 - .58) * body
    + .15 * body + (.3 + .2 - .15 - .1) * body;
  const firstAvailableGain = (.4 + .35 - .25 - .2) * note;
  const followOccupiedSaving = 3 * (.38 * .58 - gap * factor) * body
    + (.38 - gap) * body + (.15 + .1 - .1 - .05) * body
    + (.2 - .15) * body + (.15 - .1) * body
    + (.25 - .15) * note + (.2 - .1) * note;
  const followAvailableGain = 2 * (1 - inset) * pad + (.25 + .2 - .15 - .15) * note;
  const pressureMargin = 1247 + firstAvailableGain + followAvailableGain
    - (1429.75 - firstOccupiedSaving - followOccupiedSaving);
  assert.ok(followOccupiedSaving + followAvailableGain > 99);
  assert.ok(pressureMargin > 25, `Estimated reserve ${pressureMargin}px still needs actual CI verification`);
});

test('registered and portrait-pressure cases retain every source fragment, caption and exact image', async () => {
  const root = new URL('../', import.meta.url);
  const resolver = await createAssetResolver(fileURLToPath(root));
  const original = await readFile(new URL('examples/templates/T20.md', root), 'utf8');
  const [landscape] = renderCards(original, { resolveImage: (name, context) => resolver.resolveImage(`examples/templates/${name}`, context) });
  const pressure = (await createCases()).find(item => item.id === 'image-screenshot');
  const [portrait] = renderCards(pressure.source, { resolveImage: resolver.resolveImage });
  assert.equal(portrait.metadata.eyebrow, undefined);
  for (const card of [landscape, portrait]) {
    assert.equal(card.templateTitleHtml + card.templateIntroHtml + card.sections.map(section => section.html).join(''), card.html);
    const html = buildDocument([card], SIZES.portrait, '', '', css).split('<main')[1];
    assert.equal(html.split(card.image.dataUrl).length - 1, 1);
    for (const field of ['source', 'caption']) assert.equal(html.split(escapeHtml(card.metadata[field])).length - 1, 1);
    assert.equal(card.sections.length, 2);
    assert.ok(html.indexOf('class="template-main"') < html.indexOf('class="card-figure '));
  }
  assert.match(portrait.metadata.caption, /历史截图，非本轮导出/);
});
