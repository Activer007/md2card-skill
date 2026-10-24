# M9 / VIS-09：可选系列配方（源码候选）

## 状态与适用边界

本批只交付两份原创中文 Markdown、一个深色示例品牌配置、示例清单、非浏览器测试和待运行的真实验证脚本。没有新模板、自动组稿器、`--recipe` 参数、改写或分页算法。`recipes.json` 只供文档与 QA 读取，渲染器不读取它。

**两组新内容均未完成真实导出或视觉验收。** M1 仅 T01/T05/T17/T25 的既有 3:4 示例已验收，总数仍为 **4/24、4/48**。新内容使用其中某个模板，不会继承原示例的视觉结论；T04、T18、T21 仍为待验收候选。当前本地 Chromium 有明确沙箱拒绝，不重试、不换参数或引擎；Actions 当前禁用且本次执行授权已耗尽。本批不启用、不触发工作流，也不生成替代缩略图。

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

顺序的意图是“问题 → 阅读框架 → 口径解释 → 单一数值 → 未知边界”；这是编辑意图，不是已经看过真实成品的视觉评价。

## 配方 B：直接开始教程，固定 3 张

源文件：[mean-tutorial.md](../examples/series/mean-tutorial.md)。没有封面，也没有附送总结页或 CTA。

| 作者明确选择的角色 | 模板 | 本张职责 |
| --- | --- | --- |
| 1. 正文 / 代码 | T18 | 可独立执行的 JavaScript，120/180/150 三条虚构耗时的均值为 150 毫秒 |
| 2. 正文 / 代码 | T18 | 可独立复制的 `mean` 函数，空数组返回 `null`；定义本身不打印 |
| 3. 解释 | T17 | 交代输入、累加溢出和推论范围，不重复代码或补造性能结论 |

第一段代码四行；第二段函数六行。测试实际执行原始围栏内容，而不是另写一份“看起来相同”的代码。`mean([])` 返回 `null`，`mean([120, 180, 150])` 返回 `150`，单个零返回 `0`。输入约定为有限非负毫秒数，示例不实现完整数据清洗，也未防止累加溢出；这些限制保留在正文。

教程明确选择 [brand-tech.json](../examples/series/brand-tech.json)：名称和 Logo 与 `examples/brand.json` 一致，强调色为较浅的 `#b3dbe7`。这样不直接把浅底示例的砖红色套在深底代码卡上。没有修改默认品牌或模板 CSS；实际颜色、对比和连读节奏仍需真实手机验收，不能仅凭色值判断已通过。

## 明确的使用方式

