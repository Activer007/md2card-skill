# M1-A：只读角色摘要与模板匹配

本轮开始时重新 `git fetch origin main`，main 仍为 `70383b8f05fbf56112bdf10dd9fddf7b9920756a`，tree 为 `6c58c1e61d4150248bf7ff6a79b46f3bf68e6408`。工作分支 `codex/m1a-template-matching`。已核对唯一模板注册表、受控元数据、TEMPLATE_GALLERY、M0 记录及当前开发包 Goal 1A/1B；此次只做 P11–P12，独立 CLI 和图库/Skill 接入属于 M1-B。

合并前已同步先行合并的 M0 PR #26（main `a614dbbc86a77b1cfa91af3e54f1ec04bb059142`），遵循 [ADR-001](visual-upgrade/ADR-001.md) 的默认兼容、只读分析与验收边界。M0 未改变运行时代码，本 PR 也不新增视觉验收范围。

## 使用与信任边界

两个同步纯函数：

```js
import { renderCards } from '../scripts/markdown.mjs';
import { summarizeContentRoles } from '../scripts/content-role.mjs';
import { recommendTemplates } from '../scripts/template-recommender.mjs';

// markdown 是调用者已经读取的原文；无图片时不需要 resolver。
const cards = renderCards(markdown);
const summaries = summarizeContentRoles(cards);
const report = recommendTemplates({ cards, requestedAspect: 'portrait' });
const json = JSON.stringify(report, null, 2);
```

图片输入由调用者先用已有 `const resolver = await createAssetResolver(trustedAssetRoot)` 获得 resolver，再传给 `renderCards(markdown, { resolveImage: resolver.resolveImage })`。该异步步骤属于调用者；两个推荐库函数仍为同步纯函数。库函数只接收这一受信的解析结果；它不是新的原始 JSON/图片安全入口，不能把手写 cards、远程 URL、未验证图像当作受信内容。

角色摘要复用现有 parser token、sections、orderedLists、受控作者元数据与已嵌入图片，不改变 Markdown、HTML、元数据或输入对象；共享引用定义按原解析器规则收集。没有文件、网络、模型、浏览器或导出调用。`sourceLines` 是已有解析器给出的原始卡片范围；heading 的 `bodyLines` 是移除卡片元数据后的正文相对行号，不冒充原文件绝对行号。

## 角色规则

优先顺序为：完整 metric+label → 有已验证图片且作者 metadata alt/caption 或行内图片 alt 含截图/界面描述 → 有已验证图片且作者 metadata alt/caption 或行内图片 alt 含照片/影像描述 → 显式 layout → 引用块 → 列表 → 作者已选模板推导的 layout → H2/代码/表格解释结构 → 无 H1 且有 source 的资料注记 → unknown。

输出角色为 cover-intro、concept-explain、steps、comparison、quote-evidence、metric、screenshot-evidence、photo-story、source-note、unknown。这些是有限规则下的内容用途，不是图像识别或事实鉴定。例如 T37 的 AI 静物可对应 photo-story 构图用途，但仍保留 `IMAGE_SEMANTICS_NOT_VERIFIED`；不能据此说它是真实摄影。仅在正文写“截图”而未提供图片，不会成为截图角色。默认推断的 explainer 不等于作者明确选择 explainer。

标题/段落、列表、引文、代码和表格计数都来自解析结构。正文字符数为非空白 Unicode 码点数（含标题及代码，不把图片像素里的文字计入）；长代码阈值为超过 6 行或单行超过 80 字符，宽表提示为超过 4 列或单行文本超过 80 字符。这些只产生 caveat，不是像素测量，也不会替代现有溢出失败。

## 先硬过滤，再软排序

遍历的唯一集合是 `scripts/templates.mjs` 导出的 TEMPLATES，仍为 48 项，没有另建模板 ID/能力清单。每个模板先检查：

- 请求画幅必须在该模板 `aspects` 中；未知画幅保留在报告里，全部模板返回 `TEMPLATE_ASPECT_UNSUPPORTED`。
- 复用 `validateTemplateMetadata` 检查必要 metric/label、alt/caption、图片模式、密度、作者显式 layout 冲突，以及模板不会展示的字段。
- 复用 `validateTemplateCard` 检查图片数量/分节、成对引用结构、原始列表编号等。图片不丢弃，字段不补造。
- 验证候选时仅创建临时 metadata 副本并替换候选 template；显式 layout 保留。默认或原模板推导的 layout 不作作者限制，原对象绝不写回。
- `paginate: 'auto'` 不给出任何模板候选，全部标记 `AUTO_TEMPLATE_UNSUPPORTED`。这不验证或执行自动分页；现有 explainer/steps 及 layout-only 契约不变。

硬过滤成功后的固定字典序为：作者有效模板优先 → 角色/layout 一致 → 注册表用途关键词匹配 → 较少警示 → 较多结构匹配 → 位于注册表长度指导内 → 模板 ID 升序。`priority` 展示这六个比较值，`rank` 仅表示先后次序，不是美学分数。

用途和结构通过小型、固定规则读取注册表的自然语言字段，没有调用模型。非竖版使用 aspectLayouts 中实际注册的结构指导，返回请求画幅和注册表验收状态；待验收状态附带 REGISTRY_ASPECT_REVIEW_PENDING，不套用竖版指导或继承其视觉验收。结构识别包括 H1、可识别的 H2 数量、列表项数、引文/代码/表格；不能理解所有注册表句子，所以始终附带原始 purpose/structure/unsuitable 供审阅。长度、列表/分节数不匹配及缺少指导结构是软警示；真实导出的硬校验仍由原入口负责。

