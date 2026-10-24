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

test('PR17 T20 keeps the original purple paired panels, pill, type and complete .36h image', () => {
  assert.match(rule('.card.template-T20'), /--paper: #171b30; --ink: #f4f3fb; --muted: #c3c5da/);
  assert.match(rule('.card.template-T20'), /--accent: var\(--brand-accent, #c2b4ff\); --panel: #292e4b/);
  assert.match(rule('.card.template-T20 .card-eyebrow'), /border-radius: 1\.5em/);
  assert.match(rule('.card.template-T20 .template-sections'), /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(rule('.card.template-T20 .template-section'), /border-radius: 0 0 \.28em \.28em; background: var\(--panel\)/);
  assert.match(rule('.card.template-T20 h1'), /font-size: 1\.85em; font-weight: 800/);
  assert.match(rule('.card.template-T20 .image-frame'), /height: calc\(var\(--card-height\) \* \.36\)/);
  assert.match(rule('.card.template-T20 .card-image'), /width: 100%; height: 100%; object-fit: contain/);
  assert.doesNotMatch(selected, /--font-|--text-size\s*:|--note-size\s*:|line-height\s*:|object-fit:\s*cover|overflow:\s*hidden|line-clamp|text-overflow|transform:/);
});

test('the landscape interface retains at least 240 actual phone pixels; portrait is contained, not cropped to that width', async () => {
  const { width, height } = SIZES.portrait;
  const boxWidth = width * (1 - 2 * .052) - 2;
  const boxHeight = height * .36 - 2;
  const phoneScale = 351 / width;
  for (const [file, expected] of [['examples/templates/assets/original-research-interface.png', 'interface'], ['docs/images/templates/T17.png', 'portrait']]) {
    const png = await readFile(new URL(`../${file}`, import.meta.url));
    const sourceWidth = png.readUInt32BE(16), sourceHeight = png.readUInt32BE(20);
    const fit = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
    const shownWidth = sourceWidth * fit * phoneScale;
    if (expected === 'interface') assert.ok(shownWidth >= 240);
    else {
      assert.ok(shownWidth < 240, 'Complete portrait cannot be claimed to meet the landscape overview width inside this fixed-height frame');
      assert.ok(shownWidth > 120);
    }
  }
});

test('spacing-only standard calibration has a budget exceeding the measured pressure overage', () => {
  const body = 1080 * .043, note = 1080 * .0335, pad = 1080 * .052;
  const gap = Number(rule('.card.template-T20').match(/--section-gap: ([.\d]+)em/)[1]);
  const compact = Number(rule('.card.template-T20.density-compact').match(/--section-gap: ([.\d]+)em/)[1]);
  const editorial = Number(rule('.card.template-T20.density-editorial').match(/--section-gap: ([.\d]+)em/)[1]);
  assert.ok(compact < gap && gap < editorial);
  // Exact pre-patch CI 40069835718: pressure 1432.4375 used / 1224 available.
  // An arithmetic furniture budget, not a substitute for a fresh browser run.
  const saved = 4 * (.85 - gap) * body + 2 * (1 - .75) * pad
    + (.35 - .05) * body + (.7 - .3) * note
    + 2 * (.35 - .16) * body + (.25 - .12) * body
    + (.4 - .15) * note + (.35 - .15) * note
    + ((.75 + .65) - (.2 + .15)) * note;
  assert.ok(saved > (1432.4375 - 1224) + 20);
  for (const [, selector, body] of rules) if (selector.includes('density-')) assert.doesNotMatch(body, /font|line-height|scale|zoom/);
});

test('registered and pressure originals keep their text, captions, sources and exact images', async () => {
  const root = new URL('../', import.meta.url);
  const resolver = await createAssetResolver(fileURLToPath(root));
  const fixture = await readFile(new URL('examples/templates/T20.md', root), 'utf8');
  const [original] = renderCards(fixture, { resolveImage: (name, context) => resolver.resolveImage(`examples/templates/${name}`, context) });
  const pressure = (await createCases()).find(item => item.id === 'image-screenshot');
  const [screenshot] = renderCards(pressure.source, { resolveImage: resolver.resolveImage });
  for (const card of [original, screenshot]) {
    assert.equal(card.templateTitleHtml + card.templateIntroHtml + card.sections.map(section => section.html).join(''), card.html);
    const html = buildDocument([card], SIZES.portrait, '', '', css).split('<main')[1];
    assert.equal(html.split(card.image.dataUrl).length - 1, 1);
    for (const field of ['source', 'caption']) assert.equal(html.split(escapeHtml(card.metadata[field])).length - 1, 1);
    assert.equal(card.sections.length, 2);
    assert.ok(html.indexOf('class="template-main"') < html.indexOf('class="card-figure '));
  }
  assert.match(screenshot.metadata.caption, /历史截图，非本轮导出/);
});
