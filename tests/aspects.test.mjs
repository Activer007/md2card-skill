import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES, getTemplate, resolveTemplateAspect, validateTemplateMetadata, TEMPLATE_ASPECTS, TEMPLATE_ASPECT_TOLERANCE } from '../scripts/templates.mjs';
import { renderCards } from '../scripts/markdown.mjs';
import { parseSemanticDocument } from '../scripts/semantic.mjs';
import { buildDocument, buildPreviewDocument, SIZES } from '../scripts/document.mjs';
import { parseOptions, exportCards } from '../scripts/render.mjs';
import { loadAspectCard, validateAspectPlan, ASPECT_CASE_SELECTION } from '../scripts/validate-aspects.mjs';
import { createAssetResolver } from '../scripts/assets.mjs';
const css = await readFile(new URL('../assets/templates.css', import.meta.url), 'utf8');
const input = id => `<!-- card: ${JSON.stringify({ template:id, ...(id==='T21'?{metric:'38%',label:'提交率'}:{}), source:'原始来源' })} -->\n# 标题\n\n导语。\n\n## 甲\n\n完整原文甲。\n\n## 乙\n\n完整原文乙。`;

test('six selected templates add eight independently registered aspects; aspect variants never create extra design IDs', () => {
  assert.deepEqual(TEMPLATES.filter(t=>t.aspects.length>1).map(t=>t.id).sort(), ['T04','T05','T13','T21','T24','T37']);
  assert.equal(new Set(TEMPLATES.map(t=>t.id)).size,TEMPLATES.length);
  assert.equal(TEMPLATES.length, 48);
  assert.equal(TEMPLATES.filter(t=>t.status==='visually-reviewed').length, 48);
  assert.equal(TEMPLATES.filter(t=>t.acceptance).length, 48);
  for(const t of TEMPLATES) {
    assert.deepEqual(Object.keys(t.aspectLayouts),t.aspects);
    assert.equal(t.aspectLayouts.portrait.composition,t.composition);
    assert.equal(t.aspectLayouts.portrait.status,t.status);
    assert.equal(t.aspectLayouts.portrait.version,t.version);
    assert.equal(t.aspectLayouts.portrait.acceptance,t.acceptance);
    for(const aspect of t.aspects) assert.ok(Object.isFrozen(t.aspectLayouts[aspect]));
  }
  for(const id of ['T04','T21']) {
    const t=getTemplate(id);
    assert.deepEqual(t.aspects,['portrait','square','slide']);
    assert.equal(new Set(Object.values(t.aspectLayouts).map(x=>x.composition)).size,3);
    for(const aspect of ['square','slide']) {
      assert.equal(t.aspectLayouts[aspect].status,'implemented-awaiting-visual-review');
      assert.equal(t.aspectLayouts[aspect].version,2);
      assert.equal(t.aspectLayouts[aspect].acceptance,undefined);
      assert.equal(t.aspectLayouts[aspect].evidence,undefined);
      assert.match(t.aspectLayouts[aspect].boundaries,/exact short-fixture PNG\/mobile\/native-PDF artifacts are independently reviewed/);
      assert.match(t.aspectLayouts[aspect].boundaries,/final aspect-specific binding remains pending R12/);
      assert.equal(t.aspectLayouts[aspect].historicalAcceptance.batch,'visual-upgrade-aspects');
      assert.equal(t.aspectLayouts[aspect].historicalEvidence,'docs/aspect-upgrade-provenance.json');
      assert.match(t.aspectLayouts[aspect].boundaries,/registered standard-density short example/);
    }
  }
});

test('frozen internal enum supplies exact classes, not public aspect strings', () => {
  assert.equal(TEMPLATE_ASPECT_TOLERANCE,0.002);
  assert.ok(Object.isFrozen(TEMPLATE_ASPECTS));
  for(const aspect of TEMPLATE_ASPECTS) {
    assert.ok(Object.isFrozen(aspect));
    assert.equal(aspect.className,`template-aspect-${aspect.id}`);
  }
  for(const value of ['slide','square','slide" onclick="bad','</style><script>','__proto__','portrait foo',{},null]) {
    assert.throws(()=>renderCards(`<!-- card: ${JSON.stringify({template:'T04',aspect:value})} -->\n# Title`),{code:'INVALID_METADATA'});
    assert.throws(()=>validateTemplateMetadata({template:'T04',aspect:value},SIZES.slide),{code:'TEMPLATE_ASPECT_METADATA_UNSUPPORTED'});
  }
});

