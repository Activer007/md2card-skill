import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { readFile, writeFile, mkdir, mkdtemp, readdir, rm, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TEMPLATES, getTemplate, resolveTemplateAspect } from '../scripts/templates.mjs';
import { SIZES, buildDocument } from '../scripts/document.mjs';
import { renderCards } from '../scripts/markdown.mjs';
import { parsePairOptions, exportCoverPair, pairPreview } from '../scripts/render-cover-pair.mjs';
import { LIMITS } from '../scripts/render.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=(n=38)=>`<!-- card: {"template":"T21","metric":"${n}%","label":"rate %","source":"fiction ${n}"} -->\n# Definition\n\n${n}/100 people; not a learning outcome.`;

test('only three M4 combinations added; 21:9 is independent of 16:9 with strict ratio tolerance',()=>{
  assert.equal(TEMPLATES.length,48);
  assert.deepEqual(TEMPLATES.filter(t=>t.aspects.includes('wechat-wide')).map(t=>t.id).sort(),['T01','T21']);
  assert.deepEqual(getTemplate('T01').aspects,['portrait','square','wechat-wide']);
  assert.deepEqual(getTemplate('T21').aspects,['portrait','square','slide','wechat-wide']);
  for(const id of ['T01','T21']) {
    for(const size of [{width:2100,height:900},{width:1400,height:600},{width:2101,height:900},{width:2099,height:900}]) assert.equal(resolveTemplateAspect(id,size).id,'wechat-wide');
    for(const size of [{width:2102,height:900},{width:2098,height:900},{width:1200,height:800},{width:2100,height:901},{width:4200,height:1800}])assert.throws(()=>resolveTemplateAspect(id,size),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});
  }
  assert.throws(()=>resolveTemplateAspect('T01',SIZES.slide),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});
  assert.equal(resolveTemplateAspect('T21',SIZES.slide).id,'slide');
  for(const t of TEMPLATES.filter(t=>!['T01','T21'].includes(t.id)))assert.throws(()=>resolveTemplateAspect(t.id,SIZES['wechat-wide']),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});
  for(const [id,aspect] of [['T01','square'],['T01','wechat-wide'],['T21','wechat-wide']]) {
    const a=getTemplate(id).aspectLayouts[aspect];assert.equal(a.acceptance,undefined);assert.equal(a.historicalEvidence,undefined);assert.equal(a.version,1);
  }
});

test('M4 conditional CSS and all original content slots retained; no crop/fit/hide engine',async()=>{
  for(const [id,aspect,file] of [['T01','square','T01-square'],['T01','wechat-wide','T01-wide'],['T21','wechat-wide','T21-wide']]) {
    const cards=renderCards(await readFile(new URL(`../examples/wechat-covers/${file}.md`,import.meta.url),'utf8'));
    const html=buildDocument(cards,SIZES[aspect],'','');
    assert.match(html,new RegExp(`data-template-aspect="${aspect}"`));assert.match(html,/M4 independently/);
    assert.ok(html.includes(cards[0].metadata.source));
    for(const key of ['metric','label'])if(cards[0].metadata[key])assert.ok(html.includes(cards[0].metadata[key]));
    const css=html.slice(html.indexOf('/* M4 independently'),html.indexOf('@page'));
    assert.doesNotMatch(css,/overflow:\s*hidden|line-clamp|display:\s*none|font-size:\s*clamp|transform:/);
  }
  assert.doesNotMatch(buildDocument(renderCards(source()),SIZES.slide,'',''),/M4 independently/);
});

