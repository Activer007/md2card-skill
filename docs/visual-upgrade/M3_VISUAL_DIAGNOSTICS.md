# M3：可解释的视觉诊断（可选）

在 PR #29 已合并的 main `07ff4808dfd8fed73422d240dac5336ad1733566` 上实现。复用当前 worktree。已阅读 measureCards、overflow/manifest、tail-balance occupied、模板 family/composition/aspect，以及四组系列配方。M2 的 T20 screenshot-stage 和 T37 photo-cover 及其 photo-zone 安全检查均保留。

```powershell
node scripts/render.mjs examples/series/evidence-reading.md --asset-root examples --out output/audit --visual-audit --format all
```

默认关闭。开启后增加 `visual-diagnostics.json`，并作为有字节数和 SHA-256 的产物记入 manifest。没有增加自动调整、自动补文、删来源、缩字或换模板功能。旧 manifest 的 `qa.visualReview: "not-performed"` 不变，报告的 `humanVisualReview` 也始终为 `not-performed`。报告没有综合分、自动视觉通过或新的 hard fail。

## 实测与定位

在同一个已加载、字体就绪、图片已解码的 Chromium 文档中，分别读取 screen 和 print；不新增渲染会话、分页探测或按字数估算。已有 measureCards 的 occupied 语义保持不变，tail-balance 不消费本报告。

文字采用每个实际非空文本节点的 Range 行矩形；图片采用内容盒、naturalWidth/Height、object-fit/object-position 算得的可见绘制区域，contain 留边不当作图片。角色包括 title、content、image、eyebrow、caption、metric、source、footer。每个矩形有卡片索引、CSS selector、证据 ID；每张卡另有 sourceLines、模板、family、composition、aspect、variant 和 media。

坐标是卡片局部 CSS px，不是 PNG 的设备像素；PNG 需乘 --scale。四横带位于 card-content 内，面积用矩形并集消除嵌套、重叠重复计数，同时给出文字面积和全部前景面积。来源/页脚单独保留，不能用贴底来源掩盖正文下方空白。

CSS 背景、阴影、伪元素、空网格/flex 容器不计入内容。aria-hidden、隐藏内容、presentation 图片及页脚品牌图不计入前景；无明确内容身份的绝对定位满铺图片视为背景。显式 .card-image 和 figure 里的照片保留，照片不能因为画幅大就被误删。复杂 transform/object-position 未支持时标明未评估。

## 规则版本 1.0.1 / JSON schemaVersion 1

PR #30 审查修复：先完成 screen/print 两项硬溢出检查，再在原文档中采集视觉几何；可选采集异常不能掩盖 CONTENT_OVERFLOW。文字/图片自身及卡片内祖先容器的 transform、独立 rotate/scale/translate、zoom 未支持时明确标记未评估。初版 1.0.0 证据归档保持不变，最新复核见 [PR30_REVIEW.md](PR30_REVIEW.md)。

| ID | 测量和参考阈值 | 严重性与例外 |
|---|---|---|
| VD-01 | 最后标题行至第一正文行的垂直距离；小于 8 px 或超过 max(96 px, 1.5 × 标题行高) | WARN；并排构图、插入图片/指标、photo-cover 有显式例外；摄影大间距为例外。长标题使用实测换行。 |
| VD-02 | 四个等高横带的前景并集面积/横带面积；至少两个横带小于 8% | INFO；摄影、书摘、短宣言、封面、引语布局有显式例外。不是“填到 75%”要求。 |
| VD-03 | 正文区域末端至最后前景的空白高度/正文高度，大于 25% | 普通报告 WARN；上述有意留白类型 INFO/excepted；绝不 hard fail。 |
| VD-04 | T20 或显式 screenshot 角色：图片实绘面积小于卡片 20%，或宽度小于正文 55% | WARN；非截图/无图 not-applicable。只建议检查完整图放大或作者提供细节图，不建议自动裁切。 |
| VD-05 | 相邻至少两卡具有相同 family + composition + aspect + variant | 始终 INFO；表格可能续页、auto 分页有显式例外；不声称能推断作者意图。 |
| VD-06 | DOM 文字与实际图片区域存在交叠，或明确 photo-cover | WARN/human-review-required；无 DOM 叠字不代表栅格内部没有字，仍记录 OCR 未执行。 |

