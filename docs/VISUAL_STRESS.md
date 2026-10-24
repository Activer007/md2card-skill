# M8b：Notebook 标题避线与有界视觉压力矩阵

状态：源码与非浏览器测试已完成；真实 Chromium、PNG、375/390 手机预览、PDF 与人工视觉验收均待完成。已实现设计仍为 48 个，历史已验收仍为 4 个。本批没有提高验收计数，也没有把源代码检查当成真实排版通过。

## 变更边界

唯一生产样式改动是在旧 Notebook 的内容区域，给 H1–H6 的局部元素盒设置纸色背景。原有纸张横线仍在，字号、行距、边距、装饰位置均不变；没有改共享 layouts.css 或 templates.css。这会在标题盒内遮住横线，不承诺替代真实字形/换行复核。Bold 连续 H1 和企业虚构品牌一致性已有回归，本批不重复改造。

不修改解析器、资源 resolver、安全预算、默认 manual、auto 的支持范围或显式 ===。压力测试不自动缩字、裁图、删文、补结论，也不把极端输入变成新的支持承诺。尾页平衡属于独立 M8a，不在此批混入。

## 18 个案例，而非全排列

已有 validate-templates 负责 48 个自然示例的 standard 导出和大段落拒绝。本矩阵补充针对性检查，不重复声称覆盖 48 × 3 × 所有输入。

| 案例 | 设计与密度 | 目的 / 预期 |
| --- | --- | --- |
| short-compact / standard / editorial | T01，三种密度 | 同一原始短文，不同间距；比对计算字级不能变小 |
| medium-nested-url | T04 compact | 三层完整嵌套列表、中英混排、长 URL；链接不请求网络 |
| medium-code | T18 standard | 三行代码，含一条较长中文注释；原文字句与等宽字号保留 |
| medium-table | T24 editorial | 三列三行，短编号和较长说明；不是任意宽表承诺 |
| long-compact / standard / editorial | T04，三种密度 | 相同超长完整段落，应 CONTENT_OVERFLOW / exit 2，只发布诊断 |
| notebook-headings | 旧 Notebook | 两页、连续 H1 和 H1–H6；保留 ===，标题盒局部遮线 |
| image-landscape / portrait / alpha | T37 / T39 / T45 standard | 复用准确标注的原创/AI 合成素材；完整图片与透明性 |
| image-screenshot | T20 standard | 复用历史真实 T17 浏览器卡片截图，非产品界面截图，非当前验收证据 |
| image-extreme-wide / tall | T37 standard | 原创 20:1 / 1:20 边缘标记图；contain 保全，允许明显留白 |
| asset-missing / corrupt | T37 standard | INVALID_ASSET / exit 1；在浏览器前拒绝，不发布产物 |

短文三档是严格同文比较，正文 SHA-256 相同；注入的 density 元数据不同，所以完整输入 SHA-256 不同。中等语料按适用设计分别测试，不伪称同文横比。长段落是拒绝边界，不能记为内容已适配。真实人像、复杂产品 UI 截图、裁切模式、无限长列表/代码/表格不在此矩阵的通过承诺内。

## 可执行入口

本地只运行源检查，不会启动浏览器、联网或生成卡片截图：

```sh
npm run test:unit
npm run validate:visual-stress -- --plan --out validation/visual-stress-plan
```

只有以后获得许可、具备 Chromium、中文字体和 Poppler 的环境才能运行：

```sh
npm run validate:visual-stress
```

默认执行真实严格导出，包含 HTML、PNG、原生 PDF、preview 和 contact sheet。不会因浏览器不可用自动降级成通过。--plan 只产出源检查计划，summary 的 browser 为 not-run、visualReview 为 not-performed，状态是 source-checked-browser-pending。

