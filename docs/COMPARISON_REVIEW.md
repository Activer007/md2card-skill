# 同文比较：精确产物视觉复核

复核日期：2026-10-25（Asia/Shanghai）。此记录只覆盖下列 11 个成功案例与 1 个明确拒绝。

源码提交：`ba10171bd67651af6b7b24b45ce854a31d738fcb`；Git 树：`29ac782a1160a18c487170c5342805e745d29d53`。

[CI 运行](https://github.com/Activer007/md2card-skill/actions/runs/40079675432)，artifact `12554412890`；原始 ZIP SHA-256：`218dfc6d0d0c8a73d3606ca1883d05983393273c5d3113a7079257b8c2f16b3b`。技术绑定摘要：`aa7b421b28031cdeece6650a73ff8376f19a3369d27c06b4a5e8db87d013745f`。

## 方法与边界

逐例查看原始 1080×1440 PNG、自然 375/390px 手机图，以及从同一原生 PDF 使用 Poppler 渲染的完整页面，逐段对照三份原文，核对来源说明和页码。发布目录文件摘要与原始 ZIP 的技术绑定一致；没有修改输入、字体、样式或产物。每份 PDF 均为单页 810×1080 pt。

CI 的 pdftotext 原文核对通过。本地 pypdf 对部分汉字提取为兼容部首，NFC 精确比较有差异，NFKC 对照未发现原文片段缺失；这一工具差异保留，不作为精确 Unicode 一致声明，也不放宽产品的 NFC 检查。逐例 PDF 页面摘要在结构化记录中保留。

验收仅覆盖 standard / portrait / manual 和本次 CI 字体环境，不证明其他内容、密度、画幅、字体或 Windows 重新排版等价。内容完整、手机可读、来源可见与构图适用性分开评价：短尾和窄栏换行作为明确限制随图片显示，未声称已修复或零孤行。图库自身的筛选、键盘、file:// 与手机交互另行验证。

## short-reading

[完整原文](../examples/refinement/short-reading.md)。正文 SHA-256：`d1588f3f5868c569a91434228b3beb71417a6a8935ef93eda59eb31fb1c05b8e`。

### short-T04 · T04 v2

居中衬线标题、全宽导语和纵向分节清楚；正文与来源完整。两个末行分别为“处。”“断。”，手机图和 PDF 同样可见。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/short-T04.md) · [完整 PNG](evidence/refinement-run-40079675432/refinement/short-T04/card-001.png) · [375px 手机图](evidence/refinement-run-40079675432/refinement/short-T04/mobile-375.png) · [390px 手机图](evidence/refinement-run-40079675432/refinement/short-T04/mobile-390.png) · [原生 PDF](evidence/refinement-run-40079675432/refinement/short-T04/cards.pdf)。

有限范围结论：本例两段出现“处。”“断。”单字短尾；内容完整，但断行欠佳。可比较同组 T06/T10，不把本例视为无孤行排版。后续如修改样式，必须重新出图并建立新绑定；本记录不冒充排版修复。

### short-T06 · T06 v3

两块明暗对比面板形成明确阅读顺序；正文、两段小标题、来源和页码完整，手机尺寸可读。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/short-T06.md) · [完整 PNG](evidence/refinement-run-40079675432/refinement/short-T06/card-001.png) · [375px 手机图](evidence/refinement-run-40079675432/refinement/short-T06/mobile-375.png) · [390px 手机图](evidence/refinement-run-40079675432/refinement/short-T06/mobile-390.png) · [原生 PDF](evidence/refinement-run-40079675432/refinement/short-T06/cards.pdf)。

### short-T10 · T10 v3

蓝色导语、右上分节、下方横向分节保持独立构图；大标题清楚，全部正文和来源可见。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/short-T10.md) · [完整 PNG](evidence/refinement-run-40079675432/refinement/short-T10/card-001.png) · [375px 手机图](evidence/refinement-run-40079675432/refinement/short-T10/mobile-375.png) · [390px 手机图](evidence/refinement-run-40079675432/refinement/short-T10/mobile-390.png) · [原生 PDF](evidence/refinement-run-40079675432/refinement/short-T10/cards.pdf)。

### short-T13 · T13 v2

两行大标题与黄色海报构图适用于这个短例；两段横向内容及来源完整，没有裁切。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/short-T13.md) · [完整 PNG](evidence/refinement-run-40079675432/refinement/short-T13/card-001.png) · [375px 手机图](evidence/refinement-run-40079675432/refinement/short-T13/mobile-375.png) · [390px 手机图](evidence/refinement-run-40079675432/refinement/short-T13/mobile-390.png) · [原生 PDF](evidence/refinement-run-40079675432/refinement/short-T13/cards.pdf)。

## medium-reading

[完整原文](../examples/refinement/medium-reading.md)。正文 SHA-256：`eea3a2d0bcfa419a25a6e60b6d84cf48b39d711ac9311906ab042e31c13a5fac`。

### medium-T04 · T04 v2

