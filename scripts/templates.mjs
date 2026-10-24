import { Md2CardError } from './errors.mjs';

// A registry entry describes a composed design, not a theme/size permutation.
// All CSS classes and paths come from this repository-owned allowlist.
const entries = [
  { id: 'T01', name: '专题封面与侧栏导读', family: 'editorial', layout: 'cover', composition: 'cover-sidebar', purpose: '专题开篇、概念导读', image: 'none', length: [80, 180], structure: '一个 H1；开篇段落；一至两个 H2 侧栏。', unsuitable: '长文、宽表格和完整教程；可改用普通 explainer 分页。', focus: 'title', example: 'examples/templates/T01.md' },
  { id: 'T05', name: '大数字索引清单', family: 'swiss', layout: 'steps', composition: 'numbered-index', purpose: '方法清单、阅读导航', image: 'none', length: [70, 160], structure: '一个 H1；三至四个完整有序列表项。保留原始起始编号。', unsuitable: '长嵌套列表或大段说明；可用普通 steps 自动分页。', focus: 'body', example: 'examples/templates/T05.md' },
  { id: 'T17', name: '荧光重点机制解析', family: 'technology', layout: 'explainer', composition: 'mechanism-rail', purpose: '机制、原理与系统解释', image: 'none', length: [90, 200], structure: '一个 H1；简短导语；三段 H2 机制说明。', unsuitable: '长代码或宽表格；可改用技术教程模板或普通 explainer。', focus: 'body', example: 'examples/templates/T17.md' },
  { id: 'T25', name: '便签式阅读摘记', family: 'journal', layout: 'explainer', composition: 'reading-note', purpose: '阅读笔记、摘句与思考', image: 'none', length: [70, 170], structure: '一个 H1；引用块；一个 H2 下的阅读思考。', unsuitable: '密集数据、长篇引用；保留完整引文并增加手动卡片。', focus: 'body', example: 'examples/templates/T25.md' }
];

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const TEMPLATES = freeze(entries.map(entry => ({
  ...entry, version: 1, status: 'implemented-awaiting-visual-review', aspects: ['portrait'], reading: 'mobile', density: 'standard',
  typography: { bodyWidthRatio: 0.043, noteWidthRatio: 0.0335, bodyLineHeight: 1.5 },
  spacing: { insetWidthRatio: 0.052, densityAffects: 'spacing-only' },
  provenance: { design: 'Original md2card-skill composition, MIT', text: 'Original demonstration text; not an attributed external quotation', assets: 'No external assets; local system fonts only' }
})));
const byId = new Map(TEMPLATES.map(entry => [entry.id, entry]));
export const DENSITIES = Object.freeze(['compact', 'standard', 'editorial']);
export function getTemplate(id) {
  const template = byId.get(id);
  if (!template) throw new Md2CardError('INVALID_TEMPLATE', `Unknown template "${id}". Choose ${TEMPLATES.map(item => item.id).join(', ')}.`, { template: id });
  return template;
}
export function validateTemplateMetadata(metadata, { width, height } = {}) {
  if (metadata.template === undefined) {
    if (metadata.density !== undefined) throw new Md2CardError('INVALID_TEMPLATE', 'Card density requires an explicit template. Legacy theme behavior is unchanged.');
    return null;
  }
  const template = getTemplate(metadata.template);
  if (metadata.layout !== undefined && metadata.layout !== template.layout) throw new Md2CardError('TEMPLATE_LAYOUT_MISMATCH', `${template.id} requires layout "${template.layout}"; remove the conflicting layout or choose another template.`, { template: template.id });
  if (metadata.density !== undefined && !DENSITIES.includes(metadata.density)) throw new Md2CardError('INVALID_TEMPLATE', `Density must be ${DENSITIES.join(', ')}. It changes spacing, never font size.`);
  const unsupported = ['metric', 'label', ...(template.image === 'none' ? ['alt', 'caption'] : [])].filter(key => metadata[key] !== undefined);
  if (unsupported.length) throw new Md2CardError('TEMPLATE_METADATA_UNSUPPORTED', `${template.id} does not display ${unsupported.join(', ')}. Choose a matching layout; metadata is never silently discarded.`, { fields: unsupported });
  if (metadata.image !== undefined && template.image === 'none') throw new Md2CardError('TEMPLATE_IMAGE_UNSUPPORTED', `${template.id} is text-only. Choose an image template or a legacy image-caption layout; the image is never discarded.`);
  if (width !== undefined && Math.abs(width / height - 3 / 4) > 0.002) throw new Md2CardError('TEMPLATE_ASPECT_UNSUPPORTED', `${template.id} currently supports 3:4 only. Use --size portrait; other aspect ratios need independent composition acceptance.`);
  return template;
}
