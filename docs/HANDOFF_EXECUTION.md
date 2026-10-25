# 本地接续任务与验收记录

## 范围与基线

用户要求按阶段细化并推进交接任务。保留 48 套设计、全部原文及既有证据；不推送、合并、修改 Actions 或认证。最终提供分阶段本地候选、精确差异和测试/产物/视觉证据。未验证的结果保持 pending。

后续明确授权例外：用户要求合并 PR20，并在自动审批拒绝 Draft → Ready 后，明确回复“授权转为 Ready 并合并”。PR20 已按既有目标分支合并，见下方最新记录；该授权不扩展为推送本地未提交修复或合并 PR21/22。

2026-10-24 已刷新远端：main=f67e516；PR20=7a66826；PR21=2229b0e；PR22=215976e。当前隔离工作区从 PR20 head 创建，原 main 和用户交接材料保留。

## 阶段 0：可重复的本地验证

- [x] 添加 LF / binary 字节契约；在 core.autocrlf=true 下全新导出索引，337 个文件与 Git blob 字节完全一致，图库校验通过。
- [x] 修正图库测试的平台路径与 file URL 构造，保持严格身份检查。
- [x] 运行完整源测试、gallery:check，记录浏览器与 Poppler 跳过项。
- [x] 记录暂存候选文件，不提交依赖、缓存、下载或临时输出。

## 阶段 1：PR20 同文证据绑定

- [x] 保存并校验 run40079675432 的原始产物 ZIP，与精确 commit/tree 对应。
- [x] 定义并实现技术候选的来源快照、生成输入、模板版本、manifest、PNG/PDF、拒绝诊断契约；技术候选不授予视觉验收。
- [x] 重建原始 ZIP 到技术候选的 binder；语义代码与来源文件必须匹配，不执行任意 sourceRoot 模块。
- [x] 将已绑定候选接入 comparison 图库校验路径，替换原有仅检查哈希格式的逻辑；独立视觉记录契约及其不完整拒绝已实现。
- [x] 完成并接入真实独立视觉记录，逐组决定是否满足有限范围验收。
- [x] 增加错误树、错误 PDF/输入/版本、错用拒绝诊断、陈旧预览及路径越界回归；纳入聚合测试。
- [x] 核对 22 个内容案例，保留 17 个成功候选与 5 个预期拒绝的区别。
- [x] 核对三组同文：11 个成功预览与 1 个 T13 中篇拒绝；独立检查 full PNG、375/390、native PDF。
- [x] 验证当前本地候选的图库任务路线、筛选/跳转、键盘与无脚本行为；精确输入见 gallery-ui-review.json，不继承为发布版本结论。

## 阶段 2：PR21 系列接续

- [x] 展示 PR20 必要改动的带入方式，保留 PR21 历史和独立范围。
- [x] 校验 run40079867143 原始产物与四组系列，共 14 张卡。
- [x] 检查原文、来源、代码、图片、品牌、页脚、页序及连续阅读。
- [x] 新增六张不继承既有八张或 portrait 单例的视觉结论。

## 阶段 3：PR22 安全和画幅

- [ ] 展示 PR21 修复带入方式；修正 Windows fileURLToPath 与测试路径。
- [ ] 修复 loadAspectCard 对输入及相关资源的 realpath 边界，覆盖 junction/symlink、相似前缀与根内合法文件。
- [ ] 使用内容/语义不同的两个源根验证来源一致性，拒绝混用，不动态执行不可信代码。
- [ ] 校验 run40079964688 产物，完整执行/核验 58 个技术案例；仅八个指定短例可进入额外画幅视觉绑定。
- [ ] 保留默认溢出、图像比例、来源与失败关闭规则。

## 阶段 4：收尾与交付审计

- [ ] README / SKILL / reference / 图库 / 验收记录状态一致，旧历史不改写。
- [ ] 每阶段列出 branch、HEAD、修改文件、通过/失败/跳过/未执行项及证据范围。
- [ ] 展示用户可审阅的文件清单和本地独有提交；保持用户手工核查提交与推送流程。
- [ ] 按全部要求逐项审计，证据不足的项目明确保留未完成状态。

