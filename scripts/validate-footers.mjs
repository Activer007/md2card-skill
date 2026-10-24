#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runStress,repository } from './validate-visual-stress.mjs';
export async function createFooterCases() {
 const cases=[];
 for(const footerMode of ['legacy','poster','series','report'])for(const cards of [1,2]){
  const one='<!-- card: {"template":"T04","density":"standard","source":"原创练习；提及 AI 不代表已验证内容。"} -->\n# 只改变页脚表达\n\n原文和来源仍应完整保留。\n\n## 看见事实\n\n这是原创说明，不是外部实验结果。\n\n## 留下边界\n\n没有依据的地方保留为未知，不补造结论。\n';
  const source=Array(cards).fill(one).join('\n===\n\n');
  cases.push({id:`${footerMode}-${cards}`,template:'T04',density:'standard',cards,source,footerMode,footer:'作者提供的页脚 · 不删除免责声明',expected:'success',length:cards===1?'poster':'sequence',bodySha256:createHash('sha256').update(source).digest('hex')});
 }
 for (const footerMode of ['poster','series']) for (const length of ['short','flow']) {
  const source = length === 'short' ? '<!-- card: {"layout":"explainer"} -->\n# 自动分页也保留原话\n\n这是原创说明，不是事实核验。来源与 AI 使用限制写在作者页脚中。\n' : await readFile(path.join(repository,'examples/pagination-paragraphs.md'),'utf8');
  cases.push({id:`auto-${footerMode}-${length}`,template:null,cards:1,source,footerMode,footer:'原创分页示例 · AI 辅助不等于事实验证',paginate:'auto',outputCards:length==='short'?[1,1]:[2,30],expected:'success',length:`auto-${length}`,bodySha256:createHash('sha256').update(source).digest('hex')});
 }
 return cases;
}
export function runFooters(options={},dependencies={}){return runStress({root:path.join(repository,'validation/footers'),...options},{createCases:createFooterCases,...dependencies});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);let plan=false,root;while(args.length){const arg=args.shift();if(arg==='--plan')plan=true;else if(arg==='--out'&&args[0]&&!args[0].startsWith('--'))root=path.resolve(args.shift());else throw new Error(`Unknown or incomplete option: ${arg}`);}const report=await runFooters({plan,...(root?{root}:{})});console.log(`${report.results.length} footer cases: ${report.status}`);if(report.errors.length)process.exitCode=1;}catch(error){console.error(error.message);process.exitCode=1;}
}
