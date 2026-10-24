import { Md2CardError } from './errors.mjs';

// A registry entry describes a composed design, not a theme/size permutation.
// All CSS classes and paths come from this repository-owned allowlist.
const entries = [
  { id: 'T01', acceptance: 'visual-m1', name: '专题封面与侧栏导读', family: 'editorial', layout: 'cover', composition: 'cover-sidebar', purpose: '专题开篇、概念导读', image: 'none', length: [80, 180], structure: '一个 H1；开篇段落；一至两个 H2 侧栏。', unsuitable: '长文、宽表格和完整教程；可改用普通 explainer 分页。', focus: 'title', example: 'examples/templates/T01.md' },
  { id: 'T05', acceptance: 'visual-m1', maxListNumber: 99, name: '大数字索引清单', family: 'swiss', layout: 'steps', composition: 'numbered-index', purpose: '方法清单、阅读导航', image: 'none', length: [70, 160], structure: '一个 H1；三至四个完整有序列表项。保留原始起始编号；本模板编号范围为 0–99，超出请用普通 steps。', unsuitable: '长嵌套列表或大段说明；可用普通 steps 自动分页。', focus: 'body', example: 'examples/templates/T05.md' },
  { id: 'T17', acceptance: 'visual-m1', name: '荧光重点机制解析', family: 'technology', layout: 'explainer', composition: 'mechanism-rail', purpose: '机制、原理与系统解释', image: 'none', length: [90, 200], structure: '一个 H1；简短导语；三段 H2 机制说明。', unsuitable: '长代码或宽表格；可改用技术教程模板或普通 explainer。', focus: 'body', example: 'examples/templates/T17.md' },
  { id: 'T25', acceptance: 'visual-m1', name: '便签式阅读摘记', family: 'journal', layout: 'explainer', composition: 'reading-note', purpose: '阅读笔记、摘句与思考', image: 'none', length: [70, 170], structure: '一个 H1；引用块；一个 H2 下的阅读思考。', unsuitable: '密集数据、长篇引用；保留完整引文并增加手动卡片。', focus: 'body', example: 'examples/templates/T25.md' },
  {"id":"T02","name":"引语特写与证据出处","family":"editorial","layout":"quote","composition":"quotation-evidence","purpose":"观点摘引、证据提示与出处说明","image":"none","length":[90,170],"structure":"一个 H1；一个 25–45 字的引用块；两个 H2 证据短栏；来源写入 source，避免重复署名。","unsuitable":"长篇引文、三栏以上证据或宽表格；可拆成多张手动卡片，保留完整引文与出处。","focus":"quote","example":"examples/templates/T02.md"},
  {"id":"T06","name":"非对称双栏对比","family":"swiss","layout":"comparison","composition":"asymmetric-comparison","purpose":"两种方案、路径或判断方式的比较","image":"none","length":[80,140],"structure":"一个 H1；一段简短比较前提；两个 H2 对比栏，右栏适合稍长说明；后续 H2 为全宽补充。","unsuitable":"三个以上并列方案、长嵌套列表和宽表格；改用普通 comparison 多卡对比。","focus":"body","example":"examples/templates/T06.md"},
  {"id":"T09","name":"几何主题封面","family":"bauhaus","layout":"cover","composition":"geometric-cover","purpose":"概念专题开篇、工作坊主题与方法导读","image":"none","length":[80,150],"structure":"一个 6–10 字 H1；一段导语；两个 H2 短节。圆弧为标题留出独立区域，几何标记区分两段。","unsuitable":"长标题、详细教程与密集数据；改用解释卡，不缩小正文来填入封面。","focus":"title","example":"examples/templates/T09.md"},
  {"id":"T10","name":"模块拼贴概念卡","family":"bauhaus","layout":"explainer","composition":"modular-concept-collage","purpose":"概念拆解、设计原则与三段式知识介绍","image":"none","length":[80,140],"structure":"一个 H1；一段概念导语；两个 H2。导语与第一节并列，第二节为全宽综合模块。","unsuitable":"宽表格、长代码和层层嵌套的论证；可改用普通 explainer 分页。","focus":"body","example":"examples/templates/T10.md"},
  {"id":"T13","name":"超大字宣言","family":"brutalist","layout":"cover","composition":"declaration-poster","purpose":"行动主张、团队原则与明确的核心观点","image":"none","length":[80,150],"structure":"一个 6–10 字 H1 或连续 H1 标题组；一段导语；两个短 H2 论点条，标题以 2–4 字为宜。","unsuitable":"长标题、细节密集的政策与完整教程；拆卡并保留条件，不将宣言当作完整论证。","focus":"title","example":"examples/templates/T13.md"},
  {"id":"T14","name":"票据式行动清单","family":"brutalist","layout":"steps","composition":"action-ticket","purpose":"执行前检查、个人行动清单与打印任务票","image":"none","length":[80,150],"structure":"一个 H1；一句短导语；三至四项完整有序列表。编号保留输入起点，空框仅供打印后手动勾选。 本模板支持原始编号 0–99；超出请使用普通 steps。","unsuitable":"长嵌套任务、需要交互状态的待办应用；可用普通 steps 分页，不自动标记完成。","focus":"body","example":"examples/templates/T14.md","maxListNumber":99}
];

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const TEMPLATES = freeze(entries.map(entry => ({
  ...entry, version: 1, status: entry.acceptance ? 'visually-reviewed' : 'implemented-awaiting-visual-review', aspects: ['portrait'], reading: 'mobile', density: 'standard',
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


export function validateTemplateCard(card, template) {
  if (template?.maxListNumber !== undefined) {
    for (const list of card.orderedLists ?? []) {
      if (list.start < 0 || list.start + list.count - 1 > template.maxListNumber) {
        throw new Md2CardError('TEMPLATE_LIST_RANGE', `${template.id} supports list numbers 0–${template.maxListNumber}. Use the legacy steps layout for wider counters; numbers are never changed.`, { template: template.id, start: list.start, count: list.count });
      }
    }
  }
}
