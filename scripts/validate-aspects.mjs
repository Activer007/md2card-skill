#!/usr/bin/env node
// Future authorized real-Chromium validation only. Never run under a known
// browser denial, enable Actions, or treat technical export as visual acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderCards, parseMarkdownTokens, escapeHtml } from './markdown.mjs';
import { parseOptions, exportCards } from './render.mjs';
import { openRenderer, closeBrowser } from './browser.mjs';
import { inspectPdf } from './qa.mjs';
import { SIZES } from './document.mjs';
import { createAssetResolver } from './assets.mjs';
import { resolveTemplateAspect } from './templates.mjs';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const compact = value => value.normalize('NFC').replace(/\s+/gu, '');
export const MAX_ASPECT_CASES = 58;
export const ASPECT_CASE_SELECTION = Object.freeze(Object.fromEntries(Object.entries({ T04: ['square', 'slide'], T21: ['square', 'slide'], T05: ['square'], T13: ['square'], T24: ['slide'], T37: ['slide'] }).map(([id, aspects]) => [id, Object.freeze(aspects)])));
const REFUSAL = 'expected-TEMPLATE_ASPECT_UNSUPPORTED';
const EXPECTATIONS = ['candidate-unmeasured', 'candidate-unmeasured-may-overflow', 'expected-CONTENT_OVERFLOW-unverified'];
const SCOPES = ['aspect-specific-square', 'aspect-specific-slide', 'same-source-short', 'same-source-original', 'same-source-long'];
const unsafeToRetry = error => ['BROWSER_LAUNCH_FAILED', 'BROWSER_CLEANUP_FAILED', 'BROWSER_CLEANUP_TIMEOUT', 'ASPECT_MOBILE_TIMEOUT', 'RENDER_TIMEOUT', 'ASPECT_BROWSER_OPERATION_FAILED'].includes(error.code) ||
  (Array.isArray(error.details?.cleanupFailures) && error.details.cleanupFailures.some(failure => failure.action === 'close-browser'));
const codeError = (code, message) => Object.assign(new Error(message), { code });

/** Source-owned visible segments, never text scraped from incomplete output. */
export function aspectVisibleSegments(card) {
  const inline = children => children.map(child => ['text', 'code_inline'].includes(child.type) ? child.content : ['softbreak', 'hardbreak'].includes(child.type) ? '\n' : child.children ? inline(child.children) : '').join('');
  return [...parseMarkdownTokens(card.source).flatMap(token => token.type === 'inline' ? [inline(token.children ?? [])] : ['fence', 'code_block'].includes(token.type) ? [token.content] : []),
    ...['eyebrow', 'source', 'metric', 'label', 'caption'].map(key => card.metadata[key] ?? ''), '1 / 1'].filter(text => text.trim());
}

