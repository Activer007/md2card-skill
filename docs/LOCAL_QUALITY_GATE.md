# 本地质量门禁

门禁编排已有 Node 测试、doctor、图库证据检查和 Chromium 验证器，不实现新的渲染规则，也不修改 GitHub Actions。机器通过不代表维护者完成视觉、来源或语义签收。

## 环境与命令

需要 Node.js >=20、Git 和安装好的仓库依赖。完整检查还需要本地 Chromium、Fontconfig（`fc-list`、`fc-match`）、Poppler（`pdfinfo`、`pdftotext`、`pdftoppm`）。把真实工具目录加入 PATH；不自动下载或替换工具。Windows 可设置 `CHROMIUM_PATH`，也可传 `--browser`。

```sh
node scripts/local-quality-gate.mjs --help
node scripts/local-quality-gate.mjs --mode fast
node scripts/local-quality-gate.mjs --mode fast --base origin/main --changed scripts/markdown.mjs
node scripts/local-quality-gate.mjs --mode targeted --target visual-audit
node scripts/local-quality-gate.mjs --mode targeted --target screenshot-stage --target photo-cover
node scripts/local-quality-gate.mjs --mode targeted --target wechat-covers
node scripts/local-quality-gate.mjs --mode targeted --target gallery
node scripts/local-quality-gate.mjs --mode release
```

等价 npm 入口：`npm run quality -- --mode targeted --target gallery`、`npm run quality:fast`、`npm run quality:release`。Windows 的 npm shim 无法运行时直接使用 Node 入口，必要时传 `--npm-cli "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js"`。脚本用 Node 执行真实 npm CLI，不依赖 Bash 或 npm.cmd。工具查找沿用现有环境，不降低 Chromium 安全限制。

## 模式与范围

| 模式 | 真实执行 | 不代表什么 |
| --- | --- | --- |
| fast | `git diff --check HEAD`；从 base 到 HEAD、工作区和新文件收集变更；沿单元测试静态 import 依赖选择受影响测试 | 不等于完整发布通过；有浏览器依赖的受影响单元测试仍须满足环境 |
| targeted | 严格 doctor、真实浏览器启动、`pdftoppm -v`、`npm run gallery:check`、历史归档 SHA-256 检查及指定专项验证器 | 不执行全量测试或未选择专项 |
| release | 上述预检和证据检查、`npm test`、`npm run test:integration`、全部四个变体和真实 `validate-gallery` | 不替代人工视觉、平台发布预览、读屏或语义审查 |

fast 的 `--changed` 是补充变更，不会隐藏自动检测的变更。未知输入或公共配置保守选择全部单元测试；文档与证据变更选择图库、证据与兼容性测试。没有变更时跑基础冒烟测试。动态导入或数据依赖无法仅凭静态 import 完整推断，涉及共享渲染、字体、图片、示例或依赖升级时必须再执行 release。全量测试已经包含导出集成测试，release 按契约另外执行独立集成命令，报告保留这种重复及成本。

## 历史基线

| 专项 | 现有验证器 | 固定提交 | 参数 |
| --- | --- | --- | --- |
| screenshot-stage | validate-screenshot-stage.mjs | d73f405c4b5a1891b79fbe51fdb009bd55c4cf69 | --allow-browser、--out、--baseline-root |
| photo-cover | validate-photo-cover.mjs | 38bd0dbd44c8b85e3875fa70280f6d63167ed1c0 | --allow-browser、--out、--baseline-root |
| visual-audit | validate-visual-diagnostics.mjs | 07ff4808dfd8fed73422d240dac5336ad1733566 | --allow-browser、--out、--baseline-root |
| wechat-covers | validate-wechat-covers.mjs | 0fff0fd8b625c4b35fac572e5474afa6f7a49118 | --out、--baseline-root；无 --allow-browser |
| gallery | validate-gallery.mjs | 无历史源码执行 | --allow-browser、--out |

只从本地 Git 固定对象导出 scripts、assets、package.json 和 lockfile。先核对完整 commit，再用已有有界 ZIP 读取器验证归档，并对照 Git tree 检查每个文件的 blob 和 SHA-256。旧验证器继续执行自己的固定源码验证。缺少历史对象时检查失败，先从可信 origin 获取对应历史再重跑，不会改用当前源码。

`--baseline-root` 仅供单个历史专项检查已准备目录：逐文件核对后，仍使用本次新目录里的 Git 导出副本，不执行传入目录中的代码或额外依赖。错误哈希不能绕过，也没有更新 golden 的开关。

## 报告与退出码

每次在 `validation/local-quality/<UTC时间>-<mode>-<随机后缀>/` 创建新目录。`--output-root` 只能指定 validation 下的子目录，拒绝符号链接/目录联接。现有结果不覆盖，不自动清理。

