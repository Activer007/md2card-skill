# B02：实际回归与拒绝门槛

运行根目录为仓库根；证据根 `R=validation/visual-upgrade/m0-70383b8-20261025`。每次 Node 命令经证据包中的 `run-command.mjs` 执行，`commands/<name>.json` 保存完整 argv、cwd、开始/结束时间和退出码，对应 `.log` 保存输出。provenance 固定这些文件的 SHA-256。测试使用本机真实 Chrome，`CHROMIUM_PATH` 指向安装路径，`MD2CARD_REQUIRE_BROWSER=1`；没有设置浏览器跳过标记或伪造 PDF 工具。

## 命令与退出状态

| 命令 / 记录名 | 退出 | 结果 |
| --- | --- | --- |
| `node scripts/render.mjs --doctor --json` / doctor | 0 | WARN；依赖、浏览器路径、pdfinfo 可用，Fontconfig/pdftotext 不可用 |
| `node scripts/render.mjs --doctor --strict --json` / doctor-strict | 1 | 环境预检 FAIL；严格中文字体覆盖未验证、缺 pdftotext |
| package.json 的 `test:unit` 原始 Node argv / unit | 0 | 568 tests：567 pass、0 fail、1 skip，405.4 秒 |
| `node --test tests/export.test.mjs tests/pagination-export.test.mjs` / integration | 0 | 21 tests：20 pass、0 fail、1 skip，64.3 秒 |
| `node scripts/build-template-gallery.mjs --check` / gallery-check | 0 | 生成图库与已提交版本一致 |
| `node scripts/validate-gallery.mjs --allow-browser --out R/gallery --browser <Chrome>` / gallery-browser | 0 | 66/66 自动检查通过，实际生成 29 张截图 |
| `node R/capture.mjs` / goldens | 1 | 证据采集脚本首次漏 await 异步 resolver，输入图片被拒绝；不是产品回归。未生成导出；原始日志保留 |
| `node R/capture.mjs` / goldens-retry | 0 | 修正采集脚本 await 和 asset-root 后，4 套真实导出及 8 张手机截图完成 |
| `node R/rejections.mjs` / rejections | 1 | 首轮远程图片夹具缺 T20 必需 caption，先命中元数据校验；未覆盖图片拒绝分支 |
| `node R/rejections.mjs` / rejections-retry | 0 | 补齐夹具 caption 后 4/4 预期拒绝；每个 CLI 退出 1、无输出文件 |
| `node R/audit.mjs` / pdf-font-audit | 1 | PDF 页数、真实栅格化和字体记录完成；pypdf 完整片段比对失败，详见证据说明 |
| `node R/pdf-crosscheck.mjs` / pdf-crosscheck | 0 | 三引擎诊断完成；退出 0 仅代表诊断执行完成，不代表所有提取器通过 |

unit 脚本直接展开 package.json 的命令执行，未修改测试列表；它已经包含模板、页脚、字号、96 组 medium 默认 HTML 兼容、画幅、图片校准、图库、证据验证及真实字号浏览器测试。不重复添加与现有实现镜像的测试。

黄金导出实际调用的生产入口参数为：

```text
node scripts/render.mjs examples/templates/T20.md --asset-root examples/templates --out R/outputs/T20 --preview --timeout-ms 600000
```

其他三例仅替换 ID；真实执行采用 `exportCards(parseOptions(argv))`，argv 原样保存在 goldens.json。没有使用 strict（预检已明确失败），不把正常导出成功等同于严格 QA。每张 PDF 的 `pdfinfo` 和 `pdftoppm -f 1 -singlefile -scale-to 1440 -png ...` 真实命令/退出码见 pdf-audit.json；均退出 0。

## 四个拒绝夹具

