# PR #27 合并前审查与修复

日期：2026-10-26（Asia/Shanghai）。审查基线为 PR head `5a27f5f68426c2a3766af8ef1d093230789ad4f6`，main `013944d0edad904a194003491bf58ddd46e22c88`。维护者在 Draft 交付后明确要求审查、修复并合并；此授权更新了初次交付文档中的“不合并”阶段边界。

## 已修复问题

**[P2] 中文摘要遗漏已验收示例的保留问题。** JSON 中 T04 square 为 `reviewed-with-layout-limitations`，明确记录左栏“解释”拆成两行、手机图保留短尾。原 text 输出只有“已验收的精确示例”链接，省略了限制与验收范围，人工选型时无法直接看到这项已知问题。

新增真实 T04 square 回归先复现失败，再修复 `formatRecommendationText`：逐个输出验收状态、画幅/密度/分页范围和全部 `limitations`。同步中文样例与使用指南，原 JSON 和候选排序不变。没有修改模板、样式、图片、渲染默认行为或提高任何视觉验收状态。

## 复核与范围

- `node --test tests/recommend-cli.test.mjs tests/content-role.test.mjs tests/template-recommender.test.mjs tests/gallery-discovery.test.mjs tests/gallery-validation.test.mjs tests/default-body-compatibility.test.mjs`：122 通过、0 失败、0 跳过。
- `npm run gallery:check`：通过，48 implemented / 48 accepted / 0 pending。使用本机有效 npm CLI 执行，未修改全局配置。
- 对比初次提交：JSON 样例、生成图库 HTML、CSS/JS、模板注册表与原渲染器字节不变。初次 72/72 浏览器及 139 项图库测试记录仍限定其原始文件范围；本轮没有重复浏览器截图或全量渲染器 PNG/PDF 测试。
- GitHub 复核：无审查提交、无未解决审查线程；Actions 仍 `enabled=false`，main 未配置分支保护。没有声称云端 CI 通过。
- 既有 pdftotext/Fontconfig 环境限制保持；本次只修复摘要信息遗漏，不修复或隐藏 T04 的布局短尾。

初次 [M1-B 审核证据包](evidence/m1b-recommendation-review.zip)保留原始字节，不改写其源码哈希。[本轮补充证据](evidence/m1b-pr27-review.zip)包含失败回归、修复后日志、图库检查、实际 T04 摘要及修复文件哈希。未发现其余阻止合并的问题。发布与合并结果以 GitHub PR 记录为准。
