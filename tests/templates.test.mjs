import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TEMPLATES, getTemplate, validateTemplateMetadata } from '../scripts/templates.mjs';
import { renderCards } from '../scripts/markdown.mjs';
import { parseSemanticDocument } from '../scripts/semantic.mjs';
import { buildDocument, SIZES } from '../scripts/document.mjs';
import { parseOptions, exportCards } from '../scripts/render.mjs';
const css = await readFile(new URL('../assets/templates.css', import.meta.url), 'utf8');
const render = source => buildDocument(renderCards(source), SIZES.portrait, '', '', css);

test('registry counts composed designs with complete immutable contracts', () => {
  assert.equal(new Set(TEMPLATES.map(t => t.id)).size, TEMPLATES.length);
  assert.equal(new Set(TEMPLATES.map(t => t.composition)).size, TEMPLATES.length);
  for (const template of TEMPLATES) {
    for (const key of ['name','family','layout','composition','purpose','image','structure','unsuitable','example','typography','spacing','provenance']) assert.ok(template[key], `${template.id}: ${key}`);
    assert.ok(Object.isFrozen(template.typography));
    assert.ok(template.typography.bodyWidthRatio * 351 >= 14);
    assert.ok(template.typography.noteWidthRatio * 351 >= 11);
    assert.match(css, new RegExp(`\\.template-${template.id}\\b`));
  }
});

test('template IDs, densities, layouts and aspect ratios are strict allowlists', () => {
  for (const id of ['T99', '../T01', 'T01" onclick="bad', '__proto__', '']) assert.throws(() => getTemplate(id), { code: 'INVALID_TEMPLATE' });
  assert.throws(() => validateTemplateMetadata({template:'T01',layout:'steps'}), { code:'TEMPLATE_LAYOUT_MISMATCH' });
  assert.throws(() => validateTemplateMetadata({template:'T01',density:'tiny'}), { code:'INVALID_TEMPLATE' });
  assert.throws(() => validateTemplateMetadata({density:'compact'}), { code:'INVALID_TEMPLATE' });
  assert.throws(() => validateTemplateMetadata({template:'T01',image:'photo.png'}), { code:'TEMPLATE_IMAGE_UNSUPPORTED' });
  assert.throws(() => validateTemplateMetadata({template:'T01'}, SIZES.square), { code:'TEMPLATE_ASPECT_UNSUPPORTED' });
  assert.throws(() => renderCards('<!-- card: {"template":"T01","style":"color:red"} -->\n# Text'), { code:'INVALID_METADATA' });
});

test('template metadata selects only its contracted layout and never changes legacy defaults', () => {
  const [card] = renderCards('<!-- card: {"template":"T05","density":"compact"} -->\n# Checklist\n\n7. Check source.\n8. Keep limits.');
  assert.equal(card.metadata.layout, 'steps');
  assert.equal(card.metadata.density, 'compact');
  assert.match(card.templateIntroHtml, /<ol start="7">/);
  const html = buildDocument([card], SIZES.portrait, '', '', css);
  assert.match(html, /template-T05 family-swiss density-compact/);
  assert.equal(renderCards('# Legacy')[0].metadata.layout, 'explainer');
  assert.doesNotMatch(buildDocument(renderCards('# Legacy'), SIZES.portrait, '', ''), /data-template=/);
});

test('token slots preserve all source content once, including repeated H1 and later H1', () => {
  const body = '# Alpha\n# Beta\n\nOriginal **lead**.\n\n## Evidence\n\n> Quotation.\n\n# Later heading\n\nTail.\n\n## Limits\n\n- One\n- Two';
  const [card] = renderCards('<!-- card: {"template":"T01"} -->\n' + body);
  assert.equal(card.templateTitleHtml + card.templateIntroHtml + card.sections.map(s=>s.html).join(''), card.html);
  const html = render('<!-- card: {"template":"T01"} -->\n' + body).split('<main')[1];
  for (const text of ['Alpha','Beta','Original','Quotation.','Later heading','Tail.','Limits']) assert.equal(html.split(text).length - 1, 1, text);
  assert.match(card.templateTitleHtml, /<h1>Alpha<\/h1>\n<h1>Beta<\/h1>/);
});

