import { TEMPLATES, validateTemplateMetadata, validateTemplateCard } from './templates.mjs';
import { summarizeContentRoles } from './content-role.mjs';
import { Md2CardError } from './errors.mjs';

// Role vocabulary, not a second template registry. Capabilities, text and IDs
// always come from TEMPLATES; no per-template candidate list is maintained here.
const roles = Object.freeze({
  'cover-intro': { layout: 'cover', purpose: /开篇|导读|专题|主张/ },
  'concept-explain': { layout: 'explainer', purpose: /解释|概念|说明|分析|知识|原理|代码|教程/ },
  steps: { layout: 'steps', purpose: /步骤|清单|路线|流程|阶段|行动|索引/ },
  comparison: { layout: 'comparison', purpose: /比较|对照|对比|平行|分类/ },
  'quote-evidence': { layout: 'quote', purpose: /摘引|摘句|书摘|诗|短句|原话|出处/ },
  metric: { layout: 'statistic', purpose: /指标|数据|数值/ },
  'screenshot-evidence': { layout: 'image-caption', purpose: /截图|界面/ },
  'photo-story': { layout: 'image-caption', purpose: /影像|照片|故事|人像/ },
  'source-note': { layout: 'explainer', purpose: /资料|来源|出处|记录/ }
});
const numbers = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
// Shared by static role navigation; this is a route, not input compatibility.
export function templateRoleMatch(template, roleId) {
  const role = roles[roleId];
  return { layout: role?.layout === template.layout, purpose: Boolean(role?.purpose.test(template.purpose)) };
}
const unique = values => [...new Set(values)];
const sectionGuidance = structure => structure.match(/([一二两三四五六])(?:至([一二两三四五六]))?个[^；。H]{0,12}H2/);
const listGuidance = structure => structure.match(/([一二两三四五六])(?:至([一二两三四五六]))?(?:个|项)[^；。]{0,8}(?:有序列表|有序注释)/);
const within = (count, match) => count >= numbers[match[1]] && count <= numbers[match[2] ?? match[1]];
function structuralReasons(template, summary) {
  const reasons = [], f = summary.features, structure = template.structure;
  if (f.h1Count === 1 && /一个.*?H1/.test(structure)) reasons.push('TITLE_STRUCTURE_MATCH');
  const sections = sectionGuidance(structure), lists = listGuidance(structure);
  if (sections && within(f.h2Count, sections)) reasons.push('SECTION_COUNT_MATCH');
  if (f.orderedItems && /有序列表|有序注释/.test(structure)) reasons.push('ORDERED_LIST_STRUCTURE_MATCH');
  if (lists && within(f.orderedItems, lists)) reasons.push('ORDERED_LIST_COUNT_MATCH');
  if (f.bulletLists && /无序清单/.test(structure)) reasons.push('BULLET_LIST_STRUCTURE_MATCH');
  if (f.quoteBlocks && /引用块/.test(structure)) reasons.push('QUOTE_STRUCTURE_MATCH');
  if (f.codeBlocks && /代码/.test(structure)) reasons.push('CODE_STRUCTURE_MATCH');
  if (f.tableCount && /表格/.test(structure)) reasons.push('TABLE_STRUCTURE_MATCH');
  return reasons;
}
function rankCandidate(template, card, summary, requestedAspect) {
  const f = summary.features;
  const aspect = template.aspectLayouts[requestedAspect];
  const variant = card.metadata.visualVariant;
  const structure = variant === 'screenshot-stage'
    ? '一个 H1；一句导语；两个 H2 功能短说明；一个本地 metadata image，alt/caption 说明性质。按标题、图像与图注、正文、来源的 DOM 顺序展示。'
    : aspect.structure ?? template.structure;
  const explicit = card.metadata.template === template.id;
  const { layout, purpose } = templateRoleMatch(template, summary.role);
  const structureReasons = structuralReasons({ ...template, structure }, summary);
  const lengthFit = f.characters >= template.length[0] && f.characters <= template.length[1];
  const risks = [];
  if (summary.caveats.includes('LONG_CODE') && /代码|长函数|命令/.test(template.unsuitable)) risks.push('REGISTRY_LONG_CODE_CAUTION');
  if (summary.caveats.includes('WIDE_TABLE') && /表格|宽表|单元格/.test(template.unsuitable)) risks.push('REGISTRY_WIDE_TABLE_CAUTION');
  if (f.characters > template.length[1]) risks.push('ABOVE_REGISTRY_LENGTH_GUIDANCE');
  if (f.characters < template.length[0]) risks.push('BELOW_REGISTRY_LENGTH_GUIDANCE');
  if (!f.h1Count && /H1/.test(structure)) risks.push('TITLE_STRUCTURE_NOT_MET');
  if (!f.quoteBlocks && /引用块/.test(structure)) risks.push('QUOTE_STRUCTURE_NOT_MET');
  if (!f.codeBlocks && /代码/.test(structure)) risks.push('CODE_STRUCTURE_NOT_MET');
  if (!f.tableCount && /表格/.test(structure)) risks.push('TABLE_STRUCTURE_NOT_MET');
  const sections = sectionGuidance(structure), lists = listGuidance(structure);
  if (sections && !within(f.h2Count, sections)) risks.push('SECTION_COUNT_OUTSIDE_GUIDANCE');
  if (lists && !within(f.orderedItems, lists)) risks.push('ORDERED_LIST_COUNT_OUTSIDE_GUIDANCE');
  return { templateId: template.id, name: template.name,
    reasonIds: ['HARD_CONTRACTS_MET', 'ASPECT_SUPPORTED', ...(explicit ? ['AUTHOR_TEMPLATE_MATCH'] : []),
      ...(layout ? ['ROLE_LAYOUT_MATCH'] : []), ...(purpose ? ['REGISTRY_PURPOSE_MATCH'] : []),
      ...(template.image === 'required' ? ['IMAGE_REQUIRED_MET'] : []),
      ...(template.requiredMetadata?.length ? ['REQUIRED_METADATA_MET'] : []), ...structureReasons,
      ...(lengthFit ? ['WITHIN_REGISTRY_LENGTH_GUIDANCE'] : [])],
    caveats: unique(['RENDER_NOT_PERFORMED', ...summary.caveats, ...risks, ...(variant ? ['VISUAL_VARIANT_REVIEW_REQUIRED'] : []),
      ...(aspect.status === 'visually-reviewed' ? [] : ['REGISTRY_ASPECT_REVIEW_PENDING'])]),
    evidence: { layout: template.layout, aspect: requestedAspect, aspectRegistryStatus: variant ? 'variant-independent-review-required' : aspect.status, purpose: template.purpose, structure,
      unsuitable: template.unsuitable, lengthGuidance: [...template.length], actualCharacters: f.characters },
    priority: [Number(explicit), Number(layout), Number(purpose), -risks.length, structureReasons.length, Number(lengthFit)],
    requiresUserSelection: true };
}

