#!/usr/bin/env node
// Run in the authorized CI browser environment, not as a source-only substitute.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TEMPLATES } from './templates.mjs';
import { measureRefinement } from './refinement-audit.mjs';
import { parseCardMetadata } from './markdown.mjs';
import { parseOptions, exportCards } from './render.mjs';
import { openRenderer, closeBrowser } from './browser.mjs';
const root=path.resolve('validation/templates');
await mkdir(root,{recursive:true});
const results=[];
const comparison=[];
const boundaries=[];
const legacyRegressions=[];
const errors=[];
const regressionPins=JSON.parse(await readFile('docs/template-m1-provenance.json','utf8'));
const acceptedRegressions=[];
for(const template of TEMPLATES) {
 try {
  const out=path.join(root,template.id);
  const manifest=await exportCards(parseOptions([template.example,'--out',out,'--strict','--preview']));
  for(const artifact of manifest.artifacts) {
    const bytes=await readFile(path.join(out,artifact.file));
    if(createHash('sha256').update(bytes).digest('hex')!==artifact.sha256)throw new Error(`Hash mismatch: ${template.id}/${artifact.file}`);
  }
  const renderer=await openRenderer({width:1080,height:1440,scale:1,timeoutMs:30000});
  const mobile=[];
  try {
    await renderer.page.setContent(await readFile(path.join(out,'preview.html'),'utf8'),{waitUntil:'load',timeout:30000});
    await renderer.page.evaluate(()=>document.fonts.ready);
    for(const viewportWidth of [375,390]) {
      await renderer.page.setViewportSize({width:viewportWidth,height:800});
      const audit=await renderer.page.evaluate(()=>{
        const card=document.querySelector('.card');
        const scale=card.getBoundingClientRect().width/card.offsetWidth;
        const visible=element=>element.textContent.trim()&&element.getBoundingClientRect().width>0;
        const body=[...card.querySelectorAll('.template-intro p,.template-intro li,.template-section p,.template-section li,.template-metric .statistic-label,td,th,pre code')].filter(visible);
        const notes=[...card.querySelectorAll('.card-source,.card-eyebrow,.card-footer,figcaption')].filter(visible);
        return {cardWidth:card.getBoundingClientRect().width,bodyMin:body.length?Math.min(...body.map(e=>parseFloat(getComputedStyle(e).fontSize)*scale)):null,noteMin:notes.length?Math.min(...notes.map(e=>parseFloat(getComputedStyle(e).fontSize)*scale)):null};
      });
      if(audit.bodyMin!==null&&audit.bodyMin<14-0.05)throw new Error(`${template.id} mobile body too small: ${JSON.stringify(audit)}`);
      if(audit.noteMin!==null&&audit.noteMin<11-0.05)throw new Error(`${template.id} mobile source too small: ${JSON.stringify(audit)}`);
      const refinement = await renderer.page.evaluate(measureRefinement);
      const file=`mobile-${viewportWidth}.png`;
      await renderer.page.screenshot({path:path.join(out,file),fullPage:true,animations:'disabled',timeout:30000});
      const bytes=await readFile(path.join(out,file));
      mobile.push({viewportWidth,...audit,refinement,file,sha256:createHash('sha256').update(bytes).digest('hex')});
      await writeFile(path.join(out,'mobile-audit.json'),JSON.stringify(mobile,null,2)+'\n');
    }
  } finally {await closeBrowser(renderer.browser);}
  const refinementErrors = mobile.flatMap(item => item.refinement.errors);
  if (refinementErrors.length) throw new Error(refinementErrors.join('; '));
  const pin=regressionPins.records.find(item=>item.id===template.id);
  if(pin && template.version === 1) {
    const actual=manifest.artifacts.find(item=>item.file==='card-001.png')?.sha256;
    const unchanged=manifest.inputSha256===pin.input && actual===pin.png;
    acceptedRegressions.push({id:template.id,status:unchanged?'byte-identical':'requires-new-pixel-review',expectedInput:pin.input,actualInput:manifest.inputSha256,expectedPng:pin.png,actualPng:actual});
    if(!unchanged)errors.push({id:template.id,scope:'accepted-regression',code:'VISUAL_REGRESSION_CHANGED',message:'Accepted default pixels changed; inspect and explicitly re-review, never refresh the pin automatically.'});
  }
  results.push({id:template.id,version:template.version,composition:template.composition,status:'rendered-not-visually-reviewed',input:template.example,cardCount:manifest.cardCount,pdf:manifest.qa.pdf.status,mobile});
 } catch(error) { errors.push({id:template.id,code:error.code ?? 'VALIDATION_FAILED',message:error.message}); console.error(template.id,error); }
}
// Same source, same canvas: contrast compositions without editing the wording.
const comparisonInput='examples/template-comparison.md';
for(const id of ['T01','T02','T06','T09','T10','T13','T14','T17']) {
 try {
  const manifest=await exportCards(parseOptions([comparisonInput,'--template',id,'--out',path.join(root,'comparison',id),'--strict','--preview']));
  comparison.push({id,inputSha256:manifest.inputSha256,cards:manifest.cardCount,pdf:manifest.qa.pdf.status});
 } catch(error) { errors.push({id,scope:'comparison',code:error.code ?? 'VALIDATION_FAILED',message:error.message}); console.error(id,error); }
}
if(comparison.length>1&&new Set(comparison.map(item=>item.inputSha256)).size!==1)throw new Error('Same-content comparison source diverged.');
// A second unchanged source contains the actual quote/list semantics rather
// than judging quotation or numbered-ticket designs from prose-only content.
const structureComparison=[];
for(const id of ['T02','T05','T14','T25']) {
  try {
    const manifest=await exportCards(parseOptions(['examples/template-comparison-structures.md','--template',id,'--out',path.join(root,'comparison-structures',id),'--strict','--preview']));
    structureComparison.push({id,inputSha256:manifest.inputSha256,cards:manifest.cardCount,pdf:manifest.qa.pdf.status});
  } catch(error) { errors.push({id,scope:'structure-comparison',code:error.code??'VALIDATION_FAILED',message:error.message}); }
}
if(structureComparison.length>1&&new Set(structureComparison.map(item=>item.inputSha256)).size!==1)throw new Error('Structured comparison source diverged.');
// The explicit historical Bold regression keeps both H1 strings untouched.
try {
  const manifest=await exportCards(parseOptions(['examples/regression-bold-title-group.md','--theme','bold','--out',path.join(root,'legacy-bold-title-group'),'--strict','--preview']));
  legacyRegressions.push({id:'bold-title-group',inputSha256:manifest.inputSha256,cards:manifest.cardCount,pdf:manifest.qa.pdf.status});
} catch(error) { errors.push({id:'bold-title-group',scope:'legacy-regression',code:error.code ?? 'VALIDATION_FAILED',message:error.message}); }
// An oversized whole paragraph is intentionally unsuitable. It must fail, not
// shrink, discard content or publish clipped files. These are synthetic QA text.
const longBody='# 长文边界测试\n\n'+('这是合成的容量测试文本，必须完整保留，不能缩字或隐藏。'.repeat(80))+'\n';
for(const template of TEMPLATES) {
  try {
    const out=path.join(root,'boundaries',template.id);
    const {metadata,source}=parseCardMetadata(await readFile(template.example,'utf8'));
    const longInput=path.join(root,`long-boundary-${template.id}.md`);
    await writeFile(longInput,`<!-- card: ${JSON.stringify(metadata)} -->\n${source}\n\n${longBody}`);
    let failure;
    try { await exportCards(parseOptions([longInput,'--asset-root',path.dirname(template.example),'--out',out,'--format','html','--strict'])); }
    catch(error) { failure=error; }
    if(failure?.code!=='CONTENT_OVERFLOW')throw failure??new Error(`${template.id}: oversized paragraph unexpectedly succeeded.`);
    const report=JSON.parse(await readFile(path.join(out,'overflow.json'),'utf8'));
    if(report.code!=='CONTENT_OVERFLOW')throw new Error('Missing overflow evidence.');
    boundaries.push({id:template.id,status:'expected-overflow',code:failure.code});
  } catch(error) { errors.push({id:template.id,scope:'long-boundary',code:error.code??'VALIDATION_FAILED',message:error.message}); }
}
await writeFile(path.join(root,'summary.json'),JSON.stringify({schemaVersion:1,results,comparison,structureComparison,boundaries,legacyRegressions,acceptedRegressions,errors},null,2)+'\n');
if(errors.length)throw new Error(`Template acceptance failed: ${JSON.stringify(errors)}`);
console.log(`Rendered ${results.length} composed templates, native PDFs and mobile375/390 previews. Independent pixel review still required.`);
