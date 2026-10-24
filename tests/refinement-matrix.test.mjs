import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRefinementCases,runRefinement } from '../scripts/validate-refinement.mjs';
import { sourceCheck } from '../scripts/validate-visual-stress.mjs';

test('real-content matrix bounds four text lengths and six whole-image aspect cases',async()=>{
 const cases=await createRefinementCases();
 assert.equal(cases.length,22);assert.equal(new Set(cases.map(c=>c.id)).size,22);
 for(const length of ['short','medium','mixed','long']) {
   const group=cases.filter(c=>c.length===length);assert.equal(group.length,4);
   assert.equal(new Set(group.map(c=>c.bodySha256)).size,1);
   assert.ok(group.every(c=>c.expected===(length==='long'?'CONTENT_OVERFLOW':'success')));
 }
 assert.equal(cases.filter(c=>c.length==='image-aspect').length,6);
 for(const item of cases){const checked=await sourceCheck(item);assert.equal(checked.cardCount,1);if(item.imageSha256)assert.equal(checked.cardImages[0][0].hash,item.imageSha256);}
 const long=cases.find(c=>c.length==='long').source;
 assert.ok(long.length>1200);assert.equal((long.match(/^## /gm)||[]).length,6);
 assert.match(cases.find(c=>c.length==='mixed').source,/interpretation/);
});
test('source-only plan never attempts a browser or counts overflow expectations as successful exports',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'refinement-plan-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const report=await runRefinement({plan:true,root},{exportCards:()=>{throw new Error('browser must not run');}});
 assert.equal(report.status,'source-checked-browser-pending');assert.equal(report.errors.length,0);
 assert.equal(report.results.length,22);assert.equal(report.results.filter(r=>r.expected==='CONTENT_OVERFLOW').length,4);
 assert.ok(report.results.every(r=>r.status==='source-checked-browser-pending'&&r.visualReview==='not-performed'&&r.manifest===null));
 assert.equal(JSON.parse(await readFile(path.join(root,'summary.json'),'utf8')).browser,'not-run');
});
