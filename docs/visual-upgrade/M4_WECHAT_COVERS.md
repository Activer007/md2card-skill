# M4：独立公众号主封面与分享封面

基线：PR #30 合并后的 main `0fff0fd8b625c4b35fac572e5474afa6f7a49118`。复用既有 worktree。范围仅为三个新组合；21:9 = 7:3，不是 16:9 slide。模板总数仍为 48，7 个模板共 11 个额外画幅组合；旧八组合的历史证据不改写，不向新组合转移验收。

## 变更表

| 组合/工具 | 独立安排 | 字级与边界 |
|---|---|---|
| T01 square，1080×1080 | 联合标题在上，导语与双栏导读在下，完整来源与页脚 | 继承方图宽度派生的正文字级；固定标题 2.35em；375/390 预览复核 |
| T01 wechat-wide，2100×900 | 左标题与导语，右贯通导读栏，下方完整来源与横排品牌信息 | 宽图独立固定字级：正文为高的 6%，注释为高的 4.45%；840/1200 视口复核 |
| T21 wechat-wide，2100×900 | 通栏标题，左指标与单位，右导语、定义及限定双栏，下方来源/Logo | 同宽图固定正文/注释基准；指标 4.7em；不缩减口径与声明 |
| 配对 CLI | 两份作者已确认输入分别调用既有导出流程 | 原子发布两套产物及纯本地 HTML/PNG 组合预览；双输入与全部输出 SHA-256 |
| 静态图库 | 精确列出新增三组合，链接专项证据 | portrait 缩略图只证明原 portrait 精确示例；三个新组合仍有独立 aspect identity |

新 CSS 仅在文档包含上述三组合时发出。既有 T21 square/slide、其他模板及默认 portrait 不注入新样式。没有裁切同一栅格、自动缩字、隐藏文本、换模板或按字数预测布局。自定义尺寸仍须满足 200–4096 整数与原有绝对比例容差 0.002；例如 2102×900 被拒绝。所有新尺寸依旧执行 screen/print 强制安全测量。

## 配对与声明

入口与完整示例：[examples/wechat-covers/README.md](../../examples/wechat-covers/README.md)。直接单张导出仍用 `render.mjs --size square|wechat-wide`；配对用 `render-cover-pair.mjs --wide wide.md --square square.md --author-confirmed --out DIR`。

确认只记录 `authorDeclaration=both-inputs-confirmed`；`semanticEquivalence=not-verified`、`humanVisualReview=not-performed`。工具不能判断两份文案是否事实相容，始终要求作者比较数字、单位、定义、来源及限定条件。每份输入须是独立文件、单卡、显式 T01/T21。输入导出前后发生变化会使确认失效并拒绝发布。

全操作共用默认 120 秒截止时间（可按既有范围显式配置），所有产物合计 256 MiB。保留每次浏览器关闭最多五秒的既有清理宽限。不成功的中间目录不会宣称“完成”；非空输出目录与发布前竞争写入均被拒绝。双输入、共享品牌和资源目录由调用者明确给出。

## 实际证据

复现命令（`baseline` 必须是上述提交的 `git archive` 解包，脚本会逐文件校验后才执行）：

```sh
node scripts/validate-wechat-covers.mjs --baseline-root validation/m4/baseline --out validation/m4/reproduction
node --test tests/wechat-covers.test.mjs tests/aspects.test.mjs
```

使用真实 Chromium、Fontconfig 和 Poppler；运行结果见随本 PR 固定的 `m4-evidence.json`、`m4-default-compatibility.json` 和 `docs/evidence/m4-wechat-covers.tar.xz`。归档内 `index.html` 链接两套配对样例，`report.json` 保存 screen/print 实际坐标、独立复测结果、预览字级、原文哈希和拒绝记录；每侧保留原生 PNG/PDF、screen/print 截图、原生 PDF 页图、全文抽取及两个视口预览。证据仅限这些短输入。

[完整证据包](../evidence/m4-wechat-covers.tar.xz) · [证据哈希与测试记录](m4-evidence.json) · [兼容性证明](m4-default-compatibility.json)