- `report.json`：版本 1；被测 HEAD、工作区状态与输入文件哈希、系统与 Node、doctor 的字体/PDF 状态、真实浏览器版本、选测依据、每条实际命令、退出码、耗时、测试统计、基线身份及失败原因。
- `report.md`：人读状态表和日志链接。
- `logs/`：每个进程独立 stdout/stderr；单进程合计日志上限 64 MiB。
- `artifacts.json`：所有过程日志、基线和验证器产物的字节数/SHA-256；不自包含最终报告。
- `receipt.json`：最终 JSON、Markdown 和产物清单的哈希。用于检测变化，不是数字签名。

状态定义：PASS 已执行并通过；FAIL 执行/断言/哈希失败；SKIP 测试实际跳过或 TODO；BLOCKED 缺少运行条件；NOT-RUN 未选择或被前置检查阻断。**选中检查发生 SKIP 或 FAIL 时总结果 FAIL；前置条件阻断或选中项未运行时不能 PASS。** 只有所选范围全部完成才退出 0。无效参数退出 1；参数阶段尚未建立运行目录时不生成报告。

环境检查保留 doctor 原始 JSON；doctor 中 launch=unverified 只是路径检查，独立 browser 步骤真正启动并清理 Chromium。全量测试强制 REQUIRE_BROWSER 和 REQUIRE_PDF_CHECK；任何测试跳过都阻止通过。每个检查开始前后仍使用现有渲染器/验证器的内部预算；外层进程截止 45 分钟只用于防挂死，不增加单次渲染限额。若外层超时，直接子进程被终止，但不能声称其所有后代已退出，应核查日志和本次进程后再重试。

记录运行前后项目文件哈希，发生源码变化则 source-unchanged 失败。validation 产物和未跟踪的交接资料目录不作为被测源码，但 Git 状态仍披露交接目录。运行时不要在同一个 worktree 并行改源码。

## 现有能力、成本和遗漏

| 能力 | 依赖/相对成本 | 既有边界 |
| --- | --- | --- |
| Node 单元测试 | Node；通常秒至分钟，部分测试真实启动浏览器 | 名为 unit 不等于全部无浏览器；发布时必须零跳过 |
| export/pagination-export | Chromium、字体、Poppler；分钟级 | 精确输入和当前字体环境，不代表任意长文都能放下 |
| gallery:check | 本地源码、既有 ZIP/证据；通常秒级 | 静态绑定不是本次人工图像复核 |
| 四个变体验证器 | 固定 Git 基线、Chromium screen/print/mobile、Poppler；多轮真实导出，分钟级且占磁盘 | 原始 PNG 可能出现进程间栅格差异；照实 FAIL，不能自动覆盖黄金样例 |
| validate-gallery | 真浏览器、file:// 页面、键盘/无脚本/手机布局；分钟级 | 真浏览器菜单缩放、读屏未认证 |
| 归档完整性 | M2a/M2b/M3/PR30/M4 固定报告中的 SHA-256；读取数十 MiB | 验证字节身份；语义/源码链继续由 gallery:check 的现有绑定器验证 |

另外已有 validate-templates、validate-series、validate-visual-stress、validate-tail、validate-pagination、validate-footers、validate-refinement、validate-aspects、validate-showcases。它们覆盖历史模板矩阵、系列、尾页、分页、页脚、精修与画幅；成本较高且有各自历史验收范围，本入口不把它们伪装成本次已运行。相应领域改动仍应按各自帮助/文档补充专项证据。release 这一命名只指本页明确列出的门禁范围。实际本机用时以每次报告 elapsedMs 为准。

## 建议的 PR 合并前流程

门禁自身的单元测试：`node --test tests/local-quality-gate.test.mjs`。真实故障验收：`node scripts/validate-local-quality-gate.mjs --allow-faults`。后者在新 validation 目录中创建临时 Git 测试夹具，实际运行失败单元测试、缺失浏览器、缺失 PDF 工具及损坏基线，并检查重复运行不覆盖；不替换或伪造系统工具。PDF 故障隔离要求 Fontconfig 与 Poppler 安装在不同目录，无法隔离时明确失败，不能声称此项已验证。

1. 更新可信远端引用，确认 PR 精确 HEAD 和当前 worktree 状态；安装真实依赖。
2. 修改后跑 fast，审查选测依据；相应变体跑 targeted。
3. 提交准备合并的代码后跑 release。核对源码 SHA/哈希、零跳过、归档与基线身份、失败日志及未运行项。
4. 有差异先定位源码、字体或浏览器版本原因。保留失败目录，修复后新建一次运行；不改 golden 消除差异。
5. 独立查看实际截图与原生 PDF，检查来源、裁切、语义及平台预览；明确记录未完成的人类检查。将运行报告、产物清单及完整日志归档到 PR 可追溯材料，不能只写“测试通过”。
6. 合并者确认检查覆盖和残余风险后再合并。本工具不会 push、创建/合并 PR 或发布卡片。