export function validateAspectPlan(plan) {
  assert.equal(plan.schemaVersion, 2);
  assert.equal(plan.baseRevision, 'e1ad19f00ec44c90ff54e83694a42f547f437566');
  assert.ok(Array.isArray(plan.cases) && plan.cases.length === MAX_ASPECT_CASES, 'The bounded inventory must contain exactly 58 cases; do not expand this runner silently.');
  const identities = new Set();
  for (const item of plan.cases) {
    const selected = ASPECT_CASE_SELECTION[item.template]; assert.ok(selected, 'Unregistered aspect selection.');
    const refusal = item.scope.startsWith('unsupported-');
    assert.ok([...SCOPES, 'unsupported-named', 'unsupported-ratio'].includes(item.scope));
    const size = item.aspect === 'custom' ? { width: 1200, height: 800 } : SIZES[item.aspect]; assert.ok(size);
    assert.deepEqual(item.dimensions, [size.width, size.height]);
    if (refusal) {
      assert.equal(selected.length, 1); assert.equal(item.expected, REFUSAL);
      assert.equal(item.aspect, item.scope === 'unsupported-ratio' ? 'custom' : selected[0] === 'square' ? 'slide' : 'square');
      assert.throws(() => resolveTemplateAspect(item.template, size), { code: 'TEMPLATE_ASPECT_UNSUPPORTED' });
    } else {
      assert.equal(resolveTemplateAspect(item.template, size).id, item.aspect);
      assert.ok(EXPECTATIONS.includes(item.expected));
      assert.equal(item.expected, item.scope === 'same-source-long' ? EXPECTATIONS[2] : item.scope === 'same-source-original' ? EXPECTATIONS[1] : EXPECTATIONS[0]);
    }
    const shortAspect = selected.includes('slide') ? 'slide' : 'square';
    const expectedFile = item.scope === 'same-source-original' ? `examples/templates/${item.template}.md`
      : item.scope === 'same-source-long' ? `examples/aspects/${item.template}-long.md`
      : `examples/aspects/${item.template}-${item.scope.startsWith('aspect-specific-') ? item.aspect : shortAspect}.md`;
    assert.equal(item.input, expectedFile, 'Input must be its exact repository-owned fixture, never a replacement.');
    assert.match(item.inputSha256, /^[a-f0-9]{64}$/);
    if (item.scope.startsWith('aspect-specific-')) assert.equal(item.aspect, item.scope.slice('aspect-specific-'.length));
    if (item.template === 'T37') {
      assert.equal(item.assetRoot, 'examples/templates');
      assert.deepEqual(item.assets, [{ file: 'examples/templates/assets/synthetic-reading-still-life.png', reference: 'assets/synthetic-reading-still-life.png', sha256: '6efb1be0ead9937892cc8dd2b6837877521fea4527a281c9a231a8b894bde6aa', dimensions: [1536, 1024] }]);
    } else { assert.equal(item.assetRoot, undefined); assert.equal(item.assets, undefined); }
    for (const field of ['realRender', 'mobile375', 'mobile390', 'nativePdf', 'visualReview']) assert.equal(item[field], 'not-performed', 'Plans are not result or acceptance records.');
    const identity = `${item.template}/${item.scope}/${item.aspect}`;
    assert.ok(!identities.has(identity), `Duplicate case ${identity}`); identities.add(identity);
  }
  for (const [template, selected] of Object.entries(ASPECT_CASE_SELECTION)) {
    const scopes = [...selected.map(aspect => `aspect-specific-${aspect}`), 'same-source-short', 'same-source-original', 'same-source-long', ...(selected.length === 1 ? ['unsupported-named', 'unsupported-ratio'] : [])];
    for (const scope of scopes) {
      const group = plan.cases.filter(item => item.template === template && item.scope === scope);
      assert.equal(group.length, scope.startsWith('same-source-') ? selected.length + 1 : 1);
      if (scope.startsWith('same-source-')) {
        assert.deepEqual(group.map(item => item.aspect).sort(), ['portrait', ...selected].sort());
        assert.equal(new Set(group.map(item => `${item.input}:${item.inputSha256}`)).size, 1, 'A same-source comparison cannot substitute shorter text.');
      }
    }
  }
  return plan;
}

/** Resolve only the fixed, hashed repository-owned raster input. No new asset route. */
export async function loadAspectCard(repository, item) {
  const source = await readFile(path.join(repository, item.input), 'utf8');
  assert.equal(hash(source), item.inputSha256, 'Input hash changed; do not substitute or rewrite comparison text.');
  let resolver;
  if (item.assets?.length) {
    for (const asset of item.assets) assert.equal(hash(await readFile(path.join(repository, asset.file))), asset.sha256, 'Aspect image bytes changed.');
    resolver = await createAssetResolver(path.join(repository, item.assetRoot));
  }
  const cards = renderCards(source, resolver ? { resolveImage: resolver.resolveImage } : {});
  assert.equal(cards.length, 1); const card = cards[0];
  assert.equal(card.metadata.template, item.template); assert.ok(card.metadata.source);
  if (item.assets?.length) {
    assert.equal(resolver.getAssets().length, 1);
    assert.equal(card.image.hash, item.assets[0].sha256);
    assert.deepEqual([card.image.width, card.image.height], item.assets[0].dimensions);
    assert.ok(card.metadata.alt && card.metadata.caption, 'The reviewed image fixture preserves alt and caption.');
  }
  return card;
}

export function assertAspectSourceHtml(html, card, aspect) {
  const articles = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? [];
  assert.equal(articles.length, 1);
  const article = articles[0], slots = [card.templateTitleHtml, card.templateIntroHtml, ...card.sections.map(section => section.html)].filter(Boolean);
  assert.equal(slots.join(''), card.html);
  let cursor = 0;
  for (const slot of slots) { const position = article.indexOf(slot, cursor); assert.ok(position >= cursor, 'Source slot missing or reordered.'); cursor = position + slot.length; }
  for (const slot of new Set(slots)) assert.equal(article.split(slot).length - 1, slots.filter(other => other === slot).length, 'Source slot duplicated.');
  assert.ok(article.includes(`data-template="${card.metadata.template}" data-template-aspect="${aspect}"`));
  if (card.image) {
    assert.equal((article.match(/<img\b/g) ?? []).length, 1);
    assert.ok(article.includes(`src="${card.image.dataUrl}"`), 'Image bytes changed in HTML.');
    assert.ok(article.includes(`width="${card.image.width}" height="${card.image.height}" alt="${escapeHtml(card.metadata.alt)}"`));
    assert.equal(article.split(`<figcaption>${escapeHtml(card.metadata.caption)}</figcaption>`).length - 1, 1);
  }
  for (const [field, className] of [['eyebrow','card-eyebrow'],['source','card-source'],['metric','statistic-value'],['label','statistic-label']]) if (card.metadata[field]) assert.equal(article.split(`class="${className}">${escapeHtml(card.metadata[field])}<`).length - 1, 1, `Missing/duplicated ${field}.`);
}

