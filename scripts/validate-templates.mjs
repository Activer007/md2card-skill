#!/usr/bin/env node
// Run in the authorized CI browser environment, not as a source-only substitute.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TEMPLATES } from './templates.mjs';
import { parseOptions, exportCards } from './render.mjs';
import { openRenderer, closeBrowser } from './browser.mjs';
const root=path.resolve('validation/templates');
await mkdir(root,{recursive:true});
const results=[];
for(const template of TEMPLATES) {
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
        const body=[...card.querySelectorAll('.template-intro p,.template-intro li,.template-section p,.template-section li,td,th,pre code')].filter(visible);
        const notes=[...card.querySelectorAll('.card-source,.card-eyebrow,.card-footer,figcaption')].filter(visible);
        return {cardWidth:card.getBoundingClientRect().width,bodyMin:body.length?Math.min(...body.map(e=>parseFloat(getComputedStyle(e).fontSize)*scale)):null,noteMin:notes.length?Math.min(...notes.map(e=>parseFloat(getComputedStyle(e).fontSize)*scale)):null};
      });
      if(audit.bodyMin!==null&&audit.bodyMin<14-0.05)throw new Error(`${template.id} mobile body too small: ${JSON.stringify(audit)}`);
      if(audit.noteMin!==null&&audit.noteMin<11-0.05)throw new Error(`${template.id} mobile source too small: ${JSON.stringify(audit)}`);
      const file=`mobile-${viewportWidth}.png`;
      await renderer.page.screenshot({path:path.join(out,file),fullPage:true,animations:'disabled',timeout:30000});
      const bytes=await readFile(path.join(out,file));
      mobile.push({viewportWidth,...audit,file,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
  } finally {await closeBrowser(renderer.browser);}
  results.push({id:template.id,composition:template.composition,status:'rendered-not-visually-reviewed',input:template.example,cardCount:manifest.cardCount,pdf:manifest.qa.pdf.status,mobile});
}
await writeFile(path.join(root,'summary.json'),JSON.stringify({schemaVersion:1,results},null,2)+'\n');
console.log(`Rendered ${results.length} composed templates, native PDFs and mobile375/390 previews. Human pixel review still required.`);