test('standard and custom sizes use the existing inclusive ratio tolerance', () => {
  for(const id of ['T04','T21']) {
    for(const [aspect,size] of Object.entries(SIZES)) assert.equal(resolveTemplateAspect(id,size).id,aspect);
    for(const [width,height,aspect] of [[750,1000,'portrait'],[751,1000,'portrait'],[749,1000,'portrait'],[752,1000,'portrait'],[748,1000,'portrait'],[1000,1000,'square'],[1001,1000,'square'],[999,1000,'square'],[1002,1000,'square'],[998,1000,'square'],[1778,1000,'slide'],[1776,1000,'slide'],[1280,720,'slide'],[1920,1080,'slide'],[200,200,'square'],[4096,4096,'square']]) assert.equal(resolveTemplateAspect(id,{width,height}).id,aspect);
    for(const size of [{width:753,height:1000},{width:747,height:1000},{width:1003,height:1000},{width:997,height:1000},{width:1780,height:1000},{width:1775,height:1000},{width:900,height:1600},{width:1200,height:800},{width:1080},{height:1440},{width:NaN,height:1000},{width:Infinity,height:1000},{width:0,height:0},{width:199,height:199},{width:4097,height:4097},{width:1000.5,height:1000},{width:'1080',height:1080}]) assert.throws(()=>resolveTemplateAspect(id,size),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});
  }
  for(const t of TEMPLATES) for (const [aspect,size] of Object.entries(SIZES)) {
    if(t.aspects.includes(aspect)) assert.equal(resolveTemplateAspect(t.id,size).id,aspect);
    else assert.throws(()=>resolveTemplateAspect(t.id,size),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});
  }
});

test('all three layouts preserve identical source slots, DOM text order, metadata and locked card count', () => {
  for(const id of ['T04','T21']) {
    const cards=renderCards(input(id)+'\n\n===\n\n'+input(id));
    const seen=[];
    for(const [aspect,size] of Object.entries(SIZES)) {
      const html=buildDocument(cards,size,'','',css).split('<main')[1];
      assert.equal((html.match(/<article /g)||[]).length,2);
      assert.equal((html.match(new RegExp(`data-template-aspect="${aspect}"`,'g'))||[]).length,2);
      assert.match(html,new RegExp(`density-standard template-aspect-${aspect}`));
      for(const marker of ['标题','导语。','完整原文甲。','完整原文乙。','原始来源']) assert.equal(html.split(marker).length-1,2);
      assert.ok(html.indexOf('导语。')<html.indexOf('完整原文甲。') && html.indexOf('完整原文甲。')<html.indexOf('完整原文乙。'));
      seen.push(html.replaceAll(`template-aspect-${aspect}`,'ASPECT').replaceAll(`data-template-aspect="${aspect}"`,'ASPECT_DATA'));
      assert.match(buildPreviewDocument(cards,size,'','',css),/Preview transforms only the display/);
    }
    assert.equal(seen[0],seen[1]); assert.equal(seen[1],seen[2]);
  }
});

