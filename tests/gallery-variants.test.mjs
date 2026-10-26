import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TEMPLATES,validateTemplateMetadata} from '../scripts/templates.mjs';
import {buildVariantEvidence,VARIANT_EVIDENCE} from '../scripts/gallery-variants.mjs';
import {buildGalleryModel,renderGallery} from '../scripts/build-template-gallery.mjs';
import {galleryImages,expectedIds} from '../scripts/validate-gallery.mjs';
const read=file=>readFile(new URL('../'+file,import.meta.url));
const templates=TEMPLATES.map(t=>({...t,preview:{}}));
const evidence=await buildVariantEvidence(templates,read);

test('two exact historical comparisons retain registry scope, provenance and explicit permissions',()=>{
 assert.deepEqual(evidence.entries.map(e=>[e.template,e.variant,e.allowedAspects]),[['T20','screenshot-stage',['portrait']],['T37','photo-cover',['portrait']]]);
 for(const entry of evidence.entries){
  assert.equal(entry.views.length,2);
  assert.notEqual(entry.views[0].sha256,entry.views[1].sha256);
  assert.ok(entry.views.every(v=>v.width===1080&&v.height===1440&&v.command.includes('--strict --preview')));
  assert.equal(entry.views[0].metadata.visualVariant,undefined);
  assert.equal(entry.views[1].metadata.visualVariant,entry.variant);
 }
 assert.match(evidence.entries[1].views[0].status,/对比度限制/);
 assert.equal(evidence.entries[1].fields.mediaFit,'cover');
 assert.equal(evidence.entries[1].fields.subjectSafety,'clear');
});
test('pinned manifest, PNG, original image, input, report, review and brand tampering fail closed',async()=>{
 const entry=evidence.entries[1];
 for(const target of [VARIANT_EVIDENCE,entry.views[1].path,entry.views[1].input.file,entry.views[1].metadata.image,entry.report.file,entry.visualReview.file,entry.brand.file,'examples/assets/demo-logo.png']){
  await assert.rejects(buildVariantEvidence(templates,async file=>file===target?Buffer.concat([await read(file),Buffer.from('tampered')]):read(file)),/differs|changed/);
 }
});
test('future registry version cannot reuse historical pixels; pending previews gain no accepted images',async()=>{
 await assert.rejects(buildVariantEvidence(templates.map(t=>t.id==='T37'?{...t,version:t.version+1}:t),read),/version differs/);
 assert.equal((await buildVariantEvidence(templates.map(t=>({...t,preview:null})),read)).entries.length,0);
});
test('gallery keeps 48 IDs, distinct default previews, searchable routes and safe local markup',async()=>{
 const model=await buildGalleryModel(),html=renderGallery(model);
 assert.equal(model.items.length,48);assert.equal(model.accepted.length,48);
 assert.deepEqual(expectedIds(model,{purpose:'产品截图'}),['T20']);
 assert.deepEqual(expectedIds(model,{purpose:'摄影封面'}),['T37']);
 assert.deepEqual(expectedIds(model,{purpose:'photo-cover'}),['T37']);
 const images=galleryImages(model);
 for(const entry of model.variantEvidence.entries){
  const item=model.items.find(i=>i.id===entry.template),index=images.indexOf(item.preview);
  assert.deepEqual(images.slice(index+1,index+3),entry.views);
  assert.ok(entry.views.every(v=>v.sha256!==item.preview.sha256));
  assert.ok(html.includes(`href="#${entry.id}" data-template-target="${entry.template}" data-variant-target="${entry.id}"`));
  assert.ok(html.includes(`id="${entry.id}" data-visual-variant="${entry.variant}"`));
 }
 const hostile=structuredClone(model);hostile.items.find(i=>i.id==='T20').visualVariants[0].description='<script>bad</script>';
 assert.ok(!renderGallery(hostile).includes('<script>bad</script>'));
});
test('presentation leaves author crop permission, subject safety and aspect refusals enforced by the registry',()=>{
 const metadata=evidence.entries[1].views[1].metadata;
 for(const change of [{mediaFit:undefined},{subjectSafety:'blocked'},{subjectSafety:'uncertain'},{imageRole:'screenshot'},{focalX:101},{textZone:'unknown'}]){
  assert.throws(()=>validateTemplateMetadata({...metadata,...change},{width:1080,height:1440}));
 }
 assert.throws(()=>validateTemplateMetadata(metadata,{width:1080,height:1080}));
});