## 执行记录

本记录随工作更新；勾选代表有实际证据，不以计划或旧 CI 数量代替本次验证。

### 2026-10-24：阶段 0 与阶段 1 的来源验证基础

- 工作区分支为 `codex/handoff-r4-evidence`，基线仍是 PR20@7a66826，未修改 main，未创建提交或暂存实际修改。
- 阶段 0 完整测试：438 项，420 通过、0 失败、18 跳过（17 浏览器 + 1 真实 Poppler）；日志 `validation/handoff/stage0-tests.log`。图库校验：48 当前预览、0 pending portrait。与三组同文仍 pending 不矛盾。
- PR20 原始 ZIP SHA-256：`218dfc6d0d0c8a73d3606ca1883d05983393273c5d3113a7079257b8c2f16b3b`。只解出 refinement 子目录，199 文件、41,599,856 bytes，路径和大小已检查。实际摘要为 17 个成功导出、5 个预期拒绝，视觉状态仍未复核。
- 实际 CI checkout：`ba10171bd67651af6b7b24b45ce854a31d738fcb`；Git 树：`29ac782a1160a18c487170c5342805e745d29d53`；完整来源摘要：`71ce209fda6f84cec14eef3c6468ac2b58cd78c43ffbc15a7b8c4c9c42fb4682`。已获取该提交并导出原始 LF 快照。
- 新增 `evidence-source.mjs`：以真实 Git commit/tree/blob 与 SHA-256 核验来源文件；realpath 根边界；源快照与本地解释模块/样式/运行依赖一致，否则拒绝。不会导入 sourceRoot 中的任意代码。对 package.json 仅允许非运行语义（如新增测试命令）的差异。
- 170 个真实来源文件（7,927,743 bytes）已通过上述检查。来源安全定向测试 6/6 通过、无跳过，包含两个不同语义根、重新伪造哈希、缺文件、错误树及 Windows junction 越界。
- 新测试已加入 test:unit；此基础尚未接入 comparison binder 或 PR22。后续仍需 manifest/PDF/拒绝绑定、视觉检查和最终图库验收，不能提前升级三组对照状态。
- 最新定向复验：来源安全与图库验证共 27/27 通过、0 跳过；gallery:check 通过；git diff --check 通过。完整源测试的 420/0/18 是增加来源模块之前的阶段 0 结果，不冒充最终 binder 全量测试。

此时的候选文件：`.gitattributes`、`docs/HANDOFF_EXECUTION.md`、`package.json`、`tests/gallery-validation.test.mjs`、`scripts/evidence-source.mjs`、`tests/evidence-source.test.mjs`。新增模块和测试属于阶段 1 基础，平台规则与图库测试属于阶段 0。没有工作流改动。下载 ZIP、源码快照、解压产物、日志和 checkout 验证均位于被忽略的 `validation/handoff/`，不会进入候选。

当时的下一步：建立 ZIP 原始条目与读取产物的绑定，避免仅验证 ZIP 本身却信任可变解压目录；随后逐项核验 summary、生成输入、manifest、PNG/PDF、手机图和 T13 溢出诊断，生成保持 pending 的候选记录，再完成独立视觉检查和图库接入。

### 2026-10-24：完整 PR20 技术候选与异常输入回归