/** Runs only inside the real page during authorized validation. */
export function measureAspectMobile() {
  return [...document.querySelectorAll('.card')].map(card => {
    const rect = card.getBoundingClientRect(), scale = rect.width / card.offsetWidth;
    const hasText = element => element.textContent.trim();
    // Include nested spans/strong/em, not just their parents: nested em multipliers
    // must not evade the body/notes floor. Headers are hierarchy, not body text.
    const bodyRoots = [...card.querySelectorAll('.template-intro p,.template-intro li,.template-section p,.template-section li,.template-section blockquote,.template-metric .statistic-label,th,td,pre,code')].filter(hasText);
    const noteRoots = [...card.querySelectorAll('.card-source,.card-eyebrow,.brand-name,.footer-text,.card-index,figcaption')].filter(hasText);
    const descendants = roots => [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll('*')]))].filter(hasText);
    const unsupportedTransformLonghand = css => ['rotate','translate'].some(property => css[property] && css[property] !== 'none');
    const type = element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      const fontSize = parseFloat(style.fontSize); let visible = rect.width > 0 && rect.height > 0, nestedTransform = false;
      for (let node = element; node; node = node.parentElement) {
        const ancestor = getComputedStyle(node);
        if (unsupportedTransformLonghand(ancestor)) nestedTransform = true;
        if (node === card) break; // The expected card transform alone establishes scale.
        if (ancestor.display === 'none' || ['hidden','collapse'].includes(ancestor.visibility) || Number(ancestor.opacity) === 0) visible = false;
        if ((ancestor.transform && ancestor.transform !== 'none') || (ancestor.scale && !['none','1'].includes(ancestor.scale)) || (ancestor.zoom && !['normal','1'].includes(String(ancestor.zoom)))) nestedTransform = true;
      }
      return { selector: element.className || element.tagName.toLowerCase(), fontSize, effectiveSize: fontSize * scale, fontFamily: style.fontFamily, lineHeight: style.lineHeight, visible, nestedTransform };
    };
    return { template: card.dataset.template, aspect: card.dataset.templateAspect, cardWidth: rect.width, cardHeight: rect.height, canvasWidth: card.offsetWidth, canvasHeight: card.offsetHeight, scale, counter: card.querySelector('.card-index')?.textContent, images: [...card.querySelectorAll('.card-image')].map(image => {
      const style = getComputedStyle(image), rect = image.getBoundingClientRect();
      // Chromium's UA style gives img overflow:clip. That is a clipping
      // boundary, not proof that any source pixel is lost. Compute the actual
      // contain-painted object (which may be letterboxed inside the img box),
      // then compare it with each rectangular clip through the card itself.
      // All rectangles are in the same viewport coordinates after card scaling.
      const tolerance = scale + .01; // one source CSS pixel, plus float rounding
      const issues = [], clips = [];
      const px = value => value ? parseFloat(value) : 0;
      const box = (node, edge = 'padding-box') => {
        const r = node.getBoundingClientRect(), css = getComputedStyle(node);
        const border = ['Left','Top','Right','Bottom'].map(side => px(css[`border${side}Width`]) * scale);
        const padding = ['Left','Top','Right','Bottom'].map(side => px(css[`padding${side}`]) * scale);
        const insets = edge === 'border-box' ? [0,0,0,0] : edge === 'content-box' ? border.map((n,i) => n + padding[i]) : border;
        const result = { left: r.left + insets[0], top: r.top + insets[1], right: r.right - insets[2], bottom: r.bottom - insets[3] };
        // A scrollport excludes any actual scrollbar. Integer DOM metrics may
        // round by one CSS pixel, covered by the same bounded tolerance above.
        if (edge === 'padding-box' && Number.isFinite(node.clientWidth) && Number.isFinite(node.offsetWidth)) {
          const extra = node.offsetWidth - node.clientWidth - (border[0] + border[2]) / scale;
          if (extra > 1) { const left = Math.max(0, node.clientLeft - border[0] / scale) * scale; result.left += left; result.right -= extra * scale - left; }
        }
        if (edge === 'padding-box' && Number.isFinite(node.clientHeight) && Number.isFinite(node.offsetHeight)) {
          const extra = node.offsetHeight - node.clientHeight - (border[1] + border[3]) / scale;
          if (extra > 1) { const top = Math.max(0, node.clientTop - border[1] / scale) * scale; result.top += top; result.bottom -= extra * scale - top; }
        }
        result.width = result.right - result.left; result.height = result.bottom - result.top;
        if (!Object.values(result).every(Number.isFinite) || result.width <= 0 || result.height <= 0) issues.push('invalid-box-geometry');
        return result;
      };
      const contentBox = box(image, 'content-box');
      const fit = Math.min(contentBox.width / image.naturalWidth, contentBox.height / image.naturalHeight);
      const paintedWidth = image.naturalWidth * fit, paintedHeight = image.naturalHeight * fit;
      const position = (style.objectPosition || '50% 50%').trim().split(/\s+/);
      const offset = (value, spare, axis) => {
        const keyword = { left:'0%', top:'0%', center:'50%', right:'100%', bottom:'100%' }[value];
        value = keyword ?? value;
        if (/^-?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(value)) return spare * parseFloat(value) / 100;
        if (/^-?(?:\d+(?:\.\d*)?|\.\d+)px$/.test(value)) return parseFloat(value) * scale;
        issues.push(`unsupported-object-position-${axis}`); return 0;
      };
      if (position.length !== 2) issues.push('unsupported-object-position');
      const left = contentBox.left + offset(position[0], contentBox.width - paintedWidth, 'x');
      const top = contentBox.top + offset(position[1], contentBox.height - paintedHeight, 'y');
      const painted = { left, top, width: paintedWidth, height: paintedHeight, right: left + paintedWidth, bottom: top + paintedHeight };
      if (!Object.values(painted).every(Number.isFinite) || painted.width <= 0 || painted.height <= 0) issues.push('invalid-painted-geometry');
      const check = (boundary, x, y, selector, overflowX, overflowY) => {
        const clipsX = x && (painted.left < boundary.left - tolerance || painted.right > boundary.right + tolerance);
        const clipsY = y && (painted.top < boundary.top - tolerance || painted.bottom > boundary.bottom + tolerance);
        clips.push({ selector, overflowX, overflowY, boundary, clipsX, clipsY });
      };
      // Even contain can crop if object-position moves the painted object out.
      check(contentBox, true, true, 'image-content-box', style.overflowX, style.overflowY);
      for (let node = image; node; node = node.parentElement) {
        const css = getComputedStyle(node), selector = node.className || node.tagName.toLowerCase();
        // These can change or suppress paint independently of overflow/transform.
        // Their geometry is unsupported: retain evidence and fail closed.
        if ((css.contain || 'none').split(/\s+/).some(value => ['paint','content','strict'].includes(value))) issues.push(`unsupported-paint-containment:${selector}`);
        if (css.contentVisibility && css.contentVisibility !== 'visible') issues.push(`unsupported-content-visibility:${selector}`);
        if (unsupportedTransformLonghand(css)) issues.push(`unsupported-transform-longhand:${selector}`);
        if ((css.clipPath && css.clipPath !== 'none') || (css.clip && css.clip !== 'auto') || (css.maskImage && css.maskImage !== 'none')) issues.push(`unsupported-shaped-clip:${selector}`);
        const x = ['hidden','clip','auto','scroll'].includes(css.overflowX), y = ['hidden','clip','auto','scroll'].includes(css.overflowY);
        if (x || y) {
          if (['TopLeft','TopRight','BottomLeft','BottomRight'].some(corner => /[1-9]/.test(css[`border${corner}Radius`] || '0px'))) issues.push(`unsupported-rounded-clip:${selector}`);
          let edge = 'padding-box', margin = 0;
          if (css.overflowX === 'clip' || css.overflowY === 'clip') {
            const terms = (css.overflowClipMargin || '0px').trim().split(/\s+/);
            const edgeTerm = terms.find(value => ['content-box','padding-box','border-box'].includes(value));
            if (edgeTerm) edge = edgeTerm;
            const length = terms.find(value => /^(?:\d+(?:\.\d*)?|\.\d+)px$/.test(value));
            if (length) margin = parseFloat(length) * scale;
            if (terms.some(value => value !== edgeTerm && value !== length)) issues.push(`unsupported-clip-margin:${selector}`);
          }
          // overflow-clip-margin affects only axes with overflow:clip, not hidden.
          const paddingBox = box(node), clipBox = box(node, edge);
          const boundary = {
            left: css.overflowX === 'clip' ? clipBox.left - margin : paddingBox.left,
            right: css.overflowX === 'clip' ? clipBox.right + margin : paddingBox.right,
            top: css.overflowY === 'clip' ? clipBox.top - margin : paddingBox.top,
            bottom: css.overflowY === 'clip' ? clipBox.bottom + margin : paddingBox.bottom
          };
          check(boundary, x, y, selector, css.overflowX, css.overflowY);
        }
        if (node === card) break;
      }
      const clipped = clips.some(clip => clip.clipsX || clip.clipsY);
      return { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, complete: image.complete, width: rect.width, height: rect.height, objectFit: style.objectFit, clipped,
        geometry: { status: issues.length ? 'unverified' : 'verified', tolerance, objectPosition: style.objectPosition, contentBox, painted, clips, issues }, ...type(image) };
    }), body: descendants(bodyRoots).map(type), notes: descendants(noteRoots).map(type) };
  });
}

