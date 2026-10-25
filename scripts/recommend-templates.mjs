#!/usr/bin/env node
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { renderCards, splitCards } from './markdown.mjs';
import { createAssetResolver } from './assets.mjs';
import { TEMPLATE_ASPECTS } from './templates.mjs';
import { recommendTemplates } from './template-recommender.mjs';
import { buildGalleryModel } from './build-template-gallery.mjs';
import { describeCandidate, formatRecommendationText } from './recommendation-guide.mjs';
import { Md2CardError, normalizeError } from './errors.mjs';

// Same input/card ceilings as rendering, without importing its browser/export layer.
export const RECOMMEND_LIMITS = Object.freeze({ inputBytes: 2 * 1024 * 1024, cards: 200 });
const fail = (code, message) => { throw new Md2CardError(code, message); };
export const HELP = `Read-only template recommendations — 推荐 ≠ 渲染保证
Usage: node scripts/recommend-templates.mjs input.md [options]
  --size portrait|square|slide   Registered aspect; default portrait
  --paginate manual|auto        Default manual; auto returns no template candidates
  --asset-root DIRECTORY        Trusted local images; default input directory
  --format json|text            Default json; --json is an explicit alias
  --help                        Show this help
JSON success goes to stdout; errors are JSON on stderr with exit 1.
No output files, browser, network, rendering, automatic edits or template selection.
Only local UTF-8 regular files (2 MiB, 200 manual partitions); no stdin or URLs.
Reviewed links prove their exact example, not that this input will fit.
`;

export function parseRecommendationOptions(args) {
  let parsed;
  try { parsed = parseArgs({ args, strict: true, allowPositionals: true, tokens: true,
    options: { size: { type: 'string' }, paginate: { type: 'string' }, 'asset-root': { type: 'string' },
      format: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean' } } }); }
  catch (error) { fail('INVALID_RECOMMENDATION_OPTIONS', error.message); }
  const { values, positionals, tokens } = parsed;
  const seen = new Set();
  for (const token of tokens.filter(token => token.kind === 'option')) {
    if (seen.has(token.name)) fail('INVALID_RECOMMENDATION_OPTIONS', `Duplicate option --${token.name}.`);
    seen.add(token.name);
  }
  if (values.help) return { help: true };
  const remotePath = value => /^(?:[a-z][a-z0-9+.-]*:\/\/|(?:file|data):|[\\/]{2})/i.test(value);
  if (positionals.length !== 1 || positionals[0] === '-' || remotePath(positionals[0])) fail('INVALID_INPUT', 'Supply exactly one local Markdown file; URLs and UNC shares are unsupported.');
  const aspect = values.size ?? 'portrait', paginate = values.paginate ?? 'manual', format = values.format ?? 'json';
  if (!TEMPLATE_ASPECTS.some(item => item.id === aspect) || !['manual', 'auto'].includes(paginate)
    || !['json', 'text'].includes(format) || (values.json && format !== 'json')
    || (values['asset-root'] !== undefined && (!values['asset-root'].trim() || remotePath(values['asset-root'])))) fail('INVALID_RECOMMENDATION_OPTIONS', 'Invalid size, paginate, format or asset-root; see --help.');
  const input = path.resolve(positionals[0]);
  return { input, requestedAspect: aspect, paginate, format, assetRoot: path.resolve(values['asset-root'] ?? path.dirname(input)) };
}

async function readInput(input) {
  let handle;
  try {
    handle = await open(input, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const stat = await handle.stat();
    if (!stat.isFile()) fail('INVALID_INPUT', 'Input must be a regular local file.');
    if (stat.size > RECOMMEND_LIMITS.inputBytes) fail('RECOMMENDATION_BUDGET', 'Input exceeds 2 MiB.');
    // Bounded even if the input grows after fstat; never use unbounded readFile.
    const buffer = Buffer.alloc(RECOMMEND_LIMITS.inputBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > RECOMMEND_LIMITS.inputBytes) fail('RECOMMENDATION_BUDGET', 'Input exceeds 2 MiB.');
    const bytes = buffer.subarray(0, length);
    let markdown;
    try { markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { fail('INVALID_INPUT', 'Input must be valid UTF-8.'); }
    return { bytes, markdown };
  } catch (error) {
    if (error instanceof Md2CardError) throw error;
    fail('INVALID_INPUT', `Cannot read input: ${error.code ?? 'read failed'}.`);
  } finally { await handle?.close(); }
}

export async function createRecommendationReport(options) {
  const { bytes, markdown } = await readInput(options.input);
  if (splitCards(markdown).length > RECOMMEND_LIMITS.cards) fail('RECOMMENDATION_BUDGET', 'Input exceeds 200 manual partitions.');
  const resolver = await createAssetResolver(options.assetRoot);
  const cards = renderCards(markdown, { resolveImage: resolver.resolveImage });
  const report = recommendTemplates({ cards, requestedAspect: options.requestedAspect, paginate: options.paginate });
  // Reuse the existing fail-closed evidence/path/hash checks, never infer
  // acceptance from a filename or registry status alone. Read-only invocation.
  let model;
  try { model = await buildGalleryModel(); }
  catch (error) { fail('RECOMMENDATION_EVIDENCE_INVALID', error.message); }
  const byId = new Map(model.items.map(item => [item.id, item]));
  return { ...report, reportType: 'template-recommendation', status: 'success',
    sourceSha256: createHash('sha256').update(bytes).digest('hex'), sourceBytes: bytes.length,
    templateCount: model.items.length, recommendationIsRenderGuarantee: false, linksRelativeTo: 'repository-root',
    cards: report.cards.map(card => ({ ...card, candidates: card.candidates.map(candidate => describeCandidate(candidate, byId.get(candidate.templateId), report.requestedAspect)) })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseRecommendationOptions(process.argv.slice(2));
    if (options.help) process.stdout.write(HELP);
    else {
      const report = await createRecommendationReport(options);
      process.stdout.write(options.format === 'text' ? formatRecommendationText(report) : JSON.stringify(report, null, 2) + '\n');
    }
  } catch (error) {
    const report = normalizeError(error);
    process.stderr.write(JSON.stringify(report) + '\n');
    process.exitCode = report.exitCode;
  }
}
