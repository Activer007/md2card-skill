import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
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
      assert.equal(options.input,path.join(repository,item.input));
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
  return [{template:item.template,aspect:item.aspect,cardWidth,cardHeight:height*scale,canvasWidth:width,canvasHeight:height,scale,counter:'1 / 1',images:(item.assets??[]).map(asset=>({naturalWidth:asset.dimensions[0],naturalHeight:asset.dimensions[1],complete:true,width:200,height:130,objectFit:'contain',clipped:false,visible:true,nestedTransform:false})),body:[type(small?.02:.043)],notes:[type(.0335)]}];
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

// Execute only the serialized audit function against tiny in-memory DOM doubles.
// This proves its hidden/scaled-node collection, not real browser geometry.
test('mobile collector retains hidden source nodes and flags nested scaling instead of filtering them out',()=>{
  const style={fontSize:'46.44px',fontFamily:'test',lineHeight:'69.66px',display:'block',visibility:'visible',opacity:'1',transform:'none',scale:'none',zoom:'1'};
  const card={offsetWidth:1080,offsetHeight:1080,dataset:{template:'T04',templateAspect:'square'},getBoundingClientRect:()=>({width:351,height:351}),querySelector:()=>({textContent:'1 / 1'})};
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
  for(const change of [a=>a[0].images=[],a=>a[0].images[0].naturalWidth=800,a=>a[0].images[0].objectFit='cover',a=>a[0].images[0].complete=false,a=>a[0].images[0].clipped=true,a=>a[0].images[0].visible=false,a=>a[0].images[0].nestedTransform=true]) { const a=mobileAudit(item,375); change(a); assert.throws(()=>assertAspectMobile(a,item,375)); }
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

test('actual serialized mobile collector measures the full-frame image and detects ancestor cropping',()=>{
  const style={fontSize:'46.44px',fontFamily:'test',lineHeight:'69.66px',display:'block',visibility:'visible',opacity:'1',transform:'none',scale:'none',zoom:'1',overflowX:'visible',overflowY:'visible',clipPath:'none',objectFit:'contain'};
  const card={offsetWidth:1600,offsetHeight:900,dataset:{template:'T37',templateAspect:'slide'},getBoundingClientRect:()=>({width:351,height:197.4375}),querySelector:()=>({textContent:'1 / 1'})};
  const body={tagName:'P',className:'',textContent:'Original story',parentElement:card,style:{...style},getBoundingClientRect:()=>({width:200,height:50}),querySelectorAll:()=>[]};
  const note={...body,className:'card-source',style:{...style,fontSize:'53.6px'}};
  const frame={parentElement:card,style:{...style}};
  const picture={...body,tagName:'IMG',className:'card-image',textContent:'',parentElement:frame,naturalWidth:1536,naturalHeight:1024,complete:true};
  card.querySelectorAll=selector=>selector==='.card-image'?[picture]:selector.includes('.template-intro')?[body]:[note];
  const context={document:{querySelectorAll:()=>[card]},getComputedStyle:node=>node.style};
  const collect=()=>runInNewContext('('+measureAspectMobile.toString()+')()',context)[0].images[0];
  assert.equal(collect().objectFit,'contain'); assert.equal(collect().naturalWidth,1536); assert.equal(collect().clipped,false);
  frame.style.overflowX='hidden'; assert.equal(collect().clipped,true);
  frame.style.overflowX='visible'; picture.style.clipPath='inset(1px)'; assert.equal(collect().clipped,true);
  picture.style.clipPath='none'; frame.style.transform='scale(.5)'; assert.equal(collect().nestedTransform,true);
  frame.style.transform='none'; frame.style.visibility='hidden'; assert.equal(collect().visible,false);
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
  const result=await runAspectCli(['--allow-browser','--out','/tmp/unit-only-aspects'],{validate:async options=>{received=options;return {results:[],errors:[{code:'UNIT_ONLY'}]};},log:()=>{},error:()=>{}});
  assert.equal(result,1);assert.deepEqual(received,{allowBrowser:true,outputRoot:'/tmp/unit-only-aspects'});
});
