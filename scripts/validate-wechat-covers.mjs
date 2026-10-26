#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { exportCards, parseOptions } from './render.mjs';
import { exportCoverPair, parsePairOptions } from './render-cover-pair.mjs';
import { buildDocument, SIZES } from './document.mjs';
import { renderCards } from './markdown.mjs';
import { createAssetResolver } from './assets.mjs';
import { TEMPLATES, resolveTemplateAspect } from './templates.mjs';
import { openRenderer, closeBrowser, measureCards } from './browser.mjs';
import { SEMANTIC_FILES, readEvidenceFile } from './evidence-source.mjs';
import { inspectPdf } from './qa.mjs';
import { assertPdfSegments, visibleSegments } from './validate-series.mjs';
import { defaultBodyFixtures } from '../tests/helpers/body-size-fixtures.mjs';
import { prepareStageOutput } from './validate-screenshot-stage.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url)),BASE='0fff0fd8b625c4b35fac572e5474afa6f7a49118';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
const json=(file,value)=>writeFile(file,JSON.stringify(value,null,2)+'\n');
const run=(cmd,args)=>exec(cmd,args,{cwd:ROOT,windowsHide:true,timeout:20000,maxBuffer:32*1024*1024});
const FOOTER='独立封面练习',BRAND={name:'FIELDNOTES',accent:'#27594f',logo:'examples/assets/demo-logo.png'};

