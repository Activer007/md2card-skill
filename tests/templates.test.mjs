import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createAssetResolver } from '../scripts/assets.mjs';
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
    const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates/',import.meta.url)));
    const cards=renderCards(source,{resolveImage:resolver.resolveImage});
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
  for (const id of ['T05', 'T14', 'T42', 'T08', 'T28']) {
    for(const start of [7,98]) assert.doesNotThrow(()=>render(`<!-- card: {"template":"${id}"} -->\n# List\n\n${start}. First.\n${start+1}. Second.`));
    for(const start of [99,100,123456789]) assert.throws(()=>render(`<!-- card: {"template":"${id}"} -->\n# List\n\n${start}. First.\n${start+1}. Second.`),{code:'TEMPLATE_LIST_RANGE'});
  }
  const [legacy]=renderCards('<!-- card: {"layout":"steps"} -->\n# List\n\n123456789. First.');
  assert.match(legacy.html,/<ol start="123456789">/);
});

const m2Ids = ['T02', 'T06', 'T09', 'T10', 'T13', 'T14'];
test('unrendered M2 designs stay distinct from visually accepted M1 counts', () => {
  assert.equal(TEMPLATES.filter(t=>t.status==='visually-reviewed').length,4);
  for (const id of m2Ids) assert.equal(getTemplate(id).status,'implemented-awaiting-visual-review');
  assert.equal(new Set(m2Ids.map(id=>getTemplate(id).composition)).size,6);
});

test('M2 templates preserve additional sections, repeated titles and explicit boundaries', () => {
  const source='# First title\n# Second title\n\n> Original quotation.\n\n## One\n\nFirst body.\n\n## Two\n\nSecond body.\n\n## Three\n\nUnabridged extra body.';
  for (const id of m2Ids) {
    const annotated=`<!-- card: ${JSON.stringify({template:id,source:'Source text'})} -->\n${source}`;
    const cards=renderCards(annotated+'\n\n===\n\n'+annotated);
    assert.equal(cards.length,2);
    for (const card of cards) assert.equal(card.templateTitleHtml+card.templateIntroHtml+card.sections.map(s=>s.html).join(''),card.html);
    const html=buildDocument(cards,SIZES.portrait,'','',css).split('<main')[1];
    for (const text of ['First title','Second title','Original quotation.','Unabridged extra body.','Source text']) assert.equal(html.split(text).length-1,2,`${id}: ${text}`);
  }
});

test('M2 unsupported assets and scalar metadata fail instead of disappearing', () => {
  for(const id of m2Ids) {
    for(const field of ['metric','label','alt','caption']) assert.throws(()=>renderCards(`<!-- card: ${JSON.stringify({template:id,[field]:'Retain me'})} -->\n# Title`),{code:'TEMPLATE_METADATA_UNSUPPORTED'});
    assert.throws(()=>renderCards(`<!-- card: ${JSON.stringify({template:id,image:'local.png'})} -->\n# Title`),{code:'TEMPLATE_IMAGE_UNSUPPORTED'});
    assert.throws(()=>validateTemplateMetadata({template:id},SIZES.slide),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});
  }
});

test('M2 density keeps every source token and selects spacing-only classes', () => {
  for(const id of m2Ids) for(const density of ['compact','standard','editorial']) {
    const html=render(`<!-- card: ${JSON.stringify({template:id,density})} -->\n# Title\n\nFull body.`);
    assert.match(html,new RegExp(`template-${id} family-[a-z]+ density-${density}`));
    assert.equal(html.split('Full body.').length-1,1);
  }
});

test('T21 shows escaped author-provided metric and label once in source order', () => {
  const metadata={template:'T21',metric:'38% & <test>',label:'<script>label</script>',source:'Original evidence'};
  const html=render(`<!-- card: ${JSON.stringify(metadata)} -->\n# Metric title\n\nOriginal body.`).split('<main')[1];
  for(const text of ['38% &amp; &lt;test&gt;','&lt;script&gt;label&lt;/script&gt;','Original evidence']) assert.equal(html.split(text).length-1,1);
  assert.doesNotMatch(html,/<script>/);
  assert.ok(html.indexOf('Metric title')<html.indexOf('class="template-metric"'));
  assert.ok(html.indexOf('class="template-metric"')<html.indexOf('Original body.'));
});

