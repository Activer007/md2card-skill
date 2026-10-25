// Independent acceptance registry for eight exact aspect fixtures. No renderer,
// browser or snapshot module is executed while validating offline evidence.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {SEMANTIC_FILES,readEvidenceFile,sha256,evidencePath} from './evidence-source.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const ASPECT_BATCH=Object.freeze({
  id:'aspects-run-40079964688',root:'docs/evidence/aspects-run-40079964688',
  commit:'05f6bb6e484cb8887ea037e520a733db9303563d',tree:'9dee88002e629b44dbd7e141874fe5388b5e7b9d',
  sourceSha256:'473cd63ff3ff57cacdcf1bee29044d53bf02ce062b4b40bc027db529462859c1',
  auditSha256:'ca9e7a89e5874a041d4533168787c8a83b9f0b697c435f0077e544fbf3bdcc63',
  sourceManifestSha256:'69e49654cad4833e330d203ebf5015662958bdc96bbeccf2289af4b202e525fd',
  pdfAuditSha256:'0be40bd5c3cac47f01afef52cd4577abb6e47a3da53b5de3bdc3e66e736e58c7',
  reviewSha256:'5a56a88bde10e7d8bd46b14a07355b624e3f70ec96e663c77f121fc50759c4e8'
});
const eq=assert.deepEqual;
const runtime=bytes=>{const p=JSON.parse(bytes);return Object.fromEntries(['name','version','type','engines','dependencies','optionalDependencies','overrides'].map(k=>[k,p[k]]));};
export async function buildAspectEvidence(templates,readRepoFile){
  try {
    const files=new Set(),root=ASPECT_BATCH.root;
    async function read(file,digest,size){evidencePath(file);const bytes=await readRepoFile(file);files.add(file);if(digest!==undefined)eq(sha256(bytes),digest,`${file}: byte identity`);if(size!==undefined)eq(bytes.length,size,`${file}: size`);return bytes;}
    const registry=JSON.parse(await read('docs/aspect-gallery-evidence.json'));
    eq(registry.schemaVersion,1);eq(registry.batch,ASPECT_BATCH.id);eq(registry.scope,{density:'standard',pagination:'manual',fixturesOnly:true});
    const audit=JSON.parse(await read(`${root}/technical-audit.json`,ASPECT_BATCH.auditSha256));
    const source=JSON.parse(await read(`${root}/source-files.json`,ASPECT_BATCH.sourceManifestSha256));
    eq(source.git,{commit:ASPECT_BATCH.commit,tree:ASPECT_BATCH.tree,dirty:false});eq(source.sha256,ASPECT_BATCH.sourceSha256);eq(sha256(JSON.stringify(source.files)),ASPECT_BATCH.sourceSha256);
    const sourceFiles=new Map(source.files.map(f=>[f.file,f]));
    for(const file of SEMANTIC_FILES){const expected=sourceFiles.get(file);assert.ok(expected,`missing source semantics: ${file}`);const current=await read(file),executing=await readEvidenceFile(ROOT,file);if(file==='package.json')eq(runtime(current),runtime(executing));else eq(sha256(current),expected.sha256,`${file}: source root differs`);if(file==='package.json'){const original=JSON.parse(await read(`${root}/source-package.json`,expected.sha256));eq(runtime(current),runtime(JSON.stringify(original)));}else eq(sha256(executing),expected.sha256,`${file}: executing semantics differ`);}
    const reviewFile='docs/aspect-pr22-visual-review.json',review=JSON.parse(await read(reviewFile,ASPECT_BATCH.reviewSha256));
    const pdf=JSON.parse(await read(`${root}/pdf-audit.json`,ASPECT_BATCH.pdfAuditSha256));eq(pdf.bindingSha256,ASPECT_BATCH.auditSha256);
    eq(review.identity,audit.identity);eq(review.identity.commit,ASPECT_BATCH.commit);eq(review.identity.tree,ASPECT_BATCH.tree);
    const selected=audit.records.filter(r=>r.eligibleForVisualBinding);eq(selected.length,8);
    eq(registry.records.map(r=>r.id),selected.map(r=>r.id));eq(review.records.map(r=>r.id),selected.map(r=>r.id));
    const entries=[];
    for(const record of selected){
      const declaration=registry.records.find(r=>r.id===record.id),visual=review.records.find(r=>r.id===record.id),template=templates.find(t=>t.id===record.template),page=pdf.records.find(p=>p.id===record.id);
      assert.ok(template&&page);const layout=template.aspectLayouts?.[record.aspect];assert.ok(layout);
      eq(declaration,{id:record.id,template:record.template,aspect:record.aspect,templateVersion:record.templateVersion,aspectVersion:record.aspectVersion,input:record.input,inputSha256:record.inputSha256});
      eq(template.version,record.templateVersion,'aspect parent template version');eq(layout.version,record.aspectVersion,'independent aspect version');eq(layout.example,record.input,'registered aspect example');assert.ok(template.aspects.includes(record.aspect));
      eq(record.status,'exported-not-visually-reviewed');assert.ok(record.scope.startsWith('aspect-specific-'));
      await read(record.input,record.inputSha256);
      for(const file of record.files)await read(`${root}/${file.file}`,file.sha256,file.bytes);
      for(const view of Object.values(visual.views))await read(view.file,view.sha256);
      eq(visual.templateVersion,record.templateVersion);eq(visual.aspectVersion,record.aspectVersion);eq(visual.inputSha256,record.inputSha256);
      eq(visual.checks,{fullPng:'reviewed',mobile375:'reviewed',mobile390:'reviewed',nativePdfPage:'reviewed',originalTextAndMetadata:'reviewed',sourceAndCounter:'reviewed',imageProportions:record.template==='T37'?'reviewed':'not-applicable',noObservedClipping:'pass'});
      assert.ok(['reviewed-exact-fixture','reviewed-with-layout-limitations'].includes(visual.status));if(visual.status==='reviewed-with-layout-limitations')assert.ok(visual.limitations.length);
      eq(visual.views.nativePdfPage.sha256,page.rasterSha256);eq(visual.views.nativePdf.sha256,page.pdfSha256);
      if(record.template==='T37'){const file='examples/templates/assets/synthetic-reading-still-life.png';await read(file,sourceFiles.get(file).sha256);}
      entries.push({...declaration,status:visual.status,notes:visual.notes,limitations:visual.limitations,views:visual.views,pdfGeometry:visual.pdfGeometry});
    }
    await read('docs/ASPECT_PR22_REVIEW.md');
    return {batch:ASPECT_BATCH.id,scope:registry.scope,entries,evidenceFiles:[...files],review:'docs/ASPECT_PR22_REVIEW.md'};
  }catch(error){throw new Error(`ASPECT_EVIDENCE_INVALID: ${error.message.split('\n')[0].slice(0,300)}`);}
}
