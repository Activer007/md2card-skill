import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createCases, sourceCheck, runStress, checkExpectedFailure, auditMobile, authoredSegments, assertAuthoredSegments, auditPdfText, repository } from '../scripts/validate-visual-stress.mjs';
import { inspectImage } from '../scripts/assets.mjs';
import { parseCardMetadata, renderCards } from '../scripts/markdown.mjs';
import { parseOptions, exportCards } from '../scripts/render.mjs';
import { TEMPLATES, getTemplate, DENSITIES } from '../scripts/templates.mjs';
import { Md2CardError } from '../scripts/errors.mjs';
const read = file => readFile(path.join(repository, file));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function workspace(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'md2card-stress-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('bounded matrix preserves source and fits declared registry modes, not every input', async () => {
  const cases = await createCases();
  assert.equal(cases.length, 18);
  assert.equal(new Set(cases.map(item => item.id)).size, 18);
  assert.equal(TEMPLATES.length, 48);
  assert.equal(TEMPLATES.filter(item => item.acceptance || item.historicalAcceptance).length, 48);
  for (const item of cases) {
    if (item.template) {
      const template = getTemplate(item.template);
      assert.ok(template.aspects.includes('portrait'));
      assert.ok(DENSITIES.includes(item.density));
      if (item.metadata?.image) assert.equal(template.image, 'required');
    }
    if (item.expected === 'INVALID_ASSET') await assert.rejects(() => sourceCheck(item), { code: 'INVALID_ASSET' });
    else assert.equal((await sourceCheck(item)).cardCount, item.cards);
  }
  for (const group of ['same-short-source', 'same-long-source']) {
    const members = cases.filter(item => item.group === group);
    assert.deepEqual(members.map(item => item.density), DENSITIES);
    assert.equal(new Set(members.map(item => item.bodySha256)).size, 1);
    assert.equal(new Set(members.map(item => parseCardMetadata(item.source).source)).size, 1);
  }
  assert.equal(cases.filter(item => item.expected === 'CONTENT_OVERFLOW').length, 3);
});

test('medium fixtures retain nested list, long URL, Chinese comment and three-column table', async () => {
  const cases = await createCases();
  const html = id => renderCards(cases.find(item => item.id === id).source)[0].html;
  const nested = html('medium-nested-url');
  assert.equal((nested.match(/<ul>/g) ?? []).length, 3);
  assert.match(nested, /https:\/\/example\.invalid\/research\/long-path-for-source-preservation\/entry-2026\?language=zh-CN&amp;mode=original/);
  const code = html('medium-code');
  assert.match(code, /这一行是中文注释断行压力测试，不应被裁切或省略。/);
  assert.match(code, /<pre><code class="language-js">/);
  const table = html('medium-table');
  assert.equal((table.match(/<th>/g) ?? []).length, 3);
  assert.equal((table.match(/<td>/g) ?? []).length, 9);
});

test('Notebook masks heading backgrounds only, preserving ruling, type and explicit partitions', async () => {
  const css = (await read('assets/themes.css')).toString();
  const rule = css.match(/\.card\.theme-notebook \.card-content :is\(h1, h2, h3, h4, h5, h6\) \{([^}]+)\}/);
  assert.ok(rule);
  assert.equal(rule[1].trim(), 'background-color: var(--paper);');
  assert.match(css, /background-image: repeating-linear-gradient/);
  const item = (await createCases()).find(item => item.id === 'notebook-headings');
  const cards = renderCards(item.source);
  assert.equal(cards.length, 2);
  for (const level of [1, 2, 3, 4, 5, 6]) assert.match(cards.map(card => card.html).join(''), new RegExp(`<h${level}>`));
  assert.match(cards[0].html, /第二行仍属于原始标题/);
  assert.doesNotMatch(cards[0].html, /显式边界之后/);
  assert.match(cards[1].html, /显式边界之后/);
});

