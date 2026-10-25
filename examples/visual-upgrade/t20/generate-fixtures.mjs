// Original synthetic UI fixtures, explicitly fictional. No third-party assets.
// Run from the repository root; Chromium is needed only to regenerate PNGs.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { openRenderer, closeBrowser } from '../../../scripts/browser.mjs';
const dir = new URL('./',import.meta.url);
await mkdir(new URL('assets/',dir),{recursive:true});
const renderer=await openRenderer({width:1600,height:900,browser:process.env.CHROMIUM_PATH});
try {
  for(const [id,width,height,font] of [['desktop-16x9',1600,900,26],['desktop-4x3',1200,900,26],['tall-phone',390,3000,18],['dense-ui',1600,900,12]]) {
    const rows=id==='tall-phone'?30:id==='dense-ui'?14:8;
    const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:#142334;font:${font}px/1.5 Arial,"Microsoft YaHei",sans-serif}header{padding:24px;background:#17364b;color:white}main{padding:24px}.row{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #a6b6c5;padding:12px 4px;gap:12px}h1{font-size:1.5em;margin:0}p{margin:8px 0}.notice{background:#d8e8eb;padding:12px}</style><header><h1>界面构图测试</h1><p>原创虚构 UI · 不是现有产品</p></header><main><p class="notice">演示记录，不代表真实业务数据或功能。</p>${Array.from({length:rows},(_,i)=>`<div class="row"><span>记录 ${i+1} · 待核对</span><span>保留原始来源</span></div>`).join('')}<p>界面底部 · 完整性标记 END</p></main>`;
    await writeFile(new URL(`assets/${id}.html`,dir),html);
    await renderer.page.setViewportSize({width,height});await renderer.page.setContent(html);await renderer.page.evaluate(()=>document.fonts.ready);
    assert.ok(await renderer.page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight), `${id}: fixture itself overflows`);
    await renderer.page.screenshot({path:fileURLToPath(new URL(`assets/${id}.png`,dir))});
  }
}finally{await closeBrowser(renderer.browser);}
const base=await readFile(new URL('../../templates/T20.md',import.meta.url),'utf8');
const original=JSON.parse(base.match(/<!-- card: (.+) -->/)[1]);
const cases=[
  ['original', 'examples/templates/assets/original-research-interface.png'],
  ...['desktop-16x9','desktop-4x3','tall-phone','dense-ui'].map(id=>[id,`examples/visual-upgrade/t20/assets/${id}.png`]),
  ['long-title','examples/visual-upgrade/t20/assets/desktop-16x9.png'],
  ['long-source','examples/visual-upgrade/t20/assets/desktop-16x9.png'],
  ['long-body','examples/visual-upgrade/t20/assets/desktop-16x9.png'],
  ['overflow','examples/visual-upgrade/t20/assets/desktop-4x3.png'],
  ['invalid-remote','https://example.com/remote.png'],['invalid-traversal','../outside.png'],
  ['invalid-data','data:image/png;base64,AA=='],['invalid-file','file:///C:/image.png'],['invalid-svg','examples/visual-upgrade/t20/assets/a.svg']
];
for(const [id,image] of cases) {
  const meta={...original,image,...(id==='original'?{}:{alt:'原创虚构 UI 构图测试，不是现有产品截图',caption:'原创虚构 UI · 演示记录，不代表真实数据'}),visualVariant:'screenshot-stage'};
  if(id==='long-source')meta.source='来源：原创构图测试；记录 1–8 仅为演示序号，未经业务验证，不代表已经上线的产品能力。';
  let content=base.slice(base.indexOf('\n')+1);
  if(id==='long-title')content=content.replace('# 把资料放回问题里','# 把研究资料与原始来源放回待验证的问题里');
  if(id==='long-body')content=content.replace('一个虚构研究工作台的功能设想。','一个虚构研究工作台的功能设想。这些演示记录仅用于说明整理方式。').replace('按主题收集片段，保留原始出处。','按主题收集片段，保留原始出处，并记录仍需核实的细节。').replace('并排查看笔记，记录待验证项。','并排查看笔记，记录待验证项，不把暂时的解释当成确定结论。');
  if(id==='overflow')content=content.replace('按主题收集片段，保留原始出处。','按主题收集片段，保留出处。'+'这是必须完整保留的压力正文。'.repeat(100));
  await writeFile(new URL(`${id}.md`,dir),`<!-- card: ${JSON.stringify(meta)} -->\n${content}`);
}