每条检查都带 measured、threshold、exceptions（适用清单）、exception（本次实际应用）、severity、status、evidence 和 advice。within-reference 仅表示位于该条几何参考范围，不是视觉验收。excepted 仍保留原始测量。not-evaluated 不作为低密度判断。

## 安全和预算

CONTENT_OVERFLOW 及现有屏幕/打印/PDF/图片/来源检查不变。有硬溢出时只发布原来的 overflow.json（exit 2），不会同时输出成功的视觉报告。诊断报告也受原有 256 MiB 总输出限制、120 秒默认/600 秒最大总 deadline、200 卡与像素/图片限制约束。

采集另设更小的上限：每次媒体测量至多 40000 节点、20000 矩形，每卡 1024 矩形、深度 64。到达上限则该卡未评估，后续卡如缺失采集也明确报告；不放宽主渲染预算。矩形并集算法 O(n log n)，不把容器堆叠面积相加。

## 已知误报、漏报和人工检查

- Range 是文字行框，不是字形墨迹。大字号的 ascender/descender、行高和字形留白可能让框相交而肉眼不重叠；负间距只能提示复核。
- T21 大指标原先被当成首段，造成标题间距误报；增加 metric 角色和插入指标例外。T38 摄影双图的意图性大间距有显式摄影例外。
- evidence-reading 的 T05 下方空白可能触发 VD-03；短清单本来可能需要呼吸空间。这是待人判断的建议，不能以填字消除告警。
- mean-tutorial 前两张 T18 是有意连续教程；VD-05 仍提供 INFO，不是缺陷判定。表格例外同样只是可能的连续结构，不证明作者意图。
- 栅格内部文字、照片主体、真实对比度、遮挡、阅读顺序、阴影/伪元素的干扰不由本工具识别。没有 DOM 叠字的截图仍需人看实际字号；VD-04 的面积达标也可能完全读不清。
- 图片面积是整个栅格画布的绘制面积，不能识别图片内部的白边、透明区域或有效信息面积；这些可能造成面积偏高的漏报。
- 单个长文本节点的 Range 框、inline 强调和字体差异会影响密度；不得拿这个数跨不同字体评比质量。未覆盖的特殊变换会未评估或记录局限。
- 首轮 T20 tall-phone 在 legacy 页脚下触发原有 CONTENT_OVERFLOW；最终样例采用既有 M2 验收的 poster 配置。原失败日志保留，不修改原文来让测试通过。
- 本次截图检查是实施时的证据核对，不替代用户逐图视觉签收。所有机器产物保持人工视觉未检查；不提升任何历史图库状态。

## 验证与交付入口

`tests/visual-diagnostics.test.mjs` 包含六条规则各一正一反、例外、实测 screen/print 与独立 Range 值一致、长标题、满铺背景/空容器排除、contain 图片面积、真实 footer 重叠、200 卡采集上限，以及 CLI 默认关闭、deadline 和 CONTENT_OVERFLOW 生命周期。

`scripts/validate-visual-diagnostics.mjs` 先将基线源码与固定 main Git blob 核对，再执行独立旧版本对照；覆盖四组系列（5/3/3/3 卡）、竖截图/横截图、photo-cover、三行标题、短宣言、低密度报告及拒绝样例。实际 PNG、screen/print 截图、原生 PDF、完整 JSON 和误报日志随证据归档交付。兼容性证明只适用于未启用 --visual-audit，不赋予新诊断任何视觉验收。

交付归档为 `docs/evidence/m3-visual-diagnostics.tar.xz`，解压后打开 `index.html`。验证结论见 [实施审查](M3_REVIEW.md)，归档身份见 [m3-evidence.json](m3-evidence.json)。复现命令：先将 main `07ff480` 用 git archive 解到 `validation/m3/baseline`，再运行 `node scripts/validate-visual-diagnostics.mjs --allow-browser --baseline-root validation/m3/baseline --out validation/m3/fresh --browser <Chromium路径>`；需真实 Fontconfig 与 Poppler，输出目录必须为空。不会更新历史证据，也不会自动把新证明写入源码。