test('asset patterns and historical screenshots are pinned, not synthetic visual proof', async () => {
  const provenance = JSON.parse(await read('examples/visual-stress/assets/provenance.json'));
  for (const asset of provenance.assets) {
    const bytes = await read(`examples/visual-stress/assets/${asset.file}`);
    assert.equal(hash(bytes), asset.sha256);
    if (asset.type === 'intentional-invalid-signature') assert.throws(() => inspectImage(bytes), { code: 'INVALID_ASSET' });
    else { const size = inspectImage(bytes); assert.equal(size.width, asset.width); assert.equal(size.height, asset.height); assert.equal(Math.max(size.width, size.height) / Math.min(size.width, size.height), 20); }
  }
  const historic = JSON.parse(await read('docs/template-m1-provenance.json'));
  for (const record of historic.records) assert.equal(hash(await read(`docs/images/templates/${record.id}.png`)), record.png);
  const screenshot = (await createCases()).find(item => item.id === 'image-screenshot');
  assert.match(screenshot.source, /历史截图，非本轮导出/);
  assert.equal(screenshot.metadata.image, 'docs/images/templates/T17.png');
  // The reused transparent illustration is RGBA, not an opaque substitute.
  assert.equal((await read('examples/templates/assets/synthetic-olive-twig.png'))[25], 6);
});

test('--plan records every command and source hash without calling export or browser', async t => {
  const root = await workspace(t);
  const forbidden = () => { throw new Error('Browser/export must never run in plan mode'); };
  const result = await runStress({ plan: true, root }, { exportCards: forbidden, auditMobile: forbidden });
  assert.equal(result.status, 'source-checked-browser-pending');
  assert.equal(result.browser, 'not-run');
  assert.equal(result.visualReview, 'not-performed');
  assert.equal(result.errors.length, 0);
  assert.equal(result.results.length, 18);
  for (const item of result.results) {
    assert.equal(item.status, 'source-checked-browser-pending');
    assert.equal(item.manifest, null);
    assert.ok(item.command.includes('--strict') && item.command.includes('--preview'));
    assert.equal(hash(await readFile(item.command[2])), item.inputSha256);
  }
  const identity = JSON.parse(await readFile(path.join(root, 'source-files.json')));
  assert.equal(hash(JSON.stringify(identity.files)), result.sourceSha256);
  assert.ok(identity.files.some(item => item.file === 'scripts/validate-visual-stress.mjs'));
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'summary.json'))), JSON.parse(JSON.stringify(result)));
  await assert.rejects(() => runStress({ plan: true, root }), /Output is not empty/);
});

test('source asset faults reject before environment inspection and publish nothing', async t => {
  const root = await workspace(t);
  for (const item of (await createCases()).filter(item => item.expected === 'INVALID_ASSET')) {
    const input = path.join(root, `${item.id}.md`), out = path.join(root, item.id);
    await writeFile(input, item.source);
    const forbidden = () => { throw new Error('Source fault reached environment/browser'); };
    let failure;
    try { await exportCards(parseOptions([input, '--asset-root', repository, '--out', out, '--strict', '--preview']), { inspectEnvironment: forbidden, openRenderer: forbidden }); }
    catch (error) { failure = error; }
    await checkExpectedFailure(item, failure, out);
    await assert.rejects(() => readdir(out), { code: 'ENOENT' });
  }
});

test('a failed case cannot hide later failures, including expected-overflow cases', async t => {
  const root = await workspace(t), calls = [];
  const result = await runStress({ root }, {
    exportCards: async options => { calls.push(path.basename(options.out)); throw new Md2CardError('INJECTED_FAILURE', 'Source-only controlled failure; no browser was launched.'); },
    auditMobile: () => { throw new Error('Not reached'); }
  });
  assert.equal(calls.length, 18);
  assert.equal(result.results.length, 18);
  assert.equal(result.errors.length, 18);
  assert.equal(result.status, 'failed');
  assert.ok(result.results.every(item => item.status === 'failed'));
  assert.equal(JSON.parse(await readFile(path.join(root, 'summary.json'))).errors.length, 18);
});

test('expected boundaries require exact error, exit code and diagnostics-only publication', async t => {
  const root = await workspace(t), out = path.join(root, 'overflow');
  const item = { id: 'controlled-overflow', expected: 'CONTENT_OVERFLOW' };
  const error = new Md2CardError('CONTENT_OVERFLOW', 'Controlled source-only fault.', {}, 2);
  await assert.rejects(() => checkExpectedFailure(item, undefined, out), /export succeeded/);
  await assert.rejects(() => checkExpectedFailure(item, new Md2CardError('WRONG_CODE', 'Wrong'), out));
  await assert.rejects(() => checkExpectedFailure(item, new Md2CardError('CONTENT_OVERFLOW', 'Wrong exit'), out));
  await mkdir(out);
  await writeFile(path.join(out, 'overflow.json'), JSON.stringify({ code: 'CONTENT_OVERFLOW', cards: [{ index: 1 }] }));
  assert.match((await checkExpectedFailure(item, error, out)).sha256, /^[a-f0-9]{64}$/);
  await writeFile(path.join(out, 'clipped.png'), 'Not an image, deliberate leak sentinel');
  await assert.rejects(() => checkExpectedFailure(item, error, out), /never clipped assets/);
});