| ID | 触发条件 | 最终错误码 | CLI 退出 | 导出文件 |
| --- | --- | --- | --- | --- |
| unknown-metadata | 未实现的 visualVariant | INVALID_METADATA | 1 | 无 |
| remote-image | T20 元数据完整，但图片为 https URL | INVALID_ASSET | 1 | 无 |
| unsupported-aspect | 原始 T20 + square | TEMPLATE_ASPECT_UNSUPPORTED | 1 | 无 |
| auto-template | 原始 T01 + auto | PAGINATION_UNSUPPORTED_METADATA | 1 | 无 |

前两个原始文件与案例清单在 `tests/fixtures/visual-upgrade/`；后两个复用现有原始输入。命令和 JSON 错误全文保存在 `rejections.json`；初次夹具错误保存在 `rejections-attempt1.json`，不篡改历史记录。

## 跳过、未执行与阻塞

| 项目 | 状态 / 原因 | 后续处理 |
| --- | --- | --- |
| unit 的真实微型 PDF Poppler QA | SKIP 1；两个 Poppler 工具不齐 | 提供真实 pdftotext 后重跑；mock 严格失败测试已执行 |
| integration 的非 1 起始列表 PDF 编号 | SKIP 1；明确需要 pdftotext | 完整环境重跑；不以截图替代文字编号检查 |
| 集成测试内的其他 PDF 提取分支 | NOT-RUN；日志含 5 次 pdftotext unavailable 诊断，所在测试的其他导出断言通过 | 总 pass 数不代表这些子检查通过 |
| Fontconfig 中文字形覆盖及角色匹配 | BLOCKED；fc-list/fc-match 缺失 | CDP 实际字体及当前输出可见性是补充证据，不替代该门槛 |
| 官方严格 PDF 原文检查 | BLOCKED；pdftotext 缺失 | PDFium/pypdf/pdfplumber 结果单列，不能冒充严格通过 |
| `validate:templates` 全量严格导出及全部压力矩阵 | NOT-RUN / 环境阻塞；该脚本逐例固定 --strict，本机预检已经失败 | 完整环境再跑。四个 M0 样例已真实导出，模板源级测试已包含在 unit；不声称全 48 套新像素验收 |
| 全部 refinement/series/aspect/tail 的浏览器压力命令 | NOT-RUN；超出本次四例最小基线，且严格工具不齐 | 相应后续 PR 按触及范围补跑；现有相关单元测试已运行 |
| 全图库人工逐项视觉、读屏/辅助技术检查 | NOT-RUN / 待人工环境 | 自动 66/66 不等于人工或辅助技术通过；未更改图库 pending 状态 |
| 跨平台/跨 Chrome/跨字体逐像素一致性 | NOT-RUN | 当前 PNG 是固定本机环境快照；PDF 自带时间元数据，后续哈希不同本身不等于视觉回归 |

本轮默认运行时代码差异为零；没有自动刷新历史快照。首次采集/夹具错误已修正；pypdf 严格片段比对失败保留为真实发现。完整结果和下一阶段门槛见 [BASELINE-EVIDENCE](BASELINE-EVIDENCE.md)、[ADR-001](ADR-001.md)。

## 发布审查复核（2026-10-25）

修复了证据包仅存在于本地忽略目录、远程无法审阅的问题：原 ZIP 以相同字节提交到 `docs/evidence/visual-upgrade-m0-70383b8.zip`，同步 provenance 和文档链接。复核 ZIP 大小/哈希、索引哈希、140 个索引文件的大小/哈希、141 个 ZIP 条目的完整集合、45 份基线 Git 源文件哈希和 4 份原始黄金输入，均一致。包内无字体二进制或安装副本。

在新的输出目录复跑四个拒绝用例，均为预期错误码、退出 1 且无导出；图库生成一致性检查通过。原始证据没有覆盖，采集时文档快照保留。发布审查还将“当前未提交”和开放 PR 数量等表述限定到采集阶段，并记录 M0 → M1-A 合并顺序。运行时代码未变，因此未重复整套浏览器导出；上述严格 PDF/字体环境限制仍有效。
