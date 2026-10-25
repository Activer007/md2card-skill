import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {TEMPLATES} from '../scripts/templates.mjs';
import {ASPECT_BATCH,buildAspectEvidence} from '../scripts/aspect-evidence.mjs';
import {readEvidenceFile} from '../scripts/evidence-source.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const read=file=>readEvidenceFile(ROOT,file);

test('only eight registered aspect fixtures bind their own input, version, PNG/mobile/PDF and limitations',async()=>{
 const seen=new Set(),r=await buildAspectEvidence(TEMPLATES,async file=>{seen.add(file);return read(file);});
 assert.equal(r.entries.length,8);assert.deepEqual(r.scope,{density:'standard',pagination:'manual',fixturesOnly:true});
 assert.deepEqual(r.entries.map(e=>[e.template,e.aspect,e.aspectVersion]),[['T04','square',2],['T04','slide',2],['T21','square',2],['T21','slide',2],['T05','square',1],['T13','square',1],['T24','slide',1],['T37','slide',1]]);
 assert.equal(r.entries[0].status,'reviewed-with-layout-limitations');assert.match(r.entries[0].limitations[0],/释/);
 for(const e of r.entries){assert.ok(seen.has(e.input));for(const v of Object.values(e.views))assert.ok(seen.has(v.file));assert.ok(!e.views.fullPng.file.includes('/templates/'));}
 assert.ok(r.entries.every(e=>!e.id.includes('same-source')));assert.equal(TEMPLATES.length,48);
});

test('aspect registry rejects substituted source, old portraits, missing PDFs, stale review and rehashed declarations',async t=>{
 const original=JSON.parse(await read('docs/aspect-gallery-evidence.json'));
 const good=await buildAspectEvidence(TEMPLATES,read),first=good.entries[0];
 const attacks=[
  ['extra control case',r=>r.records.push({...r.records[0],id:'03-T04-same-source-short-portrait'})],
  ['missing registered case',r=>r.records.pop()],
  ['duplicate case',r=>r.records[1]=r.records[0]],
  ['wrong input with fresh hash',r=>{r.records[0].input='examples/templates/T04.md';r.records[0].inputSha256='f'.repeat(64);} ],
  ['traversal input',r=>r.records[0].input='../outside.md'],
  ['parent version as aspect version',r=>r.records[4].aspectVersion=2],
  ['changed scope',r=>r.scope.density='compact'],
  ['other artifact batch',r=>r.batch='aspects-run-other']
 ];
 for(const [name,change] of attacks)await t.test(name,async()=>{const r=structuredClone(original);change(r);await assert.rejects(buildAspectEvidence(TEMPLATES,file=>file==='docs/aspect-gallery-evidence.json'?Promise.resolve(Buffer.from(JSON.stringify(r))):read(file)),/ASPECT_EVIDENCE_INVALID/);});
 const paths=[first.input,...Object.values(first.views).map(v=>v.file),`${ASPECT_BATCH.root}/technical-audit.json`,`${ASPECT_BATCH.root}/source-files.json`,`${ASPECT_BATCH.root}/pdf-audit.json`,'docs/aspect-pr22-visual-review.json','scripts/markdown.mjs','assets/templates.css'];
 for(const file of paths)await t.test('altered '+file,async()=>{await assert.rejects(buildAspectEvidence(TEMPLATES,p=>p===file?Promise.resolve(Buffer.from('wrong bytes')):read(p)),/ASPECT_EVIDENCE_INVALID/);});
 await t.test('missing native PDF',async()=>{await assert.rejects(buildAspectEvidence(TEMPLATES,p=>p===first.views.nativePdf.file?Promise.reject(new Error('missing PDF')):read(p)),/ASPECT_EVIDENCE_INVALID/);});
 await t.test('actual old portrait pixels',async()=>{const old=await read('docs/images/templates/T04.png');await assert.rejects(buildAspectEvidence(TEMPLATES,p=>p===first.views.fullPng.file?Promise.resolve(old):read(p)),/ASPECT_EVIDENCE_INVALID/);});
 for(const [name,change] of [['aspect-version',t=>t.aspectLayouts.square.version++],['parent-version',t=>t.version++],['example',t=>t.aspectLayouts.square.example=t.example]])await t.test('registry '+name,async()=>{const templates=structuredClone(TEMPLATES);change(templates.find(t=>t.id==='T04'));await assert.rejects(buildAspectEvidence(templates,read),/ASPECT_EVIDENCE_INVALID/);});
});