test('aspect selection cannot relax metric, image, metadata, layout or automatic-mode contracts', () => {
  for(const size of Object.values(SIZES)) {
    for(const fields of [{},{metric:'38%'},{label:'提交率'}]) assert.throws(()=>validateTemplateMetadata({template:'T21',...fields},size),{code:'TEMPLATE_METADATA_REQUIRED'});
    assert.throws(()=>validateTemplateMetadata({template:'T04',image:'x.png'},size),{code:'TEMPLATE_IMAGE_UNSUPPORTED'});
    assert.throws(()=>validateTemplateMetadata({template:'T04',metric:'38%'},size),{code:'TEMPLATE_METADATA_UNSUPPORTED'});
    assert.throws(()=>validateTemplateMetadata({template:'T04',layout:'cover'},size),{code:'TEMPLATE_LAYOUT_MISMATCH'});
  }
  for(const id of ['T04','T21']) {
    assert.throws(()=>parseSemanticDocument(input(id)),{code:'PAGINATION_UNSUPPORTED_METADATA'});
    assert.throws(()=>parseOptions(['file.md','--template',id,'--paginate','auto','--size','slide']),{code:'PAGINATION_UNSUPPORTED_METADATA'});
  }
  assert.equal(parseOptions(['file.md']).paginate,'manual');
  for(const size of Object.values(SIZES)) assert.doesNotMatch(buildDocument(renderCards('# Legacy'),size,'',''),/data-template|template-aspect/);
});

test('independent CSS changes hierarchy, not body floors, transforms, crop or hidden content', () => {
  const aspectCss=css.slice(css.indexOf('/* M9 independent aspect'));
  assert.doesNotMatch(aspectCss,/--(?:text|note)-size\s*:|\b(?:transform|scale|zoom|clip|clip-path|overflow|text-overflow|object-fit|line-clamp)\s*:/);
  assert.match(css,/--text-size: calc\(var\(--card-width\) \* \.043\)/);
  assert.match(css,/--note-size: calc\(var\(--card-width\) \* \.0335\)/);
  for(const viewport of [375,390]) {
    const displayedWidth=viewport-24;
    assert.ok(.043*displayedWidth>=14); assert.ok(.0335*displayedWidth>=11);
  }
  const rules=[...aspectCss.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
  for(const [_,selector,body] of rules) {
    assert.match(selector,/\.card\.template-T(?:04|05|13|21|24|37)\.template-aspect-(?:square|slide)/);
    if(/font-size\s*:/.test(body)) {
      assert.match(selector,/h1|h2|\.statistic-value|li::before/);
      assert.ok(Number(body.match(/font-size:\s*([\d.]+)em/)[1])>=1);
    }
  }
  assert.match(aspectCss,/template-T04\.template-aspect-square \.template-main \{ display: grid/);
  assert.match(aspectCss,/template-T04\.template-aspect-slide \.template-section \{ display: grid/);
  assert.match(aspectCss,/template-T21\.template-aspect-square \.template-metric \{ grid-column: 2; grid-row: 1/);
  assert.match(aspectCss,/template-T21\.template-aspect-slide \.template-main \{ grid-column: 2; grid-row: 1 \/ 4/);
});

test('aspect examples and same-source matrix are hashed, complete and honestly unmeasured', async () => {
  const plan=JSON.parse(await readFile(new URL('../examples/aspects/validation-plan.json',import.meta.url),'utf8'));
  assert.equal(validateAspectPlan(plan).cases.length,58);
  for(const item of plan.cases) {
    const source=await readFile(new URL('../'+item.input,import.meta.url),'utf8');
    assert.equal(createHash('sha256').update(source).digest('hex'),item.inputSha256);
    const cards=[await loadAspectCard(fileURLToPath(new URL('../',import.meta.url)),item)];
    assert.equal(cards.length,1); assert.equal(cards[0].metadata.template,item.template);
    assert.equal(cards[0].templateTitleHtml+cards[0].templateIntroHtml+cards[0].sections.map(s=>s.html).join(''),cards[0].html);
    assert.match(cards[0].metadata.source,/原创|虚构/);
    for(const field of ['realRender','mobile375','mobile390','nativePdf','visualReview']) assert.equal(item[field],'not-performed');
    const dimensions={width:item.dimensions[0],height:item.dimensions[1]};
    if(item.expected==='expected-TEMPLATE_ASPECT_UNSUPPORTED') assert.throws(()=>buildDocument(cards,dimensions,'','',css),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});
    else assert.doesNotThrow(()=>buildDocument(cards,dimensions,'','',css)); // source-only, NOT fit acceptance
    if(item.scope==='same-source-long') {
      assert.match(item.expected,/expected-CONTENT_OVERFLOW-unverified/);
      assert.ok(source.length>3000);
    }
  }
  for(const id of ['T04','T21']) for(const scope of ['same-source-short','same-source-original','same-source-long']) {
    const group=plan.cases.filter(x=>x.template===id && x.scope===scope);
    assert.equal(group.length,3); assert.equal(new Set(group.map(x=>x.inputSha256)).size,1);
  }
});

test('unsupported aspect fails before preflight or renderer acquisition', async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'md2card-aspect-source-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'input.md'); await writeFile(file,'<!-- card: {"template":"T01"} -->\n# Title');
  let calls=0;
  const unexpected=async()=>{ calls++; throw new Error('Unexpected renderer/preflight'); };
  await assert.rejects(()=>exportCards(parseOptions([file,'--out',path.join(dir,'out'),'--size','slide']),{inspectEnvironment:unexpected,openRenderer:unexpected}),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});
  assert.equal(calls,0);
});

// In-process lifecycle doubles only. These deliberately do not execute a DOM
// engine and cannot establish fit, font metrics, PDF or visual acceptance.
function sourceOnlyRenderer(measurement) {
  const media=[]; let currentMedia='screen', closed=0;
  const page={
    setDefaultTimeout() {}, async setContent() {}, async evaluate() {},
    locator:()=>({evaluateAll:async()=>[]}),
    async emulateMedia({media:mode}) { currentMedia=mode; media.push(mode); }
  };
  return {
    media, closes:()=>closed,
    dependencies:{
      inspectEnvironment:async()=>({ok:true,checks:[],versions:{},fonts:{status:'source-only-stub'}}),
      openRenderer:async()=>({page,context:{},browser:{close:async()=>{closed++;},version:()=> 'source-only-fake-not-chromium'}}),
      measureCards:async()=>[{index:1,available:{width:1,height:1},used:{width:0,height:0},overflow:measurement(currentMedia)}]
    }
  };
}

test('source-only export double records derived aspect without changing source hash or final dual-media validation', async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'md2card-aspect-manifest-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  for(const id of ['T04','T21']) {
    const source=input(id), file=path.join(dir,`${id}.md`); await writeFile(file,source);
    for(const aspect of ['portrait','square','slide']) {
      const fake=sourceOnlyRenderer(()=>[]);
      const manifest=await exportCards(parseOptions([file,'--out',path.join(dir,`${id}-${aspect}`),'--size',aspect,'--format','html']),fake.dependencies);
      assert.equal(manifest.cards[0].aspect,aspect);
      assert.equal(manifest.inputSha256,createHash('sha256').update(source).digest('hex'));
      assert.equal(manifest.cardCount,1);
      assert.equal(manifest.qa.visualReview,'not-performed');
      assert.equal(manifest.versions.chromium,'source-only-fake-not-chromium');
      assert.ok(fake.media.includes('screen') && fake.media.includes('print')); assert.equal(fake.closes(),1);
    }
  }
});