export function assertAspectMobile(audit, item, viewportWidth) {
  assert.equal(audit.length, 1);
  const card = audit[0], [width, height] = item.dimensions;
  assert.equal(card.template, item.template); assert.equal(card.aspect, item.aspect); assert.equal(card.counter, '1 / 1');
  assert.equal(card.canvasWidth, width); assert.equal(card.canvasHeight, height);
  assert.ok(Math.abs(card.cardWidth - (viewportWidth - 24)) < 1, 'Actual inner card width changed; explicitly review the preview-inset contract.');
  assert.ok(Math.abs(card.scale - card.cardWidth / width) < 1e-6);
  assert.ok(Math.abs(card.cardHeight - height * card.scale) < 1);
  assert.equal((card.images ?? []).length, item.assets?.length ?? 0, 'Declared image must remain visible.');
  for (const [index, image] of (card.images ?? []).entries()) {
    assert.deepEqual([image.naturalWidth, image.naturalHeight], item.assets[index].dimensions);
    assert.equal(image.complete, true); assert.ok(image.width > 0 && image.height > 0);
    assert.equal(image.objectFit, 'contain');
    assert.equal(image.geometry?.status, 'verified', `Cannot verify full-frame image geometry: ${JSON.stringify(image.geometry?.issues ?? [])}`);
    assert.ok(Number.isFinite(image.geometry.painted.width) && image.geometry.painted.width > 0 && Number.isFinite(image.geometry.painted.height) && image.geometry.painted.height > 0);
    assert.ok(Math.abs(image.geometry.painted.width / image.geometry.painted.height - image.naturalWidth / image.naturalHeight) < 1e-6, 'Painted image must preserve source proportions.');
    assert.ok(Array.isArray(image.geometry.clips) && image.geometry.clips.length, 'Image clip-boundary evidence is required.');
    assert.equal(image.clipped, image.geometry.clips.some(clip => clip.clipsX || clip.clipsY), 'Image clipping summary disagrees with its geometry.');
    assert.equal(image.clipped, false, `Painted image crosses a clipping boundary: ${JSON.stringify(image.geometry.clips.filter(clip => clip.clipsX || clip.clipsY))}`);
    assert.equal(image.visible, true); assert.equal(image.nestedTransform, false);
  }
  assert.ok(card.body.length && card.notes.length, 'Both body and note text must be measured.');
  for (const [name, types, ratio, mobileFloor] of [['body', card.body, .043, 14], ['notes', card.notes, .0335, 11]]) for (const type of types) {
    assert.equal(type.visible, true, `${name} text is hidden in the actual preview.`);
    assert.equal(type.nestedTransform, false, `${name} has unexpected nested transform/zoom; card scaling alone cannot establish its effective size.`);
    assert.ok(Number.isFinite(type.fontSize) && type.fontSize >= ratio * width - .05, `${name} fell below its canvas-relative floor.`);
    assert.ok(Number.isFinite(type.effectiveSize) && type.effectiveSize >= mobileFloor - .05, `${name} fell below its actual mobile floor.`);
    assert.ok(Math.abs(type.effectiveSize - type.fontSize * card.scale) < .05);
  }
}

