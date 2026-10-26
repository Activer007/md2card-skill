# 图库变体展示：本地复核

2026-10-26，基于 main `fa447859cdeb38a1c7225ffba75adafa93cd4696`，复用现有 worktree。改动只涉及图库展示、证据绑定、样例、验证器与文档；模板注册、渲染器、资源安全和溢出判定均未修改。

## 结果

| 检查 | 结果 / 证据 |
| --- | --- |
| `npm run test:gallery` | 144/144，零失败、零跳过；[日志](evidence/gallery-variants/ui/unit.log) |
| 规范行尾绑定修复后 `node --test tests/gallery-variants.test.mjs` | 5/5；[日志](evidence/gallery-variants/ui/canonical-fix.log)。仅更新两份旧索引的规范字节哈希，其他已通过测试不重复 |
| `node --test tests/screenshot-stage.test.mjs tests/photo-cover.test.mjs` | 13/13，零失败、零跳过；[日志](evidence/gallery-variants/ui/safety.log) |
| `npm run gallery:check` | 48 implemented / 48 accepted / 0 pending / 12 families；[日志](evidence/gallery-variants/ui/gallery-check.log) |
| 真实 Chromium file:// | 86/86；44 张截图；[完整 JSON](evidence/gallery-variants/ui/summary.json) |
| 所有图库图片 | 63 张均正确解码并匹配路径和 1080×1440：48 默认 + 11 原同文 + 4 新对照 |
| 网络与 CSP | 原策略不变，JS on/off 两个上下文均无外部请求、请求失败、页面错误或 CSP 违反 |
| 历史字节身份 | 两个归档 SHA-256 与已固定索引一致；13 个选取文件逐字节等于归档成员；[提取核对](evidence/gallery-variants/ui/archive-verification.json) |
| 当前验证输入 | 浏览器报告记录 401 个输入的路径、大小和 SHA-256，保存时再次核对；[交付清单](gallery-variants-ui-evidence.json)固定所有报告、日志和截图 |

实际浏览器：Windows Chrome `156.0.8078.48`，启用 Chromium sandbox，默认 15000ms 操作期限。没有放宽限制或重复执行全量 release/render 矩阵。执行命令：

```sh
node scripts/validate-gallery.mjs --allow-browser --browser "C:/Program Files/Google/Chrome/Application/chrome.exe" --out validation/gallery-variants/browser-final
```

四种视口为 1280×900、375×812、390×844、640×450。最后一种仅为等效 200% 重排。验证包含已有筛选/重置/锚点/键盘/画幅链接，以及两种新用途关键词、将已隐藏目标重新显示、原生详情展开、独立来源与哈希展示。禁用页面 JavaScript 后，新用途锚点仍可原生展开详情，全部图片仍能加载。

## 实际截图与代理检查

代理查看了四张原始 PNG、十张完整变体区截图和一张桌面角色导航截图；未把其他 33 张自动截图称为已逐图人工审阅。[查看清单与限制](evidence/gallery-variants/ui/agent-visual-review.json)记录精确文件 SHA-256。维护者签收仍为 pending，浏览器自动报告保留 independentVisualReview=pending。

| 视口 | T20 | T37 |
| --- | --- | --- |
| 桌面 | [完整区截图](evidence/gallery-variants/ui/desktop-1280-T20-screenshot-stage.png) | [完整区截图](evidence/gallery-variants/ui/desktop-1280-T37-photo-cover.png) |
| 375 | [完整区截图](evidence/gallery-variants/ui/mobile-375-T20-screenshot-stage.png) | [完整区截图](evidence/gallery-variants/ui/mobile-375-T37-photo-cover.png) |
| 390 | [完整区截图](evidence/gallery-variants/ui/mobile-390-T20-screenshot-stage.png) | [完整区截图](evidence/gallery-variants/ui/mobile-390-T37-photo-cover.png) |
| 640 重排 | [完整区截图](evidence/gallery-variants/ui/reflow-200-percent-T20-screenshot-stage.png) | [完整区截图](evidence/gallery-variants/ui/reflow-200-percent-T37-photo-cover.png) |
| 无脚本 390 | [完整区截图](evidence/gallery-variants/ui/no-js-390-T20-screenshot-stage.png) | [完整区截图](evidence/gallery-variants/ui/no-js-390-T37-photo-cover.png) |

[角色入口截图](evidence/gallery-variants/ui/desktop-1280-roles.png)。原始卡片：[T20 默认](images/gallery-variants/T20-default.png) / [stage](images/gallery-variants/T20-stage.png)，[T37 默认](images/gallery-variants/T37-default.png) / [photo](images/gallery-variants/T37-photo.png)。

桌面成对展示，375/390/640 下上下排列；卡片全幅与警示文字未横向截断。T20 可见完整 END 标记；T37 当前照片主体小船未被文字挡住。这些是精确样例的代理观察，不是微字可读性、主体检测或所有未来输入的保证。

## 缺陷、误报边界与未做项目

- 提交前发现两份旧索引在工作目录残留 CRLF，而 Git 保存 LF；最初的本地绑定会使新检出仓库失败。已取 Git 原始 LF 字节固定摘要，没有更改历史 JSON 内容；受影响单测和最终浏览器检查重新通过，并逐项比较验证输入与 Git 暂存字节。
- T37 黑色品牌的默认对照存在原有眉题等低对比问题。保留原图并标注“历史兼容对照”，不把它升级成新视觉通过记录；本次不改历史颜色或数据。
- T20 图内微字在缩略图中仍偏小。图库链接原始 PNG，不宣称 stage 能让所有 UI 或长截图变得手机可读。
- 只用“DOM 无越界”和“PNG 成功解码”不能认定视觉质量通过；因此保留代理观察和维护者 pending 两种状态。没有新自动视觉评分或 OCR。
- 元数据校验验证作者字段合法，不能验证照片事实或主体真的安全。新单测继续拒绝缺失裁切授权、blocked/uncertain、截图角色、无效焦点/文字区及不支持画幅。
- 全部默认图和历史档案保持原身份；没有将图库 CSS 的缩放尺寸当成新的卡片渲染验收。
- 未做维护者逐图签收、读屏认证、浏览器原生菜单缩放、其他浏览器引擎/操作系统，亦未重新跑无关全量渲染矩阵。

独立 PR 交付；GitHub Actions 在推送前核实为 disabled，不启用或修改工作流。本报告中的 PASS 均指本地实测。
