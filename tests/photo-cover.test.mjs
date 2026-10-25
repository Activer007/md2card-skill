import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderCards, validateCardMetadata } from '../scripts/markdown.mjs';
import { createAssetResolver } from '../scripts/assets.mjs';
import { buildDocument, SIZES } from '../scripts/document.mjs';
import { validateTemplateMetadata, TEMPLATES } from '../scripts/templates.mjs';
import { recommendTemplates } from '../scripts/template-recommender.mjs';
import { parseSemanticDocument } from '../scripts/semantic.mjs';
import { defaultPhotoInput, PHOTO_CASES, selectPhotoFixtures } from '../scripts/validate-photo-cover.mjs';
import { readdir } from 'node:fs/promises';

const root=new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
const source=await readFile(new URL('../examples/visual-upgrade/t37/dark.md',import.meta.url),'utf8');
const meta=JSON.parse(source.match(/<!-- card: (.+) -->/)[1]);
const input=m=>source.replace(/<!-- card: .+ -->/,()=>`<!-- card: ${JSON.stringify(m)} -->`);
const parse=async text=>renderCards(text,{resolveImage:(await createAssetResolver(root)).resolveImage});

test('crop authorization and author safety are explicit, typed and template scoped',()=>{
  assert.equal(validateCardMetadata(meta).visualVariant,'photo-cover');
  for(const key of ['visualVariant','imageRole','mediaFit','focalX','focalY','textZone','mediaTone','subjectSafety','alt','caption','source']) {
    const copy={...meta};delete copy[key];assert.throws(()=>validateCardMetadata(copy),{code:'INVALID_METADATA'},key);
  }
  for(const template of [undefined,...TEMPLATES.filter(t=>t.id!=='T37').map(t=>t.id)])assert.throws(()=>validateCardMetadata({...meta,template}),{code:'INVALID_METADATA'});
  for(const imageRole of ['screenshot','evidence','illustration','Photo'])assert.throws(()=>validateTemplateMetadata({...meta,imageRole}),{code:'INVALID_METADATA'});
  for(const key of ['focalX','focalY'])for(const value of [-1,101,NaN,Infinity,'50',null,true,{},[]]) {
    assert.throws(()=>validateCardMetadata({...meta,[key]:value}),{code:'INVALID_METADATA'});
    assert.throws(()=>validateTemplateMetadata({...meta,[key]:value}),{code:'INVALID_METADATA'});
  }
  for(const focalX of [0,12.5,100])assert.equal(validateCardMetadata({...meta,focalX}).focalX,focalX);
  for(const subjectSafety of ['uncertain','blocked','true','',null])assert.throws(()=>validateTemplateMetadata({...meta,subjectSafety}),/complete image/);
  for(const textZone of ['none','center','top-left; color:red','TOP-LEFT'])assert.throws(()=>validateTemplateMetadata({...meta,textZone}));
  for(const mediaFit of ['contain','Cover','',null])assert.throws(()=>validateTemplateMetadata({...meta,mediaFit}));
  for(const mediaTone of ['auto','bright','',null])assert.throws(()=>validateTemplateMetadata({...meta,mediaTone}));
  for(const dimensions of [SIZES.square,SIZES.slide])assert.throws(()=>validateTemplateMetadata(meta,dimensions),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});
  assert.throws(()=>parseSemanticDocument(source),{code:'PAGINATION_UNSUPPORTED_METADATA'});
});

test('trusted resolver is reused; title and one photo are required without hiding content',async()=>{
  for(const image of ['https://example.com/a.png','//example.com/a.png','../escape.png','file:///C:/a.png','data:image/png;base64,AA==','C:/a.png','a.svg'])await assert.rejects(parse(input({...meta,image})),e=>e.code==='INVALID_ASSET'||e.code?.startsWith('ASSET_'));
  const build=cards=>buildDocument(cards,SIZES.portrait,'');
  for(const title of ['', '# One\n# Two'])await assert.rejects(async()=>build(await parse(input(meta).replace(/# .+/,title))),{code:'TEMPLATE_TITLE_REQUIRED'});
  await assert.rejects(async()=>build(await parse(source+`\n![extra](${meta.image})`)),{code:'TEMPLATE_IMAGE_COUNT'});
  const original=await parse(defaultPhotoInput(source)),photo=await parse(source);
  assert.equal(photo[0].image.hash,original[0].image.hash);
  assert.equal(photo[0].html,original[0].html);
  const html=build(photo);
  for(const value of [meta.alt,meta.caption,meta.source])assert.ok(html.includes(value));
  assert.match(html,/<h1>暗处 <strong>有光<\/strong><\/h1>/);
  assert.doesNotMatch(build(original),/photo-stage|on-media|object-fit: cover/);
  assert.throws(()=>buildDocument(photo,SIZES.slide,''),{code:'TEMPLATE_ASPECT_UNSUPPORTED'});
  photo[0].metadata={...photo[0].metadata,focalX:'0; background:red'};
  assert.throws(()=>build(photo),{code:'INVALID_METADATA'});
});

test('recommendation does not borrow default approval or recommend unsupported slide crop',async()=>{
  const cards=await parse(source),candidate=recommendTemplates({cards}).cards[0].candidates[0];
  assert.equal(candidate.templateId,'T37');
  assert.equal(candidate.evidence.aspectRegistryStatus,'variant-independent-review-required');
  assert.match(candidate.evidence.structure,/裁切/);
  assert.equal(recommendTemplates({cards,requestedAspect:'slide'}).cards[0].compatibleCount,0);
});

test('fallback removes only crop fields and inventory cannot silently skip/add cases',async()=>{
  const raw='<!-- card: {"source":"$& $$ $1","visualVariant":"photo-cover","template":"T37","focalX":100} -->\r\n# Preserve $&\r\n';
  const result=defaultPhotoInput(raw);
  assert.equal(result.slice(result.indexOf('\r\n')),raw.slice(raw.indexOf('\r\n')));
  assert.deepEqual(JSON.parse(result.match(/<!-- card: (.+) -->/)[1]),{source:'$& $$ $1',template:'T37'});
  assert.throws(()=>defaultPhotoInput('# No metadata'));
  const files=await readdir(new URL('../examples/visual-upgrade/t37/',import.meta.url));
  assert.equal(selectPhotoFixtures(files).length,PHOTO_CASES.length);
  assert.throws(()=>selectPhotoFixtures(files.filter(f=>f!=='dark.md')));
  assert.throws(()=>selectPhotoFixtures([...files,'new.md']));
});