- 新增 `scripts/evidence-archive.mjs`：读取并校验独立取得的 ZIP 摘要，之后只使用同一内存中的字节；限制大小、条目数、压缩方法，检查 CRC、数据描述符、路径、大小写重复和重叠区域。不会信任可变解压目录，也不执行归档内容。
- 来源快照新增只读字节访问；读取后即使源文件或调用者拿到的 Buffer 被改写，已验证字节也不会变化。旧 runner 未列入 source manifest 的 `docs/gallery-comparisons.json` 从已验证 Git 树读取，单独记录摘要，不冒充 sourceSha256 的一部分。
- 新增 `scripts/bind-refinement-evidence.mjs` / `npm run evidence:refinement`。输入为独立核对的 run/artifact/commit/tree/archive 身份、原始 ZIP 和匹配源码根。依次校验 summary、全部 22 个生成输入、源段落、资源、模板版本、manifest、原生 PDF 文件、PNG、手机图、PDF 文本记录及拒绝诊断。
- 所有 17 个成功案例的 `cards.html` 和 `preview.html` 均由匹配源码重新构造，并与 CI ZIP 完整字节比较；不接受在正文中加入隐藏样式后只重算哈希。PDF 校验读取实际 PDF 字节并对照 manifest 的字节数和摘要；不会把单纯的 64 字符字符串当作 PDF 验证。
- 原始 ZIP 的 refinement 范围共 199 个条目全部绑定，22 个案例 = 17 个成功候选 + 5 个预期拒绝。T13 中篇只绑定其准确生成输入及 overflow.json，不能携带成功输出。三组比较仍为 pending。
- 真实候选位于 `validation/handoff/pr20-bound-candidate.json`，SHA-256 为 `aa7b421b28031cdeece6650a73ff8376f19a3369d27c06b4a5e8db87d013745f`。重复生成 `pr20-bound-candidate-v2.json` 字节一致。候选明确区分 `verified-ci-records` 与未执行的本地 PDF 文本提取、浏览器重放、视觉验收；身份 JSON 中的 run/artifact 必须来自外部已核对元数据，不能用归档自述替代。
- 新增 ZIP 和 binder 回归，覆盖错误或缺失 PDF、重算哈希后的错误输入/manifest/样式/模板、隐藏正文、错误 PNG 尺寸、PDF 文本缺失、手机字号和图片裁切、错用拒绝诊断及拒绝目录残留成功输出。测试夹具明确为合成协议数据，不是浏览器渲染或视觉证据。
- 新测试全部进入 `test:unit` 和默认测试 glob。全量复验：**472 项，454 通过、0 失败、18 跳过**；日志 `validation/handoff/stage1-binding-full-tests-v2.log`。17 项浏览器测试被显式跳过，1 项缺少完整 Poppler 文本工具；这些不是渲染通过。`gallery:check` 仍为 48 accepted / 0 pending portrait；`git diff --check` 通过。
- 两次全量运行发现的 lifecycle 100ms 竞态现已收敛：在预期的浏览器/PDF 操作真正开始之后推进模拟计时器，保留主错误、清理超时、不发布输出以及迟到 resolve/reject 不得写文件的断言。没有延长产品超时或修改渲染器；最终全量已通过。

当前候选文件共 13 个：`.gitattributes`、`package.json`、`docs/HANDOFF_EXECUTION.md`；`scripts/evidence-source.mjs`、`scripts/evidence-archive.mjs`、`scripts/bind-refinement-evidence.mjs`；`tests/gallery-validation.test.mjs`、`tests/lifecycle.test.mjs`、`tests/evidence-source.test.mjs`、`tests/evidence-archive.test.mjs`、`tests/refinement-evidence.test.mjs`、`tests/helpers/evidence-zip.mjs`、`tests/helpers/refinement-evidence.mjs`。仍无提交、实际暂存或工作流变更。

### 原生 PDF 与视觉复核的实际边界

- 已用本机随附的 pypdf 和 Poppler `pdftoppm` 从已绑定 ZIP 直接读取并检查全部 17 份 PDF，验证实际文件摘要、单页 810×1080 pt、无旋转，并生成可解码的 1080×1440 页面图。审计脚本及记录在 `validation/handoff/audit_bound_pdfs.py`、`validation/handoff/pr20-pdf-audit-v2/audit.json`。
- pypdf 提取的部分汉字为兼容部首字符，例如“一”对应 U+2F00，而 CI 中 pdftotext 文本为原汉字。17 例的 NFC 精确比较均有差异，NFKC 对照的所有原文片段均存在。保留两套结果，不改写原文，不放宽现有 NFC 检查，不把兼容对照称为精确 Unicode 一致。这是文本提取兼容性待说明项，不是裁切证据，也不是视觉验收。
- 目前仅逐图查看了 `short-T04` 的 full PNG、375/390px 手机图及从其原生 PDF 新渲染的页面。未见裁切或内容遮挡，但两个段落存在“处。”“断。”短尾，手机图同样可见；先记录为排版待复核项，不提前批准该组。其余 16 个成功案例仍需逐图复核。

