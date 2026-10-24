import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TEMPLATES } from '../scripts/templates.mjs';
import { buildTaskGuide,buildComparisonModel } from '../scripts/gallery-discovery.mjs';
import { buildRefinementTextInput } from '../scripts/refinement-input.mjs';
const read=path=>readFile(new URL('../'+path,import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('task-first navigation selects purposes without creating new design identities',()=>{
 const tasks=buildTaskGuide(TEMPLATES);assert.equal(tasks.length,6);
 assert.ok(tasks.every(t=>t.templates.length===4&&t.hint&&t.title));
 assert.equal(TEMPLATES.length,48);assert.throws(()=>buildTaskGuide(TEMPLATES.filter(t=>t.id!=='T04')),/unknown task template/);
});
test('same-content groups have exact source hashes and no unearned current previews',async()=>{
 const groups=await buildComparisonModel(TEMPLATES,read);assert.equal(groups.length,3);
 for(const group of groups){assert.equal(group.state,'pending');assert.equal(group.previews.length,0);assert.equal(group.templates.length,4);}
});
test('comparison plans reject stale inputs, unknown IDs and forged acceptance',async()=>{
 const original=JSON.parse(await read('docs/gallery-comparisons.json'));
 for(const mutation of [g=>g.inputSha256='0'.repeat(64),g=>g.templates[0]='T99',g=>{g.state='reviewed-exact-fixtures';g.evidence={};},g=>g.evidence={claimed:true}]){
  const spec=structuredClone(original);mutation(spec.groups[0]);
  await assert.rejects(buildComparisonModel(TEMPLATES,p=>p==='docs/gallery-comparisons.json'?Promise.resolve(Buffer.from(JSON.stringify(spec))):read(p)),/GALLERY_DISCOVERY_INVALID/);
 }
});

test('synthetic accepted comparison validates current versions, scope and exact image/review paths', async()=>{
 const {createHash}=await import('node:crypto');const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const spec=JSON.parse(await read('docs/gallery-comparisons.json'));const group=spec.groups[0];
 group.state='reviewed-exact-fixtures';
 const png=await read('docs/images/templates/T04.png'); // Test fixture only: never production visual acceptance.
 const review=Buffer.from('SYNTHETIC UNIT TEST ONLY, NOT A VISUAL REVIEW\n'+'a'.repeat(40)+'\n'+group.id+'\n'+group.templates.map(id=>`(${`images/comparisons/${group.id}/${id}.png`})`).join('\n'));
 group.evidence={codeCommit:'a'.repeat(40),codeTree:'b'.repeat(40),archiveSha256:'c'.repeat(64),runUrl:'https://github.com/Activer007/md2card-skill/actions/runs/1',review:'docs/unit-comparison-review.md',reviewSha256:hash(review),scope:{density:'standard',aspect:'portrait',pagination:'manual',width:1080,height:1440},records:group.templates.map(template=>({template,version:TEMPLATES.find(item=>item.id===template).version,bodySha256:group.inputSha256,pdfSha256:'d'.repeat(64),pngSha256:hash(png)}))};
 const readFixture=(plan=spec,reviewBytes=review,imageBytes=png)=>p=>p==='docs/gallery-comparisons.json'?Promise.resolve(Buffer.from(JSON.stringify(plan))):p===group.evidence.review?Promise.resolve(reviewBytes):p.startsWith('docs/images/comparisons/')?Promise.resolve(imageBytes):read(p);
 const result=await buildComparisonModel(TEMPLATES,readFixture());assert.equal(result[0].previews.length,4);assert.equal(result[1].previews.length,0);
 assert.ok(result[0].previews.some(record=>record.template==='T13'));assert.equal(result[0].refusals.length,0);
 assert.equal(result[0].previews[0].path,'docs/images/comparisons/short-reading/T04.png');
 assert.deepEqual(result[0].previews.map(preview=>preview.version),[2,3,3,2]);
 const {buildGalleryModel,renderGallery}=await import('../scripts/build-template-gallery.mjs');const gallery=await buildGalleryModel();gallery.comparisons=result;const rendered=renderGallery(gallery);assert.equal((rendered.match(/<img /g)||[]).length,gallery.accepted.length+4);assert.ok(rendered.includes('src="../../docs/images/comparisons/short-reading/T04.png"'));assert.equal(gallery.accepted.length,48);assert.equal(gallery.pending.length,0);assert.ok(rendered.includes('同一正文、standard、3:4、manual'));
 for(const mutate of [g=>g.evidence.records[0].version=1,g=>g.evidence.records[1].version=2,g=>g.evidence.records[0].bodySha256='f'.repeat(64),g=>g.evidence.scope.density='compact',g=>g.evidence.records.pop(),g=>g.evidence.runUrl='https://untrusted.invalid/1']){
  const changed=structuredClone(spec);mutate(changed.groups[0]);await assert.rejects(buildComparisonModel(TEMPLATES,readFixture(changed)),/GALLERY_DISCOVERY_INVALID/);
 }
 await assert.rejects(buildComparisonModel(TEMPLATES,readFixture(spec,review,Buffer.from('not PNG'))),/PNG mismatch/);
 const stale=Buffer.from(review.toString().replace('images/comparisons/short-reading/T04.png','images/templates/T04.png'));const staleSpec=structuredClone(spec);staleSpec.groups[0].evidence.reviewSha256=hash(stale);
 await assert.rejects(buildComparisonModel(TEMPLATES,readFixture(staleSpec,stale)),/missing review image/);
});

test('task-first and comparison sections are static, escaped and do not promote templates',async()=>{
 const {buildGalleryModel,renderGallery}=await import('../scripts/build-template-gallery.mjs');
 const model=await buildGalleryModel();const html=renderGallery(model);
 assert.ok(html.indexOf('id="tasks"')<html.indexOf('class="filters"'));
 assert.ok(html.includes('id="comparisons"'));assert.equal((html.match(/class="task-route"/g)||[]).length,6);
 assert.equal((html.match(/class="comparison"/g)||[]).length,3);assert.equal((html.match(/data-template-card/g)||[]).length,48);
 const hostile=structuredClone(model);hostile.tasks[0].title='<img src=x>';hostile.comparisons[0].title='<script>alert(1)</script>';
 const escaped=renderGallery(hostile);assert.ok(escaped.includes('&lt;img src=x&gt;'));assert.ok(escaped.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(!escaped.includes('<img src=x>'));
});

async function refusalFixture() {
 const spec=JSON.parse(await read('docs/gallery-comparisons.json'));const group=spec.groups[1];assert.deepEqual(Object.keys(group.requiredRefusals),['T13']);group.state='reviewed-exact-fixtures';
 const png=await read('docs/images/templates/T04.png'); // Synthetic protocol fixture, never current evidence.
 const inputPath='docs/unit-inputs/medium-T13.md';
 const input=Buffer.from(buildRefinementTextInput('T13',(await read(group.input)).toString('utf8')));
 const diagnostic=Buffer.from(JSON.stringify({schemaVersion:2,status:'overflow',code:'CONTENT_OVERFLOW',input:'medium-T13.md',dimensions:{width:1080,height:1440},cards:[{index:1,screen:{overflow:['content-height']},print:{overflow:['content-height']}}]}));
 const diagnosticPath='docs/unit-medium-T13-overflow.json';
 const review=Buffer.from('SYNTHETIC UNIT TEST ONLY\n'+'a'.repeat(40)+'\n'+group.id+'\n'+group.templates.filter(id=>id!=='T13').map(id=>`(images/comparisons/${group.id}/${id}.png)`).join('\n')+'\n(unit-medium-T13-overflow.json)');
 group.evidence={codeCommit:'a'.repeat(40),codeTree:'b'.repeat(40),archiveSha256:'c'.repeat(64),runUrl:'https://github.com/Activer007/md2card-skill/actions/runs/1',review:'docs/unit-medium-review.md',reviewSha256:hash(review),scope:{density:'standard',aspect:'portrait',pagination:'manual',width:1080,height:1440},records:group.templates.map(template=>({template,version:TEMPLATES.find(item=>item.id===template).version,bodySha256:group.inputSha256,...(template==='T13'?{outcome:'expected-overflow',input:inputPath,inputSha256:hash(input),diagnostic:diagnosticPath,diagnosticSha256:hash(diagnostic)}:{outcome:'exported',pdfSha256:'d'.repeat(64),pngSha256:hash(png)})}))};
 const readFixture=(plan=spec,inputBytes=input,diagnosticBytes=diagnostic)=>p=>p==='docs/gallery-comparisons.json'?Promise.resolve(Buffer.from(JSON.stringify(plan))):p===inputPath?Promise.resolve(inputBytes):p===diagnosticPath?Promise.resolve(diagnosticBytes):p===group.evidence.review?Promise.resolve(review):p.startsWith('docs/images/comparisons/')?Promise.resolve(png):read(p);
 return {spec,input,diagnostic,readFixture};
}

test('reviewed same-content refusal stays visible without a fake image or successful-export count',async()=>{
 const {spec,readFixture}=await refusalFixture();
 const groups=await buildComparisonModel(TEMPLATES,readFixture(spec));assert.equal(groups[1].previews.length,3);assert.equal(groups[1].refusals.length,1);assert.equal(groups[1].refusals[0].template,'T13');
 const {buildGalleryModel,renderGallery}=await import('../scripts/build-template-gallery.mjs');const model=await buildGalleryModel();model.comparisons=groups;const html=renderGallery(model);assert.ok(html.includes('T13 · 本例明确不适配'));assert.ok(html.includes('保留的溢出诊断'));assert.equal((html.match(/<img /g)||[]).length,model.accepted.length+3);
 for(const mutate of [record=>record.outcome='exported',record=>record.pngSha256='e'.repeat(64),record=>record.diagnosticSha256='f'.repeat(64)]){const changed=structuredClone(spec);mutate(changed.groups[1].evidence.records.find(r=>r.template==='T13'));await assert.rejects(buildComparisonModel(TEMPLATES,readFixture(changed)),/refusal/);}
 const missing=structuredClone(spec);delete missing.groups[1].requiredRefusals;await assert.rejects(buildComparisonModel(TEMPLATES,readFixture(missing)),/record artifact/);
});

test('refusal binds the exact generated input name, hash, body and controlled metadata',async t=>{
 const fixture=await refusalFixture();
 for(const [name,mutate] of [
  ['missing input path',f=>delete f.record.input],
  ['swapped input path',f=>f.record.input='docs/unit-inputs/long-T13.md'],
  ['missing input hash',f=>delete f.record.inputSha256],
  ['changed input hash',f=>f.record.inputSha256='0'.repeat(64)],
  ['changed input bytes with stale hash',f=>f.input=Buffer.concat([f.input,Buffer.from('\n')])],
  ['missing diagnostic input',f=>delete f.failure.input],
  ['swapped diagnostic input',f=>f.failure.input='long-T13.md'],
  ['same-size other-template diagnostic',f=>f.failure.input='medium-T04.md'],
  ['diagnostic path instead of basename',f=>f.failure.input='inputs/medium-T13.md'],
  ['swapped input and diagnostic together',f=>{f.record.input='docs/unit-inputs/long-T13.md';f.failure.input='long-T13.md';}],
  ...[
   ['template','"template":"T13"','"template":"T04"'],
   ['density','"density":"standard"','"density":"compact"'],
   ['source label','原创阅读练习','不相关的来源'],
   ['body', '#', '# unrelated source\n\n#']
  ].map(([name,from,to])=>[`contradictory ${name} with fresh hash`,f=>{f.input=Buffer.from(f.input.toString().replace(from,to));f.record.inputSha256=hash(f.input);}]),
  ['different same-size body with fresh hash',f=>{f.input=Buffer.from(f.input);f.input[f.input.length-1]=32;f.record.inputSha256=hash(f.input);}]
 ]) await t.test(name,async()=>{
  const spec=structuredClone(fixture.spec);const record=spec.groups[1].evidence.records.find(r=>r.template==='T13');
  const state={record,input:fixture.input,failure:JSON.parse(fixture.diagnostic)};mutate(state);
  const diagnostic=Buffer.from(JSON.stringify(state.failure));record.diagnosticSha256=hash(diagnostic);
  assert.equal(record.bodySha256,spec.groups[1].inputSha256,'declaring the correct body hash alone is insufficient');
  await assert.rejects(buildComparisonModel(TEMPLATES,fixture.readFixture(spec,state.input,diagnostic)),/refusal (?:input|diagnostic) mismatch/);
 });
});
