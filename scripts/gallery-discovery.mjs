// Curated task routes plus immutable same-source comparison evidence. This is
// navigation over the one design registry, not a second registry or a renderer.
import { createHash } from 'node:crypto';
import { comparisonEvidenceReader } from './comparison-evidence.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const SHA = /^[a-f0-9]{64}$/;
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
 const verifyEvidence = comparisonEvidenceReader(readRepoFile);
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
   Object.assign(item, await verifyEvidence(group, versions));
  }else fail(`unknown comparison state: ${group.id}`);
  groups.push(item);
 }
 return groups;
}
