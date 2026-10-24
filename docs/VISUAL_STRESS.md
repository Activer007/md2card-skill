# M8b：Notebook 标题避线与有界视觉压力矩阵

更新：2026-10-24。[第三次组合验证](https://github.com/Activer007/md2card-skill/actions/runs/40058009275) 已通过全部 **18 个预期结果**：13 个案例成功导出，3 个长原子段落按要求溢出拒绝，2 个缺失/损坏素材在浏览器前拒绝。成功导出包含实际 PNG、375/390px 手机图和原生 PDF；机器 gate 与独立视觉结论分开记录。

其余成功案例已在先前运行检查；本轮 compact 嵌套列表/长 URL 的新完整 PNG、两种手机图及原生 PDF 也已独立复核通过，嵌套层次和完整链接保留。精确头为 `018a3bc2f0012ec6a6f83608fbd92c0a88e2f493`，树为 `2d0e7278196ee71cb0ab349c4ce8b10e9ca40f41`。最终结论及证据继承条件见 [本轮验收](TEMPLATE_UPGRADE_ACCEPTANCE.md)，历史失败保留在 [真实出图校准](RENDER_CALIBRATION.md)。

## 变更边界

旧 Notebook 的 H1–H6 局部元素盒增加纸色背景，遮住标题后的横线；原纸张纹理、字号、行距、边距和装饰位置不变。真实检查确认标题避线与页面完整性，**不代表旧 Notebook 小字号已经达到新模板的 mobile 阅读标准**。Bold 连续 H1 及 FIELDNOTES 企业虚构品牌一致性的完整 PNG/PDF 另有复核，本轮没有它们的新 375/390px 手机截图。

集成校准还针对 T04 compact 嵌套结构、T18 代码宽度、T24 表格分配和 T20 完整截图展示调整实际布局。正文、代码、表格与来源字号不变；未修改 parser、资源 resolver、安全预算、默认 manual、auto 支持范围或显式 `===`。尾页平衡属于独立 M8a，不以压力矩阵代替其实际迁移检查。

## 18 个案例，不是全排列

| 案例 | 设计与密度 | 实际 gate 结果及范围 |
| --- | --- | --- |
| short-compact / standard / editorial | T01，三密度 | 同一短文均导出，计算字级一致，仅间距变化 |
| medium-nested-url | T04 compact | 三层完整嵌套项、中英混排、长 URL 均保留；本轮导出及原图/手机/PDF 复核通过，链接不请求网络 |
| medium-code | T18 standard | 三行代码与较长中文注释保全；原尺寸、两手机宽度与 PDF 已检查 |
| medium-table | T24 editorial | 三列三行、短编号及长说明对应；原尺寸、两手机宽度与 PDF 已检查 |
| long-compact / standard / editorial | T04，三密度 | 同一超长完整段落均返回 `CONTENT_OVERFLOW` / exit 2，仅发布诊断 |
| notebook-headings | 旧 Notebook | 两页及 H1–H6 完整，标题盒遮线；不升级旧小字号结论 |
| image-landscape / portrait / alpha | T37 / T39 / T45 standard | 复用注明来源的横图、合成人像与透明插画；完整图像保全 |
| image-screenshot | T20 standard | 保全历史真实 T17 卡片截图；图片内微字不承诺自然手机可读 |
| image-extreme-wide / tall | T37 standard | 原创 20:1 / 1:20 边缘标记图完整 contain，明显留白是保全比例的结果 |
| asset-missing / corrupt | T37 standard | 均为 `INVALID_ASSET` / exit 1，在浏览器前拒绝、不发布成功产物 |

短文三档正文 SHA-256 相同，density 元数据不同，所以完整输入哈希不同。中等语料按适合的设计分别测试，不能称为同一原文横比。预期拒绝证明防护生效，不代表长内容已适配。矩阵不覆盖 48 × 3 密度、所有内容长度、任意宽表、无限长代码/列表、真实人物摄影、复杂产品 UI 或裁切功能。

## 必须保留的图片限制

历史截图是本项目此前真实导出的卡片，不是产品界面截图，也不是当前输入的验收预览。其完整像素和边界得到保全，但手机内约 70×93px 的嵌入图无法让内部微字自然阅读。通过的是完整图像与外部可读标题、说明、来源；需要阅读内部内容时应查看原图或选择更大的独立图文版式。

合成人像/插画按输入 provenance 标注，不冒充真实人物照片。极端比例 PNG 是原创程序测试图案，不是模板预览。`corrupt.png` 故意无效，missing 路径必须不存在；不能将错误素材替换成占位图骗过测试。图片哈希和 `object-fit: contain` 不能单独证明无祖先裁切，仍须看实际产物。

## 复现与证据解释

源码计划不启动浏览器：

```sh
npm run test:unit
npm run validate:visual-stress -- --plan --out validation/visual-stress-plan
```

真实严格导出仅在获准的 Chromium/CJK 字体/Poppler 环境运行：

```sh
npm run validate:visual-stress
```

`--plan` 的 `browser: not-run` / `visualReview: not-performed` 不构成出图证据。真实执行不会因工具缺失自动降级为通过。输出目录非空即拒绝，源计划和真实运行应使用不同目的目录，不删除旧证据。

逐案例保存输入、命令、完整输入/正文哈希、素材尺寸/哈希和 `source-files.json`。源文件清单哈希不是 Git tree；HEAD/tree/dirty 分别记录。失败持续聚合，缺失案例不能消失。实际导出核对 manifest、唯一文件名、所有产物/样式/资源哈希、模板/密度、screen/print 与 PDF 页数/可检索性。

原文片段来自源 tokens，不从可能缺文的输出倒推。HTML、preview 与逐页原生 PDF 检查段落、标题、列表项、表格单元格、完整代码及元数据的内容/重复次数。PDF 用 `pdftotext -raw` 并保存文本哈希，`-layout` 只辅助人工查看。仅归一化换行空白，不改源文，不退回只查一个 marker。

每个成功预览检查真实 351/366px 内卡、计算字体、可见性与嵌套缩放。新模板正文约 15.093/15.738px，来源采用独立字阶；14/11px 为最低门槛。三密度只改间距，Notebook 的旧字阶单列例外。手机审查有有限总时长与清理路径，空图片集合不能被当作通过。

四个 M1 默认 PNG 仍与固定历史哈希比较，差异需新复核，不能自动刷新。另有原短文 8 模板和含引用/从 7 开始列表的原文 4 模板比较，避免只用纯段落或精选极短文评价。48 套长文边界收集全部失败；一套件失败不隐藏其他套件结果。

实际输出、源测试与独立审查相互补充。CI 成功不自动改注册表/图库状态，不承诺所有字形或内容组合都完美；每个结论须绑定精确输入、版本和产物。
