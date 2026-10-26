import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { buildGalleryModel, ROOT } from '../scripts/build-template-gallery.mjs';
import { buildTemplateDocs, renderCatalog, renderShowcase } from '../scripts/build-template-catalog.mjs';

const model = await buildGalleryModel();
const md = new MarkdownIt({ html: true });
const tokensOf = tokens => tokens.flatMap(token => [token, ...tokensOf(token.children ?? [])]);

test('published documentation matches the verified registry and every template has one preview', async () => {
  await buildTemplateDocs({ check: true });
  const catalog = renderCatalog(model);
  const rendered = md.render(catalog);
  assert.match(rendered, /<strong>用途：<\/strong>/);
  assert.doesNotMatch(rendered, /\*\*(用途|图片|画幅)：\*\*/);
  const images = tokensOf(md.parse(catalog, {})).filter(token => token.type === 'image');
  assert.equal(images.length, model.accepted.length);
  for (const item of model.items) {
    assert.equal(catalog.split(`<a name="${item.id.toLowerCase()}"></a>`).length, 2);
    assert.equal(images.filter(token => token.attrGet('src') === `../${item.preview.path}`).length, 1);
  }
  const showcase = renderShowcase(model);
  const selected = tokensOf(md.parse(showcase, {})).filter(token => token.type === 'image')
    .map(token => model.items.find(item => item.preview?.path === token.attrGet('src')));
  assert.equal(selected.length, 12);
  assert.equal(new Set(selected.map(item => item.family)).size, model.families.length);
});

test('missing current preview stays explicit instead of borrowing historical evidence', () => {
  const pending = structuredClone(model);
  pending.items[0].preview = null;
  for (const result of [renderCatalog(pending), renderShowcase(pending)]) {
    assert.match(result, /暂无已绑定预览/);
    assert.ok(!result.includes(model.items[0].preview.path));
  }
  assert.throws(() => renderShowcase({ ...model, items: model.items.slice(1) }), /T01 is missing/);
});

test('new reader paths contain no missing local links, images or Markdown anchors', async () => {
  const files = ['README.md', 'docs/TEMPLATE_CATALOG.md', 'docs/SKILL_USAGE.md', 'docs/DOCUMENTATION.md'];
  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), 'utf8');
    for (const token of tokensOf(md.parse(source, {}))) {
      const href = token.attrGet('href') ?? token.attrGet('src');
      if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      const [relative, fragment] = href.split('#');
      const target = relative ? path.resolve(ROOT, path.dirname(file), decodeURIComponent(relative)) : path.join(ROOT, file);
      await assert.doesNotReject(access(target), `${file}: missing ${href}`);
      if (!fragment || !target.endsWith('.md')) continue;
      const targetSource = await readFile(target, 'utf8');
      const anchor = decodeURIComponent(fragment);
      const headings = [...targetSource.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => match[1].trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replaceAll(' ', '-'));
      assert.ok(headings.includes(anchor) || targetSource.includes(`<a name="${anchor}">`), `${file}: missing anchor ${href}`);
    }
  }
});