test('one unreadable fixture is reported without losing any other planned case', async t => {
  const root = await workspace(t);
  const cases = await createCases({ readFixture: async file => {
    if (file === 'examples/visual-stress/medium-code.md') throw Object.assign(new Error('Controlled missing fixture'), { code: 'ENOENT' });
    return (await read(file)).toString();
  } });
  assert.equal(cases.length, 18);
  const result = await runStress({ plan: true, root }, { createCases: () => cases });
  assert.equal(result.results.length, 18);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].id, 'medium-code');
  assert.equal(result.errors[0].code, 'ENOENT');
  assert.equal(result.results.at(-1).status, 'source-checked-browser-pending');
});

test('mobile audit timeout closes the fake renderer and preserves the primary failure', async t => {
  const out = await workspace(t); let closed = 0;
  await writeFile(path.join(out, 'cards.html'), 'Controlled test placeholder, not rendered HTML');
  await writeFile(path.join(out, 'preview.html'), 'Controlled test placeholder, not a rendered preview');
  const fake = { page: { setContent: async () => {}, evaluate: () => new Promise(() => {}) }, browser: { close: async () => { closed++; throw new Error('Controlled cleanup fault'); } } };
  await assert.rejects(() => auditMobile(out, {}, { timeoutMs: 10, openRenderer: async () => fake }), error => {
    assert.equal(error.code, 'MOBILE_AUDIT_TIMEOUT');
    assert.equal(error.details.cleanupFailure.code, 'BROWSER_CLEANUP_FAILED');
    return true;
  });
  assert.equal(closed, 1);
});

test('source-owned text covers metadata, full code, table cells and repeated source text', () => {
  const card = renderCards('<!-- card: {"template":"T18","eyebrow":"栏目","source":"出处"} -->\n# 标题\n\n重复段落。\n\n重复段落。\n\n```js\n// 完整中文注释\nconst value = "完整代码";\n```\n\n| A | B |\n|---|---|\n| 条件 | 原文 |')[0];
  const segments = authoredSegments(card);
  for (const value of ['标题', '栏目', '出处', '条件', '原文']) assert.ok(segments.includes(value));
  assert.ok(segments.includes('// 完整中文注释\nconst value = "完整代码";\n'));
  const complete = segments.join('\n');
  assert.doesNotThrow(() => assertAuthoredSegments(complete, segments, 'controlled output'));
  assert.throws(() => assertAuthoredSegments(complete.replace('完整中文注释', ''), segments, 'controlled output'), /missing source segment/);
  assert.throws(() => assertAuthoredSegments(complete.replace('重复段落。', ''), segments, 'controlled output'), /missing source segment/);
  assert.throws(() => assertAuthoredSegments(complete.replace('出处', ''), segments, 'controlled output'), /missing source segment/);
});

test('PDF coverage uses each raw page; layout text is inspection-only, not weakened coverage', async t => {
  const out = await workspace(t), calls = [];
  const source = { segments: [['左栏完整段落', '右栏完整段落', '1 / 2'], ['第二页完整文字', '2 / 2']] };
  const runner = async (command, args, options) => {
    calls.push(args); assert.equal(command, 'pdftotext'); assert.equal(options.timeout, 20000);
    const index = Number(args[1]) - 1;
    return { stdout: args.includes('-raw') ? source.segments[index].join('\n') : '左栏 右栏 交错，故意不适合完整段落匹配' };
  };
  const records = await auditPdfText(out, source, runner);
  assert.equal(records.length, 4);
  assert.equal(calls.filter(args => args.includes('-raw')).length, 2);
  assert.equal(calls.filter(args => args.includes('-layout')).length, 2);
  for (const record of records) assert.equal(hash(await readFile(path.join(out, record.file))), record.sha256);
  await assert.rejects(() => auditPdfText(out, source, async () => ({ stdout: '只有一条标记，缺少原文' })), /missing source segment/);
});
