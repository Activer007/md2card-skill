#!/usr/bin/env node
// Independent opt-in evidence. Does not change historical gallery acceptance.
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, mkdir, readdir, lstat, realpath } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { openRenderer, closeBrowser, measureCards } from './browser.mjs';
import { SIZES } from './document.mjs';
import { createAssetResolver } from './assets.mjs';
import { exportCards, parseOptions } from './render.mjs';
import { inspectPdf } from './qa.mjs';
import { SEMANTIC_FILES, readEvidenceFile } from './evidence-source.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const fixtures = path.join(ROOT, 'examples/visual-upgrade/t20');
const BASE_COMMIT = 'd73f405c4b5a1891b79fbe51fdb009bd55c4cf69';
export const STAGE_CASES = Object.freeze(['dense-ui','desktop-16x9','desktop-4x3','invalid-data','invalid-file','invalid-remote','invalid-svg','invalid-traversal','long-body','long-source','long-title','original','overflow','tall-phone']);

export function selectStageFixtures(names) {
  const actual = names.filter(name => name.endsWith('.md') && name !== 'README.md').sort();
  assert.deepEqual(actual, STAGE_CASES.map(id => `${id}.md`), 'Stage fixture inventory differs; review missing or new cases explicitly.');
  return actual;
}

export function defaultStageInput(source) {
  // Parse the single-line JSON so whitespace and key order cannot leave the
  // opt-in enabled in both halves of an apparent default/variant comparison.
  const match = /^(\s*<!--\s*card\s*:\s*)(.+?)(\s*-->[^\S\r\n]*)(\r?\n|$)/.exec(source);
  assert.ok(match, 'Stage fixture requires first-line card metadata.');
  const metadata = JSON.parse(match[2]);
  assert.equal(metadata.template, 'T20');
  assert.equal(metadata.visualVariant, 'screenshot-stage');
  delete metadata.visualVariant;
  return source.replace(match[0], () => `${match[1]}${JSON.stringify(metadata)}${match[3]}${match[4]}`);
}

export async function prepareStageOutput(out) {
  const absolute = path.resolve(out), root = await realpath(ROOT);
  const relative = path.relative(root, absolute);
  const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  assert.ok(relative && (outside || relative.split(path.sep)[0] === 'validation'), 'Output inside the repository must be under validation/.');
  await mkdir(absolute, {recursive:true});
  assert.ok(!(await lstat(absolute)).isSymbolicLink() && await realpath(absolute) === absolute, 'Validation output must not use symlinks.');
  assert.equal((await readdir(absolute)).length, 0, 'Validation output must be empty; existing evidence is never overwritten.');
  return absolute;
}

const readBaselineFile = async file => (await exec('git', ['show', `${BASE_COMMIT}:${file}`],
  {cwd:ROOT,encoding:'buffer',windowsHide:true,maxBuffer:8*1024*1024,timeout:20000})).stdout;

export async function verifyStageBaseline(root, readCommitted = readBaselineFile) {
  const files = [];
  for (const file of SEMANTIC_FILES.filter(file => file !== 'scripts/visual-diagnostics.mjs')) {
    const digest = hash(await readCommitted(file));
    assert.equal(hash(await readEvidenceFile(root,file)),digest, `Baseline differs from ${BASE_COMMIT}: ${file}`);
    files.push({file,sha256:digest});
  }
  return {commit:BASE_COMMIT,files};
}

async function geometry(page) {
  return page.locator('.card').evaluate(card => {
    const image = card.querySelector('.card-image'), box = image.getBoundingClientRect(), style = getComputedStyle(image);
    const bounds = card.getBoundingClientRect();
    // No border/padding on img; contain pixels can be narrower than its box.
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const actualWidth = image.naturalWidth * scale, actualHeight = image.naturalHeight * scale;
    const rect = r => ({ x:r.x, y:r.y, width:r.width, height:r.height });
    return { card:rect(bounds), imageBox:rect(box), screenshot:{ x:box.x+(box.width-actualWidth)/2, y:box.y+(box.height-actualHeight)/2, width:actualWidth, height:actualHeight },
      widthFraction:actualWidth/bounds.width, natural:[image.naturalWidth,image.naturalHeight],
      contain:style.objectFit, transform:style.transform, complete:image.complete && image.naturalWidth>0,
      bodyFontPx:getComputedStyle(card.querySelector('.template-main p')).fontSize,
      captionFontPx:getComputedStyle(card.querySelector('figcaption')).fontSize,
      source:card.querySelector('.card-source').textContent,
      imageData:image.src.split(',')[1] };
  });
}