test('T21 requires an explicit nonempty value and label, never invented defaults', () => {
  for(const fields of [{},{metric:'38%'},{label:'Name'},{metric:'',label:'Name'},{metric:'38%',label:'  '}]) {
    assert.throws(()=>renderCards(`<!-- card: ${JSON.stringify({template:'T21',...fields})} -->\n# Title`),{code:'TEMPLATE_METADATA_REQUIRED'});
  }
  for(const id of ['T18','T22','T26','T29','T30']) for(const field of ['metric','label']) {
    assert.throws(()=>renderCards(`<!-- card: ${JSON.stringify({template:id,[field]:'Original'})} -->\n# Title`),{code:'TEMPLATE_METADATA_UNSUPPORTED'});
  }
  const legacy=render('<!-- card: {"layout":"statistic"} -->\n# No fabricated data');
  assert.doesNotMatch(legacy,/class="(?:template-metric|statistic-value)"/);
});

test('M3 poetry keeps original hard breaks and code is executable demonstration text', async () => {
  for(const [id,breaks] of [['T29',2],['T30',3]]) {
    const [card]=renderCards(await readFile(new URL(`../examples/templates/${id}.md`,import.meta.url),'utf8'));
    assert.equal((card.html.match(/<br>/g)||[]).length,breaks);
    assert.equal(card.templateTitleHtml+card.templateIntroHtml+card.sections.map(s=>s.html).join(''),card.html);
  }
  const source=await readFile(new URL('../examples/templates/T18.md',import.meta.url),'utf8');
  const code=source.match(/```(?:js|javascript)\n([\s\S]*?)```/)?.[1];
  assert.ok(code);
  const output=[];
  runInNewContext(code,{console:{log:value=>output.push(value)}},{timeout:1000});
  assert.deepEqual(output,[150]);
  assert.match(css,/\.card\.template-T18 \.template-section pre \{[^}]*font-size: 1em/);
  assert.match(css,/\.card\.template-T21 \.template-metric \.statistic-label \{[^}]*font-size: 1em/);
});

test('enterprise demonstration header and configured footer use one fictional brand', async () => {
  const source=await readFile(new URL('../examples/showcase-enterprise.md',import.meta.url),'utf8');
  const brand=JSON.parse(await readFile(new URL('../examples/brand.json',import.meta.url),'utf8'));
  const name=brand.name.split(' · ')[0];
  assert.ok(renderCards(source)[0].metadata.eyebrow.startsWith(name+' /'));
  assert.doesNotMatch(source,/NORTHSTAR/);
});

test('required template images fail explicitly and retain validated full-frame assets', async () => {
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates/',import.meta.url)));
  for(const id of ['T37','T45','T46']) {
    for(const image of [undefined,'','  ']) assert.throws(()=>renderCards(`<!-- card: ${JSON.stringify({template:id,image})} -->\n# Title`),{code:'TEMPLATE_IMAGE_REQUIRED'});
    const cards=renderCards(`<!-- card: ${JSON.stringify({template:id,image:'assets/synthetic-reading-still-life.png',alt:'Full image <description>',caption:'Original & complete'})} -->\n# Title\n\nOriginal text.`,{resolveImage:resolver.resolveImage});
    const html=buildDocument(cards,SIZES.portrait,'','',css).split('<main')[1];
    assert.equal((html.match(/class="card-image"/g)||[]).length,1);
    assert.match(html,/alt="Full image &lt;description&gt;"/);
    assert.match(html,/<figcaption>Original &amp; complete<\/figcaption>/);
    assert.throws(()=>buildDocument([{...cards[0],image:undefined}],SIZES.portrait,'','',css),{code:'TEMPLATE_IMAGE_REQUIRED'});
    assert.doesNotMatch(css,new RegExp(`\\.card\\.template-${id}[^}]+object-fit:\\s*cover`));
  }
});

