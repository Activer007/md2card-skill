import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TEMPLATES } from '../scripts/templates.mjs';
import { buildTaskGuide,buildComparisonModel } from '../scripts/gallery-discovery.mjs';
const read=path=>readFile(new URL('../'+path,import.meta.url));
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
 const png=await read('docs/images/templates/T04.png'); // Test fixture only: never production v2 acceptance.
 const review=Buffer.from('SYNTHETIC UNIT TEST ONLY, NOT A VISUAL REVIEW\n'+'a'.repeat(40)+'\n'+group.id+'\n'+group.templates.map(id=>`(${`images/comparisons/${group.id}/${id}.png`})`).join('\n'));
 group.evidence={codeCommit:'a'.repeat(40),codeTree:'b'.repeat(40),archiveSha256:'c'.repeat(64),runUrl:'https://github.com/Activer007/md2card-skill/actions/runs/1',review:'docs/unit-comparison-review.md',reviewSha256:hash(review),scope:{density:'standard',aspect:'portrait',pagination:'manual',width:1080,height:1440},records:group.templates.map(template=>({template,version:2,bodySha256:group.inputSha256,pdfSha256:'d'.repeat(64),pngSha256:hash(png)}))};
 const readFixture=(plan=spec,reviewBytes=review,imageBytes=png)=>p=>p==='docs/gallery-comparisons.json'?Promise.resolve(Buffer.from(JSON.stringify(plan))):p===group.evidence.review?Promise.resolve(reviewBytes):p.startsWith('docs/images/comparisons/')?Promise.resolve(imageBytes):read(p);
 const result=await buildComparisonModel(TEMPLATES,readFixture());assert.equal(result[0].previews.length,4);assert.equal(result[1].previews.length,0);
 assert.equal(result[0].previews[0].path,'docs/images/comparisons/short-reading/T04.png');
 const {buildGalleryModel,renderGallery}=await import('../scripts/build-template-gallery.mjs');const gallery=await buildGalleryModel();gallery.comparisons=result;const rendered=renderGallery(gallery);assert.equal((rendered.match(/<img /g)||[]).length,gallery.accepted.length+4);assert.ok(rendered.includes('src="../../docs/images/comparisons/short-reading/T04.png"'));assert.equal(gallery.pending.length,48);assert.ok(rendered.includes('同一正文、standard、3:4、manual')); 
 for(const mutate of [g=>g.evidence.records[0].version=1,g=>g.evidence.records[0].bodySha256='f'.repeat(64),g=>g.evidence.scope.density='compact',g=>g.evidence.records.pop(),g=>g.evidence.runUrl='https://untrusted.invalid/1']){
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