export async function validateScreenshotStage({ out, browser, baselineRoot }) {
  const selected = selectStageFixtures(await readdir(fixtures));
  const baselineIdentity = baselineRoot ? await verifyStageBaseline(baselineRoot) : null;
  out = await prepareStageOutput(out);
  const css = baselineRoot ? await Promise.all(['themes','layouts','templates'].map(name => readFile(path.join(baselineRoot,`assets/${name}.css`),'utf8'))) : null;
  const baseline = baselineRoot ? await import(pathToFileURL(path.join(baselineRoot,'scripts/document.mjs'))) : null;
  const baselineMarkdown = baselineRoot ? await import(pathToFileURL(path.join(baselineRoot,'scripts/markdown.mjs'))) : null;
  const baselineExport = baselineRoot ? (await import(pathToFileURL(path.join(baselineRoot,'scripts/render.mjs')))).exportCards : null;
  const renderer = await openRenderer({ ...SIZES.portrait, browser, timeoutMs:30000 });
  const records = [];
  try {
    const {page} = renderer;
    for (const file of selected) {
      const id = file.slice(0,-3), source = await readFile(path.join(fixtures,file),'utf8');
      const variants = ['default','stage'];
      for (const mode of variants) {
        const key = `${id}-${mode}`, input = mode==='default' ? defaultStageInput(source) : source;
        const inputFile = path.join(out,`${key}.md`); await writeFile(inputFile,input);
        const target = path.join(out,key);
        const options = parseOptions([inputFile,'--out',target,'--asset-root',ROOT,'--format','all','--preview','--strict','--footer-mode','poster', ...(browser?['--browser',browser]:[])]);
        const record = {id,mode,inputSha256:hash(input)};
        records.push(record);
        try {
          const result = await exportCards(options);
          record.outcome='exported'; record.manifest=result;
        } catch(error) {
          record.outcome='refused'; record.code=error.code; record.details=error.details;
          await writeJson(path.join(out,'progress.json'),records);
          assert.ok(id.startsWith('invalid-') || id==='overflow', `${key}: unexpected refusal ${error.code}`);
          if (id==='overflow') assert.equal(error.code,'CONTENT_OVERFLOW');
          else assert.ok(['INVALID_ASSET','ASSET_PATH_INVALID','ASSET_OUTSIDE_ROOT','ASSET_NOT_FOUND','ASSET_TYPE_UNSUPPORTED'].includes(error.code), `${key}: unexpected error ${error.code}`);
          if(mode==='stage')assert.equal(error.code,records.find(r=>r.id===id&&r.mode==='default').code);
          await writeJson(path.join(out,'progress.json'),records);
          continue;
        }
        assert.ok(!id.startsWith('invalid-') && id!=='overflow', `${key}: invalid input exported`);
        const html = await readFile(path.join(target,'cards.html'),'utf8');
        if (baseline && mode==='default') {
          const assets = await createAssetResolver(ROOT), cards=baselineMarkdown.renderCards(input,{resolveImage:assets.resolveImage});
          const oldHtml = baseline.buildDocument(cards,{...options,preview:false},...css);
          assert.equal(html,oldHtml,`${key}: default HTML changed`);
          record.baselineHtmlSha256=hash(oldHtml);
        }
        await page.setViewportSize({width:1144,height:1504});
        const views={}; record.views=views;
        for (const media of ['screen','print']) {
          await page.emulateMedia({media}); await page.setContent(html); await page.evaluate(()=>document.fonts.ready);
          const measurements=await measureCards(page); assert.deepEqual(measurements[0].overflow,[]);
          const g=await geometry(page); g.imageSha256=hash(Buffer.from(g.imageData,'base64')); delete g.imageData;
          assert.equal(g.contain,'contain'); assert.equal(g.transform,'none'); assert.ok(g.complete);
          views[media]=g;
          await page.locator('.card').screenshot({path:path.join(target,`${media}.png`)});
        }
        // Expectations come from the authored fixture, never rendered DOM/PDF.
        // These controlled fixtures contain headings and plain paragraphs only.
        const metadata=JSON.parse(input.match(/<!-- card: (.+) -->/)[1]);
        const snippets=[...input.split('\n').slice(1).map(line=>line.replace(/^#+\s+/, '').trim()).filter(Boolean),metadata.eyebrow,metadata.caption,metadata.source];
        record.pdf=await inspectPdf(path.join(target,'cards.pdf'),{expectedPages:1,requireTools:true,expectedText:snippets.join('\n')});
        // -layout interleaves physical rows of two columns. As with the existing
        // aspect/refinement audits, source coverage uses raw reading order; both
        // extractor outputs remain in evidence. NFC only, never NFKC repair.
        const raw=await exec('pdftotext',['-enc','UTF-8','-raw',path.join(target,'cards.pdf'),'-'],{windowsHide:true,maxBuffer:16*1024*1024,encoding:'utf8'});
        const compact=text=>text.normalize('NFC').replace(/\s+/gu,'');
        const missing=snippets.flatMap((text,index)=>compact(raw.stdout).includes(compact(text))?[]:[index]);
        assert.deepEqual(missing,[],`${key}: PDF lost authored text`);
        record.pdf.sourceCoverage={extractor:'Poppler -raw',normalization:'NFC and whitespace only',expected:snippets.length,missing};
        await writeFile(path.join(target,'pdf-raw.txt'),raw.stdout);
        await exec('pdftotext',['-enc','UTF-8','-layout',path.join(target,'cards.pdf'),path.join(target,'pdf-text.txt')],{windowsHide:true});
        await exec('pdftoppm',['-singlefile','-scale-to','1080','-png',path.join(target,'cards.pdf'),path.join(target,'native-pdf')],{windowsHide:true,maxBuffer:1024*1024});
        if (baselineExport && id==='original' && mode==='default') {
          const before=path.join(out,'original-base-main');
          await baselineExport({...options,out:before});
          await exec('pdftoppm',['-singlefile','-scale-to','1080','-png',path.join(before,'cards.pdf'),path.join(before,'native-pdf')],{windowsHide:true});
          record.baselineEquality={};
          for(const name of ['cards.html','card-001.png','native-pdf.png']) {
            const old=hash(await readFile(path.join(before,name))),now=hash(await readFile(path.join(target,name)));
            assert.equal(now,old,`default compatibility: ${name}`);record.baselineEquality[name]=old;
          }
        }
        const preview=await readFile(path.join(target,'preview.html'),'utf8');
        await page.emulateMedia({media:'screen'});
        for(const width of [375,390]) {
          await page.setViewportSize({width,height:900});await page.setContent(preview);await page.evaluate(()=>document.fonts.ready);
          const g=await geometry(page);delete g.imageData;views[`mobile${width}`]=g;
          await page.screenshot({path:path.join(target,`mobile-${width}.png`)});
        }
        if (['desktop-16x9','desktop-4x3','dense-ui'].includes(id) && mode==='stage') assert.ok(views.screen.widthFraction>=.7, `${key}: screenshot target missed`);
        if(mode==='stage') {
          const old=records.find(r=>r.id===id&&r.mode==='default');
          assert.equal(views.screen.bodyFontPx,old.views.screen.bodyFontPx);
          assert.equal(views.screen.imageSha256,old.views.screen.imageSha256);
          assert.equal(views.screen.source,old.views.screen.source);
        }
        await writeJson(path.join(out,'progress.json'),records);
        console.log(`${key}: ${Math.round(views.screen.widthFraction*1000)/10}% screenshot width; screen/print/PDF passed`);
      }
    }
    const files=[];
    async function inventory(dir) { for(const entry of await readdir(dir,{withFileTypes:true})) {
      const file=path.join(dir,entry.name); if(entry.isDirectory())await inventory(file);
      else if(!['report.json','progress.json'].includes(entry.name)) {const bytes=await readFile(file);files.push({file:path.relative(out,file).replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)});}
    }}
    await inventory(out);
    const sourceFiles=['scripts/document.mjs','scripts/markdown.mjs','scripts/templates.mjs','scripts/render.mjs','scripts/visual-diagnostics.mjs','scripts/assets.mjs','scripts/browser.mjs','scripts/qa.mjs','scripts/doctor.mjs','scripts/validate-screenshot-stage.mjs','scripts/evidence-source.mjs','assets/themes.css','assets/layouts.css','assets/templates.css'];
    const sourceHashes=await Promise.all(sourceFiles.map(async file=>({file,sha256:hash(await readFile(path.join(ROOT,file)))})));
    const report={schemaVersion:1,scope:'T20 screenshot-stage independent exact fixtures',baseCommit:baselineIdentity?.commit ?? null,baselineIdentity,browser:await renderer.browser.version(),sourceHashes,records,files,
      visualReview:'pending',limitations:['Complete screenshots do not imply every UI microglyph is phone-readable.','Tall screenshots retain their entire height and can become very narrow.','No historical gallery acceptance is promoted.']};
    await writeJson(path.join(out,'report.json'),report);return report;
  } finally { await closeBrowser(renderer.browser); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(!args.includes('--allow-browser'))throw new Error('Pass --allow-browser to perform real Chromium/PDF validation.');
  const value=key=>args.includes(key)?args[args.indexOf(key)+1]:undefined;
  await validateScreenshotStage({out:path.resolve(value('--out')??'validation/m2a/run'),browser:value('--browser'),baselineRoot:value('--baseline-root')});
}
