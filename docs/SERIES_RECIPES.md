# M9 / VIS-09 + R11：可选系列配方

> 当前 M2 的 48 个 standard / portrait 注册示例已独立复核，版本为 13 套 v3、35 套 v2。本轮 R11 四组共 14 张卡已完成精确 CI 产物的独立逐张复核，包含新增 C/D 六张；见 [PR21 系列复核](SERIES_PR21_REVIEW.md)。历史 v1 与 M2 A/B 八卡记录保持原样。

## 状态与适用边界

更新：2026-10-24。现有四份原创中文 Markdown、品牌配置、示例清单与验证脚本。配方 A/B 的历史验证如下，当前 M2 回归和新增 C/D 的状态分别列出，不混用验收证据。[第三次组合验证](https://github.com/Activer007/md2card-skill/actions/runs/40058009275) 首次完整导出证据阅读 5 张、均值教程 3 张，并通过全卡 375/390px 手机测量、原生 PDF 全文与来源检查。精确树为 `2d0e7278196ee71cb0ab349c4ce8b10e9ca40f41`，头提交为 `018a3bc2f0012ec6a6f83608fbd92c0a88e2f493`。

在上述历史精确树中，A/B 全部 8 张完整 PNG、16 张自然手机尺寸图、两份原生 PDF 及连续阅读均已独立复核。先前两次溢出记录保留；当时的结论来自这两组输入的完整产物，不继承单模板标准例或 M1 历史例。最终证据见 [M9 历史验收](TEMPLATE_UPGRADE_ACCEPTANCE.md)。

当前 M2 的 A/B 八卡已在 [运行 40074554707](https://github.com/Activer007/md2card-skill/actions/runs/40074554707) 完成全 PNG、375/390px 手机图及原生 PDF 的独立助手复核，绑定精确源码树 `6908866b74ad48baec0faea103f0eaf288a5e4db`。最终 compact T21 事实行修复已重测，原有引言“例。”、T04“确。”和 T25“实。”等短尾仍为非阻塞限制，不声称全部消除。详细范围见 [M2 精确验收](REFINEMENT_M2_ACCEPTANCE.md#existing-series-exactly-two-eight-cards)；这不是 C/D 或 R11 四组全量运行的验收。

没有新模板、自动组稿器、`--recipe` 参数、改写或分页算法。`recipes.json` 只供文档与 QA 读取，渲染器不读取它。5/3/3/3 张系列是四组作者明确选择的内容，不增加模板数。

本轮 R11 新增 C/D 共 6 张，明确选择 standard 密度。在 run40079867143 的四组共 14 张产物中，已逐张核对 full PNG、自然 375/390px、四份原生 PDF 和连续阅读；未见裁切、遮挡或缺失来源。A 组保留首字辨识与短尾限制；PDF 文本提取器差异未伪装为本地精确 Unicode 通过。准确输入、文件摘要、图像观察及适用边界见 [本轮复核](SERIES_PR21_REVIEW.md)。这不是所有内容、密度或字体的验收，也不是正式对比度认证。

配方是用户明确选择后的可选起点，不是改变用户原文的许可：

- 已有逐字稿或锁定卡数时，保留文字、顺序、原生列表起始编号及所有 `===`。不为套配方增加卡片、换顺序、重写或省略出处。
- 不强塞封面、摘要、重复结论、CTA、占位数据或填充段落。下面五种角色只是第一份原创示例的选择，不是系统规则。
- 用户只选一张就只渲染该张；用户允许新写/改编时，才把配方作为编辑参考。未提供数据时不能为 T21 编数值。
- 固定卡数使用默认 `manual`。含模板、来源、品牌题签等元数据的输入不兼容现有 `auto`，不能删掉这些字段绕过拒绝。
- 溢出时保留原稿和诊断，换合适的现有模板或提出需授权的编辑建议；不自动缩字、删限制条件、插页或裁掉内容。

## 配方 A：从问题走到证据边界，固定 5 张

源文件：[evidence-reading.md](../examples/series/evidence-reading.md)。全系列使用同一 FIELDNOTES 名称、Logo、砖红强调色与页脚；正文无需配图。

| 作者明确选择的角色 | 模板 | 本张职责 |
| --- | --- | --- |
| 1. 封面 | T01 | 提出“提交不等于学会”，交代虚构示例范围 |
| 2. 正文 | T05 | 三个阅读问题；有序列表原始编号为 1–3 |
| 3. 解释 | T04 | 说明同一批参与者、同一观察期、重复记录去重 |
| 4. 证据示例 | T21 | `metric: 60%` 与完整 `label` 同时存在，12/20 的分子分母相邻 |
| 5. 收尾 | T25 | 原创摘句加未解决问题，无关注/转发等 CTA |

这是教学用的**虚构记录**，不是研究结果或真实业绩。观察范围为虚构第 1 周的 7 天，20 名开始者中有 12 人提交，每人只计一次。12 ÷ 20 = 60%。未评作答质量、没有对照组，不证明掌握、进步或因果效果。出处与限制写在实际卡片里，不只写在本说明中。

顺序的意图是“问题 → 阅读框架 → 口径解释 → 单一数值 → 未知边界”。整套实际产物的独立复核确认这五张的角色变化、品牌和页序可连续阅读。

非阻塞观感限制：第一张放大的“一”在手机宽度下容易看成装饰横线，实际字形与原文均保留；这不是缺字或解析器改写。若需要更明确的文字辨识，可在后续经明确选择的设计调整中处理，当前验收不隐藏这一表现。

## 配方 B：直接开始教程，固定 3 张

源文件：[mean-tutorial.md](../examples/series/mean-tutorial.md)。没有封面，也没有附送总结页或 CTA。

| 作者明确选择的角色 | 模板 | 本张职责 |
| --- | --- | --- |
| 1. 正文 / 代码 | T18 | 可独立执行的 JavaScript，120/180/150 三条虚构耗时的均值为 150 毫秒 |
| 2. 正文 / 代码 | T18 | 可独立复制的 `mean` 函数，空数组返回 `null`；定义本身不打印 |
| 3. 解释 | T17 | 交代输入、累加溢出和推论范围，不重复代码或补造性能结论 |

第一段代码四行；第二段函数六行。测试实际执行原始围栏内容，而不是另写一份“看起来相同”的代码。`mean([])` 返回 `null`，`mean([120, 180, 150])` 返回 `150`，单个零返回 `0`。输入约定为有限非负毫秒数，示例不实现完整数据清洗，也未防止累加溢出；这些限制保留在正文。

教程明确选择 [brand-tech.json](../examples/series/brand-tech.json)：名称和 Logo 与 `examples/brand.json` 一致，强调色为较浅的 `#b3dbe7`。这样不直接把浅底示例的砖红色套在深底代码卡上。没有修改默认品牌；配方实际选择的 compact 间距经过专门校准，正文/代码/来源字号不变。颜色、对比和连读节奏已经检查真实手机图，不仅凭色值判断。

## 配方 C：先比较，再做可撤回的选择，固定 3 张

源文件：[note-format-decision.md](../examples/series/note-format-decision.md)。作者明确选择 `T06 → T24 → T14` 和 `standard`；不是把三段内容装进重复面板。无封面、指标或传播 CTA。

| 作者明确选择的角色 | 模板 | 本张职责 |
| --- | --- | --- |
| 1. 两路对照 | T06 | 纸本与数字记录的需要和限制，不预设哪方胜出 |
| 2. 条件对齐 | T24 | 用真实三列表格列出整页关系、词句检索和留存副本；A/B/C 只是索引 |
| 3. 可撤回试用 | T14 | 记录一条、隔天找回、检查退出方式；不搬走旧记录，也不声称已经完成 |

节奏从非对称双栏转到条件表，再转到纵向行动票。这里的“选择”是原创方法练习，不是产品排名或效率实验。原文保留“保存不等于备份”“一次顺手不是定论”和“保留原件”等限制；不为显得果断而删掉。沿用 [examples/brand.json](../examples/brand.json) 的名称、Logo 与砖红色。

状态：待本轮真实渲染与独立视觉复核。源码结构检查只能确认三张边界、表格、原生编号 1–3 与文字保全，不能证明手机上的舒适度或无溢出。

## 配方 D：从单幅观察到两幅对照，固定 3 张

源文件：[object-observation.md](../examples/series/object-observation.md)。作者明确选择 `T37 → T38 → T29` 和 `standard`；从图片开始，但第一张承担具体观察，不是附加封面。

| 作者明确选择的角色 | 模板 | 本张职责 |
| --- | --- | --- |
| 1. 单幅观察 | T37 | 完整托盘图配短观察，区分敞开的结构与未知容量 |
| 2. 两幅并置 | T38 | 托盘与带盖盒各自成帧；同一托盘原图复用，不伪装成前后变化 |
| 3. 留下未知 | T29 | 原创摘句与札记，明确尺寸、材质、承重未知，颜色不证明材料 |

大图信息带、两帧接触印样、留白札记三种构图对应不同的阅读任务。没有补写摄影地点、实物规格、产品价格、测评或购买建议。图注、alt 和来源都说明这是原创示意插画，不是实物照片；盒盖悬在上方只是画法，不是物理现象。

复用现有 `templates/assets/original-open-tray.png` 与 `templates/assets/original-lidded-box.png`，相对于 `--asset-root examples`。两图均为仓库从空白画布绘制的原创 900 × 430 PNG，未新增、裁切或修改图片。MIT 许可、生成脚本、尺寸和 SHA-256 见[资源溯源](../examples/templates/assets/provenance.json)及[资源说明](../examples/templates/assets/README.md)。清单逐卡声明内容图片；验证器核对原始路径、字节哈希、尺寸与许可，品牌 Logo 另计。

本组明确选择 [brand-adaptive.json](../examples/series/brand-adaptive.json)：沿用 FIELDNOTES 名称与同一 Logo，不传统一 accent。这样深底 T37 与浅底 T38/T29 使用各自模板的原生强调色，而不是强行套用同一浅色或深色。未改变任何模板或品牌默认值；实际颜色可读性仍须在本组真实手机图上确认。

状态：待本轮真实渲染与独立视觉复核。验证器已经接入图片解码/完整画幅、图注 PDF 全文和逐卡手机图片检查；尚未运行这些浏览器与 PDF 阶段。alt 是无障碍描述，不冒充可见 PDF 文字；其保全另在 HTML/图片元素中核对。

## 明确的使用方式

以下命令从仓库根目录执行，只在允许启动 Chromium 的环境使用。已有真实运行不代表任何受限本地环境也可以启动浏览器。品牌文件路径由当前目录解析，但品牌内 `logo` 和 Markdown 图片都相对于 `--asset-root`，不是 JSON 所在目录。四组源文件位于 `examples/series/`，因此必须明确给出 `--asset-root examples`，让 `assets/demo-logo.png` 落在可信根内。不要扩大到仓库外部。

```bash
node scripts/render.mjs examples/series/evidence-reading.md \
  --out validation/series/evidence-reading \
  --paginate manual --size portrait --format all \
  --asset-root examples --brand examples/brand.json \
  --title "完成，不等于学会" --footer "证据阅读 · 原创示例" \
  --strict --preview --contact-sheet

node scripts/render.mjs examples/series/mean-tutorial.md \
  --out validation/series/mean-tutorial \
  --paginate manual --size portrait --format all \
  --asset-root examples --brand examples/series/brand-tech.json \
  --title "算术平均值：三张练习" --footer "均值练习 · 原创示例" \
  --strict --preview --contact-sheet

# C/D 是新增待验证输入，以下仅为复现命令，不代表已经执行。
node scripts/render.mjs examples/series/note-format-decision.md \
  --out validation/series/note-format-decision \
  --paginate manual --size portrait --format all \
  --asset-root examples --brand examples/brand.json \
  --title "记录方式：先比较，再试用" --footer "记录选择 · 原创示例" \
  --strict --preview --contact-sheet

node scripts/render.mjs examples/series/object-observation.md \
  --out validation/series/object-observation \
  --paginate manual --size portrait --format all \
  --asset-root examples --brand examples/series/brand-adaptive.json \
  --title "物件观察：看见与未知" --footer "物件观察 · 原创示例" \
  --strict --preview --contact-sheet
```

不要给多模板配方再加统一 `--template`，它会与显式单卡选择冲突，而不是偷偷覆盖。A/B 显式选择 `compact` 密度（历史实际出图后的间距校准，正文与注释字号不变），C/D 显式选择 `standard`，四组均为 1080 × 1440。A/B 有上述历史和当前 M2 精确树的真实导出记录；C/D 没有。本清单不是任意内容长度适配保证，也不承诺 1:1 或 16:9。底部连续页码由现有渲染器产生，来源来自每张卡片自身。

## 本批可执行的非浏览器检查

```bash
node --test tests/series.test.mjs
npm run test:unit
node --check scripts/validate-series.mjs
```

`series.test.mjs` 验证实际生产 parser 与生成 HTML 的结构：逐卡原文、分区与模板顺序、完整 token slot 恰好出现一次、元数据/来源、品牌内嵌与连续页码。它还验证单卡不会扩增、普通输入不会被套成配方、原生编号 7–9 的回归输入保持起点、T21 缺值/缺标签拒绝、两段真实代码的结果，以及错误 asset root 与 auto 在浏览器获取前失败。

新增检查还覆盖 C 的对照/表格/试用顺序、D 的单幅/双幅/无图顺序、两幅原创资源的 SHA-256/许可/尺寸、内容图与 Logo 分离、无统一 accent 的作者选择，以及图片声明、溯源缺失或字节不符时拒绝。新增源码还按整段保留限制，不把图片 alt 当成可见 PDF 正文，图注则必须保全。

这些是源码/DOM 字符串结构检查，不是活浏览器排版检查，不证明文本尺寸、对比、溢出或美术质量。测试导入真实验证脚本时只调用源码文本提取和图片溯源检查，不打开浏览器或调用验证主函数。

## 历史真实验证结果与本轮复现

A/B 曾在原有只读 CI 中执行 `npm run validate:series`。当时的修复只调整所选 compact 构图的间距，保留全部原文、5/3 张显式边界、品牌、代码与数据限制。第二次运行曾因证据第 3 张和教程第 2 张溢出而拒绝整组导出；第三次运行两组均完整成功，失败未改成跳过或放宽字号。

```bash
npm run test:unit
node scripts/render.mjs --doctor --strict --json
npm run validate:series
```

验证器要求干净的精确提交和全新输出目录。不要先执行上面的单独导出命令，再让验证器写入同一非空目录。它记录提交/输入/资源/产物哈希，当前清单核对 5/3/3/3 卡数、每卡模板、品牌/Logo、全部正文与元数据、screen/print 溢出、连续页码，以及原生 PDF 页数/可检索性与逐页全文。

获准执行时，验证器会对四组共 14 张卡在 375/390px 真实视口中测量并截图。既有预览内卡宽度契约为 351/366px，正文/代码/列表和来源的实际计算字级、有效字级及品牌保留在报告中；14px 正文/11px 来源是最低技术门槛，不是人眼舒适度结论。

产物位于 `validation/series/<recipe-id>/`：逐卡 PNG、`cards.pdf`、`cards.html`、`preview.html`、`contact-sheet.png`，以及每张两幅手机图。`validation/series/summary.json` 保留精确来源、字体/宽度、PDF 和产物哈希。自动报告继续使用 `exported-not-visually-reviewed`，独立视觉结论在验收文档中另外记录，不回写机器报告。

PDF 全文保全使用逐页 `pdftotext -raw`，核对每个完整段落、代码和元数据；`-layout` 仅另存供人工查看，避免多栏排齐造成假缺文。PDF 栅格图只能辅助检查，原 PDF 仍须保留可选择/搜索的文字层。

历史及当前 M2 的 A/B 各自验收检查 8 张原图、16 张自然手机图与两份原生 PDF；本 R11 阶段四组全量复验需要 14 张原图、28 张自然手机图、四份原生 PDF 与连续阅读节奏，并核对字形/标点/代码、来源/页脚、品牌、数据分母及限定条件。联系表不能替代单卡检查。任何修复需对受影响新产物重测；不以缩字、添卡或删文掩盖溢出。
