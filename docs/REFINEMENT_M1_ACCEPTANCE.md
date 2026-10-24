# M1 精修的有限范围验收

## refinement-m1-v2

独立结论：通过，限本记录明确的输入、版本、环境与产物。13 个改动模板的全尺寸 PNG、375 / 390 px 自然手机图和原生 PDF 均有独立复核或精确像素一致性承接依据，具体方法见末节；五项修正及两项先前失败的压力输入已重新逐图复核。CI 绿色不是本结论的替代依据。

日期：2026-10-24。范围仅为下列 13 个 v2 注册输入，standard、portrait 3:4、1080 × 1440、manual。该批不扩展为其他密度、任意内容、其他画幅或后续里程碑的验收。

### 精确源码、运行与原始产物

- PR17 实际头提交 [ab2ab651772a03fef2e6ea1a7eab269156a10e6b](https://github.com/Activer007/md2card-skill/commit/ab2ab651772a03fef2e6ea1a7eab269156a10e6b)。
- 完整代码树：`7771499ef8fbc8a9c34186454007d565e6abc470`。
- CI 合并预览：`45dbd54af1e7858297deca9d0ca80bc2c35cdf89`。它与上述 PR 头提交经 Git 对象核对为同一完整树，不混用后续代码的像素。
- [CI 运行 40070791479](https://github.com/Activer007/md2card-skill/actions/runs/40070791479)：343 项测试通过，0 失败、0 跳过。
- [原始产物 12550928744](https://github.com/Activer007/md2card-skill/actions/runs/40070791479/artifacts/12550928744)，原始 ZIP SHA-256：`5de2f819cbddd388d62f5ca7fe33eabc813faa3d38d8ec98921b4a0201089064`。逐项比较归档与解包目录的 1100 个文件，全部一致。
- [结构化逐项来源记录](refinement-m1-provenance.json) 保留输入、PNG、PDF、两种手机图、manifest、源资产及自动测量哈希。PDF 和手机图仍在上述原始归档中，仓库仅复制本批 13 张原始 PNG；未重编码、缩放或裁切。
- CI 源码清单的 156 个文件与冻结阶段逐字节一致，清单集合 SHA-256：`7b818b3b04bac01d5b774189e83ccfd02c58e383f9d281334b8ac272b33a0455`。48 个 v1 原始输入、PNG 与历史绑定均复核一致；此准备过程未修改旧图、旧证据、原稿或素材。

### 逐项输入与当前 PNG

| 设计 | 当前 v2 原始 PNG | 完整原始输入 | 核对焦点与自动测量 | 独立审查 |
| --- | --- | --- | --- | --- |
| T06 | [PNG](images/refinement-m1-v2/T06.png) | [Markdown](../examples/templates/T06.md) | 双栏阅读宽度；正文测量最小约 9.154em。 | 通过，限本批 |
| T10 | [PNG](images/refinement-m1-v2/T10.png) | [Markdown](../examples/templates/T10.md) | 标题 / 正文比例 2.25。 | 通过，限本批 |
| T16 | [PNG](images/refinement-m1-v2/T16.png) | [Markdown](../examples/templates/T16.md) | 宽行观点块；自动孤字 / 标点尾行检查无错误。 | 通过，限本批 |
| T19 | [PNG](images/refinement-m1-v2/T19.png) | [Markdown](../examples/templates/T19.md) | 标题 / 正文比例 2.20。 | 通过，限本批 |
| T20 | [PNG](images/refinement-m1-v2/T20.png) | [Markdown](../examples/templates/T20.md) | 完整界面图、紫色双面板和外部正文；图内微字不作为手机正文。 | 通过，限本批 |
| T22 | [PNG](images/refinement-m1-v2/T22.png) | [Markdown](../examples/templates/T22.md) | 标题 / 正文比例 2.15。 | 通过，限本批 |
| T24 | [PNG](images/refinement-m1-v2/T24.png) | [Markdown](../examples/templates/T24.md) | 标题 / 正文比例 2.25；表格不以嵌套字号缩小。 | 通过，限本批 |
| T26 | [PNG](images/refinement-m1-v2/T26.png) | [Markdown](../examples/templates/T26.md) | 批注清单的留白节奏；已在本批精确产物中独立复核。 | 通过，限本批 |
| T32 | [PNG](images/refinement-m1-v2/T32.png) | [Markdown](../examples/templates/T32.md) | 顺序阅读带；段落测量最小约 20.195em。 | 通过，限本批 |
| T34 | [PNG](images/refinement-m1-v2/T34.png) | [Markdown](../examples/templates/T34.md) | 顺序主栏 / 侧记，不再首字下沉；段落测量最小约 19.238em。 | 通过，限本批 |
| T39 | [PNG](images/refinement-m1-v2/T39.png) | [Markdown](../examples/templates/T39.md) | 人像与侧栏；段落测量最小约 11.579em，自动尾行检查无错误。 | 通过，限本批 |
| T40 | [PNG](images/refinement-m1-v2/T40.png) | [Markdown](../examples/templates/T40.md) | 完整特写与编号对应；下文记录实际 contain 缩放测量。 | 通过，限本批 |
| T45 | [PNG](images/refinement-m1-v2/T45.png) | [Markdown](../examples/templates/T45.md) | 植物与文字留白节奏；已在本批精确产物中独立复核。 | 通过，限本批 |

### 每项输入、PNG、PDF SHA-256

每项原始归档目录为 `templates/Txx/`；PNG 为 `card-001.png`，PDF 为 `cards.pdf`。以下均为完整 SHA-256。

| ID | 输入 | PNG | PDF |
| --- | --- | --- | --- |
| T06 | `a1d24b90a1dfeb3fa66d45b4dd0fdc56f71fdb7a2ab44e1c5564cd8a4c66620d` | `00b6b5073e8d4078b2415ceb4d7f969c816ae35f9cf3124514ec2fdc92bea637` | `a3265cddbe519ec869c4d1f1f3c0d2b12eac185cdc07e1e3562d51ada92a8eed` |
| T10 | `b1bed4b68c1dd452afbcc4b177513e7e11a90011d72f665c0975df556cd937aa` | `337f66f93ba7d9de16b8796d4f9dabdeca95ebe0d61423410c66b1369a285277` | `bfb51ed7d046c6a9918c739c2b1c57020cd018038f1f76dc5cf1230aa13eb98f` |
| T16 | `b7a1ba6c4e7ce91c35fe868c2b7bad0bf558187cfa3d77177d5ebfe6f1cc361f` | `ba5ca239e06e8c63a2621a791a1c604c76e1810c2f66603e084d64f64892fab2` | `c689e65ff804cf2c759392cdb8d52781cdae32413d8e0426e61c348f6e30f295` |
| T19 | `32f5ae623299ddc4b74435ade77f31e2fe93f0686db3983692b0a035e248c17a` | `6eccf71c62668f160baaa45343db1c18a63ada43f699292d5e152007f5fb5efb` | `bb5e1b8c146b9021683a1a2f37cd9ecb1e17e28dae8e141d8d98d5b57e264afc` |
| T20 | `0b56fdfa68cf2f94e3d8249cf48beaebe1de3941dc38cd2f22eb631b80c9f483` | `afef9c0f0d2f2799bf1caea88e31234bd5bd515192d698c842a327a0310520e4` | `6397df62bd93dfcf4f2367cb0148a95dbe07994b73245c69c4de82fd265c4b0c` |
| T22 | `cbef06e848d7a07fd6bd43f01d9a663a176290957b3a76558e6783c98b74801f` | `1c9f20025138a4751da822ebf8044fabed5426cafb3787c1e0511874333b139a` | `97a0c18a874cd241b59457e62ae317cbd0dbc4bfbcb16f2e8496d98aefa6abd0` |
| T24 | `874a4dd2c38f8416fa8a79d6e830becf82e7e4099c6ecae8e6f0c834586a4dfa` | `d500a3c78bf4bd056bdbecdc99ddee1737400f506eff2dfd083d33bea086dba4` | `cf802729bda20c9dab380aafe43487975ebd735c859c0b3775a28917ca55c350` |
| T26 | `ba68d129d10d4391da1eecd3841e23f8ef64374c5eb846d76426900ef62e5dba` | `c89f3ccf87940fd769d2c9d6f7e978dcf6a2e919bb2a6029b44ebfa260619bbe` | `c8c75873ea72689953167d41bdb4a36f1b7f996f9431da9364e887e2735f1288` |
| T32 | `afcb8f7815c2ad2e3335287631af536de010abcd08bbeac327003f9f8f3586a6` | `1fdcf0d71ea5c041e855438b19a0c543ea652ac4f121615b3e478f9960fa1cbf` | `3b0bb1066820b0071c987c8fc04b2e1e999bdb5e3485ef2ea8c1cc0c071495f4` |
| T34 | `e4fa1c47103570e639417c330c420af3ac8734b7a736b1fd42d123c2a3936ece` | `3b5c6ec93c4ac942b34108a7b27c255843be0546ea85fb973e1ebfb6a52ad769` | `3065b4ead0b013222decf7258eb8dda0afc5bb8346447b5ea6c70aed97d9bb5e` |
| T39 | `fa0dbafb2f37bff04dce529519cc38b34d3bf81555127d609d7d2484ab9af940` | `412a416f7846457c30d658b9b435833022c2392a0a8fe8c4c22769ba54fa84f2` | `d6e9ba810b86ae61028f29375315aafa8ff225ebadfe414d490ce60311498d7e` |
| T40 | `255a1463e49c46e5120be7feda683f45f30fb34fabd2efacbac2ba9eefce40e3` | `cf612582cc82c722e7e264dc27de0591d59fd04e24560a591d906d53cc9f135c` | `50dda045c8dc9439085bf6a0b8e666ab169c73c85774730249afc14b26de05f6` |
| T45 | `6b035a832a32f08e81b0e104828cfe8bde972aa562bd77e28f8f0e8c2c79a714` | `2f02f1b260f0ebf63d9710fe8a8450169bef1357f49e26637ed0bfd5ce236534` | `84da2449eaebb95b442a6700df094d9ce893c3ddcbac6757496469510c4ebe62` |

### 两种自然手机视口的精确图片哈希

375 / 390 px 视口分别对应 351 / 366 px 内卡。13 项的正文最小有效字号均为 15.093 / 15.738 px，必要注释均为 11.7585 / 12.261 px。每项自动 refinement errors 为空；这些度量仅作支持证据，独立视觉结论另外记录。

| ID | mobile-375.png SHA-256 | mobile-390.png SHA-256 |
| --- | --- | --- |
| T06 | `8972792e1db408c2610984692094fcb45f46b03de661113de70d76e72ccd663f` | `00b4c74c5e4f7fb872c2ff42796821572486670d04623525703413d3d896aac9` |
| T10 | `f587e3d3c6fad8397b6bcdcb0c5eb5a833d2e9ea89bb9ae9d54fd2537f5848ec` | `52bd88d27b7443c157f2d1f627614a0d489d6b131bb2e79f6d28bd54c1064705` |
| T16 | `a47205542944580fe660907ed0febff9df161fe6999a3f97fc2b2c27262c37c1` | `8d3ab78c8e75274a1fd68ad880596112429c25a9dde5da90ee1df0dfee254bea` |
| T19 | `4febf5e418a0c8c59b26155192999d9aa6fa6ccc40fb1c31866324035d513bef` | `80b1d11779c301015abd1d31fc9ab22a1289bf204d0f3285d0cc758a82e6d586` |
| T20 | `92752ea2895dd1365c4cb8d965b8d6c8be7242dca3d4d62ae284dab3a3cf1cc8` | `9dfafd0a45dd2593ac9f76f8d822f6b6e35d95fde7b8d75fee1295360500d792` |
| T22 | `a9c8aa204a44b43e2b178493c4e566d1cbca4254f40be201c61edf6de990fc38` | `3d8f37e6d556c3e5942806842dc02e9dcb76f10e0107cc7aa1507647b6c5792b` |
| T24 | `a4b5d0c8efba1ca23e6e13b90a5a5e12557689505d16b0ceb697c346e4dd1a66` | `48d24748fdd47ff7ac80cf019ad2384b683c34695ae3d3d34d60bf2b4697056c` |
| T26 | `f86b40da6452a3cbf223070bc3a7417fafee29254a146d4428d762a9552cde08` | `95a41d71ba5b040c9fae241a17cca358113171761b6cd4dbf613b9472b63523e` |
| T32 | `80b61c3c46df037ec85412567caf6c53c138e6495759a4af82848f90aa616d2c` | `b9f02db508ab0ea49d29dc9d3c01e706a76b14822a87525fe8955c307b3f660b` |
| T34 | `03a64a3e7f6359ba95a9f75c1a5abb3b4f9cd9026cff5d1ff83e4cad5e30447a` | `932833813cf5f035c997a696ca8d01aa3d9b23dfd35690d9e6eff87c22aeffb0` |
| T39 | `d358960c7a425ffec598a2284c72952ef52eccec1fccb595f67289d38723311f` | `b5358b9d02787e8fd4cc9c7826a441492a2188fc4a5a14997dc5e11996fa5570` |
| T40 | `4c64889ae9cdb9fa14fdb280739779300938d715897ffe5a7be965657f0eed26` | `d6f2fa4f6e8e0c04a08a1833c3f13211dc6cef5507effe8d626fdc8d4c7443e8` |
| T45 | `0b3b2af394a01f31c9b38f91091b20212d62aceb9b7a832ea3b18b36f93d2153` | `07a3e3c10bd565eaeb6dbb1cc792158905b6f633b343fbea13b0faf8ffb510b1` |

### 图像的实际测量与阅读边界

测量来自该 CI 精确产物的 `templates/T20/mobile-audit.json` 与 `templates/T40/mobile-audit.json`。保留小数原值见 JSON；下表仅四舍五入显示。

| 模板 / 度量 | 375 px 视口（351 px 内卡） | 390 px 视口（366 px 内卡） |
| --- | --- | --- |
| T20 完整图片宽度 | 261.064145 px | 272.220751 px |
| T40 实际图片 sourceScale | 0.233041112563 | 0.243000142715 |
| T40 原图 48 px 编号的等效字号 | 11.185973 px | 11.664007 px |

- T20 注册横图在两种自然视口均超过 240 px 的完整图像宽度门槛，object-fit 为 contain。它是界面概览，图内微小文字仍不认证为手机正文。压力案例中的完整竖向历史截图更窄，不能将注册横图门槛或阅读结论移植到该截图。
- T40 数字的原始字体设定为 48 px，实际等效字号按测得的 contain sourceScale × 48 得出，两者均超过 11 px。该值是等效字体尺寸，不是对栅格墨迹边界的测量，也不是独立读字结论。源资产保持 1200 × 680、完整显示、不裁切。
- T26 / T45 的留白、图片细节、中文读序与文字密度已在上述固定产物范围内独立复核；自动无溢出本身仍不能替代此判断。

### 自动回归与压力结果

- 48 / 48 注册模板成功导出，screen / print 溢出检查与可检索 PDF 检查通过；48 个注册模板的过量长文均返回预期 CONTENT_OVERFLOW，而不是裁切输出。
- 18 / 18 压力结果符合预期：13 项真实导出、3 项长文 CONTENT_OVERFLOW、2 项无效资产 INVALID_ASSET；不是 18 项都成功渲染。13 个成功压力案例保留 PDF 文本核对及两种手机图，原始摘要仍明确 visualReview: not-performed。
- 图库 51 / 51 检查通过，17 张截图；运行时为 35 个当前已绑定、13 个待审，不能将该历史截图称为更新后的 48 项当前图库验收；本文件本身不修改注册表或绑定。
- 22 项画幅结果符合预期：12 项导出，4 项原文在非默认画幅允许拒绝溢出，6 项长文预期拒绝。两组既有系列（evidence-reading 5 卡、mean-tutorial 3 卡）导出与 PDF 检查通过。系列仅报告技术回归，不据此认证当前连续阅读的视觉效果；此处不扩大本批视觉验收范围。

| 压力案例 | 模板 / 密度 | 实际结果 |
| --- | --- | --- |
| short-compact | T01 / compact | 成功导出；本表报告自动结果 |
| short-standard | T01 / standard | 成功导出；本表报告自动结果 |
| short-editorial | T01 / editorial | 成功导出；本表报告自动结果 |
| medium-nested-url | T04 / compact | 成功导出；本表报告自动结果 |
| medium-code | T18 / standard | 成功导出；本表报告自动结果 |
| medium-table | T24 / editorial | 成功导出；本表报告自动结果 |
| long-compact | T04 / compact | 预期拒绝：CONTENT_OVERFLOW |
| long-standard | T04 / standard | 预期拒绝：CONTENT_OVERFLOW |
| long-editorial | T04 / editorial | 预期拒绝：CONTENT_OVERFLOW |
| notebook-headings | legacy notebook / 默认 | 成功导出；本表报告自动结果 |
| image-landscape | T37 / standard | 成功导出；本表报告自动结果 |
| image-portrait | T39 / standard | 成功导出；本表报告自动结果 |
| image-alpha | T45 / standard | 成功导出；本表报告自动结果 |
| image-screenshot | T20 / standard | 成功导出；本表报告自动结果 |
| image-extreme-wide | T37 / standard | 成功导出；本表报告自动结果 |
| image-extreme-tall | T37 / standard | 成功导出；本表报告自动结果 |
| asset-missing | T37 / standard | 预期拒绝：INVALID_ASSET |
| asset-corrupt | T37 / standard | 预期拒绝：INVALID_ASSET |

先前真实失败的 T24 / editorial medium-table 现有可用高度 1222 px、占用 1221.578125 px；T20 image-screenshot 可用 1290 px、占用 1280.078125 px。两者均通过 screen / print 及 PDF 自动检查。尤其前者余量很小，只证明该精确输入与运行环境，不表示任意更长表格可用。相关完整输入和产物哈希见 JSON 的 pressure 数组。

### 环境、复现与保留的边界

该 CI 的模板 manifest 记录 Node 22.23.3、Playwright 1.64.1、Chromium 156.0.8078.4、Poppler 24.02.0，匹配中文字体 Noto Sans CJK SC。不同字体、系统或浏览器版本须重新核对。

在获得浏览器运行授权的匹配环境中，可用同一冻结树和原始输入复现，例如：

```sh
node scripts/render.mjs examples/templates/T20.md --out output/T20 --size portrait --paginate manual --format all --strict --preview
```

证据包由冻结源码、日志与已有产物核对整理，13 张当前 PNG 为原始字节副本。独立视觉结论针对上述精确树和运行，不引用后续里程碑产物。此记录本身不证明已发布、已合并或集成后的图库已重新检查。

### 独立验收结论与非阻断限制

- T20 / T24 / T32 / T34 / T40 及 T24 medium-table、T20 image-screenshot 在当前运行的全尺寸 PNG、两种自然手机图和原生 PDF 栅格中重新逐图复核通过。其余八项 T06 / T10 / T16 / T19 / T22 / T26 / T39 / T45 已在[上一精确阶段运行 40069835718](https://github.com/Activer007/md2card-skill/actions/runs/40069835718)独立检查，本轮全尺寸 PNG、两种手机 PNG 和原生 PDF 栅格均逐字节一致，因此明确承接原结论，而不是声称重新观看了不同像素。
- 独立一致性检查覆盖五项修正以外的 43 套模板：全尺寸 PNG、两种手机图，以及 1080 × 1440 原生 PDF 第一页 PPM 字节均与上一精确阶段一致。其中 35 项 v1 全尺寸 PNG 亦与历史验收基线字节及解码 RGBA 一致；不把旧像素重新命名为新设计。
- 独立核对确认 48 份原始 Markdown 字节未变，48 份模板与两份修正压力 PDF 均保留全部可见 HTML 字符，均为一页、810 × 1080 pt。字符覆盖仅作视觉检查的补充，不证明 tagged-PDF 读序、可访问性或字体可移植性；未变 PDF 的 Poppler Type-3 字形边界警告不被忽略或包装成无警告认证。
- T20 仍保留界面微字限制：图像仅提供整体上下文，解释必须由图外正文承担。T24 的 medium-table 压力例存在单独末字“供”，记录为次要、非阻断的断行润色，不扩张为任意表格内容可用。
- 旧 v1 图像与证据继续保留。M2 家族字体 / 主力重设计、M3 页脚 / 内容选择、M4 新系列 / 新画幅均不在本批证明范围。
- 图库等效 200% reflow 不是原生浏览器菜单缩放或完整读屏认证；源码支持不等于任意内容和全部画幅已验收。