默认最多 3 个候选。unknown 角色未指定模板时返回 `insufficient-role-evidence` 和空候选；若作者已经明确指定且通过硬校验，则仅保留该模板并返回 `author-template-only`，不猜测其他模板。兼容性统计继续保留。其他兼容但未入前三的 ID 放入 `omittedCompatibleTemplateIds`，与真正不兼容的 `rejected` 分开。

## JSON 及解释

完整可复现示例：[input.md](../examples/recommendations/input.md) → [output.json](../examples/recommendations/output.json)。输出包含 schemaVersion、requestedAspect、paginate、automatedRenderingPerformed=false，以及每卡 index/sourceLines/role/reasonIds/features/caveats/candidates/rejected。

| 样例 | 候选优先的依据 | 限制 |
| --- | --- | --- |
| 三项有序列表 | T05、T14、T42 都具有 steps 用途、对应列表结构和 3 项指导范围；同条件按 ID 排序 | 未核实真实排版容量；不改变原编号 |
| 显式双栏比较 | T06、T15 匹配 comparison 和两个 H2；T12 为后续兼容候选，明确提示四节指导未满足 | 显式 layout 不会被改成封面或步骤 |
| 完整 metric+label | T21 的必要字段齐全；不能展示这些字段的模板被拒绝 | source 保留作者的“合成演示”限定，数字未作事实核查 |
| 零散文字 | unknown，空候选，说明角色证据不足 | 不制造主题或作者意图 |
| 合法本地截图（单测） | 未预选 T20 时仍由 image-caption、注册表“界面”用途和实际图片优先得到 T20 | `SCREENSHOT_TEXT_REQUIRES_VISUAL_REVIEW`，不保证图内微字手机可读 |

主要 reasonIds：AUTHOR_* / QUOTE_BLOCKS / LIST_BLOCKS / EXPLANATORY_BLOCKS 说明角色来源；HARD_CONTRACTS_MET、ASPECT_SUPPORTED、IMAGE_REQUIRED_MET、REQUIRED_METADATA_MET 说明已检查的兼容条件；ROLE_LAYOUT_MATCH、REGISTRY_PURPOSE_MATCH、*_STRUCTURE_MATCH、*_COUNT_MATCH 解释排序。拒绝原因沿用已有 TEMPLATE_* 错误码，另外有 AUTO_TEMPLATE_UNSUPPORTED。多个拒绝原因按固定顺序去重。

每个候选都有 `RENDER_NOT_PERFORMED`。没有 source 时是 `SOURCE_NOT_PROVIDED`，有 source 时仍是 `SOURCE_NOT_FACT_CHECKED`。不补造来源、指标、图片、图像身份、裁切授权或新画幅，不标记视觉已验收；用户明确选择模板后，仍须通过原导出入口全部校验。

## 验证与已知范围

新增两个测试文件，共 16 项命名测试，其中包括完整 48 原始模板样例循环。覆盖无图、已验证截图、照片用途、列表/引文/双栏比较/指标、缺失必要字段、长代码/宽表/unknown、不支持画幅、显式 layout、列表编号、成对引用结构、重复稳定输出和完整输入/输出示例。

副作用测试在子进程启用 Node permission model，允许模块文件读取但禁止写入和派生进程，同时拦截 fetch、HTTP(S)、Socket 和 child_process；重复调用输出完全相同。Windows 依赖 junction 需要允许模块解析读取，未因此开放写入或进程权限。测试按当前 Node 支持情况选择 --permission 或 --experimental-permission，不强制使用较新 Node 独有的参数。另检查新模块的直接导入白名单，避免引入 renderer/browser/IO。不可变输入检查和 48 样例前后 JSON 比较确认未改写解析结果。

审查修复后的本地命令与结果（2026-10-25，Node 24.16.0）：

```text
node --test tests/content-role.test.mjs tests/template-recommender.test.mjs tests/markdown.test.mjs tests/assets.test.mjs tests/document.test.mjs tests/options.test.mjs tests/semantic.test.mjs tests/pagination.test.mjs tests/templates.test.mjs tests/aspects.test.mjs tests/default-body-compatibility.test.mjs
# exit 0；186 pass / 0 fail / 0 skip，包含 96 组默认 HTML 哈希兼容

node scripts/build-template-gallery.mjs --check
# exit 0；图库生成一致
```

`package.json` 增加 `test:recommendations` 并纳入 `test:unit`，不改依赖版本或渲染参数。完整 argv/退出码/日志保存在本地 `validation/m1a/commands/`。

首次副作用测试因 Node 文件读取白名单未覆盖 Windows junction 中间路径而失败；修复测试的模块读取许可后通过，产品代码未添加任何 IO 权限。

随后在 `CHROMIUM_PATH` 指向真实 Chrome、`MD2CARD_REQUIRE_BROWSER=1` 下完成 `node --test tests/*.test.mjs`：605 项中 603 通过、0 失败、2 跳过，包含真实浏览器 PNG/PDF 导出回归。两个跳过及其他未执行的 PDF 文本提取子检查因缺少 `pdftotext`，不能标为严格 PDF 通过；M0 的 Fontconfig 限制也仍在。仓库 GitHub Actions 当前禁用，没有本 PR 的云端 CI 结果。导出回归不等于新的模板视觉验收。

M1-B 可在此 API 上增加独立只读 CLI 和图库/Skill 指南。默认 render.mjs、受控元数据白名单、唯一模板注册表、document/browser/assets/semantic 和 CSS 均未修改。