test('contact-print images are counted without silently accepting missing or excess images', async () => {
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates/',import.meta.url)));
  const picture='![Original image](assets/synthetic-reading-still-life.png)';
  for(const count of [0,1,2,3]) {
    const cards=renderCards('<!-- card: {"template":"T38"} -->\n# Frames\n\n'+Array.from({length:count},(_,i)=>`## Frame ${i+1}\n\n${picture}\n\nOriginal caption ${i+1}.`).join('\n\n'),{resolveImage:resolver.resolveImage});
    if(count!==2) assert.throws(()=>buildDocument(cards,SIZES.portrait,'','',css),{code:'TEMPLATE_IMAGE_COUNT'});
    else {
      const html=buildDocument(cards,SIZES.portrait,'','',css).split('<main')[1];
      assert.equal((html.match(/<img\b/g)||[]).length,2);
      assert.ok(html.indexOf('Original caption 1.')<html.indexOf('Original caption 2.'));
    }
  }
  const mismatched=renderCards('<!-- card: {"template":"T38"} -->\n# Frames\n\n## One frame\n\n'+picture+'\n\n'+picture,{resolveImage:resolver.resolveImage});
  assert.throws(()=>buildDocument(mismatched,SIZES.portrait,'','',css),{code:'TEMPLATE_IMAGE_STRUCTURE'});
  for(const field of ['alt','caption']) assert.throws(()=>renderCards(`<!-- card: ${JSON.stringify({template:'T38',[field]:'Do not lose'})} -->\n# Title`),{code:'TEMPLATE_METADATA_UNSUPPORTED'});
  assert.throws(()=>renderCards('<!-- card: {"template":"T38","image":"photo.png"} -->\n# Title'),{code:'TEMPLATE_IMAGE_UNSUPPORTED'});
});

test('text-only templates reject an injected resolved image as well as inline image markup', async () => {
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates/',import.meta.url)));
  const image=resolver.resolveImage('assets/synthetic-reading-still-life.png');
  const [card]=renderCards('<!-- card: {"template":"T33"} -->\n# Title');
  assert.throws(()=>buildDocument([{...card,image}],SIZES.portrait,'','',css),{code:'TEMPLATE_IMAGE_UNSUPPORTED'});
  const inline=renderCards('<!-- card: {"template":"T33"} -->\n# Title\n\n![Full image](assets/synthetic-reading-still-life.png)',{resolveImage:resolver.resolveImage});
  assert.throws(()=>buildDocument(inline,SIZES.portrait,'','',css),{code:'TEMPLATE_IMAGE_UNSUPPORTED'});
});

test('image examples have truthful hashed asset provenance rather than generic no-assets claims', async () => {
  const base=new URL('../examples/templates/assets/',import.meta.url);
  const provenance=JSON.parse(await readFile(new URL('provenance.json',base),'utf8'));
  for(const asset of provenance.assets) {
    const data=await readFile(new URL(asset.file,base));
    assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256);
    assert.match(asset.type,/synthetic|original/);
    assert.ok(asset.description);
  }
  for(const id of ['T37','T38','T45','T46']) assert.match(getTemplate(id).provenance.assets,/provenance\.json/);
});

test('first selected 24 are distinct compositions spanning all twelve families, not accepted by counting', () => {
  const ids=['T01','T02','T05','T06','T09','T10','T13','T14','T17','T18','T21','T22','T25','T26','T29','T30','T33','T34','T37','T38','T41','T42','T45','T46'];
  assert.equal(new Set(ids.map(id=>getTemplate(id).family)).size,12);
  assert.equal(new Set(ids.map(id=>getTemplate(id).composition)).size,24);
  assert.equal(ids.filter(id=>getTemplate(id).status==='visually-reviewed').length,4);
});

