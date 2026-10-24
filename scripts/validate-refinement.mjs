#!/usr/bin/env node
// Bounded real-content portrait matrix. --plan is source-only; the real runner
// inherits strict export/PDF/source/image/mobile gates from visual-stress.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStress, repository } from './validate-visual-stress.mjs';
import { buildRefinementTextInput } from './refinement-input.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
export async function createRefinementCases() {
  const cases = [];
  for (const [length, ids] of [
    ['short', ['T04','T06','T10','T13']],
    ['medium', ['T04','T06','T10','T13']],
    ['mixed', ['T04','T17','T18','T33']],
    ['long', ['T04','T06','T10','T13']]
  ]) {
    const input = `examples/refinement/${length}-reading.md`;
    const body = await readFile(path.join(repository,input),'utf8');
    for (const template of ids) {
      cases.push({ id:`${length}-${template}`, template, density:'standard', length,
        group:`same-${length}-reading`, expected:length==='long'||(length==='medium'&&template==='T13')?'CONTENT_OVERFLOW':'success', cards:1,
        source:buildRefinementTextInput(template,body), bodySha256:digest(body), originalInput:input });
    }
  }
  for (const [id,image,alt,caption] of [
    ['landscape','examples/templates/assets/synthetic-reading-still-life.png','AI 生成的阅读静物插画','AI 生成插画，不是纪实照片。'],
    ['portrait','examples/templates/assets/synthetic-ceramic-artist.png','AI 生成的虚构成年创作者肖像','AI 虚构人物，非真实访谈。'],
    ['transparent','examples/templates/assets/synthetic-olive-twig.png','AI 生成的橄榄枝透明插画','AI 插画，不用于植物鉴定。'],
    ['interface','examples/templates/assets/original-research-interface.png','完整原创虚构研究界面','非真实产品截图；图内微字不作为手机正文。'],
    ['wide','examples/visual-stress/assets/extreme-wide.png','原创横向极端比例边缘标记','完整边缘用于核对比例，不是摄影作品。'],
    ['tall','examples/visual-stress/assets/extreme-tall.png','原创纵向极端比例边缘标记','完整边缘用于核对比例，不是摄影作品。']
  ]) {
    const body = '# 先保留完整画面\n\n这张图片只用于观察完整构图。保留原始比例，不裁切，不从画面推断未提供的事实。\n';
    cases.push({ id:`image-${id}`, template:'T37', density:'standard', length:'image-aspect', group:'same-image-caption', expected:'success', cards:1,
      source:`<!-- card: ${JSON.stringify({template:'T37',density:'standard',image,alt,caption,source:'原创图像比例练习 · 图片性质以图注为准'})} -->\n${body}`, bodySha256:digest(body), imageSha256:digest(await readFile(path.join(repository,image))) });
  }
  return cases;
}
export function runRefinement(options = {}, dependencies = {}) {
  return runStress({ root:path.join(repository,'validation/refinement'), ...options }, { createCases:createRefinementCases, ...dependencies });
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2); let plan=false,root;
    while(args.length) { const arg=args.shift(); if(arg==='--plan')plan=true; else if(arg==='--out'&&args[0]&&!args[0].startsWith('--'))root=path.resolve(args.shift()); else throw new Error(`Unknown or incomplete option: ${arg}`); }
    const report=await runRefinement({plan,...(root?{root}:{})});
    console.log(`${report.results.length} real-content cases: ${report.status}; ${report.errors.length} errors.`);
    if(report.errors.length)process.exitCode=1;
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