const pngSize = bytes => { assert.ok(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Missing real PNG header.'); return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]; };

/** Dependencies are isolated-test seams, never alternate runtime rendering engines. */
export async function validateAspects(options = {}, dependencies = {}) {
  const repository = path.resolve(options.repository ?? ROOT);
  const outputRoot = path.resolve(options.outputRoot ?? path.join(repository, 'validation/aspects'));
  const runCommand = dependencies.runCommand ?? ((command, args) => exec(command, args, { cwd: repository, timeout: 20000, maxBuffer: 1024 * 1024 }));
  const exportDeck = dependencies.exportCards ?? exportCards;
  const acquire = dependencies.openRenderer ?? openRenderer;
  const close = dependencies.closeBrowser ?? closeBrowser;
  const checkPdf = dependencies.inspectPdf ?? inspectPdf;
  const mobileTimeoutMs = options.mobileTimeoutMs ?? 30000;
  assert.ok(Number.isInteger(mobileTimeoutMs) && mobileTimeoutMs >= 1 && mobileTimeoutMs <= 30000);
  const inventory = await readFile(path.join(repository, 'examples/aspects/validation-plan.json'));
  const plan = validateAspectPlan(JSON.parse(inventory));
  const revision = (await runCommand('git', ['rev-parse', 'HEAD'])).stdout.trim();
  assert.match(revision, /^[a-f0-9]{40}$/i, 'Need an exact committed revision.');
  assert.equal((await runCommand('git', ['status', '--porcelain', '--untracked-files=normal'])).stdout.trim(), '', 'Run from a clean exact-commit checkout; validation/ is ignored.');
  if (process.env.MD2CARD_SKIP_BROWSER === '1' && !dependencies.exportCards) throw codeError('ASPECT_BROWSER_DISABLED', 'Real aspect validation is disabled by MD2CARD_SKIP_BROWSER. Do not bypass a known denial.');
  await mkdir(outputRoot, { recursive: true });
  assert.equal((await readdir(outputRoot)).length, 0, 'Use a fresh empty output directory; never mix runs or overwrite evidence.');
  const summary = { schemaVersion: 2, revision, inventoryBaseRevision: plan.baseRevision, inventorySha256: hash(inventory), status: 'running', visualReview: 'not-performed', results: [], errors: [], sourceHashes: {} };
  for (const file of ['scripts/validate-aspects.mjs','scripts/typography.mjs','scripts/assets.mjs','scripts/markdown.mjs','scripts/templates.mjs','scripts/document.mjs','scripts/render.mjs','scripts/qa.mjs','assets/themes.css','assets/layouts.css','assets/templates.css']) summary.sourceHashes[file] = hash(await readFile(path.join(repository, file)));
  let browserBlocked;
  for (const [index, item] of plan.cases.entries()) {
    const id = `${String(index + 1).padStart(2, '0')}-${item.template}-${item.scope}-${item.aspect}`;
    const out = path.join(outputRoot, id);
    const record = { id, template: item.template, scope: item.scope, aspect: item.aspect, input: item.input, inputSha256: item.inputSha256, ...(item.assets ? { assets: item.assets } : {}), expected: item.expected, status: 'pending', actualOutcome: 'not-run', visualReview: 'not-performed', artifacts: [], mobile: [], errors: [] };
    summary.results.push(record);
    const problem = (error, phase) => { const detail = { id, phase, code: error.code ?? 'ASPECT_VALIDATION_FAILED', message: error.message, ...(error.details?.cleanupFailures ? { cleanupFailures: error.details.cleanupFailures } : {}) }; record.errors.push(detail); summary.errors.push(detail); if (unsafeToRetry(error) || phase === 'browser-acquire') browserBlocked = detail; };
    if (browserBlocked && item.expected !== REFUSAL) { problem(codeError('ASPECT_BROWSER_BLOCKED', `Not attempted after ${browserBlocked.code} in ${browserBlocked.id}; no launch retry or alternate engine.`), 'blocked'); record.status = 'blocked'; continue; }
    let renderer, mobileTimer, phase = 'source';
    try {
      const sourceFile = path.join(repository, item.input), card = await loadAspectCard(repository, item);
      const argv = [sourceFile, '--out', out, '--paginate', 'manual', ...(item.aspect === 'custom' ? ['--width', '1200', '--height', '800'] : ['--size', item.aspect]), '--scale', '1', '--format', 'all', '--strict', '--preview', ...(item.assetRoot ? ['--asset-root', path.join(repository, item.assetRoot)] : [])];
      record.command = ['node', 'scripts/render.mjs', ...argv];
      phase = 'export';
      let manifest;
      try {
        if (item.expected === REFUSAL) {
          // Exercise the actual exporter with fail-closed source-only seams: an
          // unsupported ratio must fail BEFORE environment/browser acquisition.
          const forbidden = async () => { throw codeError('ASPECT_REFUSAL_ACQUIRED_RENDERER', 'Unsupported aspect reached preflight or browser acquisition.'); };
          manifest = await exportCards(parseOptions(argv), { inspectEnvironment: forbidden, openRenderer: forbidden });
        } else manifest = await exportDeck(parseOptions(argv));
      }
      catch (error) {
        // The renderer can preserve CONTENT_OVERFLOW while attaching an
        // uncertain close-browser failure. Never call that a safe expected
        // outcome or retry browser acquisition for a later case.
        if (item.expected === REFUSAL) {
          assert.equal(error.code, 'TEMPLATE_ASPECT_UNSUPPORTED');
          const outputFiles = await readdir(out).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
          assert.deepEqual(outputFiles, [], 'Unsupported ratios must not publish render artifacts.');
          assert.equal(hash(await readFile(sourceFile)), item.inputSha256);
          record.status = 'expected-refusal'; record.actualOutcome = 'refused-before-renderer'; record.refusalCode = error.code;
          continue;
        }
        if (unsafeToRetry(error) || error.code !== 'CONTENT_OVERFLOW') throw error;
        record.actualOutcome = 'overflow'; phase = 'overflow-evidence';
        assert.deepEqual(await readdir(out), ['overflow.json'], 'Overflow must publish only its report, not partial exports.');
        const bytes = await readFile(path.join(out, 'overflow.json')), report = JSON.parse(bytes);
        assert.equal(report.code, 'CONTENT_OVERFLOW'); assert.equal(report.status, 'overflow'); assert.equal(report.input, path.basename(sourceFile));
        assert.deepEqual(report.dimensions, SIZES[item.aspect]); assert.equal(report.cards.length, 1); assert.equal(report.cards[0].index, 1); assert.deepEqual(report.cards[0].sourceLines, card.sourceLines);
        assert.ok(report.cards.some(result => result.screen.overflow.length || result.print.overflow.length));
        record.artifacts.push({ file: 'overflow.json', bytes: bytes.length, sha256: hash(bytes) });
        assert.equal(hash(await readFile(sourceFile)), item.inputSha256);
        if (item.expected === EXPECTATIONS[0]) throw codeError('ASPECT_CANDIDATE_OVERFLOW', 'Short aspect candidate overflowed. Keep the original input and review layout/capacity; do not silently substitute text.');
        record.status = item.expected === EXPECTATIONS[2] ? 'expected-overflow' : 'allowed-overflow';
        continue;
      }
      assert.notEqual(item.expected, REFUSAL, 'Unsupported aspect unexpectedly exported.');
      record.actualOutcome = 'exported'; phase = 'artifacts';
      if (item.assets?.length) {
        assert.equal(manifest.assets.length, 1);
        assert.equal(manifest.assets[0].hash, item.assets[0].sha256);
        assert.deepEqual([manifest.assets[0].width, manifest.assets[0].height], item.assets[0].dimensions);
      }
      assert.equal(manifest.inputSha256, item.inputSha256); assert.equal(manifest.cardCount, 1); assert.equal(manifest.pagination.mode, 'manual');
      assert.deepEqual(manifest.dimensions, SIZES[item.aspect]); assert.equal(manifest.cards.length, 1); assert.equal(manifest.cards[0].template, item.template); assert.equal(manifest.cards[0].aspect, item.aspect);
      assert.equal(manifest.cards[0].sourceSha256, hash(card.source)); assert.deepEqual(manifest.qa.overflow, { screen: 'pass', print: 'pass' });
      assert.equal(manifest.qa.pdf.status, 'pass'); assert.equal(manifest.qa.pdf.searchable, true); assert.equal(manifest.qa.pdf.pageCount, 1); assert.equal(manifest.qa.visualReview, 'not-performed');
      assert.deepEqual(manifest.artifacts.map(artifact => artifact.file).sort(), ['card-001.png','cards.html','cards.pdf','preview.html']);
      assert.deepEqual(Object.keys(manifest.styleSha256).sort(), ['layouts','templates','themes']);
      for (const [name, sha256] of Object.entries(manifest.styleSha256)) assert.equal(sha256, summary.sourceHashes[`assets/${name}.css`]);
      for (const artifact of manifest.artifacts) {
        assert.equal(path.basename(artifact.file), artifact.file);
        const bytes = await readFile(path.join(out, artifact.file)); assert.equal(bytes.length, artifact.bytes); assert.equal(hash(bytes), artifact.sha256);
        if (artifact.file.endsWith('.png')) assert.deepEqual(pngSize(bytes), item.dimensions);
        record.artifacts.push({ ...artifact });
      }
      const manifestBytes = await readFile(path.join(out, 'manifest.json')); assert.deepEqual(JSON.parse(manifestBytes), manifest);
      record.manifestSha256 = hash(manifestBytes); record.versions = manifest.versions;
      const html = await readFile(path.join(out, 'cards.html'), 'utf8'), preview = await readFile(path.join(out, 'preview.html'), 'utf8');
      assertAspectSourceHtml(html, card, item.aspect); assertAspectSourceHtml(preview, card, item.aspect);
      phase = 'pdf';
      const expectedText = aspectVisibleSegments(card);
      // -layout extraction can interleave independent columns. Use the existing
      // inspector for native/searchable/page checks, then verify EVERY original
      // segment against per-page logical (-raw) text, not one convenient marker.
      record.pdf = await checkPdf(path.join(out, 'cards.pdf'), { expectedPages: 1, expectedText: expectedText.join('\n'), requireTools: true });
      assert.equal(record.pdf.status, 'pass'); assert.equal(record.pdf.pageCount, 1); assert.equal(record.pdf.searchable, true);
      const { stdout: rawPdfText } = await runCommand('pdftotext', ['-f','1','-l','1','-enc','UTF-8','-raw',path.join(out, 'cards.pdf'),'-']);
      const rawFile = 'pdf-page-001-raw.txt'; await writeFile(path.join(out, rawFile), rawPdfText);
      record.pdf.sourceCheck = { extraction: 'per-page-raw', expectedSegments: expectedText.length, file: rawFile, sha256: hash(rawPdfText) };
      const missing = expectedText.flatMap((segment, index) => compact(rawPdfText).includes(compact(segment)) ? [] : [index]);
      assert.deepEqual(missing, [], 'Native PDF logical text is missing original source/metadata segments.');
      record.pdf.sourceCheck.status = 'pass';
      phase = 'browser-acquire';
      renderer = await acquire({ ...SIZES[item.aspect], scale: 1, timeoutMs: 30000 });
      phase = 'mobile';
      const mobileDeadline = new Promise((_, reject) => { mobileTimer = setTimeout(() => reject(codeError('ASPECT_MOBILE_TIMEOUT', 'Mobile browser audit deadline exceeded; shutdown must be confirmed and later browser cases stay blocked.')), mobileTimeoutMs); });
      void mobileDeadline.catch(() => {});
      const wait = operation => Promise.race([operation, mobileDeadline]).catch(error => {
        if (unsafeToRetry(error)) throw error;
        const wrapped = codeError('ASPECT_BROWSER_OPERATION_FAILED', `Mobile browser operation failed: ${error.message}`);
        wrapped.details = { ...error.details, originalCode: error.code ?? null }; throw wrapped;
      });
      await wait(renderer.page.emulateMedia({ media: 'screen' }));
      await wait(renderer.page.setContent(preview, { waitUntil: 'load', timeout: mobileTimeoutMs }));
      await wait(renderer.page.evaluate(() => document.fonts.ready));
      for (const viewportWidth of [375, 390]) {
        try {
          await wait(renderer.page.setViewportSize({ width: viewportWidth, height: 900 }));
          const audit = await wait(renderer.page.evaluate(measureAspectMobile));
          const entry = { viewportWidth, audit }; record.mobile.push(entry);
          const file = `card-001-mobile-${viewportWidth}.png`;
          await wait(renderer.page.locator('.card').screenshot({ path: path.join(out, file), scale: 'css', animations: 'disabled', timeout: mobileTimeoutMs }));
          const bytes = await readFile(path.join(out, file)); entry.file = file; entry.bytes = bytes.length; entry.sha256 = hash(bytes); entry.pngDimensions = pngSize(bytes);
          assertAspectMobile(audit, item, viewportWidth);
          assert.ok(Math.abs(entry.pngDimensions[0] - audit[0].cardWidth) <= 1 && Math.abs(entry.pngDimensions[1] - audit[0].cardHeight) <= 1);
        } catch (error) { problem(error, `mobile-${viewportWidth}`); if (unsafeToRetry(error)) break; }
      }
      phase = 'final'; assert.equal(hash(await readFile(sourceFile)), item.inputSha256, 'Source changed during export.');
      if (item.expected === EXPECTATIONS[2]) problem(codeError('ASPECT_UNEXPECTED_LONG_FIT', 'Long atomic pressure source unexpectedly exported. Investigate measured containment; this is not accepted fit evidence.'), phase);
    } catch (error) { problem(error, phase); }
    finally {
      clearTimeout(mobileTimer);
      if (renderer) try { await close(renderer.browser); } catch (error) { problem(error, 'cleanup'); }
      if (record.errors.length) record.status = 'fail';
      else if (record.actualOutcome === 'exported') record.status = 'exported-not-visually-reviewed';
    }
  }
  summary.status = summary.errors.length ? 'fail' : 'pass';
  await writeFile(path.join(outputRoot, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

export const ASPECT_USAGE = 'node scripts/validate-aspects.mjs --allow-browser [--out validation/aspects]';
export function parseAspectOptions(args) {
  const options = { allowBrowser: false }; const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (seen.has(arg)) throw new Error(`Duplicate option: ${arg}`);
    seen.add(arg);
    if (arg === '--help') options.help = true;
    else if (arg === '--allow-browser') options.allowBrowser = true;
    else if (arg === '--out') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing value: --out');
      options.outputRoot = path.resolve(value);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.help && !options.allowBrowser) throw new Error('Browser execution requires --allow-browser and an authorized environment. No runtime was entered.');
  return options;
}
export async function runAspectCli(args, { validate = validateAspects, log = console.log, error = console.error } = {}) {
  try {
    const options = parseAspectOptions(args);
    if (options.help) { log(ASPECT_USAGE); return 0; }
    const summary = await validate(options);
    log(`Recorded ${summary.results.length} aspect cases; ${summary.errors.length} error(s). Human visual acceptance remains pending.`);
    return summary.errors.length ? 1 : 0;
  } catch (failure) { error(failure.message); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runAspectCli(process.argv.slice(2));
}