test('source-only overflow double still rejects in either medium and publishes only overflow report', async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'md2card-aspect-overflow-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  for(const id of ['T04','T21']) for(const aspect of ['portrait','square','slide']) for(const medium of ['screen','print']) {
    const file=path.join(dir,`${id}.md`);
    await writeFile(file,await readFile(new URL(`../examples/aspects/${id}-long.md`,import.meta.url),'utf8'));
    const out=path.join(dir,`${id}-${aspect}-${medium}`);
    const fake=sourceOnlyRenderer(mode=>mode===medium?['content-height']:[]);
    await assert.rejects(()=>exportCards(parseOptions([file,'--out',out,'--size',aspect,'--format','html']),fake.dependencies),{code:'CONTENT_OVERFLOW'});
    assert.deepEqual(await readdir(out),['overflow.json']);
    const report=JSON.parse(await readFile(path.join(out,'overflow.json'),'utf8'));
    assert.equal(report.code,'CONTENT_OVERFLOW');
    assert.deepEqual(report.cards[0][medium].overflow,['content-height']);
    assert.equal(fake.closes(),1);
  }
});


test('four short aspect previews are bound to exact inputs and actual output hashes', async () => {
  const evidence = JSON.parse(await readFile(new URL('../docs/aspect-upgrade-provenance.json', import.meta.url), 'utf8'));
  assert.equal(evidence.records.length, 4);
  assert.match(evidence.codeCommit, /^[a-f0-9]{40}$/);
  assert.match(evidence.codeTree, /^[a-f0-9]{40}$/);
  assert.match(evidence.archiveSha256, /^[a-f0-9]{64}$/);
  const seen = new Set();
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const record of evidence.records) {
    const key = `${record.id}-${record.aspect}`;
    assert.ok(!seen.has(key)); seen.add(key);
    const layout = getTemplate(record.id).aspectLayouts[record.aspect];
    assert.equal(layout.historicalAcceptance.batch, 'visual-upgrade-aspects');
    assert.equal(layout.acceptance, undefined);
    assert.equal(layout.evidence, undefined);
    assert.equal(layout.historicalEvidence, 'docs/aspect-upgrade-provenance.json');
    assert.equal(layout.example, record.input);
    assert.equal(digest(await readFile(new URL(`../${record.input}`, import.meta.url))), record.inputSha256);
    const png = await readFile(new URL(`../docs/images/aspects/${key}.png`, import.meta.url));
    assert.equal(digest(png), record.artifacts.find(item => item.format === 'png').sha256);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), SIZES[record.aspect].width);
    assert.equal(png.readUInt32BE(20), SIZES[record.aspect].height);
    assert.match(record.artifacts.find(item => item.format === 'pdf').sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(record.mobile.map(item => item.viewportWidth), [375, 390]);
    for (const mobile of record.mobile) assert.match(mobile.sha256, /^[a-f0-9]{64}$/);
  }
  assert.deepEqual([...seen].sort(), ['T04-slide', 'T04-square', 'T21-slide', 'T21-square']);
});