test('M5 text grids preserve supplementary source sections without truncating to visual slots', () => {
  for(const id of ['T04','T07','T08','T11','T12','T15','T16']) {
    const source=`<!-- card: ${JSON.stringify({template:id})} -->\n# Full title\n\nOriginal introduction.\n\n`+Array.from({length:6},(_,i)=>`## Section ${i+1}\n\nOriginal body ${i+1}.`).join('\n\n');
    const [card]=renderCards(source);
    assert.equal(card.templateTitleHtml+card.templateIntroHtml+card.sections.map(s=>s.html).join(''),card.html);
    const html=buildDocument([card],SIZES.portrait,'','',css).split('<main')[1];
    for(let i=1;i<=6;i++) assert.equal(html.split(`Original body ${i}.`).length-1,1);
  }
  assert.match(css,/\.card\.template-T12 \.template-section:nth-child\(n \+ 5\) \{ grid-column: 1 \/ -1/);
  assert.match(css,/\.card\.template-T15 \.template-section:nth-child\(n \+ 3\) \{ grid-column: 1 \/ -1/);
});

test('T03 requires image descriptions and preserves text then full portrait DOM order', async () => {
  for(const fields of [{},{alt:'Portrait'},{caption:'Fictional'}]) assert.throws(()=>renderCards(`<!-- card: ${JSON.stringify({template:'T03',image:'assets/synthetic-ceramic-artist.png',...fields})} -->\n# Title`),{code:'TEMPLATE_METADATA_REQUIRED'});
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates/',import.meta.url)));
  const cards=renderCards(await readFile(new URL('../examples/templates/T03.md',import.meta.url),'utf8'),{resolveImage:resolver.resolveImage});
  const html=buildDocument(cards,SIZES.portrait,'','',css).split('<main')[1];
  assert.ok(html.indexOf('class="template-main"')<html.indexOf('class="card-figure'));
  assert.equal(cards[0].image.width,1024);
  assert.equal(cards[0].image.height,1536);
  assert.match(getTemplate('T03').provenance.assets,/fictional adult portrait/);
});

test('M5 remains pending and decorative grids never override body size or crop images', () => {
  for(const id of ['T03','T04','T07','T08','T11','T12','T15','T16']) {
    assert.equal(getTemplate(id).status,'implemented-awaiting-visual-review');
    const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([,selector])=>selector.includes(`.template-${id}`));
    assert.ok(rules.length>0);
    for(const [, , rule] of rules) assert.doesNotMatch(rule,/--text-size\s*:|--note-size\s*:|object-fit:\s*cover|overflow:\s*hidden|text-overflow:\s*ellipsis/);
  }
});

test('T24 preserves all three real table columns and independent full-size table type', async () => {
  const [card]=renderCards(await readFile(new URL('../examples/templates/T24.md',import.meta.url),'utf8'));
  assert.equal((card.html.match(/<th>/g)||[]).length,3);
  assert.equal((card.html.match(/<td>/g)||[]).length,9);
  const html=buildDocument([card],SIZES.portrait,'','',css).split('<main')[1];
  for(const text of ['回原文核对偏差','不急着写答案','同时记录出处']) assert.equal(html.split(text).length-1,1);
  assert.match(css,/\.card\.template-T24 \.template-section table \{[^}]*font-size: 1em/);
  assert.match(css,/\.card\.template-T24 \.template-section th:first-child[^}]*width: 12%/);
  assert.match(css,/\.card\.template-T24 \.template-section th:nth-child\(2\)[^}]*width: 44%/);
});

test('T20 requires honest image descriptions and uses a real original interface illustration', async () => {
  const source=await readFile(new URL('../examples/templates/T20.md',import.meta.url),'utf8');
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates/',import.meta.url)));
  const [card]=renderCards(source,{resolveImage:resolver.resolveImage});
  assert.deepEqual([card.image.width,card.image.height],[1400,900]);
  assert.match(card.metadata.alt,/不是现有产品截图/);
  assert.match(card.metadata.caption,/非真实产品截图/);
  const html=buildDocument([card],SIZES.portrait,'','',css).split('<main')[1];
  assert.ok(html.indexOf('class="template-main"')<html.indexOf('class="card-figure'));
  assert.throws(()=>renderCards('<!-- card: {"template":"T20","image":"assets/original-research-interface.png"} -->\n# Title'),{code:'TEMPLATE_METADATA_REQUIRED'});
});

test('M6 supplied timelines, index starts and quotation breaks are never generated as facts', async () => {
  const [indexed]=renderCards(await readFile(new URL('../examples/templates/T28.md',import.meta.url),'utf8'));
  assert.match(indexed.html,/<ol start="7">/);
  const [quotation]=renderCards(await readFile(new URL('../examples/templates/T31.md',import.meta.url),'utf8'));
  assert.equal((quotation.html.match(/<br>/g)||[]).length,1);
  for(const id of ['T19','T23','T27','T32']) {
    const [card]=renderCards(await readFile(new URL(`../examples/templates/${id}.md`,import.meta.url),'utf8'));
    assert.equal(card.templateTitleHtml+card.templateIntroHtml+card.sections.map(s=>s.html).join(''),card.html);
    assert.equal(getTemplate(id).status,'implemented-awaiting-visual-review');
  }
});

