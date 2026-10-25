import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, VISUAL_LIMITS, buildVisualDiagnostics, unionArea, collectVisualGeometry } from '../scripts/visual-diagnostics.mjs';
import { parseOptions, exportCards, LIMITS } from '../scripts/render.mjs';
import { openRenderer, closeBrowser, measureCards } from '../scripts/browser.mjs';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const rect=(x,y,width,height)=>({x,y,width,height});
const text=(id,role,y,height=25,width=300)=>({id,role,kind:'text',tag:role==='title'?'h1':'p',bbox:rect(40,y,width,height),fontSize:24,lineHeight:30,selector:`#${id}`});
const image=(width=300,height=250)=>({id:'img',kind:'image',role:'image',bbox:rect(40,120,width,height),frame:rect(40,120,300,250),objectFit:'contain'});
const geometry=(elements=[text('title','title',40),text('body','content',90)])=>({index:1,complete:true,card:rect(0,0,600,800),content:rect(40,40,520,650),footer:rect(40,720,520,40),elements});
const card=(metadata={})=>({metadata,sourceLines:{start:1,end:5}});
const report=(g,metadata={},cards=[card(metadata)],extra={})=>buildVisualDiagnostics({screen:cards.map(()=>g),print:cards.map(()=>g),cards,options:{width:600,height:800,size:'portrait',...extra},inputSha256:'fixture'});
const check=(r,id)=>r.cards[0].checks.find(c=>c.ruleId===id);

test('rectangle union removes nested overlap and clips are represented by actual boxes',()=>{
  assert.equal(unionArea([rect(0,0,20,20),rect(10,10,20,20),rect(12,12,2,2)]),700);
  assert.equal(unionArea([]),0);
});
test('VD-01 distinguishes tight and normal gap; long title uses measured final line',()=>{
  assert.equal(check(report(geometry([text('t','title',40,75),text('b','content',118)])),'VD-01').severity,'WARN');
  assert.equal(check(report(geometry()),'VD-01').status,'within-reference');
  assert.equal(check(report(geometry(),{visualVariant:'photo-cover'}),'VD-01').exception,'photo-cover');
  assert.equal(check(report(geometry([text('t','title',40),text('m','metric',100,150),text('b','content',300)])),'VD-01').exception,'intervening-metric');
});
test('VD-02 measures four bands, not a stretched parent; dense control does not trigger',()=>{
  assert.equal(check(report(geometry()),'VD-02').status,'attention');
  const dense=geometry(Array.from({length:20},(_,i)=>text(`b${i}`,'content',40+i*31,27,500)));
  assert.equal(check(report(dense),'VD-02').status,'within-reference');
  assert.equal(check(report(geometry(),{template:'T13'}),'VD-02').exception,'short-declaration');
});
test('VD-03 sparse reports warn, short excerpts are explicit exceptions, sources cannot hide blank space',()=>{
  const sparse=geometry([text('t','title',40),text('b','content',90),text('s','source',650),text('f','footer',720)]);
  assert.equal(check(report(sparse),'VD-03').severity,'WARN');
  assert.equal(check(report(sparse,{template:'T29'}),'VD-03').exception,'book-excerpt');
  assert.equal(check(report(geometry([text('b','content',630)])),'VD-03').status,'within-reference');
});
test('VD-04 screenshot threshold uses painted image, not contain frame',()=>{
  assert.equal(check(report(geometry([image(60,250)]),{template:'T20'}),'VD-04').severity,'WARN');
  assert.equal(check(report(geometry([image(500,400)]),{template:'T20'}),'VD-04').status,'within-reference');
  assert.equal(check(report(geometry([image(60,250)]),{template:'T37'}),'VD-04').exception,'non-screenshot');
});
test('VD-05 adjacent structure repetition stays INFO; different composition is negative',()=>{
  const a=card({template:'T18'}),b=card({template:'T17'});
  assert.equal(check(report(geometry(),{},[a,a]),'VD-05').status,'attention');
  assert.equal(check(report(geometry(),{},[a,b]),'VD-05').status,'within-reference');
  const table=geometry([{...text('cell','content',90),tag:'td'}]);
  assert.equal(check(report(table,{},[a,a]),'VD-05').exception,'table-continuation');
  assert.equal(check(report(geometry(),{},[a,a],{paginate:'auto'}),'VD-05').exception,'auto-pagination');
});
test('VD-06 actual overlay requires a person; non-overlap never claims raster text inspected',()=>{
  const positive=check(report(geometry([image(),text('t','title',150)])),'VD-06');
  assert.equal(positive.status,'human-review-required');assert.equal(positive.severity,'WARN');
  const negative=check(report(geometry([image(),text('t','title',40)])),'VD-06');
  assert.equal(negative.status,'not-applicable');assert.equal(negative.measured.rasterTextRecognition,'not-performed');
});
test('every rule carries a version, threshold, exceptions, evidence and advice without an acceptance flag',()=>{
  const r=report(geometry());assert.equal(r.humanVisualReview,'not-performed');
  assert.equal(report(geometry(),{},[card()],{width:900,height:900}).cards[0].aspect,'square');
  assert.equal(r.cards.length,2);
  for(const c of r.cards) for(const row of c.checks){assert.ok(RULES[row.ruleId]);assert.ok(row.threshold);assert.ok(row.exceptions);assert.ok(row.advice);assert.ok(row.measured);assert.ok(row.evidence);assert.ok(['INFO','WARN'].includes(row.severity));}
  const incomplete=report({...geometry(),complete:false,incompleteReason:'budget'});
  assert.ok(incomplete.cards.every(c=>c.checks.every(r=>r.status==='not-evaluated')));
});
test('CLI is opt-in and existing render budgets remain unchanged',()=>{
  assert.equal(parseOptions(['a.md']).visualAudit,false);assert.equal(parseOptions(['a.md','--visual-audit']).visualAudit,true);
  assert.equal(LIMITS.cards,200);assert.equal(LIMITS.outputBytes,256*1024*1024);assert.equal(parseOptions(['a.md','--visual-audit']).timeoutMs,120000);
  assert.throws(()=>parseOptions(['a.md','--visual-audit','--timeout-ms','600001']));
});

