# M4 原创虚构封面样例

四份输入分别编写；不是把宽图裁成方图，也不是脚本自动缩写。T01 两份示例都说明完成记录不能证明理解；T21 两份都保留 38%、100 人开始、38 人提交、第 1 周、人数口径、每人只计一次、未评作答质量及虚构来源。它们仅为开发验收样例，不能作为真实课程调查发布。

实际使用时，作者必须逐项确认两份自己的 Markdown。`--author-confirmed` 是调用者声明，不是工具核实语义一致。不同数字/来源不会被自动“修正”，每次输出都提示人工核对。

```sh
node scripts/render-cover-pair.mjs --wide examples/wechat-covers/T01-wide.md --square examples/wechat-covers/T01-square.md --author-confirmed --out output/t01-pair --strict
node scripts/render-cover-pair.mjs --wide examples/wechat-covers/T21-wide.md --square examples/wechat-covers/T21-square.md --author-confirmed --out output/t21-pair --strict
```

可加 `--asset-root . --brand brand.json --footer "署名" --footer-mode poster`，Logo 和来源在两套独立产物中保留。首次使用安装项目依赖，并按渲染文档配置 Chromium、字体和 Poppler；`--strict` 真实验证字体与 PDF 工具。

输出 `wide/` 和 `square/`，各含 `cards.html`、`card-001.png`、`cards.pdf`、`preview.html`、`manifest.json`；根目录含 `pair-preview.html`、`pair-preview.png`、`pair-manifest.json`。组合 HTML 只引用相对本地 PNG，不需要服务、网络或脚本。预览会整体等比缩放各张独立成品，不参与原生卡片布局。

明确拒绝示例：

```sh
# 缺少 --author-confirmed：PAIR_CONFIRMATION_REQUIRED
node scripts/render-cover-pair.mjs --wide wide.md --square square.md --out output/pair
# T01 不支持 16:9：TEMPLATE_ASPECT_UNSUPPORTED
node scripts/render.mjs examples/wechat-covers/T01-wide.md --size slide --out output/wrong-aspect
# T04 不支持 21:9：TEMPLATE_ASPECT_UNSUPPORTED
node scripts/render.mjs examples/templates/T04.md --size wechat-wide --out output/wrong-template
```

单边超过几何边界：`CONTENT_OVERFLOW`；任一输入不是单卡 T01/T21：`PAIR_INPUT_UNSUPPORTED`；两参数指向同一真实文件：`PAIR_INPUTS_NOT_DISTINCT`；目标非空：`OUTPUT_EXISTS`。失败会清理本次 staging，已有目标文件不会被覆盖。包装器不支持分页、独立覆写尺寸或省略第二份输入。

参见 [M4 证据与限制](../../docs/visual-upgrade/M4_WECHAT_COVERS.md)。T21 square 是既有布局，本次只增加它的配对短输入，不修改其 CSS。
