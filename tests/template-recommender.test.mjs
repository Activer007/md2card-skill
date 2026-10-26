import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderCards } from '../scripts/markdown.mjs';
import { createAssetResolver } from '../scripts/assets.mjs';
import { TEMPLATES, validateTemplateMetadata, validateTemplateCard } from '../scripts/templates.mjs';
import { recommendTemplates } from '../scripts/template-recommender.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const recommend = (source, options={}) => recommendTemplates({cards:renderCards(source), ...options});
const rejected = (card,id) => card.rejected.find(t=>t.templateId===id)?.reasonIds ?? [];

test('no image or metric is invented and compatible omissions are distinct from rejections', () => {
  const report = recommend('# 概念\n\n## 定义\n\n原始正文。'), card = report.cards[0];
  assert.equal(report.automatedRenderingPerformed,false); assert.ok(card.candidates.length<=3);
  assert.ok(rejected(card,'T20').includes('TEMPLATE_IMAGE_REQUIRED'));
  assert.ok(rejected(card,'T21').includes('TEMPLATE_METADATA_REQUIRED'));
  assert.equal(card.compatibleCount+card.rejected.length,48);
  assert.equal(card.omittedCompatibleTemplateIds.length+card.candidates.length,card.compatibleCount);
  assert.equal(new Set([...card.candidates.map(c=>c.templateId),...card.omittedCompatibleTemplateIds,...card.rejected.map(r=>r.templateId)]).size,48);
  assert.ok(card.candidates.every(c=>c.caveats.includes('RENDER_NOT_PERFORMED')));
});

test('local screenshot with no template preselection ranks T20 from registry purpose', async () => {
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates',import.meta.url)));
  const source='<!-- card: {"image":"assets/original-research-interface.png","alt":"原创虚构界面截图","caption":"非真实产品"} -->\n# 资料工作台\n\n说明。\n\n## 整理\n\n保留出处。\n\n## 回看\n\n核对原文。';
  const cards=renderCards(source,{resolveImage:resolver.resolveImage}), before=JSON.stringify(cards);
  const report=recommendTemplates({cards});
  assert.equal(report.cards[0].role,'screenshot-evidence');
  assert.equal(report.cards[0].candidates[0].templateId,'T20');
  assert.ok(report.cards[0].candidates[0].reasonIds.includes('REGISTRY_PURPOSE_MATCH'));
  assert.ok(report.cards[0].candidates[0].caveats.includes('SCREENSHOT_TEXT_REQUIRES_VISUAL_REVIEW'));
  assert.ok(rejected(report.cards[0],'T05').includes('TEMPLATE_IMAGE_UNSUPPORTED'));
  assert.equal(JSON.stringify(cards),before);
});

test('lists, quotations, explicit two-column comparisons and supplied metric have explained candidates', () => {
  for(const [source,layout] of [
    ['# 方法\n\n1. 检查\n2. 记录\n3. 回看','steps'],
    ['# 摘句\n\n> 原创短句。\n\n## 理解\n\n保留语境。','quote'],
    ['<!-- card: {"layout":"comparison"} -->\n# 对照\n\n## A\n\n一种取向。\n\n## B\n\n另一种取向。','comparison']
  ]) {
    const [card]=recommend(source).cards;
    assert.ok(card.candidates.length);assert.equal(card.candidates[0].evidence.layout,layout);
    assert.ok(card.candidates[0].reasonIds.includes('ROLE_LAYOUT_MATCH'));
  }
  const [metric]=recommend('<!-- card: {"metric":"42%","label":"样例比例"} -->\n# 样例数据').cards;
  assert.deepEqual(metric.candidates.map(c=>c.templateId),['T21']);
  assert.ok(metric.candidates[0].reasonIds.includes('REQUIRED_METADATA_MET'));
  assert.ok(metric.candidates[0].caveats.includes('SOURCE_NOT_PROVIDED'));
  const [partial]=recommend('<!-- card: {"metric":"42%"} -->\n# 不完整指标').cards;
  assert.equal(partial.candidates.length,0);assert.ok(rejected(partial,'T21').includes('TEMPLATE_METADATA_REQUIRED'));
});

