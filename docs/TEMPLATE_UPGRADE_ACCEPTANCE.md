# 48 套模板的真实输出验收

本轮新增 44 套，加上 [M1 已验收的四套](TEMPLATE_ACCEPTANCE.md)，共 48 个独立构图，覆盖 12 个家族。字体、配色、密度和画幅变体不重复计数。

## visual-upgrade

日期：2026-10-24。范围为下列完整注册例稿，版本 1、standard 密度、portrait 3:4、1080×1440、manual。所有模板分别检查全尺寸 PNG、375 / 390 px 自然视口、原生 PDF 的 Poppler 栅格与源内容；不由 CI 绿色自动产生视觉验收。

### 精确证据

- 源码 [018a3bc2f0012ec6a6f83608fbd92c0a88e2f493](https://github.com/Activer007/md2card-skill/commit/018a3bc2f0012ec6a6f83608fbd92c0a88e2f493)，完整树 2d0e7278196ee71cb0ab349c4ce8b10e9ca40f41。
- PR 合并预览 73a74d3a3a00d00314061c41e5e58dfb16650176 与上述树一致。
- [运行 40058009275](https://github.com/Activer007/md2card-skill/actions/runs/40058009275)：327 项测试通过，0 失败、0 跳过；全部渲染套件通过。
- [原始产物 12546556001](https://github.com/Activer007/md2card-skill/actions/runs/40058009275/artifacts/12546556001)，ZIP SHA-256：419ce9625206c59a2804c095d0af1307acb87903025fada6f94410acfffc47b7。产物保留 14 天，仓库保留未改动的真实 PNG。
- [逐项输入 / PNG / PDF / 手机哈希](template-upgrade-provenance.json)；图库另外校验代码、证据、审查记录、原始输入和 PNG。M1 四张 PNG 与既有固定证据保持逐字节相同。

| 设计 | 预览 | 原文 | 独立构图 |
| --- | --- | --- | --- |
| T02 引语特写与证据出处 | [真实 PNG](images/templates/T02.png) | [完整输入](../examples/templates/T02.md) | quotation-evidence |
| T03 图文分栏人物与概念介绍 | [真实 PNG](images/templates/T03.png) | [完整输入](../examples/templates/T03.md) | portrait-editorial-spread |
| T04 专题长文分节 | [真实 PNG](images/templates/T04.png) | [完整输入](../examples/templates/T04.md) | sectioned-editorial-essay |
| T06 非对称双栏对比 | [真实 PNG](images/templates/T06.png) | [完整输入](../examples/templates/T06.md) | asymmetric-comparison |
| T07 网格知识地图 | [真实 PNG](images/templates/T07.png) | [完整输入](../examples/templates/T07.md) | root-branches-synthesis-grid |
| T08 极简步骤导航 | [真实 PNG](images/templates/T08.png) | [完整输入](../examples/templates/T08.md) | paired-step-navigation |
| T09 几何主题封面 | [真实 PNG](images/templates/T09.png) | [完整输入](../examples/templates/T09.md) | geometric-cover |
| T10 模块拼贴概念卡 | [真实 PNG](images/templates/T10.png) | [完整输入](../examples/templates/T10.md) | modular-concept-collage |
| T11 圆形节点流程 | [真实 PNG](images/templates/T11.png) | [完整输入](../examples/templates/T11.md) | circular-heading-node-flow |
| T12 几何分区四象限 | [真实 PNG](images/templates/T12.png) | [完整输入](../examples/templates/T12.md) | geometric-quadrant-field |
| T13 超大字宣言 | [真实 PNG](images/templates/T13.png) | [完整输入](../examples/templates/T13.md) | declaration-poster |
| T14 票据式行动清单 | [真实 PNG](images/templates/T14.png) | [完整输入](../examples/templates/T14.md) | action-ticket |
| T15 粗线双阵营对照 | [真实 PNG](images/templates/T15.png) | [完整输入](../examples/templates/T15.md) | two-camps-shared-wall |
| T16 黑白撞色观点合集 | [真实 PNG](images/templates/T16.png) | [完整输入](../examples/templates/T16.md) | offset-monochrome-opinion-sheets |
| T18 终端式技术教程 | [真实 PNG](images/templates/T18.png) | [完整输入](../examples/templates/T18.md) | terminal-tutorial |
| T19 系统模块架构 | [真实 PNG](images/templates/T19.png) | [完整输入](../examples/templates/T19.md) | shared-input-module-matrix |
| T20 深色产品功能展示 | [真实 PNG](images/templates/T20.png) | [完整输入](../examples/templates/T20.md) | feature-pair-interface-stage |
| T21 单指标聚焦 | [真实 PNG](images/templates/T21.png) | [完整输入](../examples/templates/T21.md) | single-metric-focus |
| T22 三指标证据板 | [真实 PNG](images/templates/T22.png) | [完整输入](../examples/templates/T22.md) | three-metric-evidence-board |
| T23 问题—行动—结果案例 | [真实 PNG](images/templates/T23.png) | [完整输入](../examples/templates/T23.md) | problem-action-result-bridge |
| T24 报告式对比表 | [真实 PNG](images/templates/T24.png) | [完整输入](../examples/templates/T24.md) | report-table-decision-note |
| T26 批注式学习清单 | [真实 PNG](images/templates/T26.png) | [完整输入](../examples/templates/T26.md) | annotated-study-checklist |
| T27 时间线学习计划 | [真实 PNG](images/templates/T27.png) | [完整输入](../examples/templates/T27.md) | dated-study-timeline |
| T28 索引卡知识整理 | [真实 PNG](images/templates/T28.png) | [完整输入](../examples/templates/T28.md) | numbered-index-slips |
| T29 题签留白书摘 | [真实 PNG](images/templates/T29.png) | [完整输入](../examples/templates/T29.md) | title-label-quotation |
| T30 横排诗文与小景 | [真实 PNG](images/templates/T30.png) | [完整输入](../examples/templates/T30.md) | horizontal-poem-small-scenery |
| T31 印章式个人语录 | [真实 PNG](images/templates/T31.png) | [完整输入](../examples/templates/T31.md) | personal-quotation-geometric-seal |
| T32 书页章节解读 | [真实 PNG](images/templates/T32.png) | [完整输入](../examples/templates/T32.md) | chapter-excerpt-facing-reading |
| T33 报头式主题导读 | [真实 PNG](images/templates/T33.png) | [完整输入](../examples/templates/T33.md) | newspaper-masthead |
| T34 专栏式观点分析 | [真实 PNG](images/templates/T34.png) | [完整输入](../examples/templates/T34.md) | column-analysis |
| T35 剪报拼贴资料卡 | [真实 PNG](images/templates/T35.png) | [完整输入](../examples/templates/T35.md) | dated-source-clipping-stack |
| T36 大标题事件回顾 | [真实 PNG](images/templates/T36.png) | [完整输入](../examples/templates/T36.md) | headline-event-record |
| T37 大图与底部信息带 | [真实 PNG](images/templates/T37.png) | [完整输入](../examples/templates/T37.md) | film-hero-band |
| T38 接触印样式记录 | [真实 PNG](images/templates/T38.png) | [完整输入](../examples/templates/T38.md) | contact-print-record |
| T39 人像与侧栏故事 | [真实 PNG](images/templates/T39.png) | [完整输入](../examples/templates/T39.md) | portrait-field-story-sidebar |
| T40 局部特写与知识注释 | [真实 PNG](images/templates/T40.png) | [完整输入](../examples/templates/T40.md) | explicit-detail-numbered-key |
| T41 色块问答 | [真实 PNG](images/templates/T41.png) | [完整输入](../examples/templates/T41.md) | color-block-question-answer |
| T42 贴纸式步骤卡 | [真实 PNG](images/templates/T42.png) | [完整输入](../examples/templates/T42.md) | sticker-steps |
| T43 漫画分镜知识解释 | [真实 PNG](images/templates/T43.png) | [完整输入](../examples/templates/T43.md) | comic-two-scenes-wide-resolution |
| T44 趣味双选项对比 | [真实 PNG](images/templates/T44.png) | [完整输入](../examples/templates/T44.md) | dimension-led-paired-dialogues |
| T45 植物留白笔记 | [真实 PNG](images/templates/T45.png) | [完整输入](../examples/templates/T45.md) | botanical-margin-note |
| T46 暖色材料质感指南 | [真实 PNG](images/templates/T46.png) | [完整输入](../examples/templates/T46.md) | material-guide |
| T47 料理步骤图文 | [真实 PNG](images/templates/T47.png) | [完整输入](../examples/templates/T47.md) | ingredient-band-illustrated-method |
| T48 生活方式产品比较 | [真实 PNG](images/templates/T48.png) | [完整输入](../examples/templates/T48.md) | product-specimen-comparison-rows |

### 实际阅读与边界

375 / 390 px 视口的内卡宽为 351 / 366 px；正文最小有效字号为 15.093 / 15.738 px，来源/标签为 11.7585 / 12.261 px。代码、表格、面板不通过嵌套倍率缩小正文。每个完整输入仍须满足契约和 screen / print 溢出检查；推荐长度不是任意文本都能放入的保证。

T34 的浮动首字保留全部字词和视觉读序，但 PDF 原始抽取把首字放到其 H2 前面，整段复制或搜索的逻辑顺序不保证连续。其视觉批准不扩张成普遍的 PDF 文本抽取保证。

部分窄栏有意形成短行；T16 的末行孤字、T18 较紧的代码框、T20 缩略插图微字、T26 较大的下部留白、T38 重复栏目序号和 T43 较小的步骤图属于已记录的非阻断限制。T36 的链接标签完整保留但有窄行换行；T40 的图内 1/2 编号较小，只适用于简单对应关系。插图不作为可读正文的替代。

### 校准记录

[真实失败与修复记录](RENDER_CALIBRATION.md) 保留两次失败运行：先修复 CommonMark 强调边界、旋转装饰范围与过量间距，再只处理五个未通过的构图及 compact 系列。未删除原文、未降低字阶、未关闭溢出保护、未自动裁图。T35 标题与日期共用标签行，T48 图像与字段形成完整产品行；它们不是只换颜色的变体。

同一段落跨 8 个模板、同一引用/编号输入跨 4 个模板分别比较，输入哈希固定。18 个压力案例包括密度、长文拒绝、嵌套列表、长 URL、中文代码注释、表格和完整图片；22 个画幅案例包含短例、原文与过量输入。具体复核范围见 [完整清单](VISUAL_BACKLOG_STATUS.md)。

### 其他真实验收不重复计数

[T04 / T21 的四个独立画幅重排](TEMPLATE_ASPECTS.md) 只证明四个指定短例，其他 46 个模板仍拒绝未实现的比例。

[5 卡证据阅读与 3 卡教程](SERIES_RECIPES.md) 是作者显式选择的 compact 配方，不会自动给用户补封面、总结或承诺。[可选尾页平衡](TAIL_BALANCING.md) 保持原编号、表头、来源与分区。图库的等效 200% reflow 不是原生浏览器缩放或完整读屏认证。
