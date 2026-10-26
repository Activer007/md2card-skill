#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {buildDocument,buildPreviewDocument,SIZES,textContrastRatio,t37DefaultTextPolicy} from './document.mjs';
import {renderCards} from './markdown.mjs';
import {createAssetResolver} from './assets.mjs';
import {openRenderer,closeBrowser,measureCards} from './browser.mjs';
import {parseOptions,exportCards} from './render.mjs';
import {inspectPdf} from './qa.mjs';
import {visibleSegments,assertPdfSegments} from './validate-series.mjs';
import {prepareStageOutput} from './validate-screenshot-stage.mjs';
import {defaultBodyFixtures} from '../tests/helpers/body-size-fixtures.mjs';
import {SEMANTIC_FILES} from './evidence-source.mjs';
import {bounded} from './validate-gallery.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const CONTRAST_BASE='0ce7e161b20d2bad1dd789150dd16acd98b00c2f';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
const json=(f,v)=>writeFile(f,JSON.stringify(v,null,2)+'\n');
const run=(exe,args)=>exec(exe,args,{cwd:ROOT,windowsHide:true,timeout:30000,maxBuffer:32*1024*1024});
const hex=rgb=>'#'+rgb.match(/[\d.]+/g).slice(0,3).map(v=>Math.round(Number(v)).toString(16).padStart(2,'0')).join('');
const lightCss=css=>css.replace('--paper:#131e1b; --ink:#f7f2e3; --muted:#c2cabd;','--paper:#faf7ef; --ink:#202820; --muted:#505d54;').replace('--panel:#0d1714;','--panel:#eeeadd;');

