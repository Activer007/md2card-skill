# M2a：T20 显式 screenshot-stage

仅在手动分页的 T20 中添加 `"visualVariant":"screenshot-stage"`。沿用 `image`、`alt`、`caption`、`source`，没有平行的 `imageRole` 接口。可运行仓库中的完整样例：

```sh
node scripts/render.mjs examples/visual-upgrade/t20/original.md --asset-root . --out output/t20-stage --preview --strict
```

本模式把完整图片移到标题之后、正文之前，使用原创纯色细线框舞台，并把图片高度上限从画板的 40% 提至 52%。图片始终正交、居中、contain；不添加假浏览器控件、数字或 UI 数据。标题、正文、图注和来源的字号不变，过量内容仍以 `CONTENT_OVERFLOW` 失败。

## 范围与兼容

- 只支持 T20 现有 portrait 画幅；其他模板、未知枚举、非字符串、自动分页、square/slide、额外行内图片均拒绝。
- 继续使用既有本地图像解析器。远程 URL、路径穿越、file/data URL、SVG、任意 CSS 等不会被放行。
- 未指定新字段时，不输出新增属性或 CSS。原 96 个独立 HTML 基线哈希逐一通过；另从 main `d73f405` 的 Git archive 执行旧 renderer，对原 T20 验证 HTML、PNG、PDF 页面像素完全相同。PDF 文件包含时间元数据，因此不以文件字节相同代替页面和文字验证。
- `assets/templates.css`、原 T20 样例/图像和模板版本保持原样。有限的兼容性证明只覆盖无 `visualVariant` 的旧输出，不为新构图授予历史验收。
- 推荐 CLI 保留新字段；其 `acceptedExample` 为 null，明确指出没有该变体的独立图库验收。现有 48 模板图库仍展示原默认构图。

## 实测与视觉范围

Windows / Chrome 156.0.8078.48；真实 Fontconfig 2.18.3、Poppler 26.09.0。最终 T20 标题与正文实际使用 Noto Sans SC，来源使用 Microsoft YaHei / Cascadia Mono。工具只放在忽略的验证目录，没有修改系统安装或捆绑字体。

| 输入 | 默认实际占宽 | 新模式实际占宽 | 结论 |
| --- | ---: | ---: | --- |
| 1600×900 桌面截图 | 89.6% | 89.6% | 已受横向内边距限制，主要改变视觉顺序 |
| 1200×900 桌面截图 | 71.1% | 89.6% | 截图宽度约增加 26%，完整展示 |
| 原 T20 1400×900 图像 | 83.0% | 89.6% | 实际面积增大，图像身份不变 |
| 高密度 1600×900 UI | 89.6% | 89.6% | 图片完整；手机上微字不可读 |
| 390×3000 长截图 | 6.9% | 9.0% | 完整但很窄；不适合手机阅读界面细节 |

占宽使用 `object-fit: contain` 后的真实图像矩形，不拿宽大的外框替代截图。375px 视口卡片宽 351px，390px 视口卡片宽 366px；89.6% 对应约 314.5 / 327.9px 的截图宽度。≥70% 是普通桌面截图的定向目标，不是所有素材的通用门槛。图像像素不会因为放大画板而自动增加。

原图、16:9、4:3、高密度 UI、长截图、长标题、长来源及较长正文均有默认/新模式成对输出。非法图片和超长正文有成对拒绝记录。所有成功案例同时检查 screen/print、PNG、375/390px、原生单页 PDF、图片 SHA-256、原文/数字/免责声明。正文 46.44px；手机以画板整体缩放显示，没有另行缩小正文来容纳图片。

PDF 保留真实文字层。`pdftotext -layout` 会交错双栏同一横行，完整段落覆盖采用 `-raw` 阅读顺序逐段检查；两种提取结果均保存。只使用 NFC 和空白规范化，不用 NFKC 替换汉字。此结论仅覆盖本批样例，不追溯修改 M0 的历史提取器发现。

代理已逐组查看成功案例的全卡、两种手机截图和 PDF 栅格；标题、正文、来源和免责声明无截断、覆盖或缺字。另单独查看存在像素取整差异的 print 截图。高密度 UI 和长截图的微字问题明确保留。维护者人工批准尚未进行；本次只交付 Draft PR。

## 重现与证据

使用 `scripts/validate-screenshot-stage.mjs --allow-browser --out <空目录> --baseline-root <可信 main Git archive 目录> --browser <Chromium>`。PATH 必须提供真实 `fc-list`、`fc-match`、`pdfinfo`、`pdftotext`、`pdftoppm`。不要以替身程序或非严格模式生成通过声明。`baseline-root` 是可信代码路径；无需新 worktree。

原创测试 UI 的 HTML、PNG 与生成脚本在 `examples/visual-upgrade/t20/`。它们明确标注虚构，记录编号只是演示序号；未复制 Guizang 的 HTML/CSS/素材。生成器先检查页面本身没有溢出，再保存截图。

独立证据与所有文件 SHA-256 见 [M2a 证据清单](m2a-evidence.json) 和 [原始证据包](../evidence/t20-screenshot-stage-m2a.zip)。[新旧逐例对照](M2A_COMPARISONS.md) 展示全卡、375、390 与 PDF 四列。旧图库与 M0 证据未覆盖或重写。

## 审查与验证

- 修复推荐说明可能借用默认模板视觉验收的问题；JSON/文本均明确保持变体验收独立。
- 修复测试 UI 自身内容超出截图视口的问题，加入生成阶段的滚动高度断言。
- 原 96 输出哈希不变；默认 T20 的 HTML/PNG/PDF 页面与 main 直接比较一致。
- 现有单元测试 593 通过、3 跳过；新增与 T20 相关定向测试 10 通过；真实浏览器导出/分页集成测试 21 通过、无跳过；图库生成检查通过。
- 推荐描述修复后，推荐 CLI、纯推荐器与新变体测试另外复跑 26 项，全部通过。16 份成功输出和 12 个拒绝路径的全部证据文件逐一校验哈希。
- 不自动合并；维护者可结合证据包继续进行人工视觉验收。

## 改动文件

- `scripts/markdown.mjs`、`templates.mjs`：受控字段、模板/图片约束；`document.mjs`：条件化构图与 CSS；`render.mjs`：manifest 记录显式变体。
- `scripts/template-recommender.mjs`、`recommendation-guide.mjs`：变体读序、独立验收状态；`default-body-compatibility.mjs` 与新的兼容 JSON：保持旧默认证据的严格哈希链。
- `scripts/validate-screenshot-stage.mjs`、`tests/screenshot-stage.test.mjs`、`package.json`：真实验收及测试入口。
- `examples/visual-upgrade/t20/`、`references/rendering.md`、本目录的 M2a 文档/清单、`docs/images/visual-upgrade/t20/`、独立证据 ZIP：正反样例、使用说明与可审阅产物。