async function fixture(t) {
  const root=await mkdtemp(path.join(tmpdir(),'md2card-pair-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const wide=path.join(root,'wide.md'),square=path.join(root,'square.md');await writeFile(wide,source());await writeFile(square,source(42));
  const args=['--wide',wide,'--square',square,'--out',path.join(root,'out'),'--author-confirmed'];
  return {root,wide,square,args,options:parsePairOptions(args)};
}
async function fakeExport(options) {
  const bytes=await readFile(options.input),manifest={status:'success',cardCount:1,inputSha256:hash(bytes)};
  await mkdir(options.out,{recursive:true});
  for(const name of ['cards.html','cards.pdf','card-001.png','preview.html'])await writeFile(path.join(options.out,name),`fake ${name}`);
  await writeFile(path.join(options.out,'manifest.json'),JSON.stringify(manifest));return manifest;
}
const fakePreview=async()=>Buffer.from('not-a-real-preview-test-only');
test('CLI requires two explicit confirmed inputs and rejects ambiguous options',async t=>{
  const f=await fixture(t);
  for(const args of [f.args.slice(0,-1),['--wide',f.wide,'--author-confirmed'],[...f.args,'--wide',f.wide],[...f.args,'--size','slide']])assert.throws(()=>parsePairOptions(args));
  const same=parsePairOptions(['--wide',f.wide,'--square',f.wide,'--out',f.options.out,'--author-confirmed']);
  await assert.rejects(exportCoverPair(same),{code:'PAIR_INPUTS_NOT_DISTINCT'});
  await assert.rejects(exportCoverPair({...f.options,authorConfirmed:false}),{code:'PAIR_CONFIRMATION_REQUIRED'});
});
test('pair preserves differing facts and hashes all independent outputs without claiming equivalence',async t=>{
  const f=await fixture(t),calls=[];
  const result=await exportCoverPair(f.options,{exportCards:async o=>{calls.push(o);return fakeExport(o);},previewPng:fakePreview});
  assert.deepEqual(calls.map(o=>[o.width,o.height]),[[2100,900],[1080,1080]]);
  assert.equal(result.semanticEquivalence,'not-verified');assert.equal(result.humanVisualReview,'not-performed');assert.equal(result.warnings.length,1);
  assert.notEqual(result.inputs.wide.sha256,result.inputs.square.sha256);
  for(const side of ['wide','square'])for(const file of result.outputs[side].files)assert.equal(file.sha256,hash(await readFile(path.join(f.options.out,file.file))));
  for(const file of result.previews)assert.equal(file.sha256,hash(await readFile(path.join(f.options.out,file.file))));
  assert.equal(await readFile(f.square,'utf8'),source(42));
  await assert.rejects(exportCoverPair(f.options),{code:'OUTPUT_EXISTS'});
});
test('either side or preview failure removes staging and cannot publish a successful pair',async t=>{
  for(const failure of ['wide','square','preview']) {
    const f=await fixture(t);await mkdir(f.options.out);
    await assert.rejects(exportCoverPair(f.options,{exportCards:async o=>{if(path.basename(o.out)===failure)throw Object.assign(new Error('overflow'),{code:'CONTENT_OVERFLOW'});return fakeExport(o);},previewPng:async()=>{throw new Error('preview failure');}}));
    assert.deepEqual(await readdir(f.options.out),[]);assert.ok(!(await readdir(f.root)).some(n=>n.startsWith('.md2card-pair-')));
  }
});
test('late destination writes survive and input mutation invalidates confirmation',async t=>{
  for(const mutate of ['input','destination']) {
    const f=await fixture(t);
    await assert.rejects(exportCoverPair(f.options,{exportCards:async o=>{const m=await fakeExport(o);if(mutate==='input')await writeFile(f.wide,source(99));return m;},previewPng:async()=>{await mkdir(f.options.out);await writeFile(path.join(f.options.out,'keep.txt'),'keep');return fakePreview();}}),{code:mutate==='input'?'PAIR_INPUT_CHANGED':'OUTPUT_EXISTS'});
    if(mutate==='destination')assert.equal(await readFile(path.join(f.options.out,'keep.txt'),'utf8'),'keep');
  }
});
test('shared deadline is passed to children; time exhaustion prevents publication',async t=>{
  const f=await fixture(t);let now=0,calls=0;
  await assert.rejects(exportCoverPair(f.options,{now:()=>now,exportCards:async o=>{assert.ok(o.timeoutMs<=f.options.timeoutMs);calls++;const m=await fakeExport(o);now=f.options.timeoutMs+1;return m;},previewPng:fakePreview}),{code:'RENDER_TIMEOUT'});
  assert.equal(calls,1);assert.ok(!(await readdir(f.root)).includes('out'));
});
test('failed side retains actionable overflow after staging cleanup',async t=>{
  const f=await fixture(t),overflow={code:'CONTENT_OVERFLOW',cards:[{index:1,sourceLines:[1,8],screen:{overflow:['content-height']}}]};
  await assert.rejects(exportCoverPair(f.options,{exportCards:async o=>{await mkdir(o.out);await writeFile(path.join(o.out,'overflow.json'),JSON.stringify(overflow));throw Object.assign(new Error('See temporary report'),{code:'CONTENT_OVERFLOW',exitCode:2});}}),error=>{
    assert.equal(error.details.pairSide,'wide');assert.equal(error.details.pairPublished,false);assert.deepEqual(error.details.overflow,overflow);assert.doesNotMatch(error.message,/temporary/);return true;
  });
  assert.ok(!(await readdir(f.root)).some(n=>n.startsWith('.md2card-pair-')));
});
test('shared logo mutation and aggregate output budget cannot publish a pair',async t=>{
  for(const failure of ['brand','bytes']) {
    const f=await fixture(t);
    await assert.rejects(exportCoverPair(f.options,{exportCards:async o=>{
      const m=await fakeExport(o);m.brand={name:'Demo',logoHash:path.basename(o.out)};
      if(failure==='bytes'){const handle=await open(path.join(o.out,'card-001.png'),'r+');try{await handle.truncate(LIMITS.outputBytes+1);}finally{await handle.close();}}
      return m;
    },previewPng:fakePreview}),{code:failure==='brand'?'PAIR_BRAND_CHANGED':'OUTPUT_BUDGET'});
    assert.ok(!(await readdir(f.root)).includes('out'));
  }
});
test('empty/unsupported/multiple cards refused before renderer and preview escapes filenames',async t=>{
  const f=await fixture(t);
  for(const input of ['# No template','<!-- card: {"template":"T04"} -->\n# Title',source()+'\n\n===\n\n'+source()]) {
    await writeFile(f.wide,input);await assert.rejects(exportCoverPair(f.options),{code:'PAIR_INPUT_UNSUPPORTED'});
  }
  const html=pairPreview({wide:{name:'<script>"',sha256:'a'},square:{name:'square.md',sha256:'b'}});
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/default-src 'none'/);
  await writeFile(f.wide,Buffer.alloc(LIMITS.inputBytes+1,65));
  await assert.rejects(exportCoverPair(f.options),{code:'RENDER_BUDGET'});
});
