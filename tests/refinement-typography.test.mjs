import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FAMILY_TYPOGRAPHY, LOCAL_FONT_STACKS, TYPOGRAPHY_ROLES, typographyForFamily, templateTypographyCss, inspectLocalTypography } from '../scripts/typography.mjs';
import { TEMPLATES } from '../scripts/templates.mjs';
import { createAssetResolver } from '../scripts/assets.mjs';
import { renderCards, escapeHtml } from '../scripts/markdown.mjs';
import { buildDocument, SIZES } from '../scripts/document.mjs';

const css = await readFile(new URL('../assets/templates.css', import.meta.url), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const rule = selector => rules.filter(([, selectors]) => selectors.trim().endsWith(selector)).map(([, , body]) => body).at(-1);
const IMAGE_NARRATIVES = ['T43', 'T47', 'T48'];

test('twelve fixed local typography profiles match the static CSS and all 48 registry entries', () => {
  assert.equal(Object.keys(FAMILY_TYPOGRAPHY).length, 12);
  assert.ok(css.startsWith(templateTypographyCss() + '\n'));
  assert.deepEqual([...TYPOGRAPHY_ROLES], ['display', 'body', 'numeric', 'quote', 'source']);
  for (const template of TEMPLATES) {
    const profile = typographyForFamily(template.family);
    assert.deepEqual(template.typography, profile, template.id);
    assert.ok(Object.isFrozen(profile));
    assert.ok(Object.isFrozen(profile.roles));
    assert.ok(profile.bodyWidthRatio * 351 >= 14, template.id);
    assert.ok(profile.noteWidthRatio * 351 >= 11, template.id);
    for (const role of TYPOGRAPHY_ROLES) assert.ok(Object.hasOwn(LOCAL_FONT_STACKS, profile.roles[role]));
  }
  for (const family of ['unknown', '__proto__', 'editorial;}body{color:red']) assert.throws(() => typographyForFamily(family), RangeError);
  assert.ok(new Set(Object.values(FAMILY_TYPOGRAPHY).map(profile => profile.bodyLineHeight)).size >= 7);
  assert.ok(new Set(Object.values(FAMILY_TYPOGRAPHY).map(profile => profile.paragraphGapScale)).size >= 8);
});

test('role font stacks remain local, CJK-capable fallbacks with no download or licensing payload', () => {
  for (const stack of Object.values(LOCAL_FONT_STACKS)) {
    assert.ok(Object.isFrozen(stack.families));
    assert.ok(stack.families.some(name => /CJK SC/.test(name)));
    assert.ok(['sans-serif', 'serif', 'monospace'].includes(stack.generic));
    assert.ok(stack.families.every(name => !/[;{}<>]|https?:|url\(/i.test(name)));
  }
  assert.doesNotMatch(templateTypographyCss(), /@font-face|@import|url\(|https?:|data:/i);
  assert.match(css, /font-family: var\(--font-body\)/);
  for (const role of TYPOGRAPHY_ROLES) assert.match(css, new RegExp(`font-family:\\s*var\\(--font-${role}\\)`));
  assert.match(css, /lining-nums tabular-nums/);
});

test('font inventory distinguishes named candidates, generic fallback and unknown inspection', () => {
  const report = inspectLocalTypography(['noto serif cjk sc,Alias Name', 'Liberation Mono', 'Not Inter']);
  assert.equal(report.stacks.serif.firstInstalledCandidate, 'noto serif cjk sc');
  assert.equal(report.stacks.sans.firstInstalledCandidate, null);
  assert.equal(report.stacks.sans.selection, 'generic-fallback');
  assert.equal(report.stacks.mono.firstInstalledCandidate, 'Liberation Mono');
  assert.equal(report.browserSelection, 'unverified');
  assert.equal(inspectLocalTypography([], { scanAvailable: false }).stacks.serif.selection, 'unverified');
});

test('density remains spacing-only and family rhythm never overrides the mobile text floor', () => {
  for (const [, selector, body] of rules) {
    if (selector.includes('.density-')) assert.doesNotMatch(body, /font|text-size|note-size|zoom|transform/);
    if (selector.includes('.family-')) assert.doesNotMatch(body, /--text-size|--note-size|font-size/);
  }
  assert.match(rule('.card.template-card'), /font-size: var\(--text-size\); line-height: var\(--body-leading\)/);
  assert.match(rule('.card.template-card p'), /var\(--paragraph-gap\) \* var\(--paragraph-rhythm\)/);
});

test('flagship image treatments use intrinsic frames rather than icon-height caps or cover crops', () => {
  for (const id of IMAGE_NARRATIVES) {
    const image = rule(`.card.template-${id} .markdown-image`);
    assert.match(image, /width:\s*100%/);
    assert.match(image, /height:\s*auto/);
    assert.match(image, /max-height:\s*none/);
    assert.match(image, /object-fit:\s*contain/);
  }
  for (const id of ['T20', 'T37', 'T45']) {
    assert.match(rule(`.card.template-${id} .image-frame`), /height:\s*auto/);
    assert.match(rule(`.card.template-${id} .card-image`), /height:\s*auto/);
  }
  assert.match(rule('.card.template-T37 .card-image'), /max-height:calc\(var\(--card-height\) \* \.52\)/);
  assert.match(rule('.card.template-T47 .template-section'), /grid-template-columns:minmax\(0,\.9fr\) minmax\(0,1\.1fr\)/);
  assert.match(rule('.card.template-T48 .template-sections'), /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(rule('.card.template-T48 .template-section:nth-child(n + 3)'), /grid-column:1\/-1/);
  for (const [, selector, body] of rules.filter(([, selectors]) => /template-T(?:05|13|20|21|29|37|43|45|47|48)\b/.test(selectors))) {
    assert.doesNotMatch(body, /object-fit:\s*cover|overflow:\s*hidden|line-clamp|text-overflow|font-size:\s*\.\d+em/, selector);
  }
});

test('all original template words, metadata and image payloads survive the role/style round unchanged', async () => {
  const resolver = await createAssetResolver(fileURLToPath(new URL('../examples/templates/', import.meta.url)));
  for (const template of TEMPLATES) {
    const source = await readFile(new URL(`../${template.example}`, import.meta.url), 'utf8');
    const [card] = renderCards(source, { resolveImage: resolver.resolveImage });
    assert.equal(card.templateTitleHtml + card.templateIntroHtml + card.sections.map(section => section.html).join(''), card.html, template.id);
    const body = buildDocument([card], SIZES.portrait, '', '', css).split('<main')[1];
    for (const metadata of ['eyebrow', 'source', 'caption', 'metric', 'label']) {
      if (card.metadata[metadata]) assert.equal(body.split(escapeHtml(card.metadata[metadata])).length - 1, 1, `${template.id} ${metadata}`);
    }
    const inlineImages = [...card.html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
    for (const image of inlineImages) assert.ok(body.includes(image), template.id);
    if (card.image) assert.equal(body.split(card.image.dataUrl).length - 1, 1, `${template.id} full image payload`);
  }
});

test('the M1 wide text structures and independent aspect section remain intact', () => {
  for (const id of ['T32', 'T34']) assert.match(rule(`.card.template-${id} .template-sections`), /display:\s*flex; flex-direction:\s*column/);
  assert.match(rule('.card.template-T34 .template-section:first-child p:first-of-type::first-letter'), /float:none; font:inherit/);
  const aspectStart = css.indexOf('/* M9 independent aspect candidates:');
  assert.ok(aspectStart > css.indexOf('/* R04 portrait metric composition:'));
  assert.doesNotMatch(css.slice(aspectStart), /\.family-|BEGIN LOCAL ROLE/);
  assert.match(rule('.card.template-T21.template-aspect-portrait .template-metric'), /display:grid/);
  assert.match(rule('.card.template-T21.template-aspect-slide .template-metric'), /grid-column: 1; grid-row: 2/);
});


test('open-grid headings and film plate stay inside the measured content box', () => {
  assert.match(rule('.card.template-T37 .card-figure'), /margin:0;/);
  assert.match(rule('.card.template-T19 .template-section h2'), /margin: 0 0 \.25em; padding: \.1em 0 \.25em/);
  assert.doesNotMatch(rule('.card.template-T37 .card-figure'), /-1|negative/);
});

test('capacity calibration preserves type roles and keeps absent labels and short links honest',async()=>{
 const css=await readFile(new URL('../assets/templates.css',import.meta.url),'utf8');
 assert.match(css,/template-T06 \.template-title:only-child \{ grid-column: 1 \/ -1;/);
 assert.match(css,/template-T36 \.template-section a \{ display:inline-block; max-width:100%; overflow-wrap:anywhere;/);
 const calibration=css.split('/* R01/R03/R11 measured-capacity')[1].split('/* M9 independent aspect')[0];
 assert.doesNotMatch(calibration,/font-size|line-height|transform|zoom|overflow\s*:|display\s*:\s*none/);
 assert.match(css,/--text-size: calc\(var\(--card-width\) \* \.043\)/);
 assert.match(css,/--note-size: calc\(var\(--card-width\) \* \.0335\)/);
});


test('compact portrait T21 gives evidence bodies a wider measure without changing type or other aspects', () => {
  const selector = '.card.template-T21.template-aspect-portrait.density-compact .template-section';
  const compact = rule(selector);
  assert.match(compact, /grid-template-columns: minmax\(0, \.5fr\) minmax\(0, 1\.5fr\)/);
  assert.doesNotMatch(compact, /font|line-height|letter-spacing|overflow|clip|transform|zoom|text-wrap/);
  const portrait = rule('.card.template-T21.template-aspect-portrait .template-section');
  assert.match(portrait, /grid-template-columns:minmax\(0,\.62fr\) minmax\(0,1\.38fr\); column-gap:\.65em/);
  const compactTracks = rules.filter(([, selectors, body]) => selectors.includes('template-T21') && selectors.includes('density-compact') && /grid-template-columns/.test(body));
  assert.equal(compactTracks.length, 1);
  assert.ok(compactTracks[0][1].trim().endsWith(selector));
  assert.doesNotMatch(compactTracks[0][1], /,|square|slide/);

  // CSS geometry only, not a replacement for Chromium line-box / PDF review.
  // At the inherited body size, both the five-CJK label and 15-CJK body line
  // fit in their tracks at export width and both prescribed phone scales.
  for (const width of [SIZES.portrait.width, 351, 366]) {
    const em = width * .043, inner = width * (1 - 2 * .052);
    const tracks = inner - .65 * em;
    const label = tracks * .25, body = tracks * .75;
    const previousBody = tracks * .69;
    assert.ok(label >= 5 * em);
    assert.ok(body > 15 * em);
    assert.ok(body > previousBody * 1.08);
  }
});
