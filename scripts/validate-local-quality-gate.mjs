#!/usr/bin/env node
// Deliberate failures in owned temporary inputs; never replace installed tools.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { parseGateOptions, runGate } from './local-quality-gate.mjs';
import { createRunDirectory, digestFile, inventory, json, prepareBaseline, runCommand } from './local-quality-support.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
async function executable(name) {
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) for (const suffix of suffixes) {
    const candidate = path.join(dir, name + suffix); try { await access(candidate); return candidate; } catch { /* next */ }
  }
  throw new Error(`Required real tool missing: ${name}`);
}

export async function validateLocalGate() {
  const out = await createRunDirectory(ROOT, 'validation/local-quality-faults', 'injections');
  const results = [], logs = path.join(out,'logs'); let sequence = 0;
  const command = (id, executable, args, timeoutMs, cwd = ROOT) => runCommand({ id:`${++sequence}-${id}`, executable, args, timeoutMs, cwd, logRoot: logs });
  const assertRejected = (label, result, check) => {
    const step = result.report.steps.find(s=>s.id===check);
    assert.ok(step && !['PASS','NOT-RUN'].includes(step.status), `${label}: intended step did not reject`);
    assert.notEqual(result.report.status,'PASS', `${label}: false PASS`);
    results.push({ label, out:result.out, status:result.report.status, check, stepStatus:step.status,
      report: null, sourceUnchanged:result.report.steps.find(s=>s.id==='source-unchanged')?.status });
  };
  try {
    const fixture = path.join(out,'unit-fixture'); await mkdir(path.join(fixture,'tests'),{recursive:true});
    await writeFile(path.join(fixture,'.gitignore'),'validation/\n');
    await writeFile(path.join(fixture,'tests','failure.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';test('intentional gate failure',()=>assert.fail('injected unit failure'));\n");
    for (const args of [['init'],['add','.'],['-c','user.name=Local Gate Fixture','-c','user.email=local-gate@example.invalid','-c','commit.gpgsign=false','commit','-m','failure fixture']]) {
      assert.equal((await command('fixture-git','git',args,30000,fixture)).exitCode,0);
    }
    const fast = parseGateOptions(['--mode','fast','--base','HEAD','--changed','tests/failure.test.mjs']);
    const first = await runGate(fast,{root:fixture}); assertRejected('unit failure',first,'unit');
    const before = await digestFile(path.join(first.out,'report.json'));
    const second = await runGate(fast,{root:fixture}); assertRejected('repeat unit failure',second,'unit');
    assert.notEqual(first.out,second.out); assert.deepEqual(await digestFile(path.join(first.out,'report.json')),before);
    assert.equal(first.report.steps.find(s=>s.id==='unit').tests.fail,1);

    const missingBrowser = await runGate(parseGateOptions(['--mode','targeted','--target','gallery','--browser',path.join(out,'absent-chromium.exe')]));
    assertRejected('browser unavailable',missingBrowser,'doctor');
    assert.equal(missingBrowser.report.environment.doctor.checks.find(c=>c.id==='browser').status,'fail');

    const fontDirs = [...new Set([path.dirname(await executable('fc-list')),path.dirname(await executable('fc-match'))])];
    const gitDir = path.dirname(await executable('git'));
    const reducedPath = [...fontDirs,gitDir,path.dirname(process.execPath),...(process.env.SystemRoot ? [path.join(process.env.SystemRoot,'System32')] : [])].join(path.delimiter);
    const prior = process.env.PATH;
    try {
      process.env.PATH = reducedPath;
      // If installations put Poppler beside Fontconfig, this injection cannot isolate absence.
      for (const tool of ['pdfinfo','pdftotext','pdftoppm']) {
        const probe = await command(`missing-${tool}`,tool,['-v'],10000);
        assert.match(probe.error ?? '',/ENOENT/, `${tool} remains reachable; use separate real tool directories for this fault test`);
      }
      const missingPdf = await runGate(parseGateOptions(['--mode','targeted','--target','gallery']));
      assertRejected('PDF tools missing',missingPdf,'doctor');
      const doctor = missingPdf.report.environment.doctor;
      assert.ok(doctor && doctor.ok===false);
      for (const id of ['pdfinfo','pdftotext']) assert.equal(doctor.checks.find(c=>c.id===id).status,'fail');
      for (const id of ['browser','fontconfig:list','fontconfig:match','cjk-glyphs']) assert.equal(doctor.checks.find(c=>c.id===id).status,'pass', `${id} must remain available during PDF-only injection`);
      results.at(-1).doctor = doctor;
    } finally { process.env.PATH = prior; }

    const old = await prepareBaseline({root:ROOT,directory:path.join(out,'tampered-baseline'),variant:'screenshot-stage',command});
    await writeFile(path.join(old.source,old.files[0].file),'intentional baseline mismatch\n');
    const mismatch = await runGate(parseGateOptions(['--mode','targeted','--target','screenshot-stage','--baseline-root',old.source]));
    assertRejected('baseline hash mismatch',mismatch,'baseline-screenshot-stage');
    assert.equal(mismatch.report.steps.find(s=>s.id==='screenshot-stage').status,'NOT-RUN');
    assert.match(mismatch.report.steps.find(s=>s.id==='baseline-screenshot-stage').reason,/Baseline mismatch/);
    for (const item of results) {
      assert.equal(item.sourceUnchanged,'PASS');
      item.report = await digestFile(path.join(item.out,'report.json'));
    }
    await json(path.join(out,'report.json'),{schemaVersion:1,status:'PASS',scope:'intentional fault detection only',humanVisualReview:'not-performed',results});
    await json(path.join(out,'artifacts.json'),{schemaVersion:1,files:await inventory(out)});
    console.log(`PASS: ${results.length} fault/repetition checks; ${out}/report.json`);
    return out;
  } catch (error) {
    await json(path.join(out,'report.json'),{schemaVersion:1,status:'FAIL',error:error.message,results}); throw error;
  }
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).join(' ')!=='--allow-faults') throw new Error('Use --allow-faults to execute deliberate failures in fresh validation directories.');
  await validateLocalGate();
}