以下命令从仓库根目录执行，**只供将来获授权、允许启动 Chromium 的环境使用；本批未运行**。品牌文件路径由当前目录解析，但品牌内 `logo` 和 Markdown 图片都相对于 `--asset-root`，不是 JSON 所在目录。两组源文件位于 `examples/series/`，因此必须明确给出 `--asset-root examples`，让 `assets/demo-logo.png` 落在可信根内。不要扩大到仓库外部。

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
```

不要给多模板配方再加统一 `--template`，它会与显式单卡选择冲突，而不是偷偷覆盖。每组选择 `standard` 密度和 1080 × 1440；这是待验证目标，不是长度适配保证，也不承诺 1:1 或 16:9。底部连续页码由现有渲染器产生，来源来自每张卡片自身。

## 本批可执行的非浏览器检查

```bash
node --test tests/series.test.mjs
npm run test:unit
node --check scripts/validate-series.mjs
```

`series.test.mjs` 验证实际生产 parser 与生成 HTML 的结构：逐卡原文、分区与模板顺序、完整 token slot 恰好出现一次、元数据/来源、品牌内嵌与连续页码。它还验证单卡不会扩增、普通输入不会被套成配方、原生编号 7–9 的回归输入保持起点、T21 缺值/缺标签拒绝、两段真实代码的结果，以及错误 asset root 与 auto 在浏览器获取前失败。

这些是源码/DOM 字符串结构检查，不是活浏览器排版检查，不证明文本尺寸、对比、溢出或美术质量。测试导入真实验证脚本时只调用纯文本提取函数，不打开浏览器或调用验证主函数。

## 将来的精确 CI 集成计划（尚未启用）

1. 取得新的执行许可并恢复可用的原有验证环境后，将本批作为独立中等大小 Draft PR 提交；不合并、不部署。以最终干净提交为对象，记录 commit、PR 基准、输入与 Logo 的 SHA-256。
2. 沿用原有 `.github/workflows/validate.yml` 的固定依赖、Node 22、Chromium、Noto CJK、Poppler、严格 preflight 与现有测试。**本批不修改工作流。** 后续获准时，在已有模板验证步骤之后增加一个步骤：`npm run validate:series`。现有 artifact 步骤已覆盖 `validation/`。
3. 干净 checkout 内的确切验证顺序如下。`validate:series` 内部执行上面的两组导出命令并继续核对；不要先执行单独导出命令再对同一非空输出目录执行它。

```bash
npm run test:unit
node scripts/render.mjs --doctor --strict --json
npm run validate:series
```

4. `scripts/validate-series.mjs` 已准备，但**整条真实浏览器路径尚未运行**。它会拒绝脏 checkout，记录实际提交和命令，核对原稿 hash、5/3 卡数、单卡模板、source hash、品牌/Logo、screen/print 溢出结果、全部 manifest 产物 hash、原生 PDF 页数，以及每一 PDF 页自己的正文/代码/出处/页码。缺工具或缺文本失败，不能记为跳过后通过。
5. 该脚本对两组**全部 8 张**分别检查 375px 与 390px 视口，记录实际卡宽、1080px 原画布、缩放比、各正文/代码/列表/来源的计算字级和有效字级、品牌与原生列表起点。当前预览边距下目标卡宽为 351/366px，改变边距必须明确更新验收条件。正文下限 14px、来源下限 11px 的机器检查只是最低门槛，不代替自然手机阅读。
6. 预期真实文件位于 `validation/series/<recipe-id>/`：逐卡原 PNG、`cards.pdf`、`cards.html`、`preview.html`、`contact-sheet.png`，以及每张各两幅 `card-NNN-mobile-375.png` / `card-NNN-mobile-390.png`。`validation/series/summary.json` 记录手机图 hash、字体与宽度实测、PDF 结果、失败项和精确来源。成功仍写 `exported-not-visually-reviewed`；不能直接改注册表验收状态。
7. 下载对应提交的 artifact 后，逐图复核全部 8 张原尺寸、16 张手机图、两份 PDF，核对中文/标点/代码、焦点、空白、读序、来源/页脚碰撞、品牌和颜色对比。联系表只辅助看连读节奏，不代替单页检查。PDF 可用以下命令生成仅供检查的栅格图，PDF 本身仍须可选择和搜索文字：

```bash
pdftoppm -png -r 96 validation/series/evidence-reading/cards.pdf \
  validation/series/evidence-reading/pdf-review
pdftoppm -png -r 96 validation/series/mean-tutorial/cards.pdf \
  validation/series/mean-tutorial/pdf-review
```

8. 在当前提交的复核记录中分别写明源码、单测、真实导出、手机、PDF、视觉六类结果。若出现溢出或阅读问题，不以字体缩小或多发卡片遮掩；修复后对新提交重跑受影响产物与全部相关检查。验收之前不发布配方缩略图，不把 M1 历史图片当作这两组新输入的证据，也不把系列当成新增模板数量。

PDF 的全文保全以逐页 `pdftotext -raw` 提取并检查每个完整源段落、代码和元数据；`-layout` 仅保留为检查产物，避免多栏视觉排齐交错造成假缺文。`inspectPdf` 仍核对页数和可检索性，不用完整多栏段落喂给其 layout 片段匹配。