// Actual computed styles + boxes, not source-token assumptions. Complex media
// backgrounds are explicitly unassessed; photo-cover still needs visual review.
async function collect(page) {
 const data=await bounded(page.locator('.card').evaluate(card=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x-card.getBoundingClientRect().x,y:r.y-card.getBoundingClientRect().y,width:r.width,height:r.height};};
  const surface=e=>{for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.backgroundImage!=='none')return null;const c=s.backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;}return null;};
  const texts=[...card.querySelectorAll('h1,.card-eyebrow,.template-main p,strong,em,a,figcaption,.card-source,.brand-name,.footer-text')].map(e=>{const s=getComputedStyle(e);return {tag:e.tagName,className:e.className,text:e.textContent,color:s.color,background:e.closest('.photo-zone')?null:surface(e),fontSize:s.fontSize,fontFamily:s.fontFamily,fontWeight:s.fontWeight,box:rect(e)};});
  return {texts,bodyText:card.innerText,images:[...card.querySelectorAll('img')].map(e=>({alt:e.alt,src:e.src,fit:getComputedStyle(e).objectFit,box:rect(e),natural:[e.naturalWidth,e.naturalHeight],complete:e.complete})),card:{background:getComputedStyle(card).backgroundColor,accent:getComputedStyle(card).getPropertyValue('--accent').trim()}};
 }),15000,'T37 computed styles');
 for(const t of data.texts){t.ratio=t.background&&/^rgb\(/.test(t.background)?textContrastRatio(hex(t.color),hex(t.background)):null;t.target=4.5;}
 for(const img of data.images){img.sha256=hash(Buffer.from(img.src.split(',')[1],'base64'));delete img.src;}
 return data;
}
async function pixels(page,before,after){
 return bounded(page.evaluate(async({a,b})=>{
  const read=async src=>{const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return {data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};};
  const old=await read(a),next=await read(b);if(old.width!==next.width||old.height!==next.height)throw Error('Raster size changed');
  let count=0,maxChannelDifference=0,minX=old.width,minY=old.height,maxX=-1,maxY=-1;
  for(let i=0;i<old.data.length;i+=4){let changed=false;for(let c=0;c<4;c++){const delta=Math.abs(old.data[i+c]-next.data[i+c]);maxChannelDifference=Math.max(maxChannelDifference,delta);if(delta)changed=true;}if(changed){count++;const p=i/4,x=p%old.width,y=Math.floor(p/old.width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
  return {width:old.width,height:old.height,changedPixels:count,maxChannelDifference,bounds:count?{minX,minY,maxX,maxY}:null};
 },{a:'data:image/png;base64,'+(await readFile(before)).toString('base64'),b:'data:image/png;base64,'+(await readFile(after)).toString('base64')}),15000,'T37 pixel comparison');
}

export async function validateT37Contrast({out,baselineRoot,browser,only}){
 out=await prepareStageOutput(out);
 const report={schemaVersion:1,status:'running',baselineCommit:CONTRAST_BASE,records:[],compatibility:[],humanVisualReview:'pending',limitations:['Light palette is a trusted token test fixture, not a new CLI theme.','Ratios cover opaque solid surfaces only; photo text requires separate review.']};
 const save=()=>json(path.join(out,'report.json'),report);
 let renderer;
 try {
  for(const file of SEMANTIC_FILES){const original=(await exec('git',['show',`${CONTRAST_BASE}:${file}`],{cwd:ROOT,encoding:'buffer',windowsHide:true,maxBuffer:32*1024*1024,timeout:20000})).stdout;assert.equal(hash(await readFile(path.join(baselineRoot,file))),hash(original),file);}
  const old=await import(pathToFileURL(path.join(baselineRoot,'scripts/document.mjs')));
  const css=await Promise.all(['themes','layouts','templates'].map(n=>readFile(path.join(ROOT,`assets/${n}.css`),'utf8')));
  for(const f of await defaultBodyFixtures())for(const accent of [undefined,'#000000','#e4c37d']){
   const cards=renderCards(f.source,{resolveImage:f.resolveImage}),options={...f.options,...(accent?{brand:{accent}}:{})};
   if(cards.some(c=>c.metadata.template==='T37')&&accent==='#000000')continue;
   const before=old.buildDocument(cards,options,...css),after=buildDocument(cards,options,...css);
   assert.equal(after,before,`${f.id}: unrelated HTML changed`);
   report.compatibility.push({id:f.id,accent:accent??null,htmlSha256:hash(after),inputSha256:hash(f.source)});
  }
  const source=await readFile(path.join(ROOT,'examples/t37-contrast/default.md'),'utf8');
  const edit=(body,metadata={})=>{const match=/^<!-- card: (.+) -->/.exec(source);return `<!-- card: ${JSON.stringify({...JSON.parse(match[1]),...metadata})} -->\n${body}`;};
  const cases=[
   {id:'no-brand'}, {id:'black',accent:'#000000',changed:true}, {id:'dark',accent:'#123',changed:true}, {id:'readable',accent:'#e4c37d'},
   {id:'light-white',accent:'#fff',light:true,changed:true}, {id:'light-pastel',accent:'#f4edda',light:true,changed:true}, {id:'light-readable',accent:'#126d64',light:true},
   {id:'long-title',accent:'#000',changed:true,source:edit('# 在沿岸慢行时留下一段值得**再次观察**的光影\n\n保留来源。\n',{eyebrow:''})},
   {id:'long-caption',accent:'#000',changed:true,source:edit('# 沿岸 **慢行**\n\n保留[来源链接](https://example.com)。\n',{caption:'AI 合成示例：图中的海岸与小船用于版式练习，并非真实摄影或地点记录。'})},
   {id:'photo-control',accent:'#000',source:await readFile(path.join(ROOT,'examples/gallery-variants/bright-photo.md'),'utf8')},
   {id:'T20-control',accent:'#000',source:await readFile(path.join(ROOT,'examples/gallery-variants/desktop-4x3-default.md'),'utf8')}
  ];
  if(only)assert.ok(cases.some(c=>c.id===only),'Unknown targeted contrast case');
  report.selectedCases=cases.filter(c=>!only||c.id===only).map(c=>c.id);
  renderer=await openRenderer({...SIZES.portrait,browser,scale:1,timeoutMs:30000});const {page}=renderer;page.setDefaultTimeout(15000);
  report.browser=renderer.browser.version();report.sourceHashes=await Promise.all(['scripts/document.mjs','scripts/validate-t37-contrast.mjs','assets/templates.css','assets/themes.css','assets/layouts.css'].map(async file=>({file,sha256:hash(await readFile(path.join(ROOT,file)))})));
  for(const c of cases.filter(c=>!only||c.id===only)){
   const input=c.source??source,resolver=await createAssetResolver(ROOT),cards=renderCards(input,{resolveImage:resolver.resolveImage});
   const brand={name:'PHOTO STUDY · 合成示例',...(c.accent?{accent:c.accent}:{}),logo:resolver.resolveImage('examples/assets/demo-logo.png')};
   const options={...SIZES.portrait,footerMode:'poster',footer:'版式练习 · 不构成事实记录',title:'T37 contrast study',brand};
   const styles=[css[0],css[1],c.light?lightCss(css[2]):css[2]],row={id:c.id,inputSha256:hash(input),lightTokenFixture:!!c.light,expectedChange:!!c.changed,policy:c.id.endsWith('control')?null:t37DefaultTextPolicy(c.accent,styles[2]),versions:{}};
   report.records.push(row);await writeFile(path.join(out,c.id+'.md'),input);
   const expectedText=[...cards.flatMap(visibleSegments),brand.name,options.footer];
   for(const [version,doc] of [['before',old],['after',{buildDocument,buildPreviewDocument}]]){
    const target=path.join(out,`${c.id}-${version}`);await mkdir(target);const html=doc.buildDocument(cards,options,...styles),preview=doc.buildPreviewDocument(cards,options,...styles);
    await writeFile(path.join(target,'cards.html'),html);await writeFile(path.join(target,'preview.html'),preview);
    const v={htmlSha256:hash(html),views:{}};row.versions[version]=v;
    for(const media of ['screen','print']){
     await page.setViewportSize({width:1144,height:1504});await page.emulateMedia({media});await page.setContent(html);await bounded(page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));}),15000,'T37 image readiness');
     const measures=await bounded(measureCards(page),15000,'T37 overflow measurement');assert.deepEqual(measures[0].overflow,[],`${c.id}/${version}/${media}: overflow`);
     const data=await collect(page);v.views[media]=data;assert.ok(data.images.every(i=>i.complete));
     assert.equal(data.images[0].sha256,cards[0].image.hash);assert.equal(data.images.at(-1).sha256,brand.logo.hash);
     if(version==='after'&&!c.id.endsWith('control'))for(const t of data.texts)if(t.ratio!==null)assert.ok(t.ratio>=4.5,`${c.id}/${media}/${t.tag}: ${t.ratio}`);
     await page.locator('.card').screenshot({path:path.join(target,`${media}.png`),animations:'disabled'});
    }
    await bounded(page.pdf({path:path.join(target,'cards.pdf'),printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,margin:{top:0,bottom:0,left:0,right:0}}),15000,'T37 native PDF');
    // -layout interleaves adjacent columns (T20 control). Source coverage is
    // checked strictly with -raw + NFC below, never dropped or NFKC-normalized.
    v.pdf=await inspectPdf(path.join(target,'cards.pdf'),{expectedPages:1,requireTools:true,expectedText:expectedText.join('\n')});
    const raw=(await run('pdftotext',['-enc','UTF-8','-raw',path.join(target,'cards.pdf'),'-'])).stdout;assertPdfSegments(raw,expectedText,c.id);v.pdf.sourceCoverage={extractor:'Poppler -raw',normalization:'NFC and whitespace only',expected:expectedText,missing:[]};await writeFile(path.join(target,'pdf-raw.txt'),raw);
    await run('pdftoppm',['-r','96','-png','-singlefile',path.join(target,'cards.pdf'),path.join(target,'native-pdf')]);
    for(const width of [375,390]){
     await page.emulateMedia({media:'screen'});await page.setViewportSize({width,height:900});await page.setContent(preview);await bounded(page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));}),15000,'T37 mobile readiness');
     v.views[`mobile${width}`]=await collect(page);await page.screenshot({path:path.join(target,`mobile-${width}.png`),animations:'disabled'});
    }
   }
   row.pixels={};for(const name of ['screen','print','mobile-375','mobile-390','native-pdf']){const difference=await pixels(page,path.join(out,`${c.id}-before`,`${name}.png`),path.join(out,`${c.id}-after`,`${name}.png`));row.pixels[name]=difference;if(!c.changed)assert.equal(difference.changedPixels,0,`${c.id}/${name} changed`);else assert.ok(difference.changedPixels>0,`${c.id}/${name} did not improve`);}
   for(const media of ['screen','print','mobile375','mobile390']){const a=row.versions.before.views[media],b=row.versions.after.views[media];assert.equal(a.bodyText,b.bodyText);assert.deepEqual(a.images,b.images);assert.deepEqual(a.texts.map(t=>t.box),b.texts.map(t=>t.box),'Text geometry changed');}
   console.log(`${c.id}: measured, PDF searchable, ${c.changed?'controlled color change':'pixel-identical'}`);await save();
  }
  // Exercise the actual export pipeline and its hard refusal, not just screenshots.
  const brandFile=path.join(out,'brand-black.json');await json(brandFile,{name:'PHOTO STUDY · 合成示例',accent:'#000000',logo:'examples/assets/demo-logo.png'});
  await writeFile(path.join(out,'black.md'),source);
  const production=await exportCards(parseOptions([path.join(out,'black.md'),'--out',path.join(out,'production-black'),'--asset-root',ROOT,'--format','all','--preview','--strict','--footer-mode','poster','--footer','版式练习 · 不构成事实记录','--title','T37 contrast study','--brand',brandFile,...(browser?['--browser',browser]:[])]));
  const productionResolver=await createAssetResolver(ROOT);
  const productionCards=renderCards(source,{resolveImage:productionResolver.resolveImage});
  const expectedProduction=buildDocument(productionCards,{...SIZES.portrait,footerMode:'poster',footer:'版式练习 · 不构成事实记录',title:'T37 contrast study',brand:{name:'PHOTO STUDY · 合成示例',accent:'#000000',logo:productionResolver.resolveImage('examples/assets/demo-logo.png')}},...css);
  assert.equal(hash(await readFile(path.join(out,'production-black/cards.html'))),hash(expectedProduction));report.production=production;
  const overflow=path.join(out,'overflow.md');await writeFile(overflow,source+'\n\n'+('长正文必须保持硬溢出拒绝。'.repeat(400)));
  await assert.rejects(exportCards(parseOptions([overflow,'--out',path.join(out,'overflow-refusal'),'--asset-root',ROOT,'--format','html','--brand',brandFile,...(browser?['--browser',browser]:[])])),error=>{report.overflow={code:error.code,details:error.details};return error.code==='CONTENT_OVERFLOW';});
  report.status='pass';
 }catch(error){report.status='fail';report.error={message:error.message,stack:error.stack};throw error;}
 finally{try{if(renderer)await closeBrowser(renderer.browser);}catch(error){report.status='fail';report.cleanupError=error.message;throw error;}finally{await save();}}
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
 assert.ok(args.includes('--allow-browser'),'Pass --allow-browser');assert.ok(value('--baseline-root'),'Provide a verified archive of main');
 await validateT37Contrast({out:path.resolve(value('--out')??'validation/t37-contrast/run'),baselineRoot:path.resolve(value('--baseline-root')),browser:value('--browser'),only:value('--only')});
}
