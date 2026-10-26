import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {buildDocument,SIZES,textContrastRatio} from '../../scripts/document.mjs';
import {renderCards} from '../../scripts/markdown.mjs';
import {createAssetResolver} from '../../scripts/assets.mjs';
import {openRenderer,closeBrowser,measureCards} from '../../scripts/browser.mjs';
import {compareDefaultPhotoHtml,defaultPhotoInput} from '../../scripts/validate-photo-cover.mjs';
const root=process.cwd(),resolveImage=(await createAssetResolver(root)).resolveImage;
const source=await fs.readFile('examples/t37-contrast/default.md','utf8');
const metadata=JSON.parse(/^<!-- card: (.+) -->/.exec(source)[1]);
const normal=`<!-- card: ${JSON.stringify({...metadata,eyebrow:'',caption:'合成图像'})} -->\n# 对比\n\n> **强调** [链接](https://example.com)\n\n- 列表\n`;
const parse=s=>renderCards(s,{resolveImage});
const photo=parse(await fs.readFile('examples/gallery-variants/bright-photo.md','utf8'));
const other=parse(await fs.readFile('examples/gallery-variants/desktop-4x3-default.md','utf8'));
const styles=await Promise.all(['themes','layouts','templates'].map(n=>fs.readFile(`assets/${n}.css`,'utf8')));
const options={...SIZES.portrait,brand:{accent:'#000000'}};
const baseline=await import('./baseline/scripts/document.mjs');
const legacy=[];
for(const id of ['original','bright','dark','portrait','three-line','blocked-portrait','no-crop-permission','no-safe-zone']){
 const input=await fs.readFile(`examples/visual-upgrade/t37/${id}.md`,'utf8');
 const cards=parse(id==='original'?input:defaultPhotoInput(input));
 legacy.push({id,...compareDefaultPhotoHtml(baseline.buildDocument(cards,options,...styles),buildDocument(cards,options,...styles))});
}
const html=buildDocument([...parse(normal),...photo,...other],options,...styles);
const renderer=await openRenderer({...SIZES.portrait,scale:1,timeoutMs:30000});
const result={schemaVersion:1,status:'running',legacyDefaultCases:legacy,views:{},humanVisualReview:'not-performed'};
try {
 const page=renderer.page;page.setDefaultTimeout(15000);
 for(const media of ['screen','print']){
  await page.emulateMedia({media});await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
  const measured=await measureCards(page);assert.ok(measured.every(c=>c.overflow.length===0));
  result.views[media]=await page.evaluate(()=>{
   const cs=(sel,pseudo)=>getComputedStyle(document.querySelector(sel),pseudo);
   return {panel:cs('.template-T37:not([data-visual-variant]) blockquote').backgroundColor,strong:cs('.template-T37:not([data-visual-variant]) blockquote strong').color,link:cs('.template-T37:not([data-visual-variant]) blockquote a').color,marker:cs('.template-T37:not([data-visual-variant]) li','::marker').color,photo:cs('[data-visual-variant="photo-cover"] .card-eyebrow').color,other:cs('.template-T20').getPropertyValue('--accent'),overflow:[]};
  });
  const v=result.views[media];assert.equal(v.strong,'rgb(247, 242, 227)');assert.equal(v.link,v.strong);assert.equal(v.marker,v.strong);assert.equal(v.photo,'rgb(17, 17, 17)');assert.equal(v.other.trim(),'#000000');
  assert.equal(v.panel,'rgb(13, 23, 20)');v.panelRatio=textContrastRatio('#f7f2e3','#0d1714');assert.ok(v.panelRatio>=4.5);
 }
 result.status='pass';
}finally {await closeBrowser(renderer.browser);await fs.writeFile('validation/t37-contrast/probe-report.json',JSON.stringify(result,null,2)+'\n');}
console.log('Mixed default/photo/T20, nested panel text, list marker and 8 legacy default contracts passed.');