test('R12 has exactly four pending purpose-led pairs and no inherited visual evidence', () => {
  const pairs = [['T05','square','numbered-index-four-tile'],['T13','square','declaration-rail-argument-stack'],['T24','slide','decision-rail-table-stage'],['T37','slide','film-frame-story-rail']];
  for (const [id, aspect, composition] of pairs) {
    const entry = getTemplate(id), layout = entry.aspectLayouts[aspect];
    assert.deepEqual(entry.aspects, ['portrait', aspect]);
    assert.equal(layout.composition, composition); assert.notEqual(layout.composition, entry.composition);
    assert.equal(layout.status, 'implemented-awaiting-visual-review'); assert.equal(layout.version, 1);
    assert.equal(layout.acceptance, undefined); assert.equal(layout.evidence, undefined);
    assert.equal(layout.historicalAcceptance, undefined); assert.equal(layout.historicalEvidence, undefined);
    assert.equal(entry.version, id === 'T24' ? 3 : 2); assert.equal(entry.status, 'visually-reviewed');
    assert.equal(entry.acceptance, id === 'T24' ? 'refinement-m2-v3' : 'refinement-m2-v2');
    assert.match(layout.boundaries, /requires new full PNG/);
  }
  const isolated=css.slice(css.indexOf('/* R12 purpose-led independent aspects:'));
  const rules=[...isolated.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
  for(const [,selector] of rules) for(const part of selector.replace(/\/\*[\s\S]*?\*\//g,'').split(',')) {
    assert.match(part.trim(), /^\.card\.template-(?:T05\.template-aspect-square|T13\.template-aspect-square|T24\.template-aspect-slide|T37\.template-aspect-slide) /);
  }
  assert.doesNotMatch(isolated,/grid-auto-flow:\s*(?:dense|column)|\border\s*:|display:\s*none|visibility:\s*hidden|font-size:\s*\.[0-9]/);
  assert.match(isolated,/template-T05\.template-aspect-square \.template-intro > ol \{ display: grid; grid-template-columns: repeat\(2/);
  assert.match(isolated,/template-T24\.template-aspect-slide \.template-main, .*display: contents/);
  assert.match(isolated,/template-T37\.template-aspect-slide \.card-figure \{ grid-column: 1; grid-row: 1 \/ 3/);
});

test('new purpose-led source comparisons retain every slot, image byte and required boundary', async () => {
  const plan=JSON.parse(await readFile(new URL('../examples/aspects/validation-plan.json',import.meta.url),'utf8'));
  for(const id of ['T05','T13','T24','T37']) {
    const specific=plan.cases.find(item=>item.template===id && item.scope.startsWith('aspect-specific-'));
    const card=await loadAspectCard(fileURLToPath(new URL('../',import.meta.url)),specific);
    const variants=getTemplate(id).aspects.map(aspect=>buildDocument([card],SIZES[aspect],'','',css).split('<main')[1]
      .replaceAll(`template-aspect-${aspect}`,'ASPECT').replaceAll(`data-template-aspect="${aspect}"`,'ASPECT_DATA'));
    assert.equal(variants[0],variants[1]);
    const shortSource=await readFile(new URL('../'+specific.input,import.meta.url),'utf8');
    const pressureSource=await readFile(new URL(`../examples/aspects/${id}-long.md`,import.meta.url),'utf8');
    assert.ok(pressureSource.startsWith(shortSource), 'Pressure input appends, never removes or edits supplied content.');
    for(const scope of ['same-source-short','same-source-original','same-source-long']) {
      const group=plan.cases.filter(item=>item.template===id && item.scope===scope);
      assert.equal(group.length,2); assert.equal(new Set(group.map(item=>item.inputSha256)).size,1);
    }
    assert.throws(()=>parseSemanticDocument(reconstructSource(card)),{code:'PAGINATION_UNSUPPORTED_METADATA'});
    assert.throws(()=>validateTemplateMetadata({template:id,metric:'42%'},SIZES[specific.aspect]),{code:'TEMPLATE_METADATA_UNSUPPORTED'});
  }
  function reconstructSource(card) { return `<!-- card: ${JSON.stringify(card.metadata)} -->\n${card.source}`; }
  for(const id of ['T05','T13','T24']) assert.throws(()=>validateTemplateMetadata({template:id,image:'assets/x.png'},SIZES[getTemplate(id).aspects[1]]),{code:'TEMPLATE_IMAGE_UNSUPPORTED'});
  assert.throws(()=>validateTemplateMetadata({template:'T37'},SIZES.slide),{code:'TEMPLATE_IMAGE_REQUIRED'});
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates',import.meta.url)));
  for(const reference of ['https://example.com/x.png','../T37.md','data:image/png;base64,AAAA','/tmp/x.png']) assert.throws(()=>resolver.resolveImage(reference),{code:'INVALID_ASSET'});
  const list=renderCards('<!-- card: {"template":"T05"} -->\n# Index\n\n98. One\n99. Two')[0];
  assert.match(buildDocument([list],SIZES.square,'','',css), /<ol start="98">/);
  assert.throws(()=>buildDocument(renderCards('<!-- card: {"template":"T05"} -->\n# Index\n\n99. One\n100. Two'),SIZES.square,'','',css),{code:'TEMPLATE_LIST_RANGE'});
});

test('every R12 unsupported named or custom ratio refuses before preflight or browser acquisition', async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'md2card-r12-refusal-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const plan=JSON.parse(await readFile(new URL('../examples/aspects/validation-plan.json',import.meta.url),'utf8'));
  let calls=0; const forbidden=async()=>{calls++;throw new Error('Unexpected acquisition');};
  for(const item of plan.cases.filter(item=>item.scope.startsWith('unsupported-'))) {
    const options=parseOptions([fileURLToPath(new URL('../'+item.input,import.meta.url)),'--out',path.join(dir,`${item.template}-${item.scope}`),'--width',String(item.dimensions[0]),'--height',String(item.dimensions[1]),...(item.assetRoot?['--asset-root',fileURLToPath(new URL('../'+item.assetRoot,import.meta.url))]:[])]);
    await assert.rejects(()=>exportCards(options,{inspectEnvironment:forbidden,openRenderer:forbidden}),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});
  }
  assert.equal(calls,0);
});

test('new supported aspects retain screen and print overflow rejection without partial artifacts', async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'md2card-r12-overflow-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const plan=JSON.parse(await readFile(new URL('../examples/aspects/validation-plan.json',import.meta.url),'utf8'));
  for(const item of plan.cases.filter(item=>['T05','T13','T24','T37'].includes(item.template) && item.scope==='same-source-long')) for(const medium of ['screen','print']) {
    const file=fileURLToPath(new URL('../'+item.input,import.meta.url)), out=path.join(dir,`${item.template}-${item.aspect}-${medium}`);
    const fake=sourceOnlyRenderer(mode=>mode===medium?['content-height']:[]);
    const options=parseOptions([file,'--out',out,'--size',item.aspect,'--format','html',...(item.assetRoot?['--asset-root',fileURLToPath(new URL('../'+item.assetRoot,import.meta.url))]:[])]);
    await assert.rejects(()=>exportCards(options,fake.dependencies),{code:'CONTENT_OVERFLOW'});
    assert.deepEqual(await readdir(out),['overflow.json']);
    const report=JSON.parse(await readFile(path.join(out,'overflow.json'),'utf8'));
    assert.deepEqual(report.cards[0][medium].overflow,['content-height']); assert.equal(fake.closes(),1);
    assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),item.inputSha256);
  }
});