| 新组合 | 原生文件 | 实际预览 |
|---|---|---|
| T01 square | [PNG](../images/m4-wechat-covers/T01-square-native.png) · [PDF](../evidence/m4-wechat-covers/T01-square.pdf) | [375](../images/m4-wechat-covers/T01-square-375.png) · [390](../images/m4-wechat-covers/T01-square-390.png) |
| T01 wechat-wide | [PNG](../images/m4-wechat-covers/T01-wide-native.png) · [PDF](../evidence/m4-wechat-covers/T01-wide.pdf) | [840](../images/m4-wechat-covers/T01-wide-840.png) · [1200](../images/m4-wechat-covers/T01-wide-1200.png) |
| T21 wechat-wide | [PNG](../images/m4-wechat-covers/T21-wide-native.png) · [PDF](../evidence/m4-wechat-covers/T21-wide.pdf) | [840](../images/m4-wechat-covers/T21-wide-840.png) · [1200](../images/m4-wechat-covers/T21-wide-1200.png) |

兼容性对照包括全部 108 个旧 HTML（48 portrait + 8 旧画幅 + 40 传统主题/布局 + 8 T20 stage + 4 T37 photo），以及 T01 portrait、T21 square、T21 slide 的真实 HTML、几何、PNG 和 PDF 页像素。PNG 记录两个独立浏览器进程的散列；若出现差异，完整保留原图，并在同一个 Chromium 上下文中分别重新加载两份 HTML，要求重放截图逐字节一致，不使用像素容差。PDF 二进制可能含生成时间，比较原生 PDF 页面像素与文字，不以相同二进制作为要求。

测试覆盖严格注册、比例拒绝、来源/指标完整性、显式确认、不同数字不自动改写、重复选项、同文件输入、任一侧失败、预览失败、截止时间、输入变动、非空目标和发布竞争写入。实际长文测试要求 `CONTENT_OVERFLOW`，不能通过缩字绕过。

最终本地结果：全量 unit 635/635，原有 Chromium/Fontconfig/Poppler 导出集成 21/21，最终兼容性证明与篡改专项 3/3；均零失败、零跳过。图库 48/48 检查通过。新样例共四张（其中三张为新组合，另有既有 T21 square 配对样例），各有独立 screen/print 测量、PDF 全文核对与两个预览视口。拒绝矩阵为三条真实长文溢出、一条真实配对第二侧溢出、48 条注册表拒绝；另保存 T04 宽图和 2102×900 的真实 CLI JSON 拒绝输出。

## 缺陷、限制与未做事项

- 首轮 T21 宽图及带 Logo 版本触发真实溢出；调整该新画幅的固定边距、栅格行距和品牌栏为横排后重新验收。原文、单位、来源与声明未删改，旧 T21 square/slide CSS 未动。
- 固定设计字级不代表任意文字都能放下。长标题、长来源、多段正文、长品牌名或用户手动放大字体仍可能拒绝；这是保留内容与安全边界后的预期限制。
- 包装器审查修复：清理临时文件前保留失败侧和溢出几何；两侧品牌/Logo 哈希变化会拒绝发布；重复读取输入始终受 2 MiB 上限约束。
- 原生 PDF 以 point 表示页面，Chromium/Poppler 换算时可能产生不超过 1px 的舍入差；不会拿截图替代 PDF，页面物理尺寸另有核对。
- 一次旧 T21 slide 基线截图出现 21 个像素单通道差 1 级（1600×900、HTML 相同），另一次也出现相同差异，其他运行与样例严格一致；具体栅格差异原因未进一步确定。原始两图、哈希、失败日志保留在归档 `anomalies/` 与 `logs/`。验收脚本改用 SHA-256 断言，避免大 Buffer 的失败差异格式化耗尽内存；原始 PNG 差异明确记为 independent-browser-raster-variation，同上下文重放截图仍须严格相等；没有加入像素容差或伪称原始两图相等。不能据此承诺跨环境、跨浏览器版本逐字节恒定。
- 宽图的合适复核视口为 840/1200；未声明 375px 的整张 21:9 缩略图正文可读。方图另有 375/390 实际预览。
- 不验证微信后台裁切、安全区、设备差异或平台规则；没有平台上传/发布集成。实际发布仍需作者预览平台结果。
- 没有 OCR、事实核查、语义等价检测、自动改标题或二次摘要；调用者声明不能替代作者复核。agent 查看截图也不等于人类已签收。
- 未扩展其余 46 个模板的 wechat-wide，也未增加 T01 slide，未更改模板总数或把旧 portrait 缩略图当作新画幅验收。
- 本次交付 Draft PR，不自动合并。
