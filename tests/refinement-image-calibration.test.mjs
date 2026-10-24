import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAssetResolver } from '../scripts/assets.mjs';
import { renderCards } from '../scripts/markdown.mjs';
import { buildDocument, SIZES } from '../scripts/document.mjs';

const css = await readFile(new URL('../assets/templates.css', import.meta.url), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const body = selector => rules.filter(([, selectors]) => selectors.trim().endsWith(selector)).map(([, , rule]) => rule).at(-1);
const ids = ['T20', 'T40', 'T43', 'T47', 'T48'];

test('CI image calibration keeps actual phone picture/key floors without cropping', async () => {
  const image20 = await readFile(new URL('../examples/templates/assets/original-research-interface.png', import.meta.url));
  const image40 = await readFile(new URL('../examples/templates/assets/original-seam-detail.png', import.meta.url));
  const [width20, height20] = [image20.readUInt32BE(16), image20.readUInt32BE(20)];
  const [width40, height40] = [image40.readUInt32BE(16), image40.readUInt32BE(20)];
  const { width, height } = SIZES.portrait;
  const innerWidth = width * (1 - 2 * .052);
  const phoneScale = 351 / width;
  assert.match(body('.card.template-T20 .card-image'), /max-height: calc\(var\(--card-height\) \* \.40\); object-fit: contain/);
  const interfaceWidth = Math.min(innerWidth, height * .40 * width20 / height20);
  assert.ok(interfaceWidth * phoneScale >= 240);
  assert.match(body('.card.template-T40 .card-content'), /grid-template-columns:calc\(var\(--card-width\) \* \.8\)/);
  assert.match(body('.card.template-T40 .image-frame'), /aspect-ratio:1200 \/ 680/);
  assert.match(body('.card.template-T40 .card-image'), /object-fit:contain/);
  const frameWidth = width * .8;
  const frameHeight = frameWidth * height40 / width40;
  const sourceScale = Math.min((frameWidth - 2) / width40, (frameHeight - 2) / height40);
  assert.ok(sourceScale * 48 * phoneScale >= 11, 'Include both one-pixel frame borders in the real picture scale');
});

test('T40 spends geometry rather than font size and retains full-width later content', () => {
  const font = 1080 * .043;
  const keyRail = 1080 - 2 * (1080 * .052 * .58) - 1080 * .8 - .2 * font;
  assert.ok(keyRail >= 3 * font, 'The supplied six-character key title reads as two horizontal three-character lines');
  assert.match(body('.card.template-T40'), /padding:calc\(var\(--pad\) \* \.75\) calc\(var\(--pad\) \* \.58\)/);
  assert.match(body('.card.template-T40 .template-section:first-child > h2'), /grid-column:2; grid-row:2/);
  assert.match(body('.card.template-T40 .template-section > *'), /grid-column:1 \/ -1/);
  assert.match(body('.card.template-T40 .card-figure figcaption'), /grid-column:1 \/ -1; grid-row:3/);
  assert.match(body('.card.template-T40 .template-intro'), /grid-column:1 \/ -1; grid-row:4; line-height:1\.4/);
  assert.match(body('.card.template-T40 .card-source'), /grid-column:1 \/ -1/);
  assert.doesNotMatch(css, /\.card\.template-T40[^{}]*\{[^}]*--text-size/);
  assert.doesNotMatch(css, /\.card\.template-T40[^{}]*\{[^}]*--note-size/);
});

test('T43 dialogue and T48 explicit field labels recover readable column measure', () => {
  const font = 1080 * .043;
  const inner = 1080 * (1 - 2 * .052);
  const sceneColumn = (inner - .45 * font) / 2;
  const dialogueMeasure = sceneColumn - .055 * font;
  assert.match(body('.card.template-T43 .template-section blockquote'), /padding:\.12em 0/);
  assert.ok(dialogueMeasure >= 10 * font, 'Ten full-width dialogue glyphs fit without shrinking');
  const specimenColumn = (inner - .6 * font) / 2;
  assert.match(body('.card.template-T48 .template-section ul'), /list-style:none; padding-left:0/);
  assert.ok(specimenColumn >= 10 * font * 1.005, 'An explicit ten-glyph field fits including family tracking');
  for (const id of ['T43', 'T47', 'T48']) assert.match(body(`.card.template-${id} .markdown-image`), /height:auto; max-height:none/);
  assert.match(body('.card.template-T47 .template-intro ul'), /display:grid; grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(body('.card.template-T47 .template-section'), /grid-template-columns:minmax\(0,\.9fr\) minmax\(0,1\.1fr\)/);
});

test('all five calibrated examples retain complete words, source and embedded image data', async () => {
  const resolver = await createAssetResolver(fileURLToPath(new URL('../examples/templates/', import.meta.url)));
  for (const id of ids) {
    const source = await readFile(new URL(`../examples/templates/${id}.md`, import.meta.url), 'utf8');
    const [card] = renderCards(source, { resolveImage: resolver.resolveImage });
    assert.equal(card.templateTitleHtml + card.templateIntroHtml + card.sections.map(section => section.html).join(''), card.html);
    const html = buildDocument([card], SIZES.portrait, '', '', css).split('<main')[1];
    assert.ok(html.includes(card.metadata.source));
    if (card.metadata.caption) assert.ok(html.includes(card.metadata.caption));
    if (card.image) assert.equal(html.split(card.image.dataUrl).length - 1, 1);
    for (const image of card.html.match(/<img\b[^>]*>/g) ?? []) assert.ok(html.includes(image));
  }
});

test('calibration never introduces clipping, fixed text heights or smaller density type', () => {
  for (const [, selector, rule] of rules.filter(([, selector]) => ids.some(id => selector.includes(`.template-${id}`)))) {
    assert.doesNotMatch(rule, /object-fit:\s*cover|overflow:\s*hidden|line-clamp|text-overflow|transform:\s*scale/, selector);
    if (selector.includes('density-')) assert.doesNotMatch(rule, /font|text-size|note-size|zoom/);
  }
});
