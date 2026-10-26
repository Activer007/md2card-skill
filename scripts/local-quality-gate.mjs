#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { VARIANTS, aggregate, createRunDirectory, digestFile, environment, inventory, json, parseTestSummary,
  prepareBaseline, resolveNpm, runCommand, sha256, slash, testStatus, verifyEvidence } from './local-quality-support.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const USAGE = `Local quality gate (Node.js >=20, Git; no network installs)
  node scripts/local-quality-gate.mjs --mode fast [--base origin/main] [--changed scripts/file.mjs ...]
  node scripts/local-quality-gate.mjs --mode targeted --target screenshot-stage|photo-cover|visual-audit|wechat-covers|gallery
  node scripts/local-quality-gate.mjs --mode release
Options: --browser PATH --npm-cli PATH --output-root validation/local-quality
         --baseline-root PATH (one targeted variant only; verified then copied, never executed in place)
Repeat --target or --changed for multiple values. Each invocation creates a new directory.
Exit 0: selected scope PASS. Exit 1: FAIL, SKIP, BLOCKED, or invalid invocation.
Fast PASS does not certify release. Human visual acceptance is always not-performed.`;

export function parseGateOptions(args) {
  const options = { mode: 'fast', targets: [], changed: [], base: 'origin/main' }, seen = new Set();
  const keys = { '--mode': 'mode', '--target': 'targets', '--changed': 'changed', '--base': 'base',
    '--browser': 'browser', '--npm-cli': 'npmCli', '--output-root': 'outputRoot', '--baseline-root': 'baselineRoot' };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]; if (flag === '--help') { assert.equal(args.length, 1, '--help must be used alone'); return { help: true }; }
    const key = keys[flag]; assert.ok(key, `Unknown option: ${flag}`);
    const value = args[++i]; assert.ok(value && !value.startsWith('--'), `Missing value: ${flag}`);
    if (Array.isArray(options[key])) options[key].push(value);
    else { assert.ok(!seen.has(key), `Duplicate option: ${flag}`); options[key] = value; seen.add(key); }
  }
  assert.ok(['fast', 'targeted', 'release'].includes(options.mode), 'Unknown mode');
  assert.ok(!options.base.startsWith('-'), 'Invalid base revision');
  options.targets = [...new Set(options.targets)];
  assert.ok(options.targets.every(t => Object.hasOwn(VARIANTS, t)), 'Unknown target');
  assert.ok(options.mode === 'targeted' ? options.targets.length : !options.targets.length, '--target is required only for targeted mode');
  assert.ok(options.mode === 'fast' || (!options.changed.length && !seen.has('base')), '--base/--changed are fast-mode options');
  assert.ok(!options.baselineRoot || (options.mode === 'targeted' && options.targets.length === 1 && VARIANTS[options.targets[0]].commit), '--baseline-root requires one historical targeted variant');
  for (const file of options.changed) assert.ok(!path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'), '--changed must be a repository-relative path');
  return options;
}

// Reverse static import closure; unknown/shared inputs conservatively select all unit tests.
// No content/character-count model is introduced here.
export async function selectTests(root, changed) {
  const all = (await readdir(path.join(root, 'tests'))).filter(n => n.endsWith('.test.mjs')).map(n => `tests/${n}`).sort();
  const unit = all.filter(n => !['tests/export.test.mjs', 'tests/pagination-export.test.mjs'].includes(n));
  const graph = new Map(), directImports = new Map();
  async function dependencies(file, visited = new Set()) {
    if (visited.has(file)) return visited;
    visited.add(file);
    if (!directImports.has(file)) {
      let source; try { source = await readFile(path.join(root, file), 'utf8'); } catch { return visited; }
      directImports.set(file, [...source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"](\.[^'"]+\.mjs)['"]/g)]
        .map(match => slash(path.normalize(path.join(path.dirname(file), match[1])))));
    }
    // Cache direct edges, never a partial transitive closure from a cycle.
    for (const dep of directImports.get(file)) await dependencies(dep, visited);
    return visited;
  }
  for (const file of unit) graph.set(file, await dependencies(file));
  const selected = new Set(), reasons = [];
  for (const file of changed.map(slash)) {
    let matches = unit.filter(test => graph.get(test).has(file));
    if (!matches.length) {
      // Docs/evidence/gallery changes affect the evidence readers and catalogue checks.
      if (file.startsWith('docs/') || file.startsWith('references/')) matches = unit.filter(test => /gallery|evidence|compatibility/.test(test));
      else matches = unit;
    }
    matches.forEach(test => selected.add(test)); reasons.push({ file, tests: matches });
  }
  if (!selected.size) {
    const smoke = unit.filter(test => /(?:local-quality-gate|markdown|options)\.test\.mjs$/.test(test));
    smoke.forEach(test => selected.add(test)); reasons.push({ file: null, reason: 'No changed paths; smoke checks only', tests: smoke });
  }
  return { files: [...selected].sort(), reasons, excludedIntegration: all.filter(n => !unit.includes(n)) };
}

export function markdownReport(report) {
  const escape = value => String(value ?? '').replaceAll('|', '\\|').replaceAll(/\r?\n/g, ' ');
  return `# Local quality gate: ${report.status}\n\nMode: **${report.mode}**. Commit: \`${report.source?.commit ?? 'unknown'}\`.\n` +
    `Started: ${report.startedAt}. Finished: ${report.completedAt}.\n\nHuman visual acceptance: **not-performed**. PASS applies only to the selected scope.\n\n` +
    `| Check | Status | Seconds | Reason / logs |\n| --- | --- | ---: | --- |\n` +
    report.steps.map(s => `| ${s.id} | ${s.status} | ${((s.elapsedMs ?? 0) / 1000).toFixed(1)} | ${escape(s.reason ?? '')} ${s.command ? `[stdout](${s.command.stdout}) · [stderr](${s.command.stderr})` : ''} |`).join('\n') +
    `\n\nFull commands, exit codes, environment, test counts, baseline identities and hashes: [report.json](report.json).\n\n` +
    `Artifact inventory: [artifacts.json](artifacts.json). Reports are authenticated by [receipt.json](receipt.json); the receipt is not a signature.\n`;
}

