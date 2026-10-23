#!/usr/bin/env node
// End-to-end checks run in CI with real Chromium, CJK fonts, and required Poppler.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseOptions, exportCards } from './render.mjs';
import { THEMES } from './document.mjs';
import { inspectPdf } from './qa.mjs';
const root = path.resolve('validation');
await mkdir(root, {recursive:true});
const results=[];
async function render(input, dir, args=[]) {
 const options=parseOptions([input,'--out',path.join(root,dir),'--strict','--preview','--contact-sheet',...args]);
 const manifest=await exportCards(options);
 for(const artifact of manifest.artifacts) {
   const bytes=await readFile(path.join(options.out,artifact.file));
   if(createHash('sha256').update(bytes).digest('hex')!==artifact.sha256)throw new Error(`Artifact hash mismatch: ${dir}/${artifact.file}`);
 }
 if(manifest.qa.pdf.status!=='pass')throw new Error(`PDF QA not passing in ${dir}`);
 results.push({directory:dir,cards:manifest.cardCount,status:'pass',layouts:[...new Set(manifest.cards.map(c=>c.layout))]});
 return manifest;
}
for(const theme of THEMES) {
 const dir=theme==='editorial'?'layouts':`themes/${theme}`;
 const m=await render('examples/layouts.md',dir,['--theme',theme]);
 if(new Set(m.cards.map(c=>c.layout)).size!==8)throw new Error(`Expected all 8 layouts in ${theme}`);
}
await render('examples/showcase-ai.md','showcase-ai',['--theme','editorial','--brand','examples/brand.json']);
await render('examples/showcase-tutorial.md','showcase-tutorial',['--theme','midnight']);
await render('examples/showcase-enterprise.md','showcase-enterprise',['--theme','minimal','--brand','examples/brand.json']);
await render('examples/rag-guide.md','rag-legacy');
await render('examples/separator-demo.md','separators');
await inspectPdf(path.join(root,'showcase-ai/cards.pdf'),{expectedPages:4,requireTools:true,expectedText:['RAG','回答']});
await writeFile(path.join(root,'summary.json'),JSON.stringify({status:'pass',strict:true,results},null,2)+'\n');
console.log(`Validated ${results.length} offline decks with required PDF checks.`);
