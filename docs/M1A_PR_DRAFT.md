# PR 草稿

标题：`feat: add read-only content roles and explainable template matching`

Base: `main`。Head: `codex/m1a-template-matching`。

目前选模板需要人工解读 48 套设计的用途和约束。新增独立的角色摘要和候选匹配纯函数：读取现有安全解析结果，先复用模板硬校验，再按作者选择、角色、用途、结构和长度指导稳定排序，最多返回 3 项，并解释拒绝和适用限制。例如无图输入会明确排除 T20；作者已提供合法本地截图和说明时，可在未预选模板的情况下优先推荐 T20。

unknown 不猜选新模板，但保留通过硬校验的作者明确选择，缺失 metric/label 不补造，auto 不分配模板；所有候选都标记未执行渲染。原始 Markdown、来源、数字和图片身份保持不变。当前仅实现 M1-A（P11–P12），独立 CLI/图库接入留给 M1-B。

## 文件范围

- `scripts/content-role.mjs`：角色、结构、来源范围和压力提示。
- `scripts/template-recommender.mjs`：唯一注册表硬过滤、稳定排序和 JSON。
- `tests/content-role.test.mjs`、`tests/template-recommender.test.mjs`：16 项新测试，含 48 原始样例和副作用约束。
- `examples/recommendations/input.md`、`examples/recommendations/output.json`：可复现的四卡输入/输出。
- `docs/M1A_RECOMMENDATIONS.md`、本 PR 草稿：API、排序理由、边界与验证。
- `package.json`：新增推荐测试命令并接入现有 unit；依赖不变。

M0 文档、夹具和证据已先行通过 PR #26 合并，本分支已同步最新 main；它们不属于本 PR 相对 main 的新增差异。外部开发资料包和本地 validation 日志不纳入本 PR。未修改模板数量、默认渲染路径、元数据白名单、模板注册表、CSS、图库或 SKILL.md。阶段边界见 [ADR-001](visual-upgrade/ADR-001.md)。

## 验证

- 定向新旧回归：186 通过、0 失败、0 跳过，包含 96 组默认 HTML 哈希兼容、既有资源安全及元数据/auto 拒绝检查。
- 48 个注册样例均复核候选与现有模板校验一致；重复运行排序和理由一致。
- 子进程写入/进程权限禁止，网络 API 拦截，推荐函数仍能重复运行；输入前后不变。
- `node scripts/build-template-gallery.mjs --check`：退出 0。
- 本地完整 `node --test tests/*.test.mjs` 在真实 Chrome 和 `MD2CARD_REQUIRE_BROWSER=1` 下运行：603 通过、0 失败、2 跳过，包含 PNG/PDF 导出回归。因缺少 pdftotext，严格 PDF 文本门槛及相关子检查仍未完成。仓库 Actions 当前禁用，没有本 PR 云端 CI；不声称新的视觉验收，推荐结果不表示渲染成功或事实已验证。

用途/结构自然语言匹配是有限规则，长度是字符指导；完整注册表提示随候选返回，不将建议变成自动改文。短代码、宽表、图内微字、缺少来源等限制仍需实际渲染及编辑核对。

代码审查已修复：行内图片 alt 被忽略、unknown 清空作者有效模板、非竖版错误沿用竖版结构指导；并按 Node 实际支持选择权限测试参数。三个行为问题先用失败用例复现，再确认修复通过。

本文保留为 PR 说明草稿；提交、CI 与合并状态以 GitHub 记录为准。
