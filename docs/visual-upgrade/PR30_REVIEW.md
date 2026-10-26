# PR #30 审查与修复

审查起点：`ff79a2b0fb239f7680f6235d15b92ce64ce7f456`，目标 main `07ff4808dfd8fed73422d240dac5336ad1733566`。按最新用户授权，修复与验证完成后合并；初次交付的 Draft 限制已由本次请求取代。复用原 worktree。

## 已修复问题

1. **P2：可选采集异常会掩盖打印溢出。** 原实现在 screen 安全检查后立即采集视觉几何，再检查 print。如果采集失败，print 的 CONTENT_OVERFLOW 被普通采集异常代替。新增测试在 print 返回真实溢出标记、采集器抛错时复现了错误优先级。现在先完成两项安全检查并处理溢出，再在同一解码文档中采集 print/screen，恢复 print 供 PDF 使用。硬拒绝不调用采集器；默认关闭时没有额外媒体切换，所有操作仍受原 deadline 约束。
2. **P2：祖先容器变换造成不可靠几何却标为完整。** 原实现只检查图片自身 transform；父容器的 scale/rotate/zoom 可让图片绘制面积和标题行高使用不同坐标尺度。真实 Chromium 回归测试复现了 complete=true。现在将卡片内祖先及元素自身的 transform、独立 rotate/scale/translate、zoom 状态向下传递；涉及前景时整卡明确未评估，不据此发出低密度判断。默认模板不新增任何样式。

规则集升级为 `1.0.1`，schemaVersion 仍为 1，阈值和建议未改变。没有引入自动修改、自动视觉签收或新的 hard fail。人工视觉状态继续为 not-performed。

## 证据与兼容性

- 两项回归先失败、修复后通过；补充测试检查采集发生于两项安全检查之后，且 JSON 的 screen/print 身份正确。
- 最终专项 15/15 通过，包含强制真实 Chromium、父级变换、满铺背景、200 卡采集上限、deadline 和溢出生命周期。兼容性/篡改测试 3/3 通过。
- 完整 unit：625 项，623 通过、0 失败、2 项环境条件跳过；真实浏览器专项另外强制执行，无跳过。图库检查 48/48，未改变历史验收状态。
- 强制 Chromium、Fontconfig、Poppler 的原有导出/分页集成检查 21/21 通过，无跳过。
- 完整实际渲染矩阵再次通过：四组系列和补充样例共 20 卡，10 份成功报告，2 条预期 CONTENT_OVERFLOW 拒绝；108 个旧版 HTML 对照及 8 组默认输出对照保持一致。
- 对原归档 SHA-256 进行验证后，逐文件比较本次 78 张正式 PNG、screen/print 截图和原生 PDF 页图，全部字节一致。10 份视觉 JSON 除 ruleSetVersion 从 1.0.0 升至 1.0.1 外完全一致。
- `m3-default-compatibility.json` 及原证据归档保持不变。新增 `pr30-default-compatibility.json`，固定相同 main 基线与修复后源码；兼容性桥同时验证旧证明和新证明，拒绝源码或证明被篡改。
- GitHub 在审查开始时没有 check runs/statuses 或行内审查意见。本地验证记录不表述为 CI 通过。

补充归档 `docs/evidence/pr30-review.tar.xz` 包含失败复现、最终测试日志、新的完整 JSON、独立测量报告、像素一致性清单和源码快照。图片不重复存储：按 equality.json 中的路径读取原 `m3-visual-diagnostics.tar.xz`，其 SHA-256 被独立固定。

人工仍需检查图片内部文字、主体、局部对比度和整体构图；本轮没有把机器建议升级成视觉已验收。