下一步：完成逐图复核并处理实际排版问题，形成有准确文件摘要的视觉结论；再接入图库的验收路径及攻击测试，验证真实交互。PR20 的技术候选完成不代表阶段 1 完成，更不代表 PR21/PR22 已完成。

### 2026-10-24：PR20 合并与图库真实文件校验

- 用户明确授权后，将 PR20 从 Draft 转为 Ready，并使用预期 head `7a66826e9abd60bf461fa10d358093948455721b`、普通 merge 方法成功合并。合并提交 `30905def9a61bcad991f6a3ab48ce40485d9eeed`，父提交为 `3dd9c30` 和 `7a66826`，目标 `refine/r3-footer-modes`。已 fetch 核对；main 仍为 `f67e516`。本地工作区 HEAD 仍为 `7a66826`，未提交的修复没有包含在此次合并中。
- 新增 `comparison-evidence.mjs` 与 `package-comparison-evidence.mjs`。从原始 ZIP 重做 binder 核验，整理三组同文的 123 个产物文件及 5 个来源/绑定文件，共 128 文件、8,776,172 bytes，位于 `docs/evidence/refinement-run-40079675432/`。未生成任何生产视觉验收记录。
- 图库现在使用固定的已核对 CI 身份和 binder 摘要，检查实际 PDF、PNG、输入、manifest、HTML、手机图、PDF 文本和诊断字节。来源根与执行代码的语义、样式和运行依赖必须匹配；视觉记录必须逐例绑定相同字节并提供完整检查结果。已知排版限制可显示在对应预览说明中，不会隐去。
- 新增/替换图库攻击回归：重新填写摘要仍不能伪造 commit/tree/archive/artifact，缺失或错用 PDF/旧缩略图、修改源码/样式/依赖、错误原文或模板版本、缺失视觉检查、错用 T13 诊断、路径越界均被拒绝。测试视觉记录只存在内存，明确标注合成测试，生产三组仍为 pending。
- 本轮完整测试：**517 项，499 通过、0 失败、18 跳过**。日志 `validation/handoff/gallery-integration-full-tests.log`；17 项浏览器被显式跳过，1 项完整 Poppler 文本检查跳过。`gallery:check` 为 48 accepted / 0 pending portrait，三组 comparison 的 pending 单独保留；`git diff --check` 通过。
- 本轮逐一查看六种图片比例案例的完整 PNG、375/390px 及原生 PDF 页面，文件摘要与 binder/PDF 审计记录逐项核对后写入 `validation/handoff/pr20-visual-observations.json`。未见裁切或图外正文缺失；界面微字只作上下文，极宽/极高图只验证比例边缘，不代表推荐成品或图内手机可读性。该记录尚未发布为验收。
- 当时的下一步：补齐并持久化文字对照的独立视觉记录，明确短尾等适用性限制，完成最终真实图库交互；随后按既定依赖顺序带入必要修复并验收 PR21/22。PR20 已合并不代表这些后续要求已经完成。

### 2026-10-25：阶段 1 本地候选完成，接续阶段 2

