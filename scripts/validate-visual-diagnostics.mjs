#!/usr/bin/env node
// Explicit local evidence run; machine checks never mark human visual acceptance.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { exportCards, parseOptions } from './render.mjs';
import { openRenderer, closeBrowser, measureCards } from './browser.mjs';
import { SEMANTIC_FILES } from './evidence-source.mjs';
import { defaultBodyFixtures } from '../tests/helpers/body-size-fixtures.mjs';
import { buildDocument } from './document.mjs';
import { renderCards } from './markdown.mjs';
import { createAssetResolver } from './assets.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url)), BASE='07ff4808dfd8fed73422d240dac5336ad1733566';
const exec=promisify(execFile), hash=b=>createHash('sha256').update(b).digest('hex');
const json=(f,v)=>writeFile(f,JSON.stringify(v,null,2)+'\n');

export function assertSampleDiagnostics(id,diagnostics) {
  for(const media of ['screen','print']) {
    const rows=diagnostics.cards.filter(c=>c.media===media), check=(index,rule)=>rows[index].checks.find(c=>c.ruleId===rule);
    if(id==='screenshot-tall')assert.equal(check(0,'VD-04').status,'attention');
    if(id==='screenshot-wide')assert.equal(check(0,'VD-04').status,'within-reference');
    if(id==='short-declaration')for(const rule of ['VD-02','VD-03'])assert.equal(check(0,rule).exception,'short-declaration');
    if(id==='sparse-report'){assert.equal(check(0,'VD-02').status,'attention');assert.equal(check(0,'VD-03').severity,'WARN');}
    if(['photo-overlay','long-title'].includes(id))assert.equal(check(0,'VD-06').status,'human-review-required');
    if(id==='long-title')assert.ok(check(0,'VD-01').measured.titleRowPositionsPx.length>=3);
    if(id==='mean-tutorial')for(const i of [0,1]){assert.equal(check(i,'VD-05').status,'attention');assert.equal(check(i,'VD-05').severity,'INFO');}
    if(id==='evidence-reading')assert.equal(check(3,'VD-01').exception,'intervening-metric');
    if(id==='object-observation')assert.equal(check(1,'VD-01').exception,'photography');
  }
}