输出默认在 validation/visual-stress。目录非空则拒绝，使用新的 --out，不删除已有证据。源计划与实际执行应使用不同目录。保存每案例输入、命令参数数组、完整输入和正文哈希、源资源尺寸/哈希，以及 source-files.json 中引擎、测试、示例、依赖配置和历史截图来源文件的内容哈希。该文件清单哈希不是 Git tree；在 Git 工作树内还记录 HEAD、tree 和 dirty，不能拿有未提交改动的 HEAD 冒充精确测试源码。

逐案例捕获错误并持续写 summary，前一案例失败不隐藏后续失败。缺失输入也占据其原有案例。成功导出需检查发布 manifest、所有产物哈希和唯一文件名、模板/密度、样式哈希、screen/print、PDF 页数/可检索性、资源数量与哈希。图片失败不能因为空 img 集合而通过。预览逐页检查真实 351/366px 内卡、正文/来源计算字级、图片原字节/尺寸/contain 和 Notebook 标题层级/背景；手机审查有单独的有限时长和清理路径。

原文段落、标题、列表项、表格单元格、完整代码块与可见元数据从源 tokens 获取，不从可能已缺文的输出反推。cards.html、preview.html 和每页 PDF 都核对全部原文片段及重复次数；PDF 使用逐页 pdftotext -raw，保留 raw 文本与哈希。-layout 只另存供人工查看，因为多栏文本会交错，不能用它误判完整段落缺失，也不能退回只查一个 marker。空白归一化仅用于应对 PDF 换行，不代表源码被改写；语义与布局仍须人工复核。

字阶仍采用现有模板基线：375px 视口对应 351px 内卡，正文约 15.093px，390 对应 366px、约 15.738px。自动最低门槛沿用正文 14px、来源 11px，不等于人眼已确认舒服，也不适用于未改字阶的旧 Notebook。模板密度仅改间距；脚本比较短文三档的实际计算字级。

## 素材与实际验收

examples/visual-stress/assets 的两张极端比例 PNG 是原创代码图案，源码及 SHA-256 均随附。corrupt.png 是有意写成无效签名的文本，missing 路径必须不存在。可用 node scripts/create-visual-stress-assets.mjs 重建；这些图案是测试输入，不是模板预览，更不是伪造的渲染截图。

横图、人像、alpha 插画复用 examples/templates/assets，身份/来源仍按该目录 provenance；历史截图复用 docs/images/templates/T17.png，SHA-256 对照 docs/template-m1-provenance.json。四张 M1 历史 PNG 均有源测试固定哈希。未来应由 validate-templates 的默认示例回归比较新的 M1 像素；差异必须重新审阅，不能继承历史验收。

本批在 m7-source-reviewed 隔离快照的 npm run test:unit 为 187/187、0 跳过；包含 12 项新源/故障测试，控制替身只证明汇总、超时/清理、全文段落核对和错误路径，不证明浏览器排版。独立源码审查发现并修复：移动审查无总截止时间、空图片检查可能误通过、单个缺失 fixture 可中止整个矩阵；另外收紧了产物唯一性、样式/资源哈希和标题层级核对。

仍待执行：真实导出、所有页面在原尺寸和手机尺寸逐图检查、PDF 内容/分页人工核对，以及四个 M1 默认像素回归。本地 Chromium 已被沙箱明确拒绝，未重试或换引擎；Actions 未启用。脚本通过也只会标记 browser-checked-visual-review-pending。图片祖先裁切、文字重叠、对比与观感不能仅靠 object-fit 或文件哈希证明，须看真实产物。

## 集成后的补充门槛

`validate-templates` 另加四套 M1 默认输入/PNG 的历史哈希比较；变化时明确失败并要求新逐图复核，绝不自动刷新证据。原同文对照不变，另以一份含引用和从 7 开始列表的原文比较 T02/T05/T14/T25，避免只用纯段落判断引用/编号设计。48 套长文边界的所有失败都会收集到 summary，不因一个异常遗漏后续模板。workflow 在单元/必需浏览器测试通过后分别执行各导出套件，即使前一导出套件失败也收集其余结果；不会忽略失败或扩展 workflow 权限。
