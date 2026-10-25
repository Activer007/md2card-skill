# M1-B：只读推荐 CLI 与图库角色指南

审查日期：2026-10-26（Asia/Shanghai；命令日志为 UTC）。基线 main 为 `013944d0edad904a194003491bf58ddd46e22c88`，已包含 M0 #26 和 M1-A #25。全程复用当前 worktree，工作分支 `codex/m1b-recommendation-cli`；本阶段交付 Draft PR，不合并。

## 改动与入口

| 文件 | 作用 |
| --- | --- |
| `scripts/recommend-templates.mjs` | 有界 UTF-8 输入、既有安全图片解析、严格 JSON / 人类可读输出；无文件写入、浏览器或网络 |
| `scripts/recommendation-guide.mjs` | 由唯一注册表生成角色路线、候选条件、精确画幅验收链接及中文摘要 |
| `scripts/template-recommender.mjs` | 仅提取共享角色匹配函数供图库复用；M1-A 排序及既有完整 JSON 示例不变 |
| `scripts/build-template-gallery.mjs`、`docs/gallery/index.html` | 静态角色入口、原生 details/锚点和 CLI 指南；没有新增图片 |
| `scripts/validate-gallery.mjs` | 扩展角色键盘/无脚本检查、手机/缩放截图；截图等待字体及绘制帧完成 |
| `tests/recommend-cli.test.mjs`、`tests/gallery-discovery.test.mjs` | CLI 的正常/拒绝/只读测试及旧任务路线与新角色入口的独立断言 |
| `SKILL.md`、`references/recommendations.md`、`references/rendering.md`、`docs/TEMPLATE_GALLERY.md` | Codex 调用方式、报告边界与离线选版入口 |
| `package.json` | 新增 `recommend` 快捷命令，把 CLI 测试加入推荐与 unit 脚本；依赖不变 |
| `examples/recommendations/cli-report.json`、`cli-report.txt` | 对已有四卡原文的可复现完整报告 |

```sh
node scripts/recommend-templates.mjs examples/recommendations/input.md --json
node scripts/recommend-templates.mjs examples/recommendations/input.md --format text
```

[JSON 样例](../examples/recommendations/cli-report.json)与[可读样例](../examples/recommendations/cli-report.txt)分别提供程序和人工入口。逐卡输出候选 ID、原因、必要图片/字段、文字结构与长度指导、请求画幅、限制及已验收精确输入链接。缺少对应画幅证据时没有 `acceptedExample`；不把 portrait 例子冒充 square/slide。每个候选明确 `inputRenderability: not-verified`，推荐不等于渲染保证。

参考开发包 P13–P14、Goal 1B 和 [ADR-001](visual-upgrade/ADR-001.md)。参考仓库仅阅读了 SKILL 与 content-planning 的角色规划原则，没有复制代码、CSS、素材、字体或其改写原文流程；当前用户原文始终只读。

## 验证结果

| 检查 | 实际结果 |
| --- | --- |
| `npm run gallery:check` | 通过；48 implemented / 48 accepted / 0 pending，仍为 12 家族 |
| `npm run test:gallery` | 139 通过、0 失败、0 跳过 |
| 推荐、角色与图库定向回归 | 119 通过、0 失败、0 跳过 |
| 最终中文摘要与 CLI 回归 | 11 通过、0 失败、0 跳过 |
| 默认 HTML / 参数 / 图片安全 / Markdown / 画幅 / M1-A 兼容 | 80 通过、0 失败、0 跳过；包含 96 组默认 HTML 哈希比较 |
| 截图绘制等待修复后的验证器单测 | 21 通过、0 失败、0 跳过 |
| 真实 Chrome `file://` 图库验证 | 72/72，34 张 UI 截图；包括 CSP、无网络、图片身份、键盘、筛选跳转、无脚本、375/390px 和等效 200% reflow |
| 八个独立画幅的 CLI 审计 | 8/8 请求画幅/示例/PNG 哈希一致，均未声称当前原文可直接渲染 |

以上测试集合有重叠，不相加作为总用例数。本机默认 npm 启动脚本指向失效的 Roaming 安装，实际使用 `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run ...` 执行相同 npm 脚本；没有修改用户全局配置。

只读测试使用 Node permission model 禁止文件写入及子进程，并拦截网络 API；带真实本地图像的推荐仍可运行。所有已验收 PNG、同文证据和画幅例子继续经过现有校验器，篡改/缺失/路径越界/错误版本/历史身份不能通过。独立审计确认 renderer、parser、assets、document、模板注册表、图库 CSS/JS 和三个证据注册 JSON 与基线逐字节一致。

本轮没有重新运行整个渲染器的所有 PNG/PDF 测试，也没有新增卡片视觉验收；测试范围对应独立 CLI 与图库改动。保留现有 pdftotext/Fontconfig 环境限制，不声称严格 PDF 已通过。仓库 Actions 在前次核对时禁用，本次报告不声称云端 CI 通过。

## 审查修复与证据

- 旧测试按全页 `.task-route` 数量断言 6，新增角色复用该样式后变成 16；修正为原任务区仍 6 条、角色区 10 条，保留完整 48 模板与真实预览断言。
- 初次受限环境 Chrome 页面初始化超时；在允许的本机 Chrome 环境重跑完成，未关闭 CSP 或绕过资源白名单。
- 逐图复核发现等效缩放的一次截图只绘出标题，DOM 检查未能发现截图内容不完整。启用脚本的验证器现等待字体和两个绘制帧；无脚本场景不等待不会执行的帧回调，仍保持真正禁用脚本及原生截图就绪逻辑。原截图、无脚本等待失败及其 summary 保留在证据包的 `prior-browser/`，不计作完整视觉证据。
- 发布审查明确区分图像角色路线、源内容硬校验、注册表 pending 和独立短例验收；补上失败 JSON、空候选、auto 和跨目录调用说明。

代理实际查看 7 张当前 UI 视口图：桌面首页/角色页、375px 角色页、390px 首页/角色页、无脚本角色页和等效 200% 角色页。其余截图仅有自动检查；未进行读屏认证或原生浏览器菜单缩放认证。UI 复核不改变任何模板验收状态。

[完整审核证据包](evidence/m1b-recommendation-review.zip)包含实际命令/退出码/日志、最终浏览器 summary 和 34 张截图、保留的首轮失败、源码哈希、八个画幅及默认核心不变审计。ZIP 的 `index.json` 列出每项字节数和 SHA-256；`review.json` 记录源码与已查看截图身份。解压查看即可，不需运行其中脚本或安装字体。证据包 SHA-256：`4908cedbf86aede93c089009326b4550de11e19ebd1b723fc29d7774ece72784`。

完成边界：M1-B 交付已实现；后续 M2 变体、自动选版/改文、模型、图片识别、新模板/新画幅、渲染保证与自动合并均不在本 PR。