test('R12 integrated aspects retain M2 typography, validated history, intrinsic image guards and separate title/numeral spacing',()=>{
  const m1Ids = ['T06','T10','T16','T19','T20','T22','T24','T26','T32','T34','T39','T40','T45'];
  assert.ok(TEMPLATES.every(entry=>entry.version===(m1Ids.includes(entry.id)?3:2) && entry.status==='visually-reviewed' && entry.historicalAcceptance.version===1 && entry.acceptance===(m1Ids.includes(entry.id)?'refinement-m2-v3':'refinement-m2-v2')));
  assert.equal(TEMPLATES.filter(entry=>entry.version===3).length,13);
  assert.equal(TEMPLATES.filter(entry=>entry.version===2).length,35);
  for (const id of m1Ids) assert.deepEqual(getTemplate(id).historicalAcceptances,[{batch:'refinement-m1-v2',version:2}]);
  assert.equal(getTemplate('T32').composition,'chapter-excerpt-reading-bands');
  assert.equal(getTemplate('T48').composition,'paired-full-image-specimen-columns');
  const isolated=css.slice(css.indexOf('/* R12 purpose-led independent aspects:'));
  assert.match(isolated,/template-T05\.template-aspect-square \.template-intro > ol > li::before \{ top: \.12em; left: \.16em; font-size: 2\.1em/);
  assert.match(isolated,/template-T13\.template-aspect-square \.template-title > h1 \+ h1 \{ margin-left: 0/);
  assert.match(isolated,/template-T37\.template-aspect-slide \.image-frame \{ height: auto/);
  assert.match(isolated,/template-T37\.template-aspect-slide \.card-image \{ max-height: calc\(var\(--card-height\) \* \.44\)/);
  assert.doesNotMatch(isolated,/--font-(?:body|display|numeric|source)|font-family:/);
});


test('entrypoint capability guidance names exactly the bounded six-template/eight-pair support and separates historical evidence',async()=>{
  for(const file of ['README.md','SKILL.md','references/rendering.md','scripts/build-template-gallery.mjs']) {
    const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
    for(const pair of ['T04/T21','T05/T13','T24/T37']) assert.ok(source.includes(pair),`${file} ${pair}`);
    assert.match(source,/6 (?:templates|个模板)/,file); assert.match(source,/8 (?:extra aspect pairs|个额外画幅组合)/,file);
    assert.doesNotMatch(source,/(?:Only|only|只有) T04(?:\/T21| and T21)/,file);
    assert.match(source,/historical evidence|v1 历史证据/,file);
    assert.doesNotMatch(source,/All 48 current templates .*await|当前 M2 版本与全部额外画幅都待新产物验收|当前 13 套 v3 \/ 35 套 v2 及全部八个额外画幅都待新产物验收/,file);
    assert.match(source,/registry binding|画幅注册绑定|证据注册表|evidence registry/,file);
  }
});