async function sandbox(t) {
  const dir=await mkdtemp(path.join(tmpdir(),'md2card-audit-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const input=path.join(dir,'input.md');await writeFile(input,'# Title\n\nBody.');
  return {dir,options:parseOptions([input,'--out',path.join(dir,'out'),'--format','html','--visual-audit','--timeout-ms','1000'])};
}
function fake(overrides={}) {
  return {openRenderer:async()=>({browser:{close:async()=>{},version:()=> 'fixture'},page:{setDefaultTimeout(){},setContent:async()=>{},evaluate:async()=>{},emulateMedia:async()=>{},locator:()=>({evaluateAll:async()=>[]})}}),inspectEnvironment:async()=>({ok:true,versions:{},fonts:{}}),measureCards:async()=>[{index:1,overflow:[]}],collectVisualGeometry:async()=>[geometry()],...overrides};
}
test('disabled audit does not collect or change artifact/qa contract; enabled report is budgeted and hashed',async t=>{
  const {dir,options}=await sandbox(t);
  const off=await exportCards({...options,visualAudit:false},fake({collectVisualGeometry:()=>{throw Error('must not collect');}}));
  assert.deepEqual((await readdir(options.out)).sort(),['cards.html','manifest.json']);assert.equal(off.qa.visualReview,'not-performed');
  const on=await exportCards({...options,out:path.join(dir,'on')},fake());
  assert.equal(on.qa.visualReview,'not-performed');const a=on.artifacts.find(a=>a.format==='visual-diagnostics');assert.ok(a.bytes>0);assert.equal(a.sha256.length,64);
  assert.equal(on.budget.outputBytes,on.artifacts.reduce((n,a)=>n+a.bytes,0));
});
test('audit obeys total deadline and leaves no partial published report',async t=>{
  const {dir,options}=await sandbox(t);
  await assert.rejects(exportCards(options,fake({collectVisualGeometry:()=>new Promise(()=>{})})),{code:'RENDER_TIMEOUT'});
  assert.deepEqual(await readdir(dir),['input.md']);
});
test('print overflow remains CONTENT_OVERFLOW with only overflow.json, even when opted in',async t=>{
  const {options}=await sandbox(t);let calls=0;
  await assert.rejects(exportCards(options,fake({measureCards:async()=>[{index:1,overflow:++calls===2?['content-footer-overlap']:[]}]})),{code:'CONTENT_OVERFLOW'});
  assert.deepEqual(await readdir(options.out),['overflow.json']);
  await assert.rejects(exportCards({...options,visualAudit:'true'}),{code:'INVALID_OPTIONS'});
});

const browser=process.env.CHROMIUM_PATH;
test('real Chromium screen/print: bbox truth, background exclusion, contain area, footer hard failure and bounded collection', {skip:!browser&&!process.env.MD2CARD_REQUIRE_BROWSER}, async()=>{
  const renderer=await openRenderer({width:600,height:800,scale:1,browser,timeoutMs:30000});
  try {
    const p=renderer.page;
    await p.setContent(`<style>body{margin:0}.card{position:relative;width:600px;height:800px;background:linear-gradient(red,blue)}.card-content{position:absolute;left:40px;top:40px;width:520px;height:650px}.card-footer{position:absolute;top:720px;left:40px;width:520px;height:40px}h1{font:40px/44px sans-serif;margin:0;width:220px}p{font:20px/28px sans-serif}img{width:400px;height:180px;object-fit:contain}.stretch{position:absolute;inset:0;z-index:-1} @media print{h1{margin-top:15px}}</style><article class="card"><div class="card-content"><div class="stretch"></div><h1>Long title wrapping over lines</h1><p>Body</p><img src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="400"><rect width="100" height="400" fill="green"/></svg>')}"><div class="card-source">Source</div></div><footer class="card-footer">Footer</footer></article>`);
    await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
    await p.evaluate(async()=>{const background=document.querySelector('img').cloneNode();background.style.cssText='position:absolute;inset:0;width:600px;height:800px;object-fit:cover';document.querySelector('.card').prepend(background);await background.decode();});
    for(const media of ['screen','print']) {
      await p.emulateMedia({media});const [g]=await collectVisualGeometry(p);
      const direct=await p.locator('h1').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const b=r.getClientRects()[0],c=el.closest('.card').getBoundingClientRect();return {x:b.x-c.x,y:b.y-c.y,width:b.width,height:b.height};});
      assert.deepEqual(g.elements.find(e=>e.role==='title').bbox,direct);
      assert.ok(g.elements.filter(e=>e.role==='title').length>1);
      assert.equal(g.elements.filter(e=>e.kind==='image')[0].bbox.width,45);
      assert.equal(g.elements.filter(e=>e.kind==='image').length,1);assert.equal(g.exclusions.decorativeImages,1);
      assert.ok(g.elements.some(e=>e.role==='source'));assert.ok(g.elements.some(e=>e.role==='footer'));
      assert.ok(!g.elements.some(e=>e.tag==='div'&&e.role==='content'));
      assert.deepEqual((await measureCards(p))[0].overflow,[]);
    }
    await p.locator('.card-content').evaluate(el=>el.style.height='710px');
    assert.ok((await measureCards(p))[0].overflow.includes('content-footer-overlap'));
    await p.locator('.card-content').evaluate((el,n)=>el.innerHTML='<p style="position:absolute;top:0">x</p>'.repeat(n),VISUAL_LIMITS.cardRectangles+1);
    const [bounded]=await collectVisualGeometry(p);assert.equal(bounded.complete,false);assert.ok(bounded.elements.length<=VISUAL_LIMITS.cardRectangles);
    // 200 cards share the same collection ceiling; later cards disclose missing measurements.
    await p.evaluate(()=>{
      document.body.innerHTML=Array.from({length:200},()=>`<article class="card"><div class="card-content">${'<p style="position:absolute;top:0">x</p>'.repeat(120)}</div><footer class="card-footer">Footer</footer></article>`).join('');
    });
    const deck=await collectVisualGeometry(p);assert.equal(deck.length,200);
    assert.ok(deck.some(c=>!c.complete));assert.ok(deck.flatMap(c=>c.elements).length<=VISUAL_LIMITS.rectangles);
    assert.ok(deck.every(c=>c.collection.deckNodes<=VISUAL_LIMITS.nodes));
  } finally {await closeBrowser(renderer.browser);}
});