export async function validateWechatCovers({out,baselineRoot,browser}) {
  out=await prepareStageOutput(out);
  assert.ok(baselineRoot,'Use a git archive of merged PR30.');
  for(const file of SEMANTIC_FILES) {
    const expected=(await exec('git',['show',`${BASE}:${file}`],{cwd:ROOT,encoding:'buffer',windowsHide:true,maxBuffer:32*1024*1024,timeout:20000})).stdout;
    assert.equal(hash(await readFile(path.join(baselineRoot,file))),hash(expected),`Baseline changed: ${file}`);
  }
  const oldDoc=await import(pathToFileURL(path.join(baselineRoot,'scripts/document.mjs'))),oldMd=await import(pathToFileURL(path.join(baselineRoot,'scripts/markdown.mjs'))),old=await import(pathToFileURL(path.join(baselineRoot,'scripts/render.mjs')));
  const css=await Promise.all(['themes','layouts','templates'].map(n=>readFile(path.join(ROOT,`assets/${n}.css`),'utf8')));
  const previous=JSON.parse(await readFile(path.join(ROOT,'docs/visual-upgrade/pr30-default-compatibility.json'),'utf8'));
  const proof={schemaVersion:1,scope:'existing-combinations-before-M4-only',baselineCommit:BASE,files:{},htmlRecords:[],actualExports:[]};
  for(const file of Object.keys(previous.files))proof.files[file]={baselineSha256:hash(await readEvidenceFile(baselineRoot,file)),currentSha256:hash(await readEvidenceFile(ROOT,file))};
  const fixtures=await defaultBodyFixtures(),assets=await createAssetResolver(ROOT);
  const stage=JSON.parse(await readFile(path.join(ROOT,'docs/visual-upgrade/m2b-default-compatibility.json'),'utf8'));
  for(const row of [...stage.stageRecords.map(r=>({id:r.input,input:r.input,options:r.options})),...['bright','dark','portrait','three-line'].map(id=>({id:`photo-${id}`,input:`examples/visual-upgrade/t37/${id}.md`,options:SIZES.portrait}))])fixtures.push({...row,source:await readFile(path.join(ROOT,row.input),'utf8'),resolveImage:assets.resolveImage});
  for(const f of fixtures) {
    const before=oldDoc.buildDocument(oldMd.renderCards(f.source,{resolveImage:f.resolveImage}),f.options,...css);
    assert.equal(buildDocument(renderCards(f.source,{resolveImage:f.resolveImage}),f.options,...css),before,f.id);
    proof.htmlRecords.push({id:f.id,inputSha256:hash(f.source),baselineHtmlSha256:hash(before)});
  }
  assert.equal(proof.htmlRecords.length,108);
  const brandFile=path.join(out,'brand.json');await json(brandFile,BRAND);
  const shared=['--asset-root',ROOT,'--brand',brandFile,'--footer',FOOTER,'--footer-mode','poster','--strict',...(browser?['--browser',browser]:[])];
  const records=[],pairs=[];
  for(const template of ['T01','T21']) {
    const wide=path.join(ROOT,`examples/wechat-covers/${template}-wide.md`),square=path.join(ROOT,`examples/wechat-covers/${template}-square.md`),target=path.join(out,`${template}-pair`);
    const result=await exportCoverPair(parsePairOptions(['--wide',wide,'--square',square,'--author-confirmed','--out',target,...shared]));
    assert.equal(result.semanticEquivalence,'not-verified');pairs.push({template,path:`${template}-pair`,manifest:result});
    for(const [side,input] of [['wide',wide],['square',square]])records.push({id:`${template}-${side}`,template,side,input,target:path.join(target,side)});
    console.log(`${template}: both independent exports published`);
  }
  const renderer=await openRenderer({width:2100,height:1440,scale:1,browser,timeoutMs:30000});
  try {
    const {page}=renderer;
    const ready=()=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
    for(const row of records) {
      const manifest=JSON.parse(await readFile(path.join(row.target,'manifest.json'),'utf8')),html=await readFile(path.join(row.target,'cards.html'),'utf8');
      row.inputSha256=hash(await readFile(row.input));row.dimensions=manifest.dimensions;row.views={};
      assert.equal(manifest.inputSha256,row.inputSha256);assert.equal(manifest.qa.pdf.searchable,true);
      const card=renderCards(await readFile(row.input,'utf8'))[0];
      await inspectPdf(path.join(row.target,'cards.pdf'),{expectedPages:1,requireTools:true});
      const info=(await run('pdfinfo',[path.join(row.target,'cards.pdf')])).stdout;
      const pageSize=/^Page size:\s*([\d.]+) x ([\d.]+) pts/m.exec(info);
      assert.ok(pageSize,`${row.id}: native PDF page size unavailable`);
      row.pdfPagePoints=pageSize.slice(1).map(Number);
      for(const [index,key] of ['width','height'].entries())assert.ok(Math.abs(row.pdfPagePoints[index]*96/72-manifest.dimensions[key])<=1,`${row.id}: native PDF canvas differs`);
      const pdfText=(await run('pdftotext',['-raw','-enc','UTF-8',path.join(row.target,'cards.pdf'),'-'])).stdout;
      assertPdfSegments(pdfText,[...visibleSegments(card),BRAND.name,FOOTER],row.id);row.pdfSourceText='all-source-segments-present';
      await writeFile(path.join(row.target,'native-text.txt'),pdfText);
      await run('pdftoppm',['-r','96','-png','-singlefile',path.join(row.target,'cards.pdf'),path.join(row.target,'native-page')]);
      for(const media of ['screen','print']) {
        await page.setViewportSize({width:2200,height:1500});await page.emulateMedia({media});await page.setContent(html);await ready();
        assert.deepEqual((await measureCards(page))[0],manifest.cards[0][media],`${row.id}: independent ${media} measurement`);
        const g=await page.locator('.card').evaluate(card=>{
          const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
          return {card:box(card),source:box(card.querySelector('.card-source')),footer:box(card.querySelector('.card-footer')),logo:[...card.querySelectorAll('.brand-logo')].map(e=>({box:box(e),loaded:e.complete&&e.naturalWidth>0})),texts:[...card.querySelectorAll('h1,h2,.template-main p,.statistic-value,.statistic-label,.card-source')].map(e=>({text:e.textContent,box:box(e),font:getComputedStyle(e).fontSize}))};
        });
        assert.equal(g.logo.length,1);assert.ok(g.logo[0].loaded);assert.ok(g.source.bottom<=g.footer.y+1);
        for(const text of g.texts)assert.ok(text.box.bottom<=g.footer.y+1,`${row.id}: ${text.text} collides with footer`);
        row.views[media]=g;await page.locator('.card').screenshot({path:path.join(row.target,`${media}.png`),animations:'disabled'});
      }
      await page.emulateMedia({media:'screen'});
      const preview=await readFile(path.join(row.target,'preview.html'),'utf8');
      for(const width of row.side==='square'?[375,390]:[840,1200]) {
        await page.setViewportSize({width,height:1500});await page.setContent(preview);await ready();
        row.views[`preview${width}`]=await page.locator('.card').evaluate(card=>{const scale=card.getBoundingClientRect().width/card.offsetWidth;return {scale,width:card.getBoundingClientRect().width,body:[...card.querySelectorAll('.template-main p')].map(e=>parseFloat(getComputedStyle(e).fontSize)*scale),notes:[...card.querySelectorAll('.card-source,.card-footer')].map(e=>parseFloat(getComputedStyle(e).fontSize)*scale)};});
        const v=row.views[`preview${width}`];assert.ok(v.body.every(n=>n>=14));assert.ok(v.notes.every(n=>n>=11));
        await page.locator('.card').screenshot({path:path.join(row.target,`preview-${width}.png`),scale:'css',animations:'disabled'});
      }
      console.log(`${row.id}: screen/print, original PDF text and two previews checked`);
    }
  } finally {await closeBrowser(renderer.browser);}
  const refusals=[];
  for(const row of records.filter(r=>r.id!=='T21-square')) {
    const input=path.join(out,`${row.id}-long.md`);await writeFile(input,(await readFile(row.input,'utf8'))+'\n\n'+('完整限定条件必须保留，不得自动缩字。'.repeat(150))+'\n');
    const target=path.join(out,`${row.id}-long`),options=parseOptions([input,'--out',target,'--size',row.side==='wide'?'wechat-wide':'square',...shared]);
    await assert.rejects(exportCards(options),{code:'CONTENT_OVERFLOW'});assert.deepEqual(await readdir(target),['overflow.json']);refusals.push({id:`${row.id}-long`,code:'CONTENT_OVERFLOW'});
  }
  for(const t of TEMPLATES.filter(t=>!['T01','T21'].includes(t.id))) {assert.throws(()=>resolveTemplateAspect(t.id,SIZES['wechat-wide']),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});refusals.push({id:`${t.id}-wechat-wide`,code:'TEMPLATE_ASPECT_UNSUPPORTED'});}
  for(const [id,size] of [['T01',SIZES.slide],['T21',{width:2102,height:900}]]) {assert.throws(()=>resolveTemplateAspect(id,size),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});refusals.push({id:`${id}-${size.width}x${size.height}`,code:'TEMPLATE_ASPECT_UNSUPPORTED'});}
  // Real one-side overflow: a completed first side must not escape staging.
  const failedPair=path.join(out,'failed-pair');
  let pairFailure;
  await assert.rejects(exportCoverPair(parsePairOptions(['--wide',records[0].input,'--square',path.join(out,'T01-square-long.md'),'--author-confirmed','--out',failedPair,...shared])),error=>{
    assert.equal(error.code,'CONTENT_OVERFLOW');assert.equal(error.details.pairSide,'square');assert.equal(error.details.pairPublished,false);
    assert.equal(error.details.overflow.code,'CONTENT_OVERFLOW');assert.ok(error.details.overflow.cards[0].screen.overflow.length>0);
    pairFailure=error.details;return true;
  });
  assert.ok(!(await readdir(out)).includes('failed-pair'));assert.ok(!(await readdir(out)).some(n=>n.startsWith('.md2card-pair-')));
  refusals.push({id:'pair-second-side-overflow',code:'CONTENT_OVERFLOW',published:false,details:pairFailure});
  for(const [id,input,size] of [['T01-portrait','examples/templates/T01.md','portrait'],['T21-square','examples/aspects/T21-square.md','square'],['T21-slide','examples/aspects/T21-slide.md','slide']]) {
    const options=parseOptions([path.join(ROOT,input),'--out',path.join(out,`compat-${id}-current`),'--size',size,'--preview','--strict',...(browser?['--browser',browser]:[])]);
    const current=await exportCards(options),before=await old.exportCards({...options,out:path.join(out,`compat-${id}-baseline`)}),equality={};
    for(const file of ['cards.html','preview.html']) {const bytes=await readFile(path.join(options.out,file));assert.equal(hash(bytes),hash(await readFile(path.join(out,`compat-${id}-baseline`,file))),`${id}: ${file} SHA-256 differs`);equality[file]=hash(bytes);}
    const raster={currentSha256:hash(await readFile(path.join(options.out,'card-001.png'))),baselineSha256:hash(await readFile(path.join(out,`compat-${id}-baseline`,'card-001.png')))};
    raster.status=raster.currentSha256===raster.baselineSha256?'byte-identical':'independent-browser-raster-variation';
    if(raster.status==='byte-identical')equality['card-001.png']=raster.currentSha256;
    else {
      // Identical HTML can have last-bit raster differences between browser
      // processes. Preserve both original PNGs; do not silently tolerate pixels
      // or retry until equal. Reload each document in one common browser context
      // and require exact equality there, with independent geometry checks.
      const replay=await openRenderer({...SIZES[size],scale:1,browser,timeoutMs:30000});
      try {
        raster.sharedContextReplay={};
        for(const suffix of ['current','baseline']) {
          await replay.page.emulateMedia({media:'screen'});
          await replay.page.setContent(await readFile(path.join(out,`compat-${id}-${suffix}`,'cards.html'),'utf8'));
          await replay.page.evaluate(()=>document.fonts.ready);
          assert.deepEqual(await measureCards(replay.page),current.cards.map(c=>c.screen));
          const png=await replay.page.locator('.card').screenshot({animations:'disabled'});
          await writeFile(path.join(out,`compat-${id}-replay-${suffix}.png`),png);raster.sharedContextReplay[suffix]=hash(png);
        }
        assert.equal(raster.sharedContextReplay.current,raster.sharedContextReplay.baseline,`${id}: same-context PNG differs`);
      } finally {await closeBrowser(replay.browser);}
    }
    for(const suffix of ['current','baseline'])await run('pdftoppm',['-r','96','-png','-singlefile',path.join(out,`compat-${id}-${suffix}`,'cards.pdf'),path.join(out,`compat-${id}-${suffix}`,'native-page')]);
    const pdfPixels=await readFile(path.join(options.out,'native-page.png'));assert.equal(hash(pdfPixels),hash(await readFile(path.join(out,`compat-${id}-baseline`,'native-page.png'))),`${id}: native PDF page SHA-256 differs`);equality.nativePdfPage=hash(pdfPixels);
    assert.deepEqual(current.cards,before.cards);proof.actualExports.push({id,equality,raster});console.log(`${id}: HTML/geometry/native PDF equal; PNG ${raster.status}${raster.sharedContextReplay?'; exact shared-context replay passed':''}`);
  }
  await json(path.join(out,'default-compatibility.json'),proof);
  const report={schemaVersion:1,baselineCommit:BASE,scope:'T01 square + T01/T21 wechat-wide only; existing T21 square checked',humanVisualReview:'not-performed',semanticEquivalence:'not-verified',pairs,records:records.map(({target,input,...r})=>({...r,path:path.relative(out,target).replaceAll('\\','/'),input:path.relative(ROOT,input).replaceAll('\\','/')})),refusals,compatibility:{htmlCases:108,actualExports:proof.actualExports},source:[]};
  for(const file of [...SEMANTIC_FILES,'scripts/render-cover-pair.mjs','scripts/validate-wechat-covers.mjs'])report.source.push({file,sha256:hash(await readEvidenceFile(ROOT,file))});
  await json(path.join(out,'report.json'),report);
  await writeFile(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>M4 实际样例</title><h1>M4 三个新组合 · 独立封面实测</h1><p>技术检查通过不等于人工视觉或语义签收。宽图以840/1200视口复核；方图375/390。</p>${pairs.map(p=>`<p><a href="${p.path}/pair-preview.html">${p.template} 双封面</a></p>`).join('')}<p><a href="report.json">完整测量报告</a> · <a href="default-compatibility.json">默认兼容性</a></p>`);
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),value=key=>{const i=args.indexOf(key);assert.ok(i>=0&&args[i+1],`Missing ${key}`);return args[i+1];};
  await validateWechatCovers({out:path.resolve(value('--out')),baselineRoot:path.resolve(value('--baseline-root')),browser:args.includes('--browser')?value('--browser'):undefined});
}
