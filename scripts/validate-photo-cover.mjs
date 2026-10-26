#!/usr/bin/env node
// Independent exact-fixture evidence, never a replacement for human subject review.
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { openRenderer, closeBrowser, measureCards } from './browser.mjs';
import { SIZES } from './document.mjs';
import { createAssetResolver } from './assets.mjs';
import { exportCards, parseOptions } from './render.mjs';
import { inspectPdf } from './qa.mjs';
import { SEMANTIC_FILES, readEvidenceFile } from './evidence-source.mjs';
import { prepareStageOutput } from './validate-screenshot-stage.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const exec=promisify(execFile),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=(file,value)=>writeFile(file,JSON.stringify(value,null,2)+'\n');
const BASE='38bd0dbd44c8b85e3875fa70280f6d63167ed1c0';
const FIXTURES=path.join(ROOT,'examples/visual-upgrade/t37');
export const PHOTO_CASES=Object.freeze(['blocked-portrait','bright','dark','invalid-focus','invalid-remote','invalid-role','no-crop-permission','no-safe-zone','original','portrait','three-line','title-overflow','uncertain']);
const LEGAL=new Set(['bright','dark','portrait','three-line']);
const FALLBACK=new Set(['blocked-portrait','no-crop-permission','no-safe-zone']);
const PHOTO_FIELDS=['visualVariant','imageRole','mediaFit','focalX','focalY','textZone','mediaTone','subjectSafety'];
const FOOTER='版式练习 · 不构成事实记录';
// Exact allowlist for the reviewed T37 black-brand defect fix. Any other
// document change still fails; historical M2b baselines are never rewritten.
export function compareDefaultPhotoHtml(before, after) {
  const selector='.card.template-T37:not([data-visual-variant="photo-cover"])';
  const correction=`\n/* T37 default: readable text only; authored brand decoration is unchanged. */\n${selector} :is(.card-eyebrow,strong,a) { color: #f7f2e3; }\n${selector} li::marker { color: #f7f2e3; }\n`;
  assert.equal(after.split(correction).length,2,'Expected exactly one T37 default contrast correction');
  assert.equal(after.replace(correction,''),before,'Default HTML changed beyond the reviewed foreground correction');
  return {classification:'controlled-T37-text-color-fix',baselineHtmlSha256:hash(before),currentHtmlSha256:hash(after),foreground:'#f7f2e3'};
}
export function selectPhotoFixtures(names) {
  const actual=names.filter(n=>n.endsWith('.md')&&n!=='README.md').sort();
  assert.deepEqual(actual,PHOTO_CASES.map(id=>`${id}.md`),'Photo fixture inventory differs; review added/missing cases.');
  return actual;
}
export function defaultPhotoInput(source) {
  const m=/^(\s*<!--\s*card\s*:\s*)(.+?)(\s*-->[^\S\r\n]*)(\r?\n|$)/.exec(source);
  assert.ok(m,'Photo fixture requires first-line metadata.');
  const metadata=JSON.parse(m[2]);assert.equal(metadata.template,'T37');assert.equal(metadata.visualVariant,'photo-cover');
  for(const field of PHOTO_FIELDS)delete metadata[field];
  return source.replace(m[0],()=>`${m[1]}${JSON.stringify(metadata)}${m[3]}${m[4]}`);
}
async function verifyBaseline(root) {
  const files=[];
  for(const file of SEMANTIC_FILES.filter(file => file !== 'scripts/visual-diagnostics.mjs')) {
    const old=(await exec('git',['show',`${BASE}:${file}`],{cwd:ROOT,encoding:'buffer',windowsHide:true,maxBuffer:8*1024*1024,timeout:20000})).stdout;
    assert.equal(hash(await readEvidenceFile(root,file)),hash(old),`Baseline differs: ${file}`);files.push({file,sha256:hash(old)});
  }
  return {commit:BASE,files};
}
async function geometry(page) {
  return page.locator('.card').evaluate(card=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const image=card.querySelector('.card-image'),box=rect(image),style=getComputedStyle(image);
    const cover=style.objectFit==='cover',scale=(cover?Math.max:Math.min)(box.width/image.naturalWidth,box.height/image.naturalHeight);
    const pos=style.objectPosition.split(' ').map(parseFloat);
    const crop={x:Math.max(0,(image.naturalWidth-box.width/scale)*pos[0]/100),y:Math.max(0,(image.naturalHeight-box.height/scale)*pos[1]/100),width:Math.min(image.naturalWidth,box.width/scale),height:Math.min(image.naturalHeight,box.height/scale)};
    const zone=card.querySelector('.photo-zone'),heading=card.querySelector('.template-heading'),h1=card.querySelector('h1');
    return {imageBox:box,natural:[image.naturalWidth,image.naturalHeight],fit:style.objectFit,position:style.objectPosition,crop,
      imageData:image.src.split(',')[1],alt:image.alt,complete:image.complete&&image.naturalWidth>0,
      heading:rect(heading),zone:zone?rect(zone):null,source:rect(card.querySelector('.card-source')),footer:rect(card.querySelector('.card-footer')),
      titleLines:Math.round(h1.getBoundingClientRect().height/(parseFloat(getComputedStyle(h1).lineHeight)*(h1.getBoundingClientRect().width/h1.offsetWidth))),
      foreground:zone?[...zone.querySelectorAll('h1,.card-eyebrow,strong,em,a,code,s')].map(e=>({tag:e.tagName,text:e.textContent,color:getComputedStyle(e).color})):[],
      backing:zone?getComputedStyle(heading).backgroundColor:null,bodyFont:getComputedStyle(card.querySelector('.template-main p')).fontSize};
  });
}
export function checkPhotoGeometry(g,metadata,mode) {
  assert.ok(g.complete);assert.equal(g.alt,metadata.alt);assert.equal(g.fit,mode==='photo'?'cover':'contain');
  if(mode!=='photo')return;
  assert.equal(g.position,`${metadata.focalX}% ${metadata.focalY}%`,'Crop focal position differs from author permission');
  assert.equal(g.backing,metadata.mediaTone==='dark'?'rgba(0, 0, 0, 0.76)':'rgba(255, 255, 255, 0.84)','Local contrast backing differs from reviewed contract');
  const s=g.zone,h=g.heading;
  assert.ok(h.x>=s.x-1&&h.right<=s.right+1&&h.y>=s.y-1&&h.bottom<=s.bottom+1,'Title outside declared safe region');
  assert.ok(g.imageBox.bottom<g.source.y&&g.source.bottom<=g.footer.y+1,'Photo/source/footer overlap');
  const expected=metadata.mediaTone==='dark'?'rgb(255, 255, 255)':'rgb(17, 17, 17)';
  assert.ok(g.foreground.length>0);for(const f of g.foreground)assert.equal(f.color,expected,`${f.tag} foreground`);
  assert.ok(g.crop.x>=-1e-6&&g.crop.y>=-1e-6&&g.crop.x+g.crop.width<=g.natural[0]+1e-6&&g.crop.y+g.crop.height<=g.natural[1]+1e-6);
}
async function readyPhotoView(page) {
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
}
export async function validatePhotoCover({out,browser,baselineRoot}) {
  const selected=selectPhotoFixtures(await readdir(FIXTURES));
  assert.ok(baselineRoot,'A verified baseline root is required for default compatibility.');
  const baselineIdentity=await verifyBaseline(baselineRoot);
  out=await prepareStageOutput(out);
  const baseline=await import(pathToFileURL(path.join(baselineRoot,'scripts/document.mjs')));
  const oldParser=await import(pathToFileURL(path.join(baselineRoot,'scripts/markdown.mjs')));
  const oldExport=(await import(pathToFileURL(path.join(baselineRoot,'scripts/render.mjs')))).exportCards;
  const css=await Promise.all(['themes','layouts','templates'].map(n=>readFile(path.join(baselineRoot,`assets/${n}.css`),'utf8')));
  const brand={name:'PHOTO STUDY · 合成示例',accent:'#000000',logo:'examples/assets/demo-logo.png'};
  const brandFile=path.join(out,'brand.json');await json(brandFile,brand);
  const renderer=await openRenderer({...SIZES.portrait,browser,timeoutMs:30000}),records=[];
  try {
    const {page}=renderer;
    for(const file of selected) {
      const id=file.slice(0,-3),source=await readFile(path.join(FIXTURES,file),'utf8');
      const modes=id==='original'?['default']:LEGAL.has(id)||FALLBACK.has(id)?['default','photo']:['photo'];
      for(const mode of modes) {
        const key=`${id}-${mode}`,input=mode==='default'&&id!=='original'?defaultPhotoInput(source):source;
        const inputFile=path.join(out,`${key}.md`),target=path.join(out,key);await writeFile(inputFile,input);
        const options=parseOptions([inputFile,'--out',target,'--asset-root',ROOT,'--format','all','--preview','--strict','--footer-mode','poster','--brand',brandFile,'--footer',FOOTER,...(browser?['--browser',browser]:[])]);
        const record={id,mode,inputSha256:hash(input)};records.push(record);
        const expected=mode==='photo'&&!LEGAL.has(id)?id==='title-overflow'?'CONTENT_OVERFLOW':id==='invalid-remote'?'ASSET_PATH_INVALID':'INVALID_METADATA':null;
        try {record.manifest=await exportCards(options);record.outcome='exported';}
        catch(error) {
          record.outcome='refused';record.code=error.code;record.message=error.message;record.details=error.details;
          await json(path.join(out,'progress.json'),records);
          if(id==='invalid-remote')assert.ok(['ASSET_PATH_INVALID','INVALID_ASSET'].includes(error.code));else assert.equal(error.code,expected,`${key}: unexpected refusal`);
          assert.ok(expected,`${key}: expected export`);console.log(`${key}: refused ${error.code}`);continue;
        }
        assert.equal(expected,null,`${key}: invalid input exported`);
        const metadata=JSON.parse(input.match(/<!-- card: (.+) -->/)[1]);
        const html=await readFile(path.join(target,'cards.html'),'utf8');
        const resolver=await createAssetResolver(ROOT),oldCards=oldParser.renderCards(mode==='photo'?defaultPhotoInput(input):input,{resolveImage:resolver.resolveImage});
        if(mode==='default') {
          const resolvedBrand={...brand,logo:resolver.resolveImage(brand.logo)};
          const oldHtml=baseline.buildDocument(oldCards,{...options,brand:resolvedBrand,preview:false},...css);
          record.defaultCompatibility=compareDefaultPhotoHtml(oldHtml,html);record.baselineHtmlSha256=hash(oldHtml);
        }
        const views={};record.views=views;await page.setViewportSize({width:1144,height:1504});
        for(const media of ['screen','print']) {
          await page.emulateMedia({media});await page.setContent(html);await readyPhotoView(page);
          assert.deepEqual((await measureCards(page))[0].overflow,[]);
          const g=await geometry(page);g.imageSha256=hash(Buffer.from(g.imageData,'base64'));delete g.imageData;
          assert.equal(g.imageSha256,oldCards[0].image.hash);checkPhotoGeometry(g,metadata,mode);views[media]=g;
          if(id==='three-line'&&mode==='photo')assert.equal(g.titleLines,3);
          await page.locator('.card').screenshot({path:path.join(target,`${media}.png`)});
        }
        const plain=line=>line.replace(/^#+\s+/,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*|`/g,'').trim();
        const snippets=[...input.split('\n').slice(1).map(plain).filter(Boolean),metadata.eyebrow,metadata.caption,metadata.source,brand.name,FOOTER].filter(Boolean);
        record.pdf=await inspectPdf(path.join(target,'cards.pdf'),{expectedPages:1,requireTools:true,expectedText:snippets.join('\n')});
        const raw=(await exec('pdftotext',['-enc','UTF-8','-raw',path.join(target,'cards.pdf'),'-'],{windowsHide:true,maxBuffer:16*1024*1024,encoding:'utf8'})).stdout;
        const compact=t=>t.normalize('NFC').replace(/\s+/gu,'');
        const missing=snippets.flatMap((t,i)=>compact(raw).includes(compact(t))?[]:[i]);assert.deepEqual(missing,[],`${key}: PDF lost authored text`);
        record.pdf.sourceCoverage={extractor:'Poppler -raw',normalization:'NFC and whitespace only',expected:snippets,missing};await writeFile(path.join(target,'pdf-raw.txt'),raw);
        await exec('pdftoppm',['-singlefile','-scale-to','1080','-png',path.join(target,'cards.pdf'),path.join(target,'native-pdf')],{windowsHide:true,maxBuffer:1024*1024});
        if(id==='original') {
          const before=path.join(out,'original-base-main');await oldExport({...options,out:before});
          await exec('pdftoppm',['-singlefile','-scale-to','1080','-png',path.join(before,'cards.pdf'),path.join(before,'native-pdf')],{windowsHide:true});
          record.controlledDifferences={};for(const name of ['cards.html','card-001.png','native-pdf.png']) {
            const old=hash(await readFile(path.join(before,name))),current=hash(await readFile(path.join(target,name)));
            record.controlledDifferences[name]={beforeSha256:old,afterSha256:current,identical:old===current};
          }
        }
        const preview=await readFile(path.join(target,'preview.html'),'utf8');await page.emulateMedia({media:'screen'});
        for(const width of [375,390]) {
          await page.setViewportSize({width,height:900});await page.setContent(preview);await readyPhotoView(page);
          const g=await geometry(page);delete g.imageData;checkPhotoGeometry(g,metadata,mode);views[`mobile${width}`]=g;
          await page.screenshot({path:path.join(target,`mobile-${width}.png`)});
        }
        if(mode==='photo')assert.equal(views.screen.bodyFont,records.find(r=>r.id===id&&r.mode==='default').views.screen.bodyFont);
        await json(path.join(out,'progress.json'),records);console.log(`${key}: screen/print/mobile/native PDF passed`);
      }
    }
    // Include actual originals in the archive, not just paths to an external workspace.
    await mkdir(path.join(out,'originals'));
    const refs=new Set(records.filter(r=>r.manifest).flatMap(r=>r.manifest.assets.map(a=>a.reference)));
    for(const ref of refs)if(ref)await copyFile(path.join(ROOT,ref),path.join(out,'originals',path.basename(ref)));
    const files=[];async function inventory(dir){for(const e of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())await inventory(f);else if(!['report.json','progress.json'].includes(e.name)){const b=await readFile(f);files.push({file:path.relative(out,f).replaceAll('\\','/'),bytes:b.length,sha256:hash(b)});}}}await inventory(out);
    const sourceHashes=await Promise.all([...SEMANTIC_FILES,'scripts/validate-photo-cover.mjs'].map(async file=>({file,sha256:hash(await readFile(path.join(ROOT,file)))})));
    const report={schemaVersion:1,scope:'T37 photo-cover exact independent fixtures',baselineIdentity,browser:await renderer.browser.version(),sourceHashes,records,files,visualReview:'pending',limitations:['Subject safety is author declared, not detected.','Original pixels remain embedded but cover visibly crops only after explicit permission.','Three-line title fit is fixture/font specific; overflow is a hard error.','No historical gallery acceptance is promoted.']};
    await json(path.join(out,'report.json'),report);return report;
  }finally{await closeBrowser(renderer.browser);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
  if(!args.includes('--allow-browser'))throw new Error('Pass --allow-browser for real Chromium/PDF validation.');
  await validatePhotoCover({out:path.resolve(value('--out')??'validation/m2b/run'),browser:value('--browser'),baselineRoot:value('--baseline-root')});
}