export async function validateVisualDiagnostics({out,baselineRoot,browser}) {
  assert.ok(baselineRoot,'A git archive of merged PR29 is required');
  await mkdir(out,{recursive:true});assert.deepEqual(await readdir(out),[],'Use empty output');
  // Verify archived sources against committed bytes before executing the baseline.
  for(const file of SEMANTIC_FILES.filter(f=>f!=='scripts/visual-diagnostics.mjs')) {
    const expected=(await exec('git',['show',`${BASE}:${file}`],{cwd:ROOT,encoding:'buffer',maxBuffer:32*1024*1024,windowsHide:true})).stdout;
    assert.deepEqual(await readFile(path.join(baselineRoot,file)),expected,`Untrusted baseline ${file}`);
  }
  const old=await import(pathToFileURL(path.join(baselineRoot,'scripts/render.mjs')));
  const oldDoc=await import(pathToFileURL(path.join(baselineRoot,'scripts/document.mjs')));
  const oldMarkdown=await import(pathToFileURL(path.join(baselineRoot,'scripts/markdown.mjs')));
  const css=await Promise.all(['themes','layouts','templates'].map(n=>readFile(path.join(baselineRoot,'assets',`${n}.css`),'utf8')));
  const proof={schemaVersion:1,scope:'without-visual-audit-only',baselineCommit:BASE,files:{},htmlRecords:[],actualExports:[]};
  const photo=JSON.parse(await readFile(path.join(ROOT,'docs/visual-upgrade/m2b-default-compatibility.json'),'utf8'));
  for(const file of [...Object.keys(photo.files),'scripts/visual-diagnostics.mjs']) proof.files[file]={baselineSha256:file.endsWith('/visual-diagnostics.mjs')?null:hash(await readFile(path.join(baselineRoot,file))),currentSha256:hash((await readFile(path.join(ROOT,file),'utf8')).replaceAll('\r\n','\n'))};
  const fixtureRows=await defaultBodyFixtures(), resolver=await createAssetResolver(ROOT);
  for(const row of [...photo.stageRecords.map(r=>({id:r.input,input:r.input,options:r.options})),...['bright','dark','portrait','three-line'].map(id=>({id:`photo-${id}`,input:`examples/visual-upgrade/t37/${id}.md`,options:{width:1080,height:1440}}))]) fixtureRows.push({...row,source:await readFile(path.join(ROOT,row.input),'utf8'),resolveImage:resolver.resolveImage});
  for(const f of fixtureRows) {
    const previous=oldDoc.buildDocument(oldMarkdown.renderCards(f.source,{resolveImage:f.resolveImage}),f.options,...css);
    assert.equal(buildDocument(renderCards(f.source,{resolveImage:f.resolveImage}),f.options,...css),previous,f.id);
    proof.htmlRecords.push({id:f.id,inputSha256:hash(f.source),baselineHtmlSha256:hash(previous)});
  }
  const recipes=JSON.parse(await readFile(path.join(ROOT,'examples/series/recipes.json'),'utf8')).recipes;
  const samples=[...recipes.map(r=>({...r,baseline:true})),
    {id:'screenshot-tall',input:'examples/visual-upgrade/t20/tall-phone.md',assetRoot:'.',footerMode:'poster',baseline:true},
    {id:'screenshot-wide',input:'examples/visual-upgrade/t20/desktop-16x9.md',assetRoot:'.',footerMode:'poster',baseline:true},
    {id:'photo-overlay',input:'examples/visual-upgrade/t37/dark.md',assetRoot:'.',baseline:true},
    {id:'long-title',input:'examples/visual-upgrade/t37/three-line.md',assetRoot:'.',baseline:true},
    {id:'short-declaration',input:'examples/visual-audit/short-declaration.md',assetRoot:'.'},
    {id:'sparse-report',input:'examples/visual-audit/sparse-report.md',assetRoot:'.'},
    {id:'overflow',input:'examples/visual-upgrade/t37/title-overflow.md',assetRoot:'.',reject:'CONTENT_OVERFLOW'},
    {id:'footer-overflow',input:'examples/visual-audit/sparse-report.md',assetRoot:'.',footer:'真实页脚重叠测试。'.repeat(200),reject:'CONTENT_OVERFLOW'}];
  const summary={schemaVersion:1,baselineCommit:BASE,humanVisualReview:'not-performed',htmlEqualityCount:proof.htmlRecords.length,records:[],limitations:['No OCR, subject detection or visual acceptance.','Raw text rectangles approximate line area, not actual ink.','See M3_VISUAL_DIAGNOSTICS.md for false positives and false negatives.']};
  const renderer=await openRenderer({width:1080,height:1440,scale:1,browser,timeoutMs:30000});
  try {
    for(const sample of samples) {
      const target=path.join(out,sample.id);
      const argv=[path.join(ROOT,sample.input),'--out',target,'--format','all','--preview','--strict','--asset-root',path.resolve(ROOT,sample.assetRoot),'--title',sample.title??sample.id];
      if(browser)argv.push('--browser',browser);if(sample.brandFile)argv.push('--brand',path.join(ROOT,sample.brandFile));if(sample.footer)argv.push('--footer',sample.footer);
      if(sample.footerMode)argv.push('--footer-mode',sample.footerMode);
      const options=parseOptions(argv), row={id:sample.id,input:sample.input,inputSha256:hash(await readFile(options.input))};
      if(sample.reject) {
        await assert.rejects(exportCards({...options,visualAudit:true}),{code:sample.reject});
        assert.deepEqual(await readdir(target),['overflow.json']);row.expectedRefusal=sample.reject;summary.records.push(row);continue;
      }
      row.manifest=await exportCards({...options,visualAudit:true});
      assert.equal(row.manifest.qa.visualReview,'not-performed');
      const diagnostics=JSON.parse(await readFile(path.join(target,'visual-diagnostics.json'),'utf8'));
      assert.equal(diagnostics.humanVisualReview,'not-performed');assert.equal(diagnostics.inputSha256,row.inputSha256);
      assertSampleDiagnostics(sample.id,diagnostics);
      const html=await readFile(path.join(target,'cards.html'),'utf8'), p=renderer.page;
      row.independentMeasurements=[];
      for(const media of ['screen','print']) {
        await p.emulateMedia({media});await p.setContent(html);
        await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
        assert.ok((await measureCards(p)).every(m=>m.overflow.length===0));
        const direct=await p.locator('.card').evaluateAll(cards=>cards.map(card=>{
          const origin=card.getBoundingClientRect(), result={};
          for(const [role,selector] of Object.entries({title:'h1',source:'.card-source',footer:'.card-footer'})) {
            const el=card.querySelector(selector);if(!el)continue;
            const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())&&!n.textContent.trim()){}
            if(n){const range=document.createRange();range.setStart(n,n.textContent.search(/\S/));range.setEnd(n,n.textContent.trimEnd().length);const r=range.getClientRects()[0];if(r)result[role]={x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height};}
          }return result;
        }));
        for(const [i,expected] of direct.entries()) {
          const actual=diagnostics.cards.find(c=>c.index===i+1&&c.media===media);
          assert.equal(actual.geometry.complete,true);
          for(const [role,bbox] of Object.entries(expected))assert.deepEqual(actual.geometry.elements.find(e=>e.role===role)?.bbox,bbox,`${sample.id} ${media} ${i+1} ${role}`);
          await p.locator('.card').nth(i).screenshot({path:path.join(target,`${media}-${String(i+1).padStart(3,'0')}.png`)});
        }
        row.independentMeasurements.push({media,cards:direct});
      }
      // Existing defaults and PNG/native-PDF pixels are compared to verified main.
      if(sample.baseline) {
        const off=path.join(out,`${sample.id}-off`), before=path.join(out,`${sample.id}-baseline`);
        const currentManifest=await exportCards({...options,out:off});
        const baselineManifest=await old.exportCards({...options,out:before});
        assert.ok(!currentManifest.artifacts.some(a=>a.format==='visual-diagnostics'));
        const stableManifest=m=>{const {createdAt,artifacts,budget,...rest}=m;const {elapsedMs,outputBytes,...limits}=budget;return {...rest,budget:limits,artifactNames:artifacts.map(a=>({file:a.file,format:a.format}))};};
        assert.deepEqual(stableManifest(currentManifest),stableManifest(baselineManifest));
        row.defaultEquality={};
        for(const name of ['cards.html','preview.html',...currentManifest.artifacts.filter(a=>a.format==='png').map(a=>a.file)]) {
          const expected=hash(await readFile(path.join(before,name)));
          assert.equal(hash(await readFile(path.join(off,name))),expected,`${sample.id} default ${name}`);
          assert.equal(hash(await readFile(path.join(target,name))),expected,`${sample.id} enabled ${name}`);
          row.defaultEquality[name]=expected;
        }
        for(const dir of [before,off,target]) await exec('pdftoppm',['-scale-to','1080','-png',path.join(dir,'cards.pdf'),path.join(dir,'native')],{windowsHide:true,maxBuffer:1024*1024});
        for(const name of (await readdir(before)).filter(n=>/^native-.*\.png$/.test(n))) {
          const expected=hash(await readFile(path.join(before,name)));
          assert.equal(hash(await readFile(path.join(off,name))),expected);assert.equal(hash(await readFile(path.join(target,name))),expected);
          row.defaultEquality[name]=expected;
        }
        proof.actualExports.push({id:sample.id,equality:row.defaultEquality});
      }
      row.diagnosticsSha256=hash(await readFile(path.join(target,'visual-diagnostics.json')));
      summary.records.push(row);await json(path.join(out,'progress.json'),summary);
      console.log(`${sample.id}: actual screen/print JSON, strict PDF and ${sample.baseline?'baseline equality':'advisory report'} passed`);
    }
  } finally {await closeBrowser(renderer.browser);}
  await json(path.join(out,'default-compatibility.json'),proof);
  await json(path.join(out,'report.json'),summary);return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];assert.ok(args.includes('--allow-browser'));
  await validateVisualDiagnostics({out:path.resolve(value('--out')),baselineRoot:path.resolve(value('--baseline-root')),browser:args.includes('--browser')?value('--browser'):undefined});
}
