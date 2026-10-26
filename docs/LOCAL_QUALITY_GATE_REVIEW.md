# 本地质量门禁：代码审查与实际验收

最终本地门禁 **PASS**。三种模式均有实际记录，完整 release 的全部选中检查通过，零跳过。故障注入另行证明错误条件下不能通过；不代表人类视觉签收。

使用方式见[本地质量门禁](LOCAL_QUALITY_GATE.md)。机器可读索引见[证据索引](local-quality-evidence.json)，完整报告、日志和最终截图/PDF 见[证据归档](evidence/local-quality-gate-20261026.tar.xz)。归档根目录 `index.json` 列出每个条目的大小与 SHA-256；按 `runs/<运行目录>/report.md` 开始查看。原报告中的绝对路径保留采集时来源，归档索引提供对应目录映射。

## 来源与范围

- 起点 main：bf87b66607fd433ebdbabb2a88ccfedb26f59565（M4 / PR31）。复用原 worktree。
- 最终被测代码：fd625dd3d997026026929c826e631b66b395a053。交付提交仅补充文档、证据索引和归档；门禁、测试、包脚本和渲染源码未在实测后更改。
- 运行环境：Windows、Node 24.16.0、真实 Chrome 156.0.8078.48、MSYS Fontconfig、Poppler 26.09.0。具体版本、字体族/字形覆盖、工具状态保存在 doctor JSON 和日志。
- 原有 scripts/render.mjs、browser.mjs、doctor.mjs、全部模板/CSS/输入/黄金样例保持原样；没有 GitHub Actions 变更。

## 本地源码审查及修复

| 发现 | 影响 | 修复与验证 |
| --- | --- | --- |
| 静态 import 闭包在循环依赖处缓存半成品 | 某些受影响测试可能漏选 | 只缓存直接边，为每个测试重新遍历；新增环形依赖回归用例 |
| 默认文件并发引发两次 BROWSER_CLEANUP_TIMEOUT | 全量测试可能因 Chromium 关闭资源争用失败 | npm test、独立集成与门禁 fast 使用 test-concurrency=1；保留 5 秒原关闭时限和全部断言 |
| 初版只核对近期五份归档 | 早期 M0/M1-B/PR27/PR28/PR29 归档缺少显式哈希检查 | 覆盖十份既有归档；无统一外部 JSON 的三份从固定 main Git blob 提取 SHA-256 pin |
| Windows npm shim 与 NODE_OPTIONS reporter 重复 | 无法启动 npm 或双 reporter 配置报错 | 以 Node 调用真实 npm-cli.js；只设置一个 TAP reporter，并清除子测试的 NODE_TEST_CONTEXT |

输出目录检查包含真实 Windows junction 回归；拒绝通过 validation 下的链接写入其他目录。历史基线先从四个固定 Git 对象导出，再核对树清单、Git blob 和每文件 SHA-256；传入目录只作比较，不直接执行。

## 必须如实保留的首次失败

`2026-10-26T09-30-10-526Z-release-GsE0ew`，提交 8fd6e7b75c5ef445850eb691d0eff2621ad535c3：整体 FAIL。

- npm test：668 项，666 通过、2 失败、0 跳过。
- 失败项：exports HTML, exact-size PNGs and searchable two-page PDF；real Chromium screen/print: bbox truth, background exclusion, contain area, footer hard failure and bounded collection。
- 两项均为 BROWSER_CLEANUP_TIMEOUT。前者耗时约 24 秒，后者约 14 秒；原错误、栈和退出码在 008-test.stdout.log。
- 独立集成 21/21、四个变体、图库和环境检查均 PASS，source-unchanged PASS。门禁仍将整体标为 FAIL，未被后续成功覆盖。
- 串行重跑没有复现该错误支持资源争用解释，但不保证任意机器永远不会遇到清理失败。没有重试自动转绿逻辑。

