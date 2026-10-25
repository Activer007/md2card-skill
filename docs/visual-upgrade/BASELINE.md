# M0：当前基线冻结

记录日期：2026-10-25。范围仅为基线、最小原始样例和拒绝夹具；没有实现推荐器、图片新变体、视觉诊断或新画幅。所有状态均对应本次实跑，不沿用历史 PR 的测试结果。

## B00：源码与规划核对 — 完成

| 项目 | 本次记录 |
| --- | --- |
| 仓库 | Activer007/md2card-skill |
| 基线分支 | main（已 fetch） |
| HEAD commit | `70383b8f05fbf56112bdf10dd9fddf7b9920756a` |
| Git tree | `6c58c1e61d4150248bf7ff6a79b46f3bf68e6408` |
| 工作分支 | `codex/visual-upgrade-m0` |
| 包版本 | 3.0.0 |
| 采集时开放 PR | GitHub 全仓库 `is:pr is:open` 查询返回 0；仅为采集时状态，见证据包 `open-prs.json`，不代表发布时状态 |
| 原有目录 | 开始时不存在 `docs/visual-upgrade`，本目录是本次新增 |

已核对 package.json、SKILL.md、scripts/{markdown,templates,document,render,browser,assets}.mjs，以及相关样式、分页、PDF QA、图库生成/校验和现有测试。源码 SHA-256 见 [m0-provenance.json](m0-provenance.json)。测试对象是以上 commit 的运行时代码；新增文档和负向夹具不属于该 commit/tree。最终完整性检查确认运行时、样式、原始输入未改动。

规划来源是 WorkBuddy 安装目录之外附带的 `md2card-guizang-development-pack` 中 10 份 Markdown，逐文件哈希已冻结；整个规划包不复制进仓库。发现的差异：

1. 规划 README 把 `70383b8…` 写为 Git tree；实际它是 commit，tree 如上。
2. 当前 main 已包含 PR #24 的正文四档字号，默认 `medium`；不能再作为未实现功能。当前 WorkBuddy 安装副本与 main 存在运行时文件差异，不能仅凭同为 3.0.0 判断一致；见证据包 `installation-drift.json`。本次未同步安装副本。
3. `visualVariant`、`imageRole`、推荐 CLI、`wechat-wide` 和视觉诊断 JSON 仍是提案，不是有效接口。未知元数据仍被拒绝。
4. 规划同时给出常规顺序和图像优先的最小路径；本次采用 [ADR-001](ADR-001.md) 的建议顺序，不启动任何后续实现。

## 已有能力与边界

| 范围 | 当前契约 |
| --- | --- |
| 模板 | 48 套；模板版本和支持画幅逐项保存在 provenance，不能把历史预览当作新变体证据 |
| 语义版式 | cover、explainer、comparison、steps、image-caption、statistic、case-study、quote，共 8 种 |
| 默认值 | 1080×1440 portrait、manual 分页、editorial、medium 正文、legacy 页脚；本轮四例均使用这些默认值 |
| 自动分页 | explainer/steps 的受限语义分页；仅 layout 元数据，模板等额外字段继续硬拒绝 |
| 图片 | 明确本地 asset root，真实路径边界，PNG/JPEG/WebP；扩展名/MIME/解码与大小预算；远程资源、SVG、data URL、逃逸等继续拒绝 |
| 保护 | 默认完整保留图片比例；浏览器禁脚本、阻断网络；溢出必须失败，不能靠裁切、删字或缩字掩盖 |
| 画幅 | 48 套 portrait；额外 8 个组合：T04 square/slide、T05 square、T13 square、T24 slide、T37 slide、T21 square/slide。实现状态不等于当前独立视觉验收状态 |
| 输出 | HTML/预览、精确尺寸 PNG、Chromium 原生 PDF；所有导出都经过实际浏览器几何检查 |
| 图库 | 预览绑定输入/源码/样式/产物证据；版本变化不自动继承旧验收。本轮静态一致性及 66 项浏览器检查通过 |

## 环境：实际版本

| 工具 | 版本 / 状态 |
| --- | --- |
| Windows | 10.0.26200 x64 |
| Node.js | 24.16.0 |
| markdown-it / Playwright | 15.0.3 / 1.64.1（与锁定依赖一致） |
| 本次运行 Chrome | 156.0.8078.48；`C:/Program Files/Google/Chrome/Application/chrome.exe` |
| pdfinfo / pdftoppm | Poppler 26.07.0；实际页数检查及 PDF 栅格化成功 |
| pdftotext | 缺失；严格 PDF 文本门槛 BLOCKED |
| fc-list / fc-match | 缺失；严格 Fontconfig 字体覆盖门槛 BLOCKED |
| Python / pypdf / PDFium | 3.12.14 / 6.10.0 / pypdfium2 5.14.0 |
| pdfplumber / Pillow | 0.11.9 / 12.3.0 |

字体不是通过 CSS 字体栈推测的：已采集 Chromium CDP `CSS.getPlatformFontsForNode` 的实际 family/PostScript 名与 glyphCount；另读取对应本地字体 OpenType name 表并保存文件 SHA-256。Noto Sans SC 2.04、Noto Serif SC 2.02、Cascadia Mono 2102.025、Microsoft YaHei 6.31、Arial 7.06、Century Gothic 2.35 均出现在本次实际字体记录中。Noto 两个文件的完整版本字符串带 `non-release`，详见 provenance 和证据包 `font-files.json`。没有下载或更换字体。

## B00–B03 状态与出口

| 任务 | 状态 | 证据 |
| --- | --- | --- |
| B00 真实基线 | 完成 | 本文、source/plan/environment/open-prs/installation-drift 记录及 provenance |
| B01 最小黄金样例 | 已采集并逐图复核；PDF 提取兼容性有保留项 | [BASELINE-EVIDENCE](BASELINE-EVIDENCE.md)，4 个原始输入、PNG/PDF、8 个手机视图及哈希 |
| B02 默认/拒绝回归 | 可用测试通过；严格环境门槛 BLOCKED | [REGRESSION](REGRESSION.md)，567 单元 + 20 集成通过、66 图库检查、4 个拒绝用例 |
| B03 决策与范围 | 完成 | [ADR-001](ADR-001.md) |

本次完成的是可追溯基线冻结，**不是全环境严格验收通过**。M1 可从只读分析独立立项；M2a 新视觉验收之前需恢复真实 Fontconfig/Poppler 检查并处置 PDF 提取差异。未执行项、失败及跳过均保留，不覆盖旧图库验收状态。

M0 PR 包含本目录基线文档/provenance、`tests/fixtures/visual-upgrade` 的案例清单和两份负向输入，以及可下载的[原始证据包](../evidence/visual-upgrade-m0-70383b8.zip)。原始黄金输入复用现有 examples，不另写文案。按维护者授权，先提交、审查并合并 M0，再合并 M1-A；发布状态以 GitHub PR 为准。证据包保留采集时字节和哈希，发布审查的文档修订不回写历史证据。
