#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat, realpath, readdir, mkdir, mkdtemp, rm, rmdir, rename, open } from 'node:fs/promises';
import { exportCards, parseOptions, LIMITS } from './render.mjs';
import { renderCards } from './markdown.mjs';
import { createAssetResolver } from './assets.mjs';
import { resolveTemplateAspect } from './templates.mjs';
import { openRenderer, closeBrowser } from './browser.mjs';
import { Md2CardError, normalizeError } from './errors.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, message, details = {}) => { throw new Md2CardError(code, message, details); };
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const PAIR_HELP = `Usage: node scripts/render-cover-pair.mjs --wide wide.md --square square.md --author-confirmed --out DIR

Two separate author-confirmed Markdown inputs. No rewriting or semantic inference.
Only T01/T21; each input must explicitly select its template and contain one card.
--author-confirmed  Declare that the author reviewed BOTH exact inputs for publication.
                    This does not certify semantic equivalence; the tool never verifies it.
--wide FILE         Independent 2100x900 wechat-wide input (required)
--square FILE       Independent 1080x1080 square input (required, distinct file)
--out DIR           Absent or empty destination; published only after BOTH exports succeed
--asset-root DIR    Shared trusted asset boundary (default common input directory)
--brand FILE        Shared brand JSON; preserves the logo on both independently rendered cards
--footer TEXT       Shared attribution; --footer-mode legacy/poster/series/report
--body-size SIZE    Manual small/medium/large/xlarge, never auto-fit
--browser PATH     Chromium path, or CHROMIUM_PATH
--timeout-ms N     Shared total deadline, 1000–600000; default 120000
--strict           Require fonts and native PDF verification tools
--json             Machine-readable result/error
--help, -h         Show help

Always writes wide/ and square/ (HTML, PNG, native PDF, responsive preview, manifests),
pair-preview.html, pair-preview.png, pair-manifest.json. Offline; no platform upload.
Human visual review and semantic equivalence remain not-verified. Different numbers,
sources, units or qualifications must be checked by the author before publication.
`;

export function parsePairOptions(argv) {
  let parsed;
  try { parsed = parseArgs({args:argv,strict:true,allowPositionals:false,tokens:true,options:{
    wide:{type:'string'},square:{type:'string'},out:{type:'string'},'author-confirmed':{type:'boolean'},
    'asset-root':{type:'string'},brand:{type:'string'},footer:{type:'string'},'footer-mode':{type:'string'},
    'body-size':{type:'string'},browser:{type:'string'},'timeout-ms':{type:'string'},strict:{type:'boolean'},
    json:{type:'boolean'},help:{type:'boolean',short:'h'}
  }}); } catch(error) { fail('INVALID_OPTIONS',error.message); }
  const seen = new Set();
  for(const token of parsed.tokens.filter(t=>t.kind==='option')) {
    if(seen.has(token.name)) fail('INVALID_OPTIONS',`Duplicate --${token.name}.`);
    seen.add(token.name);
  }
  const v=parsed.values;
  if(v.help) return {help:true};
  if(!v.wide || !v.square || !v.out || v['author-confirmed']!==true) fail('PAIR_CONFIRMATION_REQUIRED','Provide --wide, --square, --out and --author-confirmed after the author reviews both inputs.');
  const wide=path.resolve(v.wide),square=path.resolve(v.square);
  if(!v['asset-root'] && path.dirname(wide)!==path.dirname(square)) fail('INVALID_OPTIONS','Inputs in different directories require an explicit shared --asset-root.');
  const shared=['--asset-root',path.resolve(v['asset-root']||path.dirname(wide))];
  for(const key of ['brand','footer','footer-mode','body-size','browser','timeout-ms']) if(v[key]!==undefined) shared.push(`--${key}`,v[key]);
  if(v.strict)shared.push('--strict');
  const sides=Object.fromEntries([['wide',wide,'wechat-wide'],['square',square,'square']].map(([side,input,size])=>[side,parseOptions([input,'--out',path.join(path.resolve(v.out),side),'--size',size,'--format','all','--preview',...shared])]));
  return {out:path.resolve(v.out),authorConfirmed:true,json:Boolean(v.json),timeoutMs:sides.wide.timeoutMs,sides};
}