test('unsupported aspect, explicit layout, paired structures and actual list bounds are hard exclusions', () => {
  const [square]=recommend('# 方法\n\n1. 保留原编号',{requestedAspect:'square'}).cards;
  assert.ok(rejected(square,'T02').includes('TEMPLATE_ASPECT_UNSUPPORTED'));
  assert.ok(square.candidates.every(c=>TEMPLATES.find(t=>t.id===c.templateId).aspects.includes('square')));
  const [wide]=recommend('<!-- card: {"template":"T01"} -->\n# 独立宽封面\n\n保持正文与完整来源。',{requestedAspect:'wechat-wide'}).cards;
  assert.deepEqual(wide.candidates.map(c=>c.templateId),['T01']);assert.equal(wide.rejected.length,47);
  for(const row of wide.rejected.filter(r=>!['T01','T21'].includes(r.templateId))) assert.ok(row.reasonIds.includes('TEMPLATE_ASPECT_UNSUPPORTED'));
  assert.equal(wide.candidates[0].evidence.aspect,'wechat-wide');
  const [layout]=recommend('<!-- card: {"layout":"cover"} -->\n# 标题\n\n1. 项目').cards;
  assert.ok(rejected(layout,'T05').includes('TEMPLATE_LAYOUT_MISMATCH'));
  const [range]=recommend('# 编号\n\n100. 原始编号').cards;
  assert.ok(rejected(range,'T05').includes('TEMPLATE_LIST_RANGE'));
  const [paired]=recommend('<!-- card: {"layout":"comparison"} -->\n# 对照\n\n## A\n\n> 单个选项\n\n## B\n\n> 单个选项').cards;
  assert.ok(rejected(paired,'T44').includes('TEMPLATE_OPTION_STRUCTURE'));
});

test('pressure and unknown inputs retain caveats; auto never receives templates', () => {
  for(const [source,caveat] of [
    ['# 代码\n\n```js\n'+('const sample = 1;\n'.repeat(10))+'```','LONG_CODE'],
    ['# 宽表\n\n| A | B | C | D | E |\n|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 |','WIDE_TABLE'],
    ['零散文字','UNKNOWN_ROLE']
  ]) {
    const [card]=recommend(source).cards;
    assert.ok(card.caveats.includes(caveat));assert.ok(card.candidates.every(c=>c.caveats.includes(caveat)));
    if(caveat==='UNKNOWN_ROLE'){assert.equal(card.candidates.length,0);assert.equal(card.selectionStatus,'insufficient-role-evidence');}
  }
  const [auto]=recommend('# 步骤\n\n1. 检查',{paginate:'auto'}).cards;
  assert.equal(auto.candidates.length,0);assert.ok(auto.rejected.every(r=>r.reasonIds.includes('AUTO_TEMPLATE_UNSUPPORTED')));
});

test('unknown image semantics retain only a valid explicit author template, without guessing alternatives', async () => {
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates',import.meta.url)));
  const source='<!-- card: {"template":"T20","image":"assets/original-research-interface.png","alt":"示例图","caption":"原创演示"} -->\n# 示例';
  const cards=renderCards(source,{resolveImage:resolver.resolveImage});
  const [report]=recommendTemplates({cards}).cards;
  assert.equal(report.role,'unknown');
  assert.equal(report.selectionStatus,'author-template-only');
  assert.deepEqual(report.candidates.map(c=>c.templateId),['T20']);
  assert.ok(report.candidates[0].reasonIds.includes('AUTHOR_TEMPLATE_MATCH'));
  assert.ok(report.candidates[0].caveats.includes('IMAGE_ROLE_UNKNOWN'));
  assert.equal(report.omittedCompatibleTemplateIds.length+1,report.compatibleCount);
  assert.equal(recommendTemplates({cards,requestedAspect:'square'}).cards[0].candidates.length,0);
  assert.equal(recommendTemplates({cards,paginate:'auto'}).cards[0].candidates.length,0);
});

test('nonportrait candidates explain their registered aspect structure instead of portrait guidance', () => {
  const source='<!-- card: {"template":"T04"} -->\n# 论点\n\n## 一\n\n正文。\n\n## 二\n\n正文。\n\n## 三\n\n正文。';
  const [report]=recommend(source,{requestedAspect:'square'}).cards;
  const candidate=report.candidates.find(c=>c.templateId==='T04');
  assert.equal(candidate.evidence.aspect,'square');
  assert.equal(candidate.evidence.structure,TEMPLATES.find(t=>t.id==='T04').aspectLayouts.square.structure);
  assert.ok(!candidate.reasonIds.includes('SECTION_COUNT_MATCH'),'portrait H2 count is not square guidance');
  assert.ok(candidate.caveats.includes('REGISTRY_ASPECT_REVIEW_PENDING'));
});

