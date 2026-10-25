import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm, symlink, rename, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCards } from '../scripts/markdown.mjs';
import { buildDocument, buildPreviewDocument, SIZES } from '../scripts/document.mjs';
import { validateAspects, validateAspectPlan, aspectVisibleSegments, assertAspectMobile, measureAspectMobile, loadAspectCard, MAX_ASPECT_CASES } from '../scripts/validate-aspects.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
const plan=JSON.parse(await readFile(path.join(ROOT,'examples/aspects/validation-plan.json'),'utf8'));
const fakePng=(width,height)=>{ const b=Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(b); b.writeUInt32BE(width,16); b.writeUInt32BE(height,20); return b; };
const fakeError=(code,message=code)=>Object.assign(new Error(message),{code});

// Every runtime dependency that could launch a browser, inspect a PDF or run a
// subprocess is replaced. Synthetic PNG headers are only protocol fixtures, not
// real images, screenshots, rendering evidence or fit measurements. Removed after tests.
async function harness(t, config={}) {
  const dir=await mkdtemp(path.join(tmpdir(),'md2card-aspect-validator-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const repository=path.join(dir,'repo'), outputRoot=path.join(dir,'results'); await mkdir(repository);
  for(const folder of ['assets','scripts','examples/aspects']) await cp(path.join(ROOT,folder),path.join(repository,folder),{recursive:true});
  for(const file of ['package.json','package-lock.json']) await cp(path.join(ROOT,file),path.join(repository,file));
  await mkdir(path.join(repository,'examples/templates'),{recursive:true});
  for(const id of ['T04','T21','T05','T13','T24','T37']) await cp(path.join(ROOT,`examples/templates/${id}.md`),path.join(repository,`examples/templates/${id}.md`));
  await cp(path.join(ROOT,'examples/templates/assets'),path.join(repository,'examples/templates/assets'),{recursive:true});
  const styles=await Promise.all(['themes','layouts','templates'].map(name=>readFile(path.join(repository,`assets/${name}.css`),'utf8')));
  const calls={exports:[],opens:[],closes:0,pdfs:[],commands:[]}, sources=new Map();
  const dependencies={
    runCommand:async(command,args)=>{
      calls.commands.push({command,args});
      if(command==='git') return {stdout:args[0]==='rev-parse'?'a'.repeat(40):config.dirty?' M scripts/render.mjs':''};
      assert.equal(command,'pdftotext'); assert.ok(args.includes('-raw') && !args.includes('-layout')); assert.deepEqual(args.slice(0,4),['-f','1','-l','1']);
      const id=path.basename(path.dirname(args.at(-2))), card=sources.get(id);
      let segments=aspectVisibleSegments(card);
      if(config.pdfMissing && id.startsWith('01-')) segments=segments.filter(text=>text!==card.metadata.source);
      return {stdout:segments.join('\n')+'\f'};
    },
    exportCards:async options=>{
      const id=path.basename(options.out), item=plan.cases[Number(id.slice(0,2))-1]; calls.exports.push({id,options});
      assert.equal(options.strict,true); assert.equal(options.preview,true); assert.equal(options.paginate,'manual'); assert.deepEqual([...options.formats].sort(),['html','pdf','png']); assert.equal(options.scale,1);
      assert.equal(options.input,await realpath(path.join(repository,item.input)));
      if(config.exportError && id.startsWith('01-')) throw fakeError(config.exportError);
      if(config.nestedCleanup && id.startsWith('01-')) throw Object.assign(fakeError('CONTENT_OVERFLOW'),{details:{cleanupFailures:[{action:'close-browser',code:'BROWSER_CLEANUP_TIMEOUT'}]}});
      if(config.twoFailures && ['01','02'].includes(id.slice(0,2))) throw fakeError('TEST_EXPORT_FAILURE');
      const source=await readFile(options.input,'utf8'), card=await loadAspectCard(repository,item); sources.set(id,card);
      await mkdir(options.out,{recursive:true});
      const overflow=(item.scope==='same-source-long' && !(config.unexpectedLongFit && id.startsWith('09-'))) || (config.originalOverflow && item.scope==='same-source-original') || (config.shortOverflow && id.startsWith('01-'));
      if(overflow) {
        await writeFile(path.join(options.out,'overflow.json'),JSON.stringify({code:'CONTENT_OVERFLOW',status:'overflow',input:path.basename(options.input),dimensions:SIZES[item.aspect],cards:[{index:1,sourceLines:card.sourceLines,screen:{overflow:['content-height']},print:{overflow:[]}}]}));
        if(config.partialOverflow && id.startsWith('09-')) await writeFile(path.join(options.out,'cards.html'),'not allowed');
        throw fakeError('CONTENT_OVERFLOW');
      }
      const files={
        'cards.html':buildDocument([card],options,...styles),
        'preview.html':buildPreviewDocument([card],options,...styles),
        'cards.pdf':'FAKE PDF TEST BYTES; never inspected by a real PDF tool',
        'card-001.png':fakePng(options.width,options.height)
      };
      const artifacts=[];
      for(const [file,value] of Object.entries(files)) { const bytes=Buffer.from(value); await writeFile(path.join(options.out,file),bytes); artifacts.push({file,bytes:bytes.length,sha256:hash(bytes)}); }
      const manifest={inputSha256:hash(source),cardCount:1,pagination:{mode:'manual'},dimensions:SIZES[item.aspect],cards:[{template:item.template,aspect:item.aspect,sourceSha256:hash(card.source)}],qa:{overflow:{screen:'pass',print:'pass'},pdf:{status:'pass',searchable:true,pageCount:1},visualReview:'not-performed'},artifacts,styleSha256:Object.fromEntries(['themes','layouts','templates'].map((name,i)=>[name,hash(styles[i])])),assets:card.image?[{hash:card.image.hash,width:card.image.width,height:card.image.height}]:[],versions:{chromium:'fake-not-a-browser'}};
      await writeFile(path.join(options.out,'manifest.json'),JSON.stringify(manifest));
      if(config.badHash && id.startsWith('01-')) await writeFile(path.join(options.out,'cards.html'),'CORRUPTED');
      return manifest;
    },
    inspectPdf:async(file,options)=>{ calls.pdfs.push({file,options}); assert.equal(options.requireTools,true); assert.equal(options.expectedPages,1); assert.equal(typeof options.expectedText,'string','-layout inspector must not enforce interleaved paragraph snippets'); return {status:'pass',pageCount:1,searchable:true}; },
    openRenderer:async options=>{
      const id=calls.exports.at(-1).id, item=plan.cases[Number(id.slice(0,2))-1]; calls.opens.push({id,options}); if(config.acquireError)throw config.acquireError==='unknown'?new Error('Initialization disconnected'):fakeError(config.acquireError); let viewportWidth;
      const audit=()=>mobileAudit(item,viewportWidth,config.smallFont && id.startsWith('01-'));
      return {browser:{fake:true},page:{
        async emulateMedia() {}, async setContent() {}, async setViewportSize(value) {viewportWidth=value.width;},
        async evaluate(fn) { if(fn===measureAspectMobile) {if(config.hangMobile && id.startsWith('01-'))return new Promise(()=>{});if(config.operationError && id.startsWith('01-'))throw new Error('Audit browser disconnected');return audit();} return undefined; },
        locator(selector) { assert.equal(selector,'.card'); return {async screenshot({path:file,scale}) {assert.equal(scale,'css');const [a]=audit();await writeFile(file,fakePng(Math.ceil(a.cardWidth),Math.ceil(a.cardHeight)));}}; }
      }};
    },
    closeBrowser:async browser=>{assert.equal(browser.fake,true);calls.closes++;if(config.closeError && calls.closes===1)throw fakeError('BROWSER_CLEANUP_FAILED');}
  };
  return {repository,outputRoot,calls,run:()=>validateAspects({repository,outputRoot,...(config.hangMobile?{mobileTimeoutMs:20}:{})},dependencies)};
}
function mobileAudit(item,viewportWidth,small=false) {
  const [width,height]=item.dimensions, cardWidth=viewportWidth-24, scale=cardWidth/width;
  const type=ratio=>({fontSize:ratio*width,effectiveSize:ratio*cardWidth,visible:true,nestedTransform:false});
  return [{template:item.template,aspect:item.aspect,cardWidth,cardHeight:height*scale,canvasWidth:width,canvasHeight:height,scale,counter:'1 / 1',images:(item.assets??[]).map(asset=>({naturalWidth:asset.dimensions[0],naturalHeight:asset.dimensions[1],complete:true,width:200,height:130,objectFit:'contain',clipped:false,geometry:{status:'verified',painted:{width:195,height:130},clips:[{selector:'image-content-box',clipsX:false,clipsY:false}],issues:[]},visible:true,nestedTransform:false})),body:[type(small?.02:.043)],notes:[type(.0335)]}];
}

test('fixed 58-case schema rejects expansions, substitutions, malformed ratios and expectation weakening',()=>{
  assert.equal(validateAspectPlan(structuredClone(plan)).cases.length,58);
  for(const change of [p=>p.cases.push(p.cases[0]),p=>p.cases[0].input='../secret.md',p=>p.cases[0].aspect='square" style=',p=>p.cases[0].dimensions=[100,200],p=>p.cases[0].expected='expected-CONTENT_OVERFLOW-unverified',p=>p.cases[2].inputSha256='0'.repeat(64),p=>p.cases[0]=p.cases[1]]) {const p=structuredClone(plan);change(p);assert.throws(()=>validateAspectPlan(p));}
});

test('source segment extraction includes all prose, headings, code and consequential metadata',()=>{
  const [card]=renderCards('<!-- card: {"template":"T21","metric":"38%","label":"提交率","source":"虚构来源","eyebrow":"教学"} -->\n# 标题\n\n这是 **完整** 段落。\n\n## 口径\n\n`literal`\n\n```txt\nsource code\n```');
  const segments=aspectVisibleSegments(card);
  for(const text of ['标题','这是 完整 段落。','口径','literal','source code\n','教学','虚构来源','38%','提交率','1 / 1'])assert.ok(segments.includes(text),text);
});

test('mobile audit enforces measured inner width plus unchanged canvas and actual-display floors',()=>{
  for(const item of plan.cases)for(const viewport of [375,390])assert.doesNotThrow(()=>assertAspectMobile(mobileAudit(item,viewport),item,viewport));
  const item=plan.cases[0];
  for(const change of [a=>a[0].cardWidth=375,a=>a[0].body[0].fontSize=.042*1080,a=>a[0].body[0].effectiveSize=13,a=>a[0].notes[0].fontSize=.03*1080,a=>a[0].notes=[],a=>a[0].scale=.9,a=>a[0].aspect='portrait',a=>a[0].body[0].fontSize=NaN,a=>a[0].body[0].visible=false,a=>a[0].notes[0].nestedTransform=true]) {const a=mobileAudit(item,375);change(a);assert.throws(()=>assertAspectMobile(a,item,375));}
});

test('source-only doubles exercise all 58 cases, source/PDF hashes, both mobile widths and expected long overflow',async t=>{
  const h=await harness(t),summary=await h.run();
  assert.equal(summary.status,'pass');assert.equal(summary.results.length,58);assert.equal(summary.errors.length,0);assert.equal(summary.visualReview,'not-performed');
  assert.equal(summary.results.filter(r=>r.status==='expected-overflow').length,14);
  assert.equal(summary.results.filter(r=>r.status==='expected-refusal').length,8); assert.equal(h.calls.exports.length,50);
  const success=summary.results.filter(r=>r.status==='exported-not-visually-reviewed');assert.equal(success.length,36);assert.equal(h.calls.opens.length,36);assert.equal(h.calls.closes,36);
  for(const r of success){assert.deepEqual(r.mobile.map(m=>m.viewportWidth),[375,390]);assert.equal(r.pdf.sourceCheck.status,'pass');assert.equal(r.pdf.sourceCheck.extraction,'per-page-raw');assert.ok(r.pdf.sourceCheck.expectedSegments>=4);assert.match(r.manifestSha256,/^[a-f0-9]{64}$/);for(const m of r.mobile)assert.match(m.sha256,/^[a-f0-9]{64}$/);}
  assert.equal(JSON.parse(await readFile(path.join(h.outputRoot,'summary.json'),'utf8')).results.length,58);
});

test('original-source overflow is allowed honestly without swapping in short input',async t=>{
  const h=await harness(t,{originalOverflow:true}),summary=await h.run();assert.equal(summary.status,'pass');assert.equal(summary.results.filter(r=>r.status==='allowed-overflow').length,14);assert.equal(h.calls.opens.length,22);
  for(const r of summary.results.filter(r=>r.scope==='same-source-original')){assert.equal(r.input,`examples/templates/${r.template}.md`);assert.equal(r.actualOutcome,'overflow');assert.equal(r.artifacts[0].file,'overflow.json');}
});

test('each independent export failure is collected and later cases still run',async t=>{
  const h=await harness(t,{twoFailures:true}),summary=await h.run();assert.equal(h.calls.exports.length,50);assert.equal(summary.results.length,58);assert.equal(summary.errors.length,2);assert.ok(summary.results.slice(2).every(r=>r.status!=='fail'));assert.equal(summary.status,'fail');
});

test('short candidate overflow fails; long overflow with partial publication fails; unexpected long fit fails',async t=>{
  for(const config of [{shortOverflow:true},{partialOverflow:true},{unexpectedLongFit:true}]){
    const h=await harness(t,config),summary=await h.run();assert.equal(summary.status,'fail');assert.equal(summary.results.length,58);assert.equal(h.calls.exports.length,50);
    if(config.shortOverflow)assert.ok(summary.errors.some(e=>e.code==='ASPECT_CANDIDATE_OVERFLOW'));
    if(config.partialOverflow)assert.ok(summary.errors.some(e=>e.phase==='overflow-evidence'));
    if(config.unexpectedLongFit)assert.ok(summary.errors.some(e=>e.code==='ASPECT_UNEXPECTED_LONG_FIT'));
  }
});

test('artifact hash damage and missing native PDF source segments fail independently',async t=>{
  for(const config of [{badHash:true},{pdfMissing:true}]){const h=await harness(t,config),summary=await h.run();assert.equal(summary.status,'fail');assert.equal(summary.results[0].status,'fail');assert.equal(summary.results.at(-1).status,'expected-refusal');assert.equal(h.calls.exports.length,50);}
});

test('both mobile-width failures are retained, screenshots hashed, and renderer closed',async t=>{
  const h=await harness(t,{smallFont:true}),summary=await h.run();assert.equal(summary.results[0].mobile.length,2);assert.deepEqual(summary.results[0].errors.map(e=>e.phase),['mobile-375','mobile-390']);assert.equal(h.calls.closes,36);assert.equal(summary.status,'fail');
});

test('a browser launch denial or uncertain cleanup stops repeated browser work but records all remaining cases',async t=>{
  for(const config of [{exportError:'BROWSER_LAUNCH_FAILED'},{closeError:true},{nestedCleanup:true},{hangMobile:true},{acquireError:'RENDER_TIMEOUT'},{acquireError:'unknown'},{operationError:true}]){const h=await harness(t,config),summary=await h.run();assert.equal(h.calls.exports.length,1);assert.equal(summary.results.length,58);assert.equal(summary.results.filter(r=>r.status==='blocked').length,49);assert.equal(summary.errors.length,50);assert.equal(summary.status,'fail');}
});

test('dirty checkout or stale output blocks execution, and input hash mismatch prevents that export only',async t=>{
  const dirty=await harness(t,{dirty:true});await assert.rejects(dirty.run());assert.equal(dirty.calls.exports.length,0);
  const stale=await harness(t);await mkdir(stale.outputRoot);await writeFile(path.join(stale.outputRoot,'keep.txt'),'keep');await assert.rejects(stale.run());assert.equal(stale.calls.exports.length,0);assert.equal(await readFile(path.join(stale.outputRoot,'keep.txt'),'utf8'),'keep');
  const changed=await harness(t);await writeFile(path.join(changed.repository,'examples/aspects/T04-square.md'),'# Changed input');const summary=await changed.run();assert.equal(summary.results[0].errors[0].phase,'source');assert.equal(changed.calls.exports.length,49);assert.equal(summary.results.at(-1).status,'expected-refusal');
});

test('different source semantics are rejected before commands, output creation or browser/export acquisition',async t=>{
  for(const file of ['assets/templates.css','scripts/markdown.mjs','scripts/browser.mjs','scripts/validate-aspects.mjs','package-lock.json','package.json']) {
    const h=await harness(t),target=path.join(h.repository,file),original=await readFile(target,'utf8');
    if(file==='package.json') {const pkg=JSON.parse(original);pkg.dependencies['markdown-it']='0.0.0';await writeFile(target,JSON.stringify(pkg));}
    else await writeFile(target,original+'\n/* different source */\n'+(file.endsWith('.mjs')?'throw new Error("Untrusted source must never execute");\n':''));
    await assert.rejects(h.run(),{code:'ASPECT_SOURCE_INVALID'});
    assert.equal(h.calls.commands.length,0);assert.equal(h.calls.exports.length,0);assert.equal(h.calls.opens.length,0);
    await assert.rejects(readFile(path.join(h.outputRoot,'summary.json')),{code:'ENOENT'});
  }
});

const directoryLink=(destination,link)=>symlink(destination,link,process.platform==='win32'?'junction':'dir');

test('identical input through an escaping junction or symlink is refused, including a sibling with the same prefix',async t=>{
  const h=await harness(t),outside=h.repository+'-outside',original=path.join(h.repository,'examples/aspects');
  await rename(original,outside);await directoryLink(outside,original);
  await assert.rejects(loadAspectCard(h.repository,plan.cases[0]),{code:'ASPECT_SOURCE_INVALID'});
  // The inventory itself must also stay inside the root; no exports may start.
  await assert.rejects(h.run(),{code:'EVIDENCE_SOURCE_INVALID'});assert.equal(h.calls.exports.length,0);
});

test('asset root and nested image junctions cannot escape even when the image bytes and hash are unchanged',async t=>{
  for(const relative of ['examples/templates','examples/templates/assets']) {
    const h=await harness(t),original=path.join(h.repository,relative),outside=h.repository+'-outside';
    await rename(original,outside);await directoryLink(outside,original);
    const item=plan.cases.find(item=>item.template==='T37'&&item.scope==='aspect-specific-slide');
    await assert.rejects(loadAspectCard(h.repository,item),{code:'ASPECT_SOURCE_INVALID'});
    const summary=await h.run();assert.equal(summary.status,'fail');assert.ok(h.calls.exports.every(call=>!call.id.includes('T37')));
  }
});

test('real paths and junctions fully inside the root preserve original input and image identities',async t=>{
  const h=await harness(t);
  for(const [relative,name] of [['examples/aspects','aspect-data'],['examples/templates/assets','examples/templates/image-data']]) {
    const original=path.join(h.repository,relative),inside=path.join(h.repository,name);
    await rename(original,inside);await directoryLink(inside,original);
  }
  for(const item of [plan.cases[0],plan.cases.find(item=>item.template==='T37'&&item.scope==='aspect-specific-slide')]) {
    const card=await loadAspectCard(h.repository,item);assert.equal(card.metadata.template,item.template);
    if(item.assets)assert.equal(card.image.hash,item.assets[0].sha256);
  }
  const summary=await h.run();assert.equal(summary.status,'pass');assert.equal(summary.results.length,58);
});

// Execute only the serialized audit function against tiny in-memory DOM doubles.
// This proves its hidden/scaled-node collection, not real browser geometry.
test('mobile collector retains hidden source nodes and flags nested scaling instead of filtering them out',()=>{
  const style={fontSize:'46.44px',fontFamily:'test',lineHeight:'69.66px',display:'block',visibility:'visible',opacity:'1',transform:'none',scale:'none',zoom:'1'};
  const card={style:{...style},offsetWidth:1080,offsetHeight:1080,dataset:{template:'T04',templateAspect:'square'},getBoundingClientRect:()=>({width:351,height:351}),querySelector:()=>({textContent:'1 / 1'})};
  const body={tagName:'P',className:'',textContent:'Original body',parentElement:card,style:{...style},getBoundingClientRect:()=>({width:200,height:50}),querySelectorAll:()=>[]};
  const note={...body,className:'card-source',textContent:'Original source',style:{...style,fontSize:'36.18px',display:'none'},getBoundingClientRect:()=>({width:0,height:0})};
  card.querySelectorAll=selector=>selector==='.card-image'?[]:selector.includes('.template-intro')?[body]:[note];
  const context={document:{querySelectorAll:()=>[card]},getComputedStyle:node=>node.style};
  let [audit]=runInNewContext('('+measureAspectMobile.toString()+')()',context);
  assert.equal(audit.notes.length,1);assert.equal(audit.notes[0].visible,false);
  body.style.transform='matrix(0.5, 0, 0, 0.5, 0, 0)';
  [audit]=runInNewContext('('+measureAspectMobile.toString()+')()',context);assert.equal(audit.body[0].nestedTransform,true);
  body.style.transform='none';body.style.zoom='0.5';
  [audit]=runInNewContext('('+measureAspectMobile.toString()+')()',context);assert.equal(audit.body[0].nestedTransform,true);
});


test('R12 plan rejects extra assets, wrong image hashes, support expansion and refusal weakening',()=>{
  const i=plan.cases.findIndex(item=>item.template==='T37'), refusal=plan.cases.findIndex(item=>item.scope==='unsupported-named');
  for(const change of [p=>p.cases[i].assetRoot='/',p=>p.cases[i].assets[0].sha256='0'.repeat(64),p=>p.cases[i].assets[0].file='../outside.png',p=>p.cases[i].assets.push(p.cases[i].assets[0]),p=>p.cases[refusal].expected='candidate-unmeasured',p=>p.cases[refusal].aspect='portrait',p=>p.cases[i].visualReview='accepted',p=>p.cases[22].input='examples/aspects/T13-square.md']) { const p=structuredClone(plan); change(p); assert.throws(()=>validateAspectPlan(p)); }
});

test('image collector contract refuses crop, changed proportions, missing or hidden full-frame image',()=>{
  const item=plan.cases.find(item=>item.template==='T37');
  for(const change of [a=>a[0].images=[],a=>a[0].images[0].naturalWidth=800,a=>a[0].images[0].objectFit='cover',a=>a[0].images[0].complete=false,a=>a[0].images[0].clipped=true,a=>a[0].images[0].geometry.status='unverified',a=>a[0].images[0].geometry.painted.width=1,a=>delete a[0].images[0].geometry,a=>a[0].images[0].visible=false,a=>a[0].images[0].nestedTransform=true]) { const a=mobileAudit(item,375); change(a); assert.throws(()=>assertAspectMobile(a,item,375)); }
});

test('image caption remains in native PDF source segments and altered image bytes block its export',async t=>{
  const item=plan.cases.find(item=>item.template==='T37');
  const card=await loadAspectCard(ROOT,item); assert.ok(aspectVisibleSegments(card).includes(card.metadata.caption));
  const h=await harness(t); await writeFile(path.join(h.repository,item.assets[0].file),'changed image');
  const summary=await h.run(); assert.equal(summary.status,'fail');
  const results=summary.results.filter(result=>result.template==='T37'); assert.equal(results.length,9);
  assert.ok(results.every(result=>result.errors[0].phase==='source'));
  assert.ok(h.calls.exports.every(call=>!call.id.includes('T37')));
});

// The numeric element sizes below are copied from the immutable CI run
// 40068790583 T37 audits. Coordinates/ancestors here are explicit DOM doubles,
// not rerendered measurements or replacement CI artifacts.
function imageGeometryFixture({ viewport = 375, aspect = 'slide', width = 198.04763793945312, height = 86.87249755859375 } = {}) {
  const dimensions=SIZES[aspect], scale=(viewport-24)/dimensions.width;
  const rectangle=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
  const style={fontSize:`${dimensions.width*.043}px`,fontFamily:'test',lineHeight:`${dimensions.width*.043*1.5}px`,display:'block',visibility:'visible',opacity:'1',transform:'none',scale:'none',rotate:'none',translate:'none',zoom:'1',contain:'none',contentVisibility:'visible',overflowX:'visible',overflowY:'visible',overflowClipMargin:'0px',clipPath:'none',clip:'auto',maskImage:'none',objectFit:'contain',objectPosition:'50% 50%'};
  for(const side of ['Left','Top','Right','Bottom']) {style[`border${side}Width`]='0px';style[`padding${side}`]='0px';}
  for(const corner of ['TopLeft','TopRight','BottomLeft','BottomRight'])style[`border${corner}Radius`]='0px';
  const node=(className,rect,parentElement,extra={})=>({className,tagName:'DIV',textContent:'',style:{...style},bounds:rect,parentElement,getBoundingClientRect(){return this.bounds;},querySelectorAll:()=>[],...extra});
  const card=node('card',rectangle(12,0,viewport-24,dimensions.height*scale),null,{offsetWidth:dimensions.width,offsetHeight:dimensions.height,dataset:{template:'T37',templateAspect:aspect},querySelector:()=>({textContent:'1 / 1'})});
  card.style.overflowX=card.style.overflowY='hidden';
  const frame=node('image-frame',rectangle(20,20,width,height),card);
  const picture=node('card-image',rectangle(20,20,width,height),frame,{tagName:'IMG',naturalWidth:1536,naturalHeight:1024,complete:true});
  // Actual Chromium 156 UA defaults, the root cause of the previous false positive.
  picture.style.overflowX=picture.style.overflowY='clip'; picture.style.overflowClipMargin='content-box';
  const body=node('',rectangle(30,30,100,30),card,{tagName:'P',textContent:'Original story'});
  const note=node('card-source',rectangle(30,30,100,30),card,{tagName:'P',textContent:'Original caption/source'});note.style.fontSize=`${dimensions.width*.0335}px`;
  card.querySelectorAll=selector=>selector==='.card-image'?[picture]:selector.includes('.template-intro')?[body]:[note];
  const collect=()=>JSON.parse(JSON.stringify(runInNewContext('('+measureAspectMobile.toString()+')()',{document:{querySelectorAll:()=>[card]},getComputedStyle:node=>node.style})));
  const item={template:'T37',aspect,dimensions:[dimensions.width,dimensions.height],assets:[{dimensions:[1536,1024]}]};
  return {card,frame,picture,body,note,collect,item,scale,rectangle,assertPass:()=>assertAspectMobile(collect(),item,viewport)};
}

test('Chromium img overflow:clip is harmless when the exact contain-painted rectangle fits',()=>{
  for(const values of [
    {viewport:375,aspect:'slide',width:198.04763793945312,height:86.87249755859375},
    {viewport:390,aspect:'slide',width:206.51121520996094,height:90.58500671386719},
    {viewport:375,aspect:'portrait',width:314.4984130859375,height:209.66561889648438},
    {viewport:390,aspect:'portrait',width:327.93853759765625,height:218.6256866455078}
  ]) {
    const f=imageGeometryFixture(values), image=f.collect()[0].images[0];
    assert.equal(image.clipped,false); assert.equal(image.geometry.status,'verified');
    assert.equal(image.geometry.clips.find(clip=>clip.selector==='card-image').clipsX,false);
    assert.equal(image.geometry.clips.find(clip=>clip.selector==='card-image').clipsY,false);
    assert.ok(Math.abs(image.geometry.painted.width/image.geometry.painted.height-1.5)<1e-9);
    assert.doesNotThrow(f.assertPass);
    if(values.aspect==='slide')assert.ok(image.geometry.painted.width<image.width*.7,'Actual picture is letterboxed, not stretched to the element box.');
  }
});

test('ancestor overflow declarations pass only while the painted source remains inside their exact bounds',()=>{
  const f=imageGeometryFixture();f.frame.style.overflowX=f.frame.style.overflowY='hidden';
  assert.doesNotThrow(f.assertPass);
  const paint=f.collect()[0].images[0].geometry.painted;
  // Clip empty letterboxing only: the img element exceeds the frame, the source does not.
  f.frame.bounds=f.rectangle(paint.left-1,paint.top,paint.width+2,paint.height);assert.doesNotThrow(f.assertPass);
  f.frame.bounds=f.rectangle(paint.left+1,paint.top,paint.width,paint.height);
  let image=f.collect()[0].images[0];assert.equal(image.clipped,true);assert.ok(image.geometry.clips.find(c=>c.selector==='image-frame').clipsX);assert.throws(f.assertPass,/clipping boundary/);
  f.frame.bounds=f.rectangle(paint.left,paint.top+1,paint.width,paint.height);
  image=f.collect()[0].images[0];assert.ok(image.geometry.clips.find(c=>c.selector==='image-frame').clipsY);assert.throws(f.assertPass,/clipping boundary/);
});

test('image content boxes subtract scaled border/padding and preserve valid object positioning',()=>{
  const f=imageGeometryFixture();
  for(const side of ['Left','Top','Right','Bottom']) {f.picture.style[`border${side}Width`]='10px';f.picture.style[`padding${side}`]='20px';}
  const image=f.collect()[0].images[0];assert.ok(Math.abs(image.geometry.contentBox.left-(20+30*f.scale))<1e-9);assert.doesNotThrow(f.assertPass);
  f.picture.style.objectPosition='100% 0%';assert.doesNotThrow(f.assertPass);
  f.picture.style.objectPosition='200% 50%';assert.throws(f.assertPass,/clipping boundary/);
  f.picture.style.objectPosition='0px 0px';assert.doesNotThrow(f.assertPass);
  f.picture.style.objectPosition='400px 0px';assert.throws(f.assertPass,/clipping boundary/);
  f.picture.style.objectPosition='calc(50% + 1px) 50%';assert.throws(f.assertPass,/Cannot verify/);
});

test('clip-margin is geometric and does not disable hidden, scrollport or card-edge clipping',()=>{
  const f=imageGeometryFixture();const paint=f.collect()[0].images[0].geometry.painted;
  f.frame.bounds=f.rectangle(paint.left+1,paint.top,paint.width-2,paint.height);f.frame.style.overflowX='clip';
  assert.throws(f.assertPass,/clipping boundary/);
  f.frame.style.overflowClipMargin='padding-box 5px';assert.doesNotThrow(f.assertPass);
  f.frame.style.overflowX='hidden';assert.throws(f.assertPass,/clipping boundary/);
  f.frame.style.overflowX='auto';f.frame.bounds=f.rectangle(paint.left,paint.top,paint.width,paint.height);
  f.frame.offsetWidth=594;f.frame.clientWidth=578;f.frame.clientLeft=0;assert.throws(f.assertPass,/clipping boundary/);
  delete f.frame.offsetWidth;delete f.frame.clientWidth;delete f.frame.clientLeft;f.frame.style.overflowX='visible';
  f.picture.bounds=f.rectangle(0,20,f.picture.bounds.width,f.picture.bounds.height);f.picture.style.objectPosition='0% 50%';assert.throws(f.assertPass,/clipping boundary/);
  assert.ok(f.collect()[0].images[0].geometry.clips.find(c=>c.selector==='card').clipsX);
});

test('shaped clips, masks, hidden images and nested scaling remain rejected rather than guessed safe',()=>{
  for(const [property,value] of [['clipPath','inset(1px)'],['clip','rect(0px, 1px, 1px, 0px)'],['maskImage','linear-gradient(black, transparent)']]) {
    const f=imageGeometryFixture();f.picture.style[property]=value;assert.equal(f.collect()[0].images[0].geometry.status,'unverified');assert.throws(f.assertPass,/Cannot verify/);
  }
  const rounded=imageGeometryFixture();rounded.picture.style.borderTopLeftRadius='2px';assert.throws(rounded.assertPass,/Cannot verify/);
  const scaled=imageGeometryFixture();scaled.frame.style.transform='scale(.5)';assert.throws(scaled.assertPass);
  const hidden=imageGeometryFixture();hidden.frame.style.visibility='hidden';assert.throws(hidden.assertPass);
});

// These source-only injections reproduce clipping mechanisms the rectangular
// solver does not support. Reject them without pretending to solve their paint.
test('paint containment and content visibility fail closed even with visible overflow',()=>{
  const unsupported=[
    ...['paint','content','strict','layout paint style','size layout paint style'].map(value=>['contain',value,'unsupported-paint-containment']),
    ...['auto','hidden'].map(value=>['contentVisibility',value,'unsupported-content-visibility'])
  ];
  for(const target of ['picture','frame','card'])for(const [property,value,issue] of unsupported) {
    const f=imageGeometryFixture(), node=f[target], paint=f.collect()[0].images[0].geometry.painted;
    node.style.overflowX=node.style.overflowY='visible';node.style[property]=value;
    if(target==='frame')node.bounds=f.rectangle(paint.left+10,paint.top+10,paint.width-20,paint.height-20);
    const image=f.collect()[0].images[0];
    assert.equal(image.geometry.status,'unverified',`${target} ${property}:${value}`);
    assert.ok(image.geometry.issues.includes(`${issue}:${node.className}`));
    assert.throws(f.assertPass,/Cannot verify full-frame image geometry/);
  }
  for(const contain of ['none','size','inline-size','layout','style','size layout style']) {
    const f=imageGeometryFixture();f.frame.style.contain=contain;f.frame.style.contentVisibility='visible';assert.doesNotThrow(f.assertPass);
  }
});

test('independent rotate rejects the exact rotated-box false negative instead of understating source paint',()=>{
  const f=imageGeometryFixture(), {width,height}=f.picture.bounds;
  // The reviewer injected this 90-degree bounding box. Unrotated contain math
  // reports only 57.915px of paint height; actual rotated source is 130.309px.
  f.picture.bounds=f.rectangle(20,0,height,width);
  f.picture.offsetWidth=width/f.scale;f.picture.offsetHeight=height/f.scale;
  f.picture.style.rotate='90deg';
  const paint=f.collect()[0].images[0].geometry.painted;
  f.frame.bounds=f.rectangle(paint.left,paint.top,paint.width,paint.height);
  f.frame.style.overflowX=f.frame.style.overflowY='hidden';
  const image=f.collect()[0].images[0];
  assert.equal(f.picture.style.transform,'none');assert.ok(paint.height<height*1.5/2);
  assert.equal(image.clipped,false,'The unsupported unrotated math alone misses this crop.');
  assert.equal(image.geometry.status,'unverified');assert.equal(image.nestedTransform,true);
  assert.ok(image.geometry.issues.includes('unsupported-transform-longhand:card-image'));
  assert.throws(f.assertPass,/Cannot verify full-frame image geometry/);
});

test('rotate and translate longhands fail closed on image, ancestor and card without expanding the solver',()=>{
  for(const target of ['picture','frame','card'])for(const [property,value] of [['rotate','90deg'],['rotate','0deg'],['translate','10px 0px'],['translate','0px']]) {
    const f=imageGeometryFixture(),node=f[target];node.style[property]=value;
    const image=f.collect()[0].images[0];
    assert.equal(image.nestedTransform,true);assert.equal(image.geometry.status,'unverified');
    assert.ok(image.geometry.issues.includes(`unsupported-transform-longhand:${node.className}`));
    assert.throws(f.assertPass,/Cannot verify full-frame image geometry/);
  }
  const baseline=imageGeometryFixture();
  baseline.card.style.transform=`matrix(${baseline.scale}, 0, 0, ${baseline.scale}, 0, 0)`;
  assert.doesNotThrow(baseline.assertPass,'The expected card scaling transform remains supported.');
});

test('body and note type floors cannot be established through rotate or translate longhands',()=>{
  for(const target of ['body','note'])for(const inherited of [false,true])for(const property of ['rotate','translate']) {
    const f=imageGeometryFixture(),node=inherited?f.frame:f[target];
    if(inherited)f[target].parentElement=f.frame;
    node.style[property]=property==='rotate'?'90deg':'10px 0px';
    const audit=f.collect(),type=audit[0][target==='body'?'body':'notes'][0];
    assert.equal(type.nestedTransform,true);
    // A shared image ancestor may fail its geometry first; either path rejects.
    assert.throws(()=>assertAspectMobile(audit,f.item,375));
  }
});

test('CLI help and rejected arguments never invoke validation or browser runtime',async()=>{
  const {parseAspectOptions,runAspectCli,ASPECT_USAGE}=await import('../scripts/validate-aspects.mjs');
  let calls=0;const logs=[];const errors=[];
  const runtime={validate:async()=>{calls++;throw new Error('must not enter runtime');},log:message=>logs.push(message),error:message=>errors.push(message)};
  assert.equal(await runAspectCli(['--help'],runtime),0);assert.deepEqual(logs,[ASPECT_USAGE]);
  for(const args of [[],['--unknown'],['--help','--unknown'],['--out'],['--out','--allow-browser'],['--allow-browser','--allow-browser'],['--help','--help']]) assert.equal(await runAspectCli(args,runtime),1);
  assert.equal(calls,0);assert.equal(errors.length,7);
  assert.deepEqual(parseAspectOptions(['--allow-browser']),{allowBrowser:true});
});
test('CLI explicit runtime dispatch remains separately test-injected and reports failures',async()=>{
  const {runAspectCli}=await import('../scripts/validate-aspects.mjs');let received;
  const out=path.join(tmpdir(),'unit-only-aspects');
  const result=await runAspectCli(['--allow-browser','--out',out],{validate:async options=>{received=options;return {results:[],errors:[{code:'UNIT_ONLY'}]};},log:()=>{},error:()=>{}});
  assert.equal(result,1);assert.deepEqual(received,{allowBrowser:true,outputRoot:path.resolve(out)});
});