export async function runGate(options, { root = ROOT } = {}) {
  root = await realpath(root);
  const out = await createRunDirectory(root, options.outputRoot, options.mode);
  const report = { schemaVersion: 1, mode: options.mode, options, startedAt: new Date().toISOString(), status: 'BLOCKED',
    environment: environment(), humanVisualReview: 'not-performed', source: null, commands: [], steps: [], limitations: [
      'No semantic equivalence, OCR, assistive-technology or human visual acceptance is certified.',
      'A process timeout terminates the direct child; descendant shutdown is not certified. Inspect logs before retrying.',
      'Historical archive hashes authenticate bytes; existing gallery/source binders validate their applicable semantics.'
    ] };
  const nodeOptions = process.env.NODE_OPTIONS ?? '';
  assert.ok(!nodeOptions.includes('--test-reporter') || (nodeOptions.match(/--test-reporter=tap(?:\s|$)/g)?.length === 1 && !nodeOptions.includes('--test-reporter-destination')), 'Use the default TAP reporter without custom reporter destinations');
  const env = { ...process.env, NODE_OPTIONS: nodeOptions.includes('--test-reporter') ? nodeOptions : `${nodeOptions} --test-reporter=tap`.trim(),
    MD2CARD_REQUIRE_BROWSER: '1', MD2CARD_REQUIRE_PDF_CHECK: '1', MD2CARD_SKIP_BROWSER: '0' };
  if (options.browser) env.CHROMIUM_PATH = path.resolve(options.browser);
  // Child test runners must not inherit Node's internal parent-runner transport.
  delete env.NODE_TEST_CONTEXT;
  report.environment.configuration = Object.fromEntries(['CHROMIUM_PATH', 'MD2CARD_REQUIRE_BROWSER', 'MD2CARD_REQUIRE_PDF_CHECK', 'MD2CARD_SKIP_BROWSER', 'NODE_OPTIONS'].map(k => [k, env[k] ?? null]));
  let sequence = 0;
  const command = async (id, executable, args, timeoutMs) => {
    const record = await runCommand({ executable, args, cwd: root, env, logRoot: path.join(out, 'logs'), id: `${String(++sequence).padStart(3, '0')}-${id}`, timeoutMs });
    report.commands.push(record); return record;
  };
  const git = async (id, args) => {
    const result = await command(id, 'git', args, 30000);
    assert.equal(result.status, 'PASS', `Git ${id} failed; see ${result.stderr}`); return readFile(result.stdout, 'utf8');
  };
  const step = async (id, selected, action, dependencies = []) => {
    const row = { id, selected, status: 'NOT-RUN' }; report.steps.push(row);
    if (!selected) { row.reason = 'Outside selected mode/target'; return row; }
    const blockers = dependencies.filter(s => s.status !== 'PASS');
    if (blockers.length) { row.reason = `Prerequisite did not pass: ${blockers.map(s => s.id).join(', ')}`; return row; }
    const started = Date.now();
    try { Object.assign(row, await action(row)); row.status ??= 'PASS'; }
    catch (error) { row.status = error.code === 'ENOENT' ? 'BLOCKED' : 'FAIL'; row.reason = error.message; }
    row.elapsedMs = Date.now() - started; return row;
  };
  const execute = async (row, executable, args, tests = false) => {
    const result = await command(row.id, executable, args); row.command = result;
    row.status = result.status; row.reason = result.error ?? (result.timedOut ? 'Timed out; descendant shutdown unverified' : `Exit ${result.exitCode}`);
    if (tests && !result.timedOut && !result.error) {
      row.tests = parseTestSummary(await readFile(result.stdout, 'utf8')); row.status = testStatus(result.exitCode, row.tests);
      if (row.status === 'SKIP') row.reason = 'Skipped/TODO tests prevent acceptance';
    }
    if (result.error?.startsWith('ENOENT')) row.status = 'BLOCKED';
    return row;
  };
  async function snapshot(label) {
    const commit = (await git(`${label}-commit`, ['rev-parse', 'HEAD'])).trim();
    const status = await git(`${label}-status`, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const names = (await git(`${label}-files`, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean);
    const files = [];
    for (const file of [...new Set(names)].sort()) {
      // Untracked handoff documents are not project inputs. Preserve and disclose them in status.
      if (file.startsWith('validation/') || file.startsWith('md2card-guizang-development-pack/')) continue;
      try { files.push({ file, ...await digestFile(path.join(root, file)) }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; files.push({ file, deleted: true }); }
    }
    return { commit, status, files, fingerprint: sha256(JSON.stringify(files)) };
  }
  try {
    report.source = await snapshot('before');
    const targets = options.mode === 'release' ? Object.keys(VARIANTS) : options.targets;
    await step('static', true, async row => execute(row, 'git', ['diff', '--check', 'HEAD']));
    const changes = options.mode === 'fast' ? [...new Set([
      ...(await git('changed-committed', ['diff', '--name-only', '-z', `${options.base}...HEAD`])).split('\0'),
      ...(await git('changed-local', ['diff', '--name-only', '-z', 'HEAD'])).split('\0'),
      ...(await git('changed-new', ['ls-files', '-z', '--others', '--exclude-standard', '--', 'scripts', 'tests', 'package.json', 'docs', 'references', 'assets', 'examples'])).split('\0'),
      ...options.changed
    ].filter(Boolean))] : [];
    const selection = options.mode === 'fast' ? await selectTests(root, changes) : null;
    report.selection = selection;
    await step('unit', options.mode === 'fast', row => execute(row, process.execPath, ['--test', ...selection.files], true));
    const strict = options.mode !== 'fast';
    const doctor = await step('doctor', strict, async row => {
      await execute(row, process.execPath, ['scripts/render.mjs', '--doctor', '--strict', '--json', ...(env.CHROMIUM_PATH ? ['--browser', env.CHROMIUM_PATH] : [])]);
      try { report.environment.doctor = JSON.parse(await readFile(row.command.stdout, 'utf8')); } catch { row.status = 'FAIL'; row.reason = 'Invalid doctor JSON'; }
      if (report.environment.doctor?.ok !== true || row.status !== 'PASS') { row.status = 'BLOCKED'; row.reason = 'Strict environment preflight did not pass; see doctor checks and logs'; }
    });
    const browser = await step('browser', strict, async row => {
      await execute(row, process.execPath, ['scripts/local-quality-probe.mjs', ...(env.CHROMIUM_PATH ? [env.CHROMIUM_PATH] : [])]);
      if (row.status === 'PASS') report.environment.browser = JSON.parse(await readFile(row.command.stdout, 'utf8'));
      else row.status = 'BLOCKED';
    }, [doctor]);
    const pdf = await step('pdf-rasterizer', strict, row => execute(row, 'pdftoppm', ['-v']), [doctor]);
    let npmCli;
    const npm = async (row, args, tests = false) => { npmCli ??= await resolveNpm(options.npmCli); return execute(row, process.execPath, [npmCli, ...args], tests); };
    await step('test', options.mode === 'release', row => npm(row, ['test'], true), [doctor, browser, pdf]);
    await step('integration', options.mode === 'release', row => npm(row, ['run', 'test:integration'], true), [doctor, browser, pdf]);
    await step('gallery-check', strict, row => npm(row, ['run', 'gallery:check']));
    await step('evidence', strict, async () => ({ status: 'PASS', artifacts: await verifyEvidence(root) }));
    for (const [name, definition] of Object.entries(VARIANTS)) {
      let identity;
      const baseline = definition.commit ? await step(`baseline-${name}`, targets.includes(name), async () => {
        identity = await prepareBaseline({ root, directory: path.join(out, `baseline-${name}`), variant: name, supplied: options.baselineRoot, command });
        return { status: 'PASS', identity };
      }) : null;
      await step(name, targets.includes(name), async row => {
        const args = [`scripts/${definition.script}`, ...(definition.allow ? ['--allow-browser'] : []), '--out', path.join(out, name),
          ...(identity ? ['--baseline-root', identity.source] : []), ...(env.CHROMIUM_PATH ? ['--browser', env.CHROMIUM_PATH] : [])];
        await execute(row, process.execPath, args);
        if (row.status === 'PASS') {
          const file = path.join(out, name, name === 'gallery' ? 'summary.json' : 'report.json');
          row.result = { file: slash(path.relative(out, file)), ...await digestFile(file) };
        }
      }, [doctor, browser, pdf, ...(baseline ? [baseline] : [])]);
    }
  } catch (error) {
    report.steps.push({ id: 'runner', selected: true, status: 'FAIL', reason: error.message });
  } finally {
    await step('source-unchanged', true, async () => {
      const after = await snapshot('after'); report.sourceAfter = { commit: after.commit, status: after.status, fingerprint: after.fingerprint };
      assert.ok(report.source && report.source.commit === after.commit && isDeepStrictEqual(report.source.files, after.files), 'Project files or HEAD changed during the run');
      return { status: 'PASS' };
    });
    report.completedAt = new Date().toISOString(); report.status = aggregate(report.steps);
    // Normalize log references once, after every command has completed.
    for (const record of report.commands) { record.stdout = slash(path.relative(out, record.stdout)); record.stderr = slash(path.relative(out, record.stderr)); }
    try { await json(path.join(out, 'artifacts.json'), { schemaVersion: 1, files: await inventory(out) }); }
    catch (error) { report.steps.push({ id: 'artifact-inventory', selected: true, status: 'FAIL', reason: error.message }); report.status = 'FAIL'; }
    await json(path.join(out, 'report.json'), report);
    await writeFile(path.join(out, 'report.md'), markdownReport(report));
    await json(path.join(out, 'receipt.json'), { schemaVersion: 1, files: await Promise.all(['artifacts.json', 'report.json', 'report.md'].map(async file => ({ file, ...await digestFile(path.join(out, file)) }))) });
  }
  return { report, out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseGateOptions(process.argv.slice(2));
    if (options.help) console.log(USAGE);
    else {
      const { report, out } = await runGate(options);
      console.log(`${report.status}: ${options.mode}; ${out}/report.json`);
      if (report.status !== 'PASS') process.exitCode = 1;
    }
  } catch (error) { console.error(error.message); console.error(USAGE); process.exitCode = 1; }
}