test('checked-in input/output example is reproducible and does not assign candidates to unknown roles', async () => {
  const source=await readFile(new URL('../examples/recommendations/input.md',import.meta.url),'utf8');
  const expected=await readFile(new URL('../examples/recommendations/output.json',import.meta.url),'utf8');
  assert.equal(JSON.stringify(recommend(source),null,2)+'\n',expected);
  const report=JSON.parse(expected);
  assert.deepEqual(report.cards.map(c=>c.role),['steps','comparison','metric','unknown']);
  assert.equal(report.cards[3].candidates.length,0);
});

test('all 48 real registry fixtures obey the same renderer hard validators and stable ranking', async () => {
  const resolver=await createAssetResolver(fileURLToPath(new URL('../examples/templates',import.meta.url)));
  for(const template of TEMPLATES) {
    const source=await readFile(new URL(`../${template.example}`,import.meta.url),'utf8');
    const cards=renderCards(source,{resolveImage:resolver.resolveImage});
    const before=JSON.stringify(cards), report=recommendTemplates({cards});
    assert.equal(JSON.stringify(report),JSON.stringify(recommendTemplates({cards})),template.id);
    assert.equal(JSON.stringify(cards),before,template.id);
    assert.equal(report.cards[0].candidates[0].templateId,template.id,'explicit valid author choice ranks first');
    for(const candidate of report.cards[0].candidates) {
      const metadata={...cards[0].metadata,template:candidate.templateId};
      if(!cards[0].metadataExplicitKeys?.includes('layout'))delete metadata.layout;
      const registry=validateTemplateMetadata(metadata,{width:1080,height:1440});
      assert.doesNotThrow(()=>validateTemplateCard(cards[0],registry));
    }
  }
});

test('recommendation modules have a narrow pure import boundary; execution cannot write, spawn or network', async () => {
  const allowed = new Set(['./markdown.mjs','./templates.mjs','./errors.mjs','./content-role.mjs']);
  for (const file of ['content-role.mjs','template-recommender.mjs']) {
    const source=await readFile(new URL(`../scripts/${file}`,import.meta.url),'utf8');
    for(const [,dependency] of source.matchAll(/from\s+['"]([^'"]+)['"]/g))assert.ok(allowed.has(dependency),dependency);
    assert.doesNotMatch(source,/\bimport\s*\(/,'No deferred browser/IO imports');
  }
  const script=`
    import fs from 'node:fs'; import fsp from 'node:fs/promises'; import net from 'node:net';
    import http from 'node:http'; import https from 'node:https'; import child from 'node:child_process';
    import {syncBuiltinESMExports} from 'node:module';
    const deny=()=>{throw Error('Forbidden side effect')};
    for(const [obj,names] of [[fs,['writeFileSync','writeFile','appendFile','appendFileSync','mkdir','mkdirSync','rename','renameSync','unlink','unlinkSync']],
      [fsp,['writeFile','appendFile','mkdir','rename','unlink','rm']], [net,['connect','createConnection']],
      [http,['request','get']], [https,['request','get']], [child,['spawn','spawnSync','exec','execSync','execFile','execFileSync']]]) for(const name of names)obj[name]=deny;
    net.Socket.prototype.connect=deny; globalThis.fetch=deny; syncBuiltinESMExports();
    const {renderCards}=await import('./scripts/markdown.mjs');
    const {recommendTemplates}=await import('./scripts/template-recommender.mjs');
    const cards=renderCards('# Test\\n\\n1. Keep source');
    const first=JSON.stringify(recommendTemplates({cards}));
    for(let i=0;i<10;i++)if(JSON.stringify(recommendTemplates({cards}))!==first)throw Error('Unstable');
    process.stdout.write('stable-without-side-effects');`;
  // Reads permit package/junction resolution on Windows. Writes and child
  // processes remain denied by Node permissions; network APIs are trapped above.
  const permissionFlag=process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
  const result=spawnSync(process.execPath,[permissionFlag,'--allow-fs-read=*','--input-type=module','-e',script],{cwd:root,encoding:'utf8',timeout:30000,windowsHide:true});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'stable-without-side-effects');
});