test('templates preserve explicit partitions and reject unsupported automatic mode', () => {
  const source='<!-- card: {"template":"T17"} -->\n# First\n\nBody.\n\n===\n\n<!-- card: {"template":"T25"} -->\n# Second\n\n> Note.';
  assert.equal(renderCards(source).length,2);
  assert.throws(()=>parseSemanticDocument(source), {code:'PAGINATION_UNSUPPORTED_METADATA'});
  assert.throws(()=>parseOptions(['file.md','--template','T17','--paginate','auto']), {code:'PAGINATION_UNSUPPORTED_METADATA'});
});

test('unsafe strings cannot become template classes or executable markup', () => {
  assert.throws(()=>render('<!-- card: {"template":"T01</style><script>"} -->\n# Title'),{code:'INVALID_TEMPLATE'});
  const html=render('<!-- card: {"template":"T01","eyebrow":"<script>bad()</script>","source":"<img src=x>"} -->\n# <b>Title</b>\n\nText.');
  assert.doesNotMatch(html,/<script>|<img src=x>|<b>Title/);
  assert.match(html,/&lt;script&gt;/);
});

test('all delivered examples select their registered template and preserve full parser HTML', async () => {
  for (const template of TEMPLATES) {
    const source=await readFile(new URL('../'+template.example, import.meta.url),'utf8');
    const cards=renderCards(source);
    assert.equal(cards.length,1);
    assert.equal(cards[0].metadata.template,template.id);
    assert.equal(cards[0].templateTitleHtml+cards[0].templateIntroHtml+cards[0].sections.map(s=>s.html).join(''),cards[0].html);
    assert.match(buildDocument(cards,SIZES.portrait,'','',css),new RegExp(`data-template="${template.id}"`));
  }
});

test('density affects space only and nested typography has explicit mobile floors', () => {
  const densityRules=[...css.matchAll(/\.card\.template-card\.density-[^{]+\{([^}]+)\}/g)].map(m=>m[1]);
  assert.equal(densityRules.length,2);
  for(const rule of densityRules) assert.doesNotMatch(rule,/font|text-size|scale|zoom/);
  assert.match(css,/\.card\.template-card pre \{ font-size: 1em/);
  assert.match(css,/\.card\.template-card table \{ font-size: 1em/);
});

test('CLI template options are discoverable and reject unknown choices before rendering', () => {
  assert.deepEqual(parseOptions(['--list-templates']),{listTemplates:true});
  assert.equal(parseOptions(['file.md','--template','T01']).template,'T01');
  assert.throws(()=>parseOptions(['file.md','--template','T00']),{code:'INVALID_TEMPLATE'});
});


test('public metadata and CLI reject empty tokens and unsupported meaningful fields', () => {
  for (const metadata of [{template:''},{template:'T01',density:''},{density:''}]) {
    assert.throws(()=>renderCards(`<!-- card: ${JSON.stringify(metadata)} -->\n# Title`),{code:'INVALID_TEMPLATE'});
  }
  assert.throws(()=>parseOptions(['file.md','--template','']),{code:'INVALID_TEMPLATE'});
  for (const field of ['metric','label','alt','caption']) {
    assert.throws(()=>renderCards(`<!-- card: ${JSON.stringify({template:'T01',[field]:'DO NOT LOSE'})} -->\n# Title`),{code:'TEMPLATE_METADATA_UNSUPPORTED'});
  }
});


test('composed templates never inherit legacy theme treatments', () => {
  const card=renderCards('<!-- card: {"template":"T01"} -->\n# Title\n\n`Code`')[0];
  for(const theme of ['editorial','minimal','midnight','notebook','bold']) {
    const html=buildDocument([card],{...SIZES.portrait,theme},'','',css);
    assert.doesNotMatch(html,new RegExp(`class="card[^"\n]*theme-${theme}`));
  }
});


test('large list counters are rejected before they can overlap a fixed number rail', () => {
  for(const start of [7,98]) assert.doesNotThrow(()=>render(`<!-- card: {"template":"T05"} -->\n# List\n\n${start}. First.\n${start+1}. Second.`));
  for(const start of [99,100,123456789]) assert.throws(()=>render(`<!-- card: {"template":"T05"} -->\n# List\n\n${start}. First.\n${start+1}. Second.`),{code:'TEMPLATE_LIST_RANGE'});
  const [legacy]=renderCards('<!-- card: {"layout":"steps"} -->\n# List\n\n123456789. First.');
  assert.match(legacy.html,/<ol start="123456789">/);
});