最终交付保留该运行的完整 JSON/Markdown、日志、产物清单与 receipt；旧原始截图/PDF 全部留在本地原目录。归档 index 对此运行明确标记 reports-and-logs，不能把清单中未打包的旧图像说成已交付。最终正常 release 的所有产物完整打包。

## 最终实测

| 模式 | 运行目录 | 结果 | 主要证据 |
| --- | --- | --- | --- |
| fast | 2026-10-26T09-43-29-104Z-fast-WhikQg | PASS | fd625dd；13/13 门禁相关测试，零跳过 |
| targeted | 2026-10-26T09-58-42-394Z-targeted-uhWpJL | PASS | 最终提交真实图库 72/72，34 张截图 |
| release | 2026-10-26T09-42-40-352Z-release-HVzVnS | PASS | 全量 669/669、独立集成 21/21；全部选中检查 PASS |
| 故障注入 | 2026-10-26T09-59-08-140Z-injections-P9CEeF | PASS（故障正确拒绝） | 单元失败、浏览器不可用、PDF 缺失、基线损坏及重复运行，共 5 项 |

release 总耗时 951.399 秒；npm test 约 504 秒、独立集成约 98 秒、T20 约 77 秒、T37 约 85 秒、M3 约 108 秒、M4 约 50 秒、图库约 17 秒。相比首次并发运行 634.650 秒，串行调度增加时间，降低浏览器争用；没有增加单次渲染预算。

release 产物清单包含 1065 个文件，其中 400 个 PNG、66 个 PDF，覆盖验证器的成功与预期拒绝案例、当前/历史基线导出及手机/原生 PDF 截图。最终源文件与 HEAD 前后保持一致。十份历史归档 SHA-256、四个固定历史源码基线和图库静态绑定检查全部通过。

故障注入中，单元断言失败为 FAIL；浏览器和 PDF 缺失为 BLOCKED，依赖步骤 NOT-RUN；基线不匹配为 FAIL，旧版本验证器 NOT-RUN。PDF 隔离检查同时确认 Chromium 路径、Fontconfig 和中文字形检查仍为 PASS，排除“只是全部环境都坏了”的误判。两次故意失败运行的目录不同，第一次报告哈希未变化；全部故障运行的 source-unchanged PASS。

## 已执行的交付复核

1. 逐条核对最终 report.json 的全部 selected 检查均 PASS，test/integration 的 fail、cancelled、skipped、todo 均为零。
2. 核对四个固定基线身份与十份历史归档；没有从未验证目录执行旧版本。
3. 检查实际命令、退出码、doctor、浏览器版本和完整日志，而非仅终端最后一行。
4. 打包程序重算 artifacts.json 和 receipt.json 中的文件哈希，并重新打开归档核对每个条目的集合、大小和 SHA-256。
5. 比较 fd625dd 后的差异，仅文档/证据交付；门禁、测试、包脚本、原有渲染源码保持实测版本。

## 未执行与限制

归档在逐条读回验证通过后，首次生成外部索引时遇到绝对/相对路径错误。仅修正外部索引生成，使用同一份已完成归档；没有重新渲染或重写归档字节。

- Linux/macOS 实机执行 NOT-RUN；实现使用跨平台 Node API，但不冒充跨平台实测。
- 独立人类视觉、语义一致性、平台最终显示、真实浏览器菜单缩放及读屏 NOT-RUN。机器几何/哈希检查不是维护者签收。
- 其他历史大矩阵（templates/series/visual-stress/tail/pagination/footers/refinement/aspects/showcases）本次没有重新逐一执行；其相关 Node 测试和已绑定证据由全量套件/图库检查覆盖，不宣称全部历史压力矩阵得到新像素验收。
- fast 静态依赖选择不能完整推断任意动态导入/数据依赖，共享渲染改动必须使用 release。
- 外层命令超时只确认对直接子进程的终止请求，后代进程关闭未认证；不要把这一保护说成整棵进程树的硬截止。渲染器自身的原有预算未改变。
- 现有历史截图验收边界保持原样。未更新 golden，未提高任何安全或溢出阈值。