test('timeline supplementary blocks and quotation preludes stay in body columns', () => {
  const cases=[['T27','# Timeline\n\n## A longer supplied date label\n\n- First full task.\n- Second full task.\n\n> Original note.'],['T31','# Thought\n\nOriginal prelude.\n\n> Original quotation.\n\nOriginal reflection.']];
  for(const [id,body] of cases) {
    const [card]=renderCards(`<!-- card: ${JSON.stringify({template:id})} -->\n${body}`);
    assert.equal(card.templateTitleHtml+card.templateIntroHtml+card.sections.map(s=>s.html).join(''),card.html);
  }
  assert.match(css,/\.card\.template-T27 \.template-section > :not\(h2\) \{ grid-column: 2/);
  assert.match(css,/\.card\.template-T31 \.template-intro > \* \{ grid-column: 1/);
});

test('T39 and T40 emit one safe figure before narrative using internal registry order', async () => {
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates/',import.meta.url)));
  for(const id of ['T39','T40']) {
    const cards=renderCards(await readFile(new URL(`../examples/templates/${id}.md`,import.meta.url),'utf8'),{resolveImage:resolver.resolveImage});
    const html=buildDocument(cards,SIZES.portrait,'','',css).split('<main')[1];
    assert.equal((html.match(/class="card-figure /g)||[]).length,1);
    assert.ok(html.indexOf('class="template-heading"')<html.indexOf('class="card-figure '));
    assert.ok(html.indexOf('class="card-figure ')<html.indexOf('class="template-main"'));
    assert.equal(html.split(cards[0].metadata.caption).length-1,1);
    assert.throws(()=>renderCards(`<!-- card: ${JSON.stringify({template:id,image:'image.png',alt:'Description',caption:'Caption',figureBeforeMain:'false'})} -->\n# Title`),{code:'INVALID_METADATA'});
  }
});

test('T40 preserves nondefault native starts and rejects counters too wide for its key', async () => {
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates/',import.meta.url)));
  const header='<!-- card: {"template":"T40","image":"assets/original-seam-detail.png","alt":"Full detail","caption":"Explicit detail source"} -->\n# Key\n\n';
  for(const start of [7,98,99,100,123456789]) {
    const cards=renderCards(header+`${start}. First key.\n${start+1}. Second key.`,{resolveImage:resolver.resolveImage});
    if(start<=98) {
      assert.doesNotThrow(()=>buildDocument(cards,SIZES.portrait,'','',css));
      assert.match(cards[0].html,new RegExp(`<ol start="${start}">`));
    } else assert.throws(()=>buildDocument(cards,SIZES.portrait,'','',css),{code:'TEMPLATE_LIST_RANGE'});
  }
});

test('image-record templates reject mixed image paragraphs and preserve additional explanations', async () => {
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates/',import.meta.url)));
  for(const [id,count] of [['T43',3],['T47',2],['T48',2]]) {
    const header=`<!-- card: ${JSON.stringify({template:id})} -->\n# Records\n\n`;
    const record=i=>`## Record ${i}\n\n![Original](assets/original-open-tray.png)\n\nOriginal explanation ${i}.\n\nAdditional detail ${i}.`;
    const body=Array.from({length:count},(_,i)=>record(i+1)).join('\n\n');
    const cards=renderCards(header+body,{resolveImage:resolver.resolveImage});
    const html=buildDocument(cards,SIZES.portrait,'','',css).split('<main')[1];
    for(let i=1;i<=count;i++) assert.equal(html.split(`Additional detail ${i}.`).length-1,1);
    for(const invalid of [body.replace('![Original]','Mixed text ![Original]'),body.replace('![Original](assets/original-open-tray.png)','[![Original](assets/original-open-tray.png)](https://example.test)'),body.replace(/Original explanation 1\.\n\nAdditional detail 1\./,'')]) {
      const bad=renderCards(header+invalid,{resolveImage:resolver.resolveImage});
      assert.throws(()=>buildDocument(bad,SIZES.portrait,'','',css),{code:'TEMPLATE_IMAGE_STRUCTURE'});
    }
  }
});

test('T44 counts sibling option quotes from tokens, never nested-quote markup', () => {
  const header='<!-- card: {"template":"T44"} -->\n# Options\n\n';
  const valid='## Dimension one\n\n> A original.\n\n> B original.\n\n## Dimension two\n\n> A other.\n\n> B other.\n\n## Limits\n\nOriginal limits.';
  assert.doesNotThrow(()=>render(header+valid));
  for(const invalid of [valid.replace('> A original.\n\n> B original.','> A original.\n>\n> > Nested B is not a sibling.'),valid.replace('> B original.','B is an ordinary paragraph.')]) {
    assert.throws(()=>render(header+invalid),{code:'TEMPLATE_OPTION_STRUCTURE'});
  }
  const [card]=renderCards(header+valid);
  assert.equal(card.sections[0].shape.topLevelBlockquotes,2);
  assert.equal(card.templateTitleHtml+card.templateIntroHtml+card.sections.map(s=>s.html).join(''),card.html);
});

test('48 implemented compositions span twelve families without inflating visual acceptance', () => {
  assert.equal(TEMPLATES.length,48);
  for(let n=1;n<=48;n++) assert.ok(getTemplate(`T${String(n).padStart(2,'0')}`));
  const families=new Map();
  for(const template of TEMPLATES) families.set(template.family,(families.get(template.family)||0)+1);
  assert.equal(families.size,12);
  assert.ok([...families.values()].every(count=>count===4));
  assert.equal(TEMPLATES.filter(t=>t.status==='visually-reviewed').length,4);
});

test('empty quotes or lists cannot satisfy required authored descriptions and options', async () => {
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates/',import.meta.url)));
  for(const empty of ['>','-','> \u200b']) {
    const records=[1,2].map(i=>`## Step ${i}\n\n![Image](assets/original-cucumber-prep.png)\n\n${empty}`).join('\n\n');
    const cards=renderCards('<!-- card: {"template":"T47"} -->\n# Steps\n\n'+records,{resolveImage:resolver.resolveImage});
    assert.throws(()=>buildDocument(cards,SIZES.portrait,'','',css),{code:'TEMPLATE_IMAGE_STRUCTURE'});
    const options=[1,2].map(i=>`## Dimension ${i}\n\n> First option\n\n${empty==='-'?'>':empty}`).join('\n\n');
    assert.throws(()=>render('<!-- card: {"template":"T44"} -->\n# Options\n\n'+options),{code:'TEMPLATE_OPTION_STRUCTURE'});
  }
});

test('same-source quote/list comparison exercises original semantics without per-template edits', async () => {
  const source=await readFile(new URL('../examples/template-comparison-structures.md',import.meta.url),'utf8');
  const base=renderCards(source)[0];
  assert.match(base.html,/<blockquote>/);
  assert.match(base.html,/<ol start="7">/);
  for(const id of ['T02','T05','T14','T25']) {
    const card=renderCards(`<!-- card: ${JSON.stringify({template:id})} -->\n${source}`)[0];
    assert.equal(card.metadata.template,id);
    assert.equal(card.source,base.source);
    assert.equal(card.html,base.html);
    assert.equal(card.templateTitleHtml+card.templateIntroHtml+card.sections.map(section=>section.html).join(''),base.html);
    assert.doesNotThrow(()=>buildDocument([card],SIZES.portrait,'','',css));
  }
});


test('authored action examples parse intended emphasis without literal delimiters', async () => {
  for (const [id, count] of [['T14', 4], ['T42', 3]]) {
    const [card] = renderCards(await readFile(new URL(`../examples/templates/${id}.md`, import.meta.url), 'utf8'));
    assert.doesNotMatch(card.html, /\*\*/);
    assert.equal((card.html.match(/<strong>/g) ?? []).length, count);
  }
});


test('calibrated templates keep compact spacing below standard below editorial', () => {
  for (const id of ['T03','T16','T19','T24','T27','T28','T35','T36','T38','T40','T43','T44','T46','T47','T48']) {
    const values = ['', '.density-compact', '.density-editorial'].map(suffix => {
      const selector = `.card.template-${id}${suffix} {`;
      const start = css.indexOf(selector);
      assert.ok(start >= 0, selector);
      const body = css.slice(start + selector.length, css.indexOf('}', start));
      return ['section', 'paragraph'].map(token => Number(body.match(new RegExp(`--${token}-gap: ([.0-9]+)em`))[1]));
    });
    for (const token of [0, 1]) assert.ok(values[1][token] < values[0][token] && values[0][token] < values[2][token], id);
  }
});