纵向全宽阅读带容纳全部中篇原文，标题、段落、来源和页码清楚；未见遮挡或裁切。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/medium-T04.md) · [完整 PNG](evidence/refinement-run-40079675432/refinement/medium-T04/card-001.png) · [375px 手机图](evidence/refinement-run-40079675432/refinement/medium-T04/mobile-375.png) · [390px 手机图](evidence/refinement-run-40079675432/refinement/medium-T04/mobile-390.png) · [原生 PDF](evidence/refinement-run-40079675432/refinement/medium-T04/cards.pdf)。

### medium-T06 · T06 v3

中篇形成较长的左右面板，全部原文和限定语保留；左栏以“出处。”结束，未出现单字独行或裁切。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/medium-T06.md) · [完整 PNG](evidence/refinement-run-40079675432/refinement/medium-T06/card-001.png) · [375px 手机图](evidence/refinement-run-40079675432/refinement/medium-T06/mobile-375.png) · [390px 手机图](evidence/refinement-run-40079675432/refinement/medium-T06/mobile-390.png) · [原生 PDF](evidence/refinement-run-40079675432/refinement/medium-T06/cards.pdf)。

### medium-T10 · T10 v3

蓝色导语、右上内容与下方分节完整；底部小标题分两行，正文和来源仍清楚，未见重叠或裁切。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/medium-T10.md) · [完整 PNG](evidence/refinement-run-40079675432/refinement/medium-T10/card-001.png) · [375px 手机图](evidence/refinement-run-40079675432/refinement/medium-T10/mobile-375.png) · [390px 手机图](evidence/refinement-run-40079675432/refinement/medium-T10/mobile-390.png) · [原生 PDF](evidence/refinement-run-40079675432/refinement/medium-T10/cards.pdf)。

### medium-T13 · T13 v2

完整中篇超过 T13 容量；screen/print 可用高度 1221、占用约 1433。没有成功预览，不缩字或删原文。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/medium-T13.md) · [溢出诊断](evidence/refinement-run-40079675432/refinement/medium-T13/overflow.json)。

## mixed-reading

[完整原文](../examples/refinement/mixed-reading.md)。正文 SHA-256：`9ad5321fd1b8a8f701da38442c6ecf31d286317b1fa59d8885e647d2a121a737`。

### mixed-T04 · T04 v2

中英文全宽段落可读，source/context 小标题和 interpretation/uncertain evidence 均完整，未见缺字或裁切。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/mixed-T04.md) · [完整 PNG](evidence/refinement-run-40079675432/refinement/mixed-T04/card-001.png) · [375px 手机图](evidence/refinement-run-40079675432/refinement/mixed-T04/mobile-375.png) · [390px 手机图](evidence/refinement-run-40079675432/refinement/mixed-T04/mobile-390.png) · [原生 PDF](evidence/refinement-run-40079675432/refinement/mixed-T04/cards.pdf)。

### mixed-T17 · T17 v2

深色纵向编号路线和绿色小标题保持层级，正文与来源完整；两个段落分别出现“源。”“论。”单字短尾。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/mixed-T17.md) · [完整 PNG](evidence/refinement-run-40079675432/refinement/mixed-T17/card-001.png) · [375px 手机图](evidence/refinement-run-40079675432/refinement/mixed-T17/mobile-375.png) · [390px 手机图](evidence/refinement-run-40079675432/refinement/mixed-T17/mobile-390.png) · [原生 PDF](evidence/refinement-run-40079675432/refinement/mixed-T17/cards.pdf)。

有限范围结论：本例出现“源。”“论。”单字短尾；内容完整，但断行欠佳。混排可比较同组 T04/T18。后续如修改样式，必须重新出图并建立新绑定；本记录不冒充排版修复。

### mixed-T18 · T18 v2

深色面板与蓝色分节标题清楚，中英内容完整；下方留白较大，属于本例短内容的构图节奏。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/mixed-T18.md) · [完整 PNG](evidence/refinement-run-40079675432/refinement/mixed-T18/card-001.png) · [375px 手机图](evidence/refinement-run-40079675432/refinement/mixed-T18/mobile-375.png) · [390px 手机图](evidence/refinement-run-40079675432/refinement/mixed-T18/mobile-390.png) · [原生 PDF](evidence/refinement-run-40079675432/refinement/mixed-T18/cards.pdf)。

### mixed-T33 · T33 v2

衬线双栏保持版面特征，全部原文、来源和页码可见；右侧窄栏使 uncertain 与 evidence 分行，英文阅读节奏更碎。

[精确生成输入](evidence/refinement-run-40079675432/refinement/inputs/mixed-T33.md) · [完整 PNG](evidence/refinement-run-40079675432/refinement/mixed-T33/card-001.png) · [375px 手机图](evidence/refinement-run-40079675432/refinement/mixed-T33/mobile-375.png) · [390px 手机图](evidence/refinement-run-40079675432/refinement/mixed-T33/mobile-390.png) · [原生 PDF](evidence/refinement-run-40079675432/refinement/mixed-T33/cards.pdf)。

有限范围结论：窄栏让 uncertain 与 evidence 分行；本例保留完整文字，但英文较多时阅读更零碎。后续如修改样式，必须重新出图并建立新绑定；本记录不冒充排版修复。

## 状态

三组同文具备这 11 个精确成功预览的有限视觉复核与 1 个精确拒绝记录，不扩大已有 48 套注册示例的验收范围。六种图片比例测试与四个长文拒绝另列技术/观察记录，不借用本记录获得验收。
