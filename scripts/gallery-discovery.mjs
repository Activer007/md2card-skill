// Curated task routes plus immutable same-source comparison evidence. This is
// navigation over the one design registry, not a second registry or a renderer.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildRefinementTextInput } from './refinement-input.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const fail = message => { throw new Error(`GALLERY_DISCOVERY_INVALID: ${message}`); };
const TASKS = Object.freeze([
 { id:'explain', title:'解释一个概念', hint:'先用文字建立理解，再选图形或分区。', ids:['T04','T10','T17','T19'] },
 { id:'compare', title:'作一次有条件的比较', hint:'相同维度、真实条件，不暗示自动评分。', ids:['T06','T24','T44','T48'] },
 { id:'read', title:'保留引文与自己的理解', hint:'分清原话、解释和出处。', ids:['T02','T25','T29','T32'] },
 { id:'act', title:'给出步骤或检查清单', hint:'保留顺序与条件，不自动标记已完成。', ids:['T05','T14','T18','T47'] },
 { id:'image', title:'让图片讲一个完整故事', hint:'先有原图与说明，不隐式裁切或补造事实。', ids:['T20','T37','T39','T43'] },
 { id:'focus', title:'突出一个主张或指标', hint:'标题有主次；数字保留分母、范围与限制。', ids:['T09','T13','T21','T22'] }
]);
export function buildTaskGuide(items) {
 const byId=new Map(items.map(item=>[item.id,item]));
 return TASKS.map(task=>({...task,templates:task.ids.map(id=>{const item=byId.get(id);if(!item)fail(`unknown task template ${id}`);return {id,name:item.name,currentPreview:Boolean(item.preview)};})}));
}
export async function buildComparisonModel(items,readRepoFile) {
 const spec=JSON.parse((await readRepoFile('docs/gallery-comparisons.json')).toString('utf8'));
 if(spec.schemaVersion!==1||!Array.isArray(spec.groups)||spec.groups.length>8)fail('invalid comparison schema');
 const known=new Set(items.map(item=>item.id));const versions=new Map(items.map(item=>[item.id,item.version]));const seen=new Set();const groups=[];
 for(const group of spec.groups){
  if(!/^[a-z0-9-]+$/.test(group.id)||seen.has(group.id)||typeof group.title!=='string'||!group.title.trim()||!Array.isArray(group.templates)||group.templates.length<2||group.templates.length>6||new Set(group.templates).size!==group.templates.length||group.templates.some(id=>!known.has(id)))fail('invalid comparison group');seen.add(group.id);
  const bytes=await readRepoFile(group.input);
  if(!SHA.test(group.inputSha256)||hash(bytes)!==group.inputSha256)fail(`input hash mismatch: ${group.id}`);
  const requiredRefusals=group.requiredRefusals??{};
  if(!requiredRefusals||Array.isArray(requiredRefusals)||typeof requiredRefusals!=='object'||Object.entries(requiredRefusals).some(([id,reason])=>!group.templates.includes(id)||typeof reason!=='string'||!reason.trim())||group.templates.length-Object.keys(requiredRefusals).length<2)fail(`invalid refusal boundary: ${group.id}`);
  const item={...group,requiredRefusals,previews:[],refusals:[]};
  if(group.state==='pending'){
   if(group.evidence!==undefined)fail(`pending group contains acceptance: ${group.id}`);
  }else if(group.state==='reviewed-exact-fixtures'){
   const proof=group.evidence;
   if(proof?.scope?.density!=='standard'||proof?.scope?.aspect!=='portrait'||proof?.scope?.pagination!=='manual'||proof?.scope?.width!==1080||proof?.scope?.height!==1440)fail(`scope mismatch: ${group.id}`);
   if(!proof||!COMMIT.test(proof.codeCommit)||!COMMIT.test(proof.codeTree)||!SHA.test(proof.archiveSha256)||!/^https:\/\/github\.com\/Activer007\/md2card-skill\/actions\/runs\/[0-9]+$/.test(proof.runUrl)||!Array.isArray(proof.records))fail(`incomplete evidence: ${group.id}`);
   const review=await readRepoFile(proof.review);
   if(!SHA.test(proof.reviewSha256)||hash(review)!==proof.reviewSha256||!review.toString().includes(proof.codeCommit)||!review.toString().includes(group.id))fail(`review mismatch: ${group.id}`);
   if(proof.records.length!==group.templates.length||new Set(proof.records.map(r=>r.template)).size!==group.templates.length)fail(`record count mismatch: ${group.id}`);
   for(const record of proof.records){
    if(!group.templates.includes(record.template)||record.version!==versions.get(record.template)||record.bodySha256!==group.inputSha256)fail(`record scope mismatch: ${group.id}`);
    if(Object.hasOwn(requiredRefusals,record.template)){
     if(record.outcome!=='expected-overflow'||!SHA.test(record.diagnosticSha256)||record.pngSha256!==undefined||record.pdfSha256!==undefined)fail(`refusal record mismatch: ${group.id}`);
     const inputName=`${path.posix.basename(group.input,'-reading.md')}-${record.template}.md`;
     if(typeof record.input!=='string'||path.posix.basename(record.input)!==inputName||!SHA.test(record.inputSha256))fail(`refusal input mismatch: ${group.id}`);
     const input=await readRepoFile(record.input);
     if(hash(input)!==record.inputSha256||!input.equals(Buffer.from(buildRefinementTextInput(record.template,bytes.toString('utf8')))))fail(`refusal input mismatch: ${group.id}`);
     const diagnostic=await readRepoFile(record.diagnostic);const failure=JSON.parse(diagnostic.toString('utf8'));
     if(hash(diagnostic)!==record.diagnosticSha256||failure.input!==inputName||failure.schemaVersion!==2||failure.code!=='CONTENT_OVERFLOW'||failure.status!=='overflow'||failure.dimensions?.width!==1080||failure.dimensions?.height!==1440||!Array.isArray(failure.cards)||failure.cards.length!==1||failure.cards[0]?.index!==1||!['screen','print'].some(media=>Array.isArray(failure.cards[0]?.[media]?.overflow)&&failure.cards[0][media].overflow.length>0&&failure.cards[0][media].overflow.every(reason=>typeof reason==='string')))fail(`refusal diagnostic mismatch: ${group.id}`);
     const relative=path.posix.relative(path.posix.dirname(proof.review),record.diagnostic);
     if(!review.toString().includes(`(${relative})`))fail(`missing review refusal: ${group.id}`);
     item.refusals.push({template:record.template,reason:requiredRefusals[record.template],path:record.diagnostic,sha256:record.diagnosticSha256});continue;
    }
    if(record.outcome!==undefined&&record.outcome!=='exported'||!SHA.test(record.pdfSha256)||!SHA.test(record.pngSha256))fail(`record artifact mismatch: ${group.id}`);
    const file=`docs/images/comparisons/${group.id}/${record.template}.png`;
    const png=await readRepoFile(file);
    if(hash(png)!==record.pngSha256||png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.toString('ascii',12,16)!=='IHDR'||png.readUInt32BE(16)!==1080||png.readUInt32BE(20)!==1440)fail(`PNG mismatch: ${group.id}/${record.template}`);
    const relative=path.posix.relative(path.posix.dirname(proof.review),file);
    if(!review.toString().includes(`(${relative})`))fail(`missing review image: ${group.id}/${record.template}`);
    item.previews.push({template:record.template,version:record.version,path:file,width:1080,height:1440,sha256:record.pngSha256});
   }
  }else fail(`unknown comparison state: ${group.id}`);
  groups.push(item);
 }
 return groups;
}
