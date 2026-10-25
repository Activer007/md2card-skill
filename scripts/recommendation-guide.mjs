// Presentation over the existing registry/matcher and verified gallery model.
// No template IDs, acceptance decisions, or second capability list live here.
import { CONTENT_ROLES } from './content-role.mjs';
import { templateRoleMatch } from './template-recommender.mjs';

const labels = {
  'cover-intro': '开篇与主张', 'concept-explain': '概念与解释', steps: '步骤与清单',
  comparison: '有条件的比较', 'quote-evidence': '引文与证据', metric: '明确的指标',
  'screenshot-evidence': '截图与界面证据', 'photo-story': '照片与图像故事',
  'source-note': '资料与来源注记', unknown: '角色证据不足'
};
export function buildRoleGuide(items) {
  return CONTENT_ROLES.map(id => ({ id, title: labels[id], templates: items.filter(item => {
    const match = templateRoleMatch(item, id);
    return match.layout || match.purpose;
  }).map(item => ({ id: item.id, name: item.name, image: item.image, currentPreview: Boolean(item.preview) })) }));
}

export function describeCandidate(candidate, item, aspect) {
  const layout = item.aspectLayouts[aspect];
  let acceptedExample = null;
  // A portrait PNG never substitutes for a square/slide example. The caller
  // supplies a model that has verified actual bytes, versions and review scope.
  if (candidate.visualVariant) {
    // Default-template evidence does not certify an opt-in composition.
    acceptedExample = null;
  } else if (aspect === 'portrait' && item.preview) {
    acceptedExample = { status: 'reviewed-exact-fixture', aspect, input: item.example,
      inputSha256: item.inputSha256, png: { file: item.preview.path, sha256: item.preview.sha256 },
      scope: { density: item.preview.density, pagination: item.preview.pagination, width: item.preview.width, height: item.preview.height },
      review: item.evidence.review, evidence: item.evidence.path, templateVersion: item.version };
  } else {
    const entry = item.aspectEvidence.find(entry => entry.aspect === aspect && entry.input === layout?.example);
    if (entry) acceptedExample = { status: entry.status, aspect, input: entry.input, inputSha256: entry.inputSha256,
      png: entry.views.fullPng, mobile375: entry.views.mobile375, mobile390: entry.views.mobile390,
      pdf: entry.views.nativePdf, scope: { density: 'standard', pagination: 'manual' },
      templateVersion: entry.templateVersion, aspectVersion: entry.aspectVersion,
      review: 'docs/ASPECT_PR22_REVIEW.md', limitations: entry.limitations };
  }
  return { ...candidate, conditions: { image: item.image, requiredMetadata: item.requiredMetadata ?? [],
    inlineImageCount: item.inlineImageCount ?? null, imageSections: item.imageSections ?? null,
    textStructure: candidate.evidence.structure, lengthGuidance: [...item.length], supportedAspects: [...item.aspects],
    unsuitable: item.unsuitable },
    gallery: `docs/gallery/index.html#${item.id}`, acceptedExample,
    exampleStatus: candidate.visualVariant ? 'no-reviewed-example-for-requested-variant' : acceptedExample ? 'reviewed-exact-input-only' : 'no-reviewed-example-for-requested-aspect',
    inputRenderability: 'not-verified', recommendationIsRenderGuarantee: false };
}

export function formatRecommendationText(report) {
  const explanations = {
    HARD_CONTRACTS_MET: '通过现有元数据和内容结构硬校验', ASPECT_SUPPORTED: '支持请求画幅',
    AUTHOR_TEMPLATE_MATCH: '保留作者明确选择', ROLE_LAYOUT_MATCH: '版式与内容角色匹配',
    REGISTRY_PURPOSE_MATCH: '注册用途与内容角色匹配', IMAGE_REQUIRED_MET: '已提供所需图片',
    REQUIRED_METADATA_MET: '必需字段齐全', TITLE_STRUCTURE_MATCH: '标题结构匹配',
    SECTION_COUNT_MATCH: '分节数量匹配', ORDERED_LIST_STRUCTURE_MATCH: '有序列表结构匹配',
    ORDERED_LIST_COUNT_MATCH: '列表项数符合指导', BULLET_LIST_STRUCTURE_MATCH: '无序清单结构匹配',
    QUOTE_STRUCTURE_MATCH: '包含引文结构', CODE_STRUCTURE_MATCH: '包含代码结构',
    TABLE_STRUCTURE_MATCH: '包含表格结构', WITHIN_REGISTRY_LENGTH_GUIDANCE: '字符数位于注册指导范围'
  };
  const lines = ['模板推荐 ≠ 渲染保证；未启动浏览器、未导出或改写原文。',
    `输入 SHA-256: ${report.sourceSha256}`, `画幅: ${report.requestedAspect}；分页: ${report.paginate}`];
  for (const card of report.cards) {
    lines.push('', `卡片 ${card.index} · ${labels[card.role]} (${card.role}) · ${card.selectionStatus}`);
    if (!card.candidates.length) lines.push('没有推荐候选；不猜选或补造必要字段。');
    for (const item of card.candidates) {
      if (item.visualVariant) lines.push(`显式构图: ${item.visualVariant}`);
      lines.push(`${item.rank}. ${item.templateId} ${item.name}`, `   理由: ${item.reasonIds.map(id => explanations[id] ?? id).join('；')}`,
        `   用途: ${item.evidence.purpose}`,
        `   图片: ${item.conditions.image}；必需字段: ${item.conditions.requiredMetadata.join(', ') || '无'}`,
        `   文字: ${item.conditions.textStructure}；${item.conditions.lengthGuidance.join('–')} 字仅为指导`,
        `   支持画幅: ${item.conditions.supportedAspects.join(', ')}`, `   不适合: ${item.conditions.unsuitable}`,
        `   限制: ${item.caveats.join(', ')}`, `   图库: ${item.gallery}`,
        item.acceptedExample ? `   已验收的精确示例: ${item.acceptedExample.input} → ${item.acceptedExample.png.file}；复核: ${item.acceptedExample.review}`
          : item.visualVariant ? '   请求变体暂无独立图库验收；不能借用默认模板验收。' : '   请求画幅暂无已验收示例；不能借用竖版验收。');
      if (item.acceptedExample) {
        const example = item.acceptedExample;
        lines.push(`   示例验收状态: ${example.status}`,
          `   示例验收范围: ${example.aspect} / ${example.scope.density} / ${example.scope.pagination}（仅原始示例）`);
        for (const limitation of example.limitations ?? []) lines.push(`   示例保留问题: ${limitation}`);
      }
      if (item.caveats.includes('SCREENSHOT_TEXT_REQUIRES_VISUAL_REVIEW')) lines.push('   截图内微字（例如 8px）不保证在手机上可读；需查看原图与真实输出。');
    }
    lines.push(`未入选但兼容: ${card.omittedCompatibleTemplateIds.join(', ') || '无'}`);
    lines.push(`拒绝: ${card.rejected.map(item => `${item.templateId} [${item.reasonIds.join(', ')}]`).join('; ') || '无'}`);
  }
  return lines.join('\n') + '\n';
}
