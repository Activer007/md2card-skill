import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseOptions, checkRenderBudget, loadBrand } from '../scripts/render.mjs';

test('extended options remain backwards compatible and validate limits', () => {
  const options = parseOptions(['example.md', '--preview', '--contact-sheet', '--strict', '--json']);
  assert.equal(options.width, 1080); assert.equal(options.preview, true); assert.equal(options.contactSheet, true); assert.equal(options.strict, true);
  assert.equal(parseOptions(['--doctor', '--strict']).doctor, true);
  assert.throws(() => parseOptions(['x.md', '--timeout-ms', '0']), {code:'INVALID_OPTIONS'});
  assert.throws(() => parseOptions(['x.md', '--unknown']), {code:'INVALID_OPTIONS'});
  assert.throws(() => checkRenderBudget(200, options), {code:'RENDER_BUDGET'});
  assert.throws(() => checkRenderBudget(201, options), {code:'RENDER_BUDGET'});
  assert.equal(checkRenderBudget(8, options).cardPixels, 1080*1440*8);
  assert.equal(checkRenderBudget(8, options).contactSheet.height, 780);
});

test('brand JSON allowlist prevents CSS or unsupported properties', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md2card-brand-')); t.after(() => rm(dir,{recursive:true,force:true}));
  const file = path.join(dir, 'brand.json');
  await writeFile(file, JSON.stringify({name:'示例',accent:'#26766b',logo:'logo.png'}));
  const result = await loadBrand(file, ref => ({dataUrl:'data:image/png;base64,AA==',reference:ref}));
  assert.equal(result.logo.reference,'logo.png');
  for(const bad of [{css:'evil'}, {accent:'red;background:url(x)'}, {logo:3}, {name:'a'.repeat(101)}, null]) {
    await writeFile(file, JSON.stringify(bad));
    await assert.rejects(()=>loadBrand(file,()=>{}), {code:'INVALID_BRAND'});
  }
});


test('contact-sheet pixel and side budgets reject extreme aspect ratios before rendering', () => {
  const tall = parseOptions(['x.md','--width','200','--height','4096','--format','html','--contact-sheet']);
  assert.throws(() => checkRenderBudget(200,tall), error => error.code === 'RENDER_BUDGET' && /Contact sheet/.test(error.message));
  const plain = { ...tall, contactSheet:false };
  assert.equal(checkRenderBudget(200,plain).estimatedPixels,163840000);
  const normal = parseOptions(['x.md','--format','html','--contact-sheet']);
  const budget = checkRenderBudget(4,normal);
  assert.deepEqual(budget.contactSheet,{columns:4,rows:1,width:1180,height:400,pixels:472000});
  assert.equal(budget.estimatedPixels,budget.cardPixels+472000);
});

test('footer mode is explicit, defaults to legacy, and rejects unknown or malformed values', () => {
  assert.equal(parseOptions(['example.md']).footerMode, 'legacy');
  for (const footerMode of ['legacy', 'poster', 'series', 'report']) {
    for (const paginate of ['manual', 'auto']) {
      const options = parseOptions(['example.md', '--footer-mode', footerMode, '--paginate', paginate, '--footer', 'AI-assisted; verify facts']);
      assert.equal(options.footerMode, footerMode);
      assert.equal(options.paginate, paginate);
      assert.equal(options.footer, 'AI-assisted; verify facts');
    }
    assert.equal(parseOptions(['example.md', '--template', 'T01', '--footer-mode', footerMode]).footerMode, footerMode);
  }
  for (const invalid of ['', 'none', 'false', 'Poster', ' poster ', 'series,report', 'poster" onclick="bad']) {
    assert.throws(() => parseOptions(['example.md', '--footer-mode', invalid]), { code: 'INVALID_OPTIONS' });
    assert.throws(() => parseOptions(['--list-templates', '--footer-mode', invalid]), { code: 'INVALID_OPTIONS' });
  }
  assert.throws(() => parseOptions(['example.md', '--footer-mode']), { code: 'INVALID_OPTIONS' });
  assert.throws(() => parseOptions(['example.md', '--footer-mode', 'report', '--template', 'T01', '--paginate', 'auto']), { code: 'PAGINATION_UNSUPPORTED_METADATA' });
});
