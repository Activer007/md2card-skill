import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {textContrastRatio,t37DefaultTextPolicy,buildDocument,SIZES} from '../scripts/document.mjs';
import {renderCards} from '../scripts/markdown.mjs';
import {createAssetResolver} from '../scripts/assets.mjs';
import {compareDefaultPhotoHtml} from '../scripts/validate-photo-cover.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const css=await Promise.all(['themes','layouts','templates'].map(name=>readFile(new URL(`../assets/${name}.css`,import.meta.url),'utf8')));
const light=css[2].replace('--paper:#131e1b; --ink:#f7f2e3; --muted:#c2cabd;', '--paper:#faf7ef; --ink:#202820; --muted:#505d54;').replace('--panel:#0d1714;', '--panel:#eeeadd;');
const parse=async file=>renderCards(await readFile(new URL('../'+file,import.meta.url),'utf8'),{resolveImage:(await createAssetResolver(root)).resolveImage});

test('opaque sRGB ratios use exact thresholds and reject unsupported colors',()=>{
 assert.equal(textContrastRatio('#000','#fff'),21);
 assert.equal(textContrastRatio('#123456','#123456'),1);
 assert.equal(textContrastRatio('#fff','#abc'),textContrastRatio('#aabbcc','#ffffff'));
 assert.ok(textContrastRatio('#767676','#fff')>=4.5);
 assert.ok(textContrastRatio('#777777','#fff')<4.5);
 for(const value of ['rgba(0,0,0,.5)','#0000','red',null,'#fff; display:none'])assert.throws(()=>textContrastRatio(value,'#fff'));
});
test('default and readable brands keep existing output; unsafe dark/light pairs use existing ink',()=>{
 assert.equal(t37DefaultTextPolicy(undefined,css[2]),null);
 for(const accent of ['#e4c37d','#fff','#76e1d6'])assert.equal(t37DefaultTextPolicy(accent,css[2]),null);
 for(const accent of ['#000','#123',' #000']) {
  if(accent.startsWith(' ')){assert.throws(()=>t37DefaultTextPolicy(accent,css[2]));continue;}
  const p=t37DefaultTextPolicy(accent,css[2]);assert.equal(p.foreground,'#f7f2e3');assert.ok(p.minimumBefore<4.5);assert.ok(p.minimumAfter>=4.5);
 }
 for(const accent of ['#fff','#f4edda']) {const p=t37DefaultTextPolicy(accent,light);assert.equal(p.foreground,'#202820');assert.ok(p.minimumAfter>=4.5);}
 assert.equal(t37DefaultTextPolicy('#126d64',light),null);
});
test('only necessary default T37 documents receive foreground CSS; photo and other templates stay scoped out',async()=>{
 const options={...SIZES.portrait,brand:{name:'保持品牌',accent:'#000'}};
 const normal=await parse('examples/gallery-variants/bright-default.md');
 const photo=await parse('examples/gallery-variants/bright-photo.md');
 const other=await parse('examples/gallery-variants/desktop-4x3-default.md');
 const corrected=buildDocument(normal,options,...css);
 assert.match(corrected,/T37 default: readable text only/);
 assert.match(corrected,/not\(\[data-visual-variant="photo-cover"\]\)/);
 assert.ok(corrected.includes('--brand-accent: #000;'));
 assert.ok(corrected.includes('保持品牌'));
 const before=corrected.replace(/\n\/\* T37 default: readable text only; authored brand decoration is unchanged\. \*\/\n[^\n]+\n[^\n]+\n/,'');
 assert.equal(compareDefaultPhotoHtml(before,corrected).classification,'controlled-T37-text-color-fix');
 assert.throws(()=>compareDefaultPhotoHtml(before,corrected.replace('保持品牌','删除品牌')));
 assert.throws(()=>compareDefaultPhotoHtml(before,corrected.replace('li::marker { color: #f7f2e3','li::marker { color: #000000')));
 assert.throws(()=>compareDefaultPhotoHtml(before,before));
 for(const cards of [other,photo])assert.doesNotMatch(buildDocument(cards,options,...css),/T37 default: readable text only/);
 for(const accent of [undefined,'#e4c37d'])assert.doesNotMatch(buildDocument(normal,{...options,brand:{accent}},...css),/T37 default: readable text only/);
 const mixed=buildDocument([...normal,...photo,...other],options,...css);
 assert.equal((mixed.match(/T37 default: readable text only/g)||[]).length,1);
 assert.ok(mixed.includes('data-visual-variant="photo-cover"'));
});