/** Pure, synchronous recommendation over trusted parse results. Does not read
 * files, resolve assets, run render/export, rewrite metadata or open a browser. */
export function recommendTemplates({ cards, requestedAspect = 'portrait', paginate = 'manual' } = {}) {
  if (typeof requestedAspect !== 'string' || !requestedAspect || !['manual', 'auto'].includes(paginate)) {
    throw new Md2CardError('INVALID_RECOMMENDATION_OPTIONS', 'Use an aspect string and manual or auto pagination.');
  }
  const summaries = summarizeContentRoles(cards);
  const registry = [...TEMPLATES].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { schemaVersion: 1, requestedAspect, paginate, automatedRenderingPerformed: false,
    ranking: ['author-template', 'role-layout', 'registry-purpose', 'fewer-caveats', 'structure-matches', 'length-guidance', 'template-id'],
    cards: cards.map((card, index) => {
      const summary = summaries[index], rejected = [], compatible = [];
      for (const template of registry) {
        const reasonIds = [], details = [];
        if (paginate === 'auto') reasonIds.push('AUTO_TEMPLATE_UNSUPPORTED');
        if (!template.aspects.includes(requestedAspect)) reasonIds.push('TEMPLATE_ASPECT_UNSUPPORTED');
        const metadata = { ...card.metadata, template: template.id };
        // Keep explicitly authored layout constraints. An inferred/default layout
        // is not author intent; this local validation object is never written back.
        if (!summary.authorMetadataKeys.includes('layout')) delete metadata.layout;
        for (const check of [() => validateTemplateMetadata(metadata), () => validateTemplateCard(card, template)]) {
          try { check(); } catch (error) {
            if (!(error instanceof Md2CardError)) throw error;
            reasonIds.push(error.code); details.push({ code: error.code, message: error.message });
          }
        }
        if (reasonIds.length) rejected.push({ templateId: template.id, reasonIds: unique(reasonIds), details });
        else compatible.push(rankCandidate(template, card, summary, requestedAspect));
      }
      compatible.sort((a, b) => {
        for (let i = 0; i < a.priority.length; i++) if (a.priority[i] !== b.priority[i]) return b.priority[i] - a.priority[i];
        return a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : 0;
      });
      // Unknown semantics are not a reason to erase an explicit, compatible
      // author choice. Retain only that choice; never guess alternatives.
      const selected = summary.role === 'unknown'
        ? compatible.filter(candidate => candidate.templateId === card.metadata.template).slice(0, 1)
        : compatible.slice(0, 3);
      const selectedIds = new Set(selected.map(candidate => candidate.templateId));
      return { ...summary, ...(paginate === 'auto' ? { caveats: [...summary.caveats, 'AUTO_LAYOUTS_EXPLAINER_STEPS_ONLY'] } : {}),
        selectionStatus: paginate === 'auto' ? 'manual-templates-only' : !compatible.length ? 'no-compatible-template'
          : summary.role === 'unknown' ? selected.length ? 'author-template-only' : 'insufficient-role-evidence' : 'candidates-available',
        candidates: selected.map((candidate, i) => ({ ...candidate, ...(card.metadata.visualVariant ? { visualVariant: card.metadata.visualVariant } : {}), rank: i + 1 })),
        compatibleCount: compatible.length, omittedCompatibleTemplateIds: compatible.filter(c => !selectedIds.has(c.templateId)).map(c => c.templateId), rejected };
    }) };
}