- 三组同文的 11 个成功案例已分别查看 full PNG、375/390 与原生 PDF 页面；T13 中篇拒绝诊断也已核对。独立记录为 docs/COMPARISON_REVIEW.md 与 docs/comparison-visual-review.json，各组绑定真实文件及两份复核文件的摘要。T04 短文、T17 混排短尾及 T33 窄栏限制保留在图注，不冒充排版问题已修复。
- 图库当前显示 48 个注册预览与 11 个同文预览。修复两处历史测试将所有 img 数量误认为注册模板数量的断言，保留注册计数和各预览身份检查。完整源测试 518 项：500 通过、0 失败、18 跳过（17 浏览器、1 完整 Poppler）；日志 validation/handoff/comparison-reviewed-full-tests.log。
- 首次真实图库验证在受限执行环境中遇到 GPU 子进程退出及浏览器崩溃。正式权限下保持 Chromium 沙箱、CSP 和请求白名单，通过 60/60 项。修正页面过时状态说明后再次执行，最终仍为 60/60，25 张截图已独立查看；精确 263 个输入摘要及机器报告保存在 docs/gallery-ui-review.json，可读说明在 docs/GALLERY_UI_REVIEW.md。此结果只证明当前未提交本地候选，原生菜单缩放、辅助技术及其他浏览器仍未验证。
- PR21 仍为 open draft，head 2229b0e73147a27f5e2273208fded6497521a57a，base refine/r4-content-gallery。已通过连接器获取 run40079867143 / artifact12553849934 并下载原始 ZIP；实际 SHA-256 与 GitHub digest 均为 f6393c44356ee2bab20bcdfa4aaf977bb4433ff175bf7887987f7da25b886708。已获取 CI commit20bcb5256cee43071b1efd43448a9308966620f7，其 tree 为 c1d255e6abd7ef1f32cc26d469a3f6343a6d935a，与 PR21 head tree 相同。尚未给 14 张系列卡片授予本轮视觉验收。
- 当前本地改动应作为 PR20 合并后的新补充 PR 候选；PR21/22 各自专项修复继续留在对应 PR 历史上。尚未提交、推送或创建新 PR。下一步校验四组系列的来源、HTML、PDF、手机图、品牌及页序，再独立逐张复核。

### 2026-10-25：阶段 2 精确产物复核与独立工作区

- 当前工作区 E:/LHA/codex-worktree/r5-series-evidence/md2card-skill，分支 codex/r5-series-evidence，HEAD 2229b0e73147a27f5e2273208fded6497521a57a。本地独有提交 0；未提交、推送或合并 PR21。原 R4 工作区全部本地候选继续保留。
- 基于 PR21 原 head 创建新工作区，逐文件核对原始快照后恢复 LF 字节，使用 git apply --check 验证公共补丁后带入 11 个已跟踪文件的修改及 144 个新增文件，保留 PR21 自己的 12 文件增量和合并历史。补丁摘要 d0974cc693c8dd35c4ebc8e571d4874168c952b47654b18d6ccf6868c0989a0b；带入清单在 validation/handoff/r4-carry-forward.json。没有更改渲染器、模板样式、Actions 或认证。
- 原始 ZIP 的四组系列共 14 卡、85 个文件全部核对。来源173文件/7,943,324bytes与精确Git树一致；HTML和预览HTML由匹配语义重建后与ZIP逐字节一致。PDF/PNG/手机图、品牌Logo/accent、图片原始身份及许可、卡序、页脚、列表编号、模板版本、screen/print诊断均记录于 docs/evidence/series-run-40079867143/technical-audit.json。
- 独立查看14张full PNG、28张375/390手机图及四份原生PDF的14页新栅格图。新增C/D六张没有继承旧结论。A组首字“一”的下沉辨识以及“确。”“例。”“实。”短尾保留为限制，未改写内容。逐卡结论与哈希见 docs/SERIES_PR21_REVIEW.md 和 docs/series-pr21-visual-review.json。
- 四份原生PDF页数5/3/3/3、每页810×1080pt、无旋转。CI raw检查与本机pypdf兼容性问题分别记录：14页NFC有差异、6页NFKC仍有不匹配，未据此声称本机精确Unicode通过。
- 公共修复带入后全量源测试528项：510通过、0失败、18跳过；日志 validation/handoff/r5-full-tests.log。gallery:check与git diff --check通过。未重跑浏览器排版；R4图库60项报告保留其原工作区/输入边界，不扩大为新阶段验收。
- 下一步进入阶段3：从PR22原head建立接续候选，保留PR21必要改动；修复loadAspectCard输入与资源realpath边界、来源根/执行语义一致性及Windows路径测试，然后核验58技术案例和8个指定画幅短例。
