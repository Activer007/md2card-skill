# PR 草稿：只读推荐 CLI 与静态角色指南

原标题建议：`feat: add read-only template recommendation CLI and gallery role guide`

Base: `main`；Head: `codex/m1b-recommendation-cli`；保持 Draft，不自动合并。

M1-A 只有纯函数入口，Codex 尚不能直接从 Markdown 获取带实际验收链接的选型报告。本 PR 增加独立只读 CLI：默认严格 JSON，也可输出中文摘要，复用唯一注册表和现有硬校验。候选附上图片/文字/画幅条件、原因、不适合情况与经过身份校验的精确画幅示例；推荐不表示原文一定可渲染。

现有离线图库新增从内容角色进入的静态指南；复用 M1-A 的匹配规则和原生定位行为，保留 CSP、file://、安全路径、键盘和无脚本后备。仍是 48 个模板，48 张 portrait PNG、11 张同文 PNG 与 8 组独立画幅证据均保持原身份。renderer 默认行为、模板注册表及 CSS/JS 未改。

验证：图库生成检查通过；图库单测 139 通过；推荐/图库定向 119 通过；默认契约兼容 80 通过；最终 CLI 11 通过；截图等待修复后的验证器 21 通过；真实 Chrome 72/72、34 张截图。测试集合存在重叠。7 张 UI 视口图实际复核，范围与未执行项详见 [M1B_REVIEW](M1B_REVIEW.md)。

审查修复包括原任务数量断言的范围、只读权限与错误通道、精确画幅证据区分，以及截图在滚动/缩放后等待绘制完成。首轮失败记录保留。没有新增卡片 PNG/PDF 视觉验收；仓库 Actions 当前禁用，不宣称云端 CI。现有严格 PDF/字体工具缺失仍是后续环境任务。

交付：[指南](../references/recommendations.md)、[完整 JSON](../examples/recommendations/cli-report.json)、[中文报告](../examples/recommendations/cli-report.txt)、[审核证据包](evidence/m1b-recommendation-review.zip)。