async function empty(out) {
  try { if((await readdir(out)).length) fail('OUTPUT_EXISTS',`Output directory is not empty: ${out}`); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
}

async function readInput(input) {
  const handle=await open(input,'r');
  try {
    const info=await handle.stat();
    if(!info.isFile()||info.size>LIMITS.inputBytes)fail('RENDER_BUDGET','Each input must be a regular Markdown file no larger than 2 MiB.');
    const bytes=Buffer.alloc(LIMITS.inputBytes+1);let length=0;
    while(length<bytes.length) {const {bytesRead}=await handle.read(bytes,length,bytes.length-length,null);if(!bytesRead)break;length+=bytesRead;}
    if(length>LIMITS.inputBytes)fail('RENDER_BUDGET','Input grew beyond 2 MiB.');
    return bytes.subarray(0,length);
  } finally {await handle.close();}
}

export function pairPreview(inputs, images={wide:'wide/card-001.png',square:'square/card-001.png'}) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>独立双封面 · 本地复核</title><style>*{box-sizing:border-box}body{margin:0;background:#f1f0eb;color:#18251e;font:16px/1.6 system-ui,sans-serif}main{max-width:1248px;margin:auto;padding:24px}h1{font-size:28px;margin:0}p{margin:10px 0 22px}section{margin:24px 0;padding:20px;background:#fff}h2{font-size:20px;margin:0 0 12px}img{display:block;width:100%;height:auto}.square{max-width:560px}code{overflow-wrap:anywhere;font-size:12px}a{color:#225e4f}</style>
<main><h1>两份输入，两套独立封面</h1><p>作者已声明确认两份输入。工具未核实语义一致：请逐项核对数字、单位、来源与限定条件。此预览不是公众号实际展示效果或人工视觉签收。</p>
${['wide','square'].map(side=>`<section class="${side}"><h2>${side==='wide'?'21:9 主封面 · 2100 × 900':'1:1 分享封面 · 1080 × 1080'}</h2><img src="${escape(images[side])}" alt="${side} 独立渲染封面"><p>${escape(inputs[side].name)}<br><code>SHA-256 ${escape(inputs[side].sha256)}</code></p><a href="${side}/card-001.png">原生 PNG</a> · <a href="${side}/cards.pdf">可搜索 PDF</a> · <a href="${side}/preview.html">响应式预览</a></section>`).join('')}
</main></html>`;
}

async function previewPng(html,options,remaining) {
  const renderer=await openRenderer({browser:options.sides.wide.browser,width:1200,height:1800,scale:1,timeoutMs:remaining()});
  let primary,timer;
  try {
    const work=async()=>{
      await renderer.page.setViewportSize({width:1200,height:1800});
      await renderer.page.setContent(html,{waitUntil:'load',timeout:remaining()});
      await renderer.page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
      return renderer.page.locator('main').screenshot({animations:'disabled',timeout:remaining()});
    };
    return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Md2CardError('RENDER_TIMEOUT','Pair preview exceeded total deadline.')),remaining());})]);
  } catch(error) {primary=error;throw error;}
  finally {clearTimeout(timer);try{await closeBrowser(renderer.browser);}catch(error){if(!primary)throw error;primary.details={...primary.details,cleanupFailure:error.message};}}
}

/** Atomic pair publication. Dependency seams are used only by lifecycle tests. */
export async function exportCoverPair(options,dependencies={}) {
  if(options.authorConfirmed!==true) fail('PAIR_CONFIRMATION_REQUIRED','Both inputs require explicit author confirmation.');
  const now=dependencies.now??Date.now,start=now(),deadline=start+options.timeoutMs;
  const remaining=()=>{const ms=deadline-now();if(ms<=0)fail('RENDER_TIMEOUT','Pair exceeded its shared total deadline.');return ms;};
  await empty(options.out);
  const identities=await Promise.all(['wide','square'].map(side=>realpath(options.sides[side].input)));
  if(identities[0]===identities[1])fail('PAIR_INPUTS_NOT_DISTINCT','Supply two distinct author-confirmed files; the wrapper never derives a second cover.');
  const inputs={};
  for(const side of ['wide','square']) {
    const config=options.sides[side],bytes=await readInput(config.input);
    const assets=await createAssetResolver(config.assetRoot),cards=renderCards(bytes.toString('utf8'),{resolveImage:assets.resolveImage});
    if(cards.length!==1||!['T01','T21'].includes(cards[0].metadata.template)||!/<h1\b/.test(cards[0].html))fail('PAIR_INPUT_UNSUPPORTED','Each cover needs exactly one card with an H1 and explicit T01 or T21 metadata.');
    const aspect=resolveTemplateAspect(cards[0].metadata.template,config).id;
    if(aspect!==(side==='wide'?'wechat-wide':'square'))fail('PAIR_INPUT_UNSUPPORTED','Pair dimensions must be the registered 21:9 and 1:1 canvases.');
    inputs[side]={name:path.basename(config.input),sha256:hash(bytes),template:cards[0].metadata.template,aspect};
  }
  remaining();await mkdir(path.dirname(options.out),{recursive:true});
  let staging=await mkdtemp(path.join(path.dirname(options.out),'.md2card-pair-')),primary;
  try {
    const outputs={};let bytesTotal=0,sharedBrand;
    const record=async file=>{
      remaining();const full=path.join(staging,file),info=await stat(full);
      if(!info.isFile()||info.size+bytesTotal>LIMITS.outputBytes)fail('OUTPUT_BUDGET','Combined pair exceeds 256 MiB.');
      const bytes=await readFile(full);bytesTotal+=bytes.length;
      if(bytesTotal>LIMITS.outputBytes)fail('OUTPUT_BUDGET','Combined pair exceeds 256 MiB.');
      return {file,bytes:bytes.length,sha256:hash(bytes)};
    };
    for(const side of ['wide','square']) {
      const config={...options.sides[side],out:path.join(staging,side),timeoutMs:remaining()};
      let manifest;
      try { manifest=await (dependencies.exportCards??exportCards)(config); }
      catch(error) {
        // Staging is removed on failure. Retain actionable geometry instead of
        // directing callers to a report that will no longer exist.
        let overflow;
        if(error.code==='CONTENT_OVERFLOW') {
          const report=path.join(config.out,'overflow.json');
          try {if((await stat(report)).size<=LIMITS.inputBytes)overflow=JSON.parse(await readFile(report,'utf8'));}catch { /* Original failure remains authoritative. */ }
        }
        if(Object.isExtensible(error)) {
          error.details={...error.details,pairSide:side,inputSha256:inputs[side].sha256,pairPublished:false,...(overflow?{overflow}: {})};
          if(error.code==='CONTENT_OVERFLOW')error.message=`Content overflow in ${side} cover. No pair published; original inputs were not modified.`;
        }
        throw error;
      }
      if(manifest.status!=='success'||manifest.cardCount!==1||manifest.inputSha256!==inputs[side].sha256)fail('PAIR_INPUT_CHANGED','Rendered input differs from the confirmed input snapshot. No pair published.');
      if(hash(await readInput(config.input))!==inputs[side].sha256)fail('PAIR_INPUT_CHANGED','Input changed during export.');
      const brandIdentity=JSON.stringify(manifest.brand??null);
      if(side==='wide')sharedBrand=brandIdentity;
      else if(brandIdentity!==sharedBrand)fail('PAIR_BRAND_CHANGED','Shared brand or logo changed between the two exports. No pair published.');
      outputs[side]={inputSha256:inputs[side].sha256,files:[]};
      for(const name of (await readdir(config.out)).sort())outputs[side].files.push(await record(`${side}/${name}`));
    }
    const html=pairPreview(inputs);await writeFile(path.join(staging,'pair-preview.html'),html);
    const images={};for(const side of ['wide','square'])images[side]=`data:image/png;base64,${(await readFile(path.join(staging,side,'card-001.png'))).toString('base64')}`;
    const png=await (dependencies.previewPng??previewPng)(pairPreview(inputs,images),options,remaining);
    remaining();if(png.length+bytesTotal>LIMITS.outputBytes)fail('OUTPUT_BUDGET','Pair preview exceeds combined output budget.');
    await writeFile(path.join(staging,'pair-preview.png'),png);
    const previews=[];for(const file of ['pair-preview.html','pair-preview.png'])previews.push(await record(file));
    for(const side of ['wide','square'])if(hash(await readInput(options.sides[side].input))!==inputs[side].sha256)fail('PAIR_INPUT_CHANGED','Input changed before publication.');
    const manifest={schemaVersion:1,status:'success',authorDeclaration:'both-inputs-confirmed',semanticEquivalence:'not-verified',humanVisualReview:'not-performed',
      warnings:['Author must compare numbers, units, sources and qualifications; the wrapper does not infer equivalence.'],inputs,outputs,previews,
      budget:{timeoutMs:options.timeoutMs,elapsedMs:now()-start,outputBytesBeforeManifest:bytesTotal,maxOutputBytes:LIMITS.outputBytes}};
    const json=JSON.stringify(manifest,null,2)+'\n';if(bytesTotal+Buffer.byteLength(json)>LIMITS.outputBytes)fail('OUTPUT_BUDGET','Pair manifest exceeds combined budget.');
    await writeFile(path.join(staging,'pair-manifest.json'),json);remaining();await empty(options.out);
    try{await rmdir(options.out);}catch(error){if(error.code!=='ENOENT')throw error;}
    await rename(staging,options.out);staging=undefined;return manifest;
  } catch(error) {primary=error;throw error;}
  finally {if(staging)try{await rm(staging,{recursive:true,force:true});}catch(error){if(!primary)throw error;primary.details={...primary.details,cleanupFailure:error.message};}}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{const options=parsePairOptions(process.argv.slice(2));if(options.help)console.log(PAIR_HELP);else{const result=await exportCoverPair(options);console.log(options.json?JSON.stringify(result,null,2):`Independent cover pair saved: ${options.out}\nSemantic equivalence: not-verified; author review required.`);}}
  catch(error){const normalized=normalizeError(error);console.error(process.argv.includes('--json')?JSON.stringify(normalized):`${normalized.code}: ${normalized.message}`);process.exitCode=normalized.exitCode;}
}
