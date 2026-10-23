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
  assert.equal(checkRenderBudget(8, options).estimatedPixels, 1080*1440*8);
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
