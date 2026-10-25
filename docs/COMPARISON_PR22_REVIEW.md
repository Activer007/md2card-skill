# PR22 同文比较：真实产物重新绑定

2026-10-25。源码提交 05f6bb6e484cb8887ea037e520a733db9303563d，tree 9dee88002e629b44dbd7e141874fe5388b5e7b9d。[CI运行](https://github.com/Activer007/md2card-skill/actions/runs/40079964688)，artifact 12554054288，ZIP SHA-256 794985f23429b86be89a8790070ee4f2e4b168d8160239bcb5dfc06761d52d5b。技术绑定摘要 647ad2a81847358e4e84ee8eac4cc7f58604b457f665003ba64efa13c876576f。

22案例重新核验为17成功/5预期拒绝，199个原始条目均绑定，HTML/preview由匹配PR22语义重建后逐字节一致。图库只使用其中三组11个成功比较与1个T13中篇拒绝。

## 视觉结论的保留依据

[原独立复核](COMPARISON_REVIEW.md)保持不变。本次核对11例完整PNG和22张375/390手机图均与已查看版本逐字节相同；新PDF文件哈希已变化，不能沿用旧PDF身份，已逐份读取并重新栅格化，11张完整页面PNG也与原复核记录摘要完全一致。因此沿用这些精确像素的视觉观察与限制，不声称重新人工查看了44张不同的新图。[等价性记录](evidence/refinement-run-40079964688/visual-equivalence.json)和[新PDF审计](evidence/refinement-run-40079964688/native-pdf-audit.json)分别记录来源、旧新PDF及相同页面摘要。

全部17份成功PDF单页810×1080pt，无旋转；本地pypdf的NFC提取仍有兼容字形差异，NFKC片段均存在，不声称本机精确Unicode通过。验收只覆盖standard/portrait/manual及CI字体环境。图库交互需对最终本地候选重新验证。

## short-reading

### short-T04

居中衬线标题、全宽导语和纵向分节清楚；正文与来源完整。两个末行分别为“处。”“断。”，手机图和 PDF 同样可见。

本例两段出现“处。”“断。”单字短尾；内容完整，但断行欠佳。可比较同组 T06/T10，不把本例视为无孤行排版。

[short-T04.md](evidence/refinement-run-40079964688/refinement/inputs/short-T04.md) · [manifest.json](evidence/refinement-run-40079964688/refinement/short-T04/manifest.json) · [cards.html](evidence/refinement-run-40079964688/refinement/short-T04/cards.html) · [preview.html](evidence/refinement-run-40079964688/refinement/short-T04/preview.html) · [cards.pdf](evidence/refinement-run-40079964688/refinement/short-T04/cards.pdf) · [card-001.png](evidence/refinement-run-40079964688/refinement/short-T04/card-001.png) · [contact-sheet.png](evidence/refinement-run-40079964688/refinement/short-T04/contact-sheet.png) · [mobile-375.png](evidence/refinement-run-40079964688/refinement/short-T04/mobile-375.png) · [mobile-390.png](evidence/refinement-run-40079964688/refinement/short-T04/mobile-390.png) · [page-1-raw.txt](evidence/refinement-run-40079964688/refinement/short-T04/page-1-raw.txt) · [page-1-layout.txt](evidence/refinement-run-40079964688/refinement/short-T04/page-1-layout.txt) · [新PDF完整页面](evidence/refinement-run-40079964688/native-pdf-pages/short-T04.png)
### short-T06

两块明暗对比面板形成明确阅读顺序；正文、两段小标题、来源和页码完整，手机尺寸可读。



[short-T06.md](evidence/refinement-run-40079964688/refinement/inputs/short-T06.md) · [manifest.json](evidence/refinement-run-40079964688/refinement/short-T06/manifest.json) · [cards.html](evidence/refinement-run-40079964688/refinement/short-T06/cards.html) · [preview.html](evidence/refinement-run-40079964688/refinement/short-T06/preview.html) · [cards.pdf](evidence/refinement-run-40079964688/refinement/short-T06/cards.pdf) · [card-001.png](evidence/refinement-run-40079964688/refinement/short-T06/card-001.png) · [contact-sheet.png](evidence/refinement-run-40079964688/refinement/short-T06/contact-sheet.png) · [mobile-375.png](evidence/refinement-run-40079964688/refinement/short-T06/mobile-375.png) · [mobile-390.png](evidence/refinement-run-40079964688/refinement/short-T06/mobile-390.png) · [page-1-raw.txt](evidence/refinement-run-40079964688/refinement/short-T06/page-1-raw.txt) · [page-1-layout.txt](evidence/refinement-run-40079964688/refinement/short-T06/page-1-layout.txt) · [新PDF完整页面](evidence/refinement-run-40079964688/native-pdf-pages/short-T06.png)
### short-T10

蓝色导语、右上分节、下方横向分节保持独立构图；大标题清楚，全部正文和来源可见。



[short-T10.md](evidence/refinement-run-40079964688/refinement/inputs/short-T10.md) · [manifest.json](evidence/refinement-run-40079964688/refinement/short-T10/manifest.json) · [cards.html](evidence/refinement-run-40079964688/refinement/short-T10/cards.html) · [preview.html](evidence/refinement-run-40079964688/refinement/short-T10/preview.html) · [cards.pdf](evidence/refinement-run-40079964688/refinement/short-T10/cards.pdf) · [card-001.png](evidence/refinement-run-40079964688/refinement/short-T10/card-001.png) · [contact-sheet.png](evidence/refinement-run-40079964688/refinement/short-T10/contact-sheet.png) · [mobile-375.png](evidence/refinement-run-40079964688/refinement/short-T10/mobile-375.png) · [mobile-390.png](evidence/refinement-run-40079964688/refinement/short-T10/mobile-390.png) · [page-1-raw.txt](evidence/refinement-run-40079964688/refinement/short-T10/page-1-raw.txt) · [page-1-layout.txt](evidence/refinement-run-40079964688/refinement/short-T10/page-1-layout.txt) · [新PDF完整页面](evidence/refinement-run-40079964688/native-pdf-pages/short-T10.png)
### short-T13

两行大标题与黄色海报构图适用于这个短例；两段横向内容及来源完整，没有裁切。



[short-T13.md](evidence/refinement-run-40079964688/refinement/inputs/short-T13.md) · [manifest.json](evidence/refinement-run-40079964688/refinement/short-T13/manifest.json) · [cards.html](evidence/refinement-run-40079964688/refinement/short-T13/cards.html) · [preview.html](evidence/refinement-run-40079964688/refinement/short-T13/preview.html) · [cards.pdf](evidence/refinement-run-40079964688/refinement/short-T13/cards.pdf) · [card-001.png](evidence/refinement-run-40079964688/refinement/short-T13/card-001.png) · [contact-sheet.png](evidence/refinement-run-40079964688/refinement/short-T13/contact-sheet.png) · [mobile-375.png](evidence/refinement-run-40079964688/refinement/short-T13/mobile-375.png) · [mobile-390.png](evidence/refinement-run-40079964688/refinement/short-T13/mobile-390.png) · [page-1-raw.txt](evidence/refinement-run-40079964688/refinement/short-T13/page-1-raw.txt) · [page-1-layout.txt](evidence/refinement-run-40079964688/refinement/short-T13/page-1-layout.txt) · [新PDF完整页面](evidence/refinement-run-40079964688/native-pdf-pages/short-T13.png)

## medium-reading

### medium-T04

纵向全宽阅读带容纳全部中篇原文，标题、段落、来源和页码清楚；未见遮挡或裁切。



[medium-T04.md](evidence/refinement-run-40079964688/refinement/inputs/medium-T04.md) · [manifest.json](evidence/refinement-run-40079964688/refinement/medium-T04/manifest.json) · [cards.html](evidence/refinement-run-40079964688/refinement/medium-T04/cards.html) · [preview.html](evidence/refinement-run-40079964688/refinement/medium-T04/preview.html) · [cards.pdf](evidence/refinement-run-40079964688/refinement/medium-T04/cards.pdf) · [card-001.png](evidence/refinement-run-40079964688/refinement/medium-T04/card-001.png) · [contact-sheet.png](evidence/refinement-run-40079964688/refinement/medium-T04/contact-sheet.png) · [mobile-375.png](evidence/refinement-run-40079964688/refinement/medium-T04/mobile-375.png) · [mobile-390.png](evidence/refinement-run-40079964688/refinement/medium-T04/mobile-390.png) · [page-1-raw.txt](evidence/refinement-run-40079964688/refinement/medium-T04/page-1-raw.txt) · [page-1-layout.txt](evidence/refinement-run-40079964688/refinement/medium-T04/page-1-layout.txt) · [新PDF完整页面](evidence/refinement-run-40079964688/native-pdf-pages/medium-T04.png)
### medium-T06

中篇形成较长的左右面板，全部原文和限定语保留；左栏以“出处。”结束，未出现单字独行或裁切。



[medium-T06.md](evidence/refinement-run-40079964688/refinement/inputs/medium-T06.md) · [manifest.json](evidence/refinement-run-40079964688/refinement/medium-T06/manifest.json) · [cards.html](evidence/refinement-run-40079964688/refinement/medium-T06/cards.html) · [preview.html](evidence/refinement-run-40079964688/refinement/medium-T06/preview.html) · [cards.pdf](evidence/refinement-run-40079964688/refinement/medium-T06/cards.pdf) · [card-001.png](evidence/refinement-run-40079964688/refinement/medium-T06/card-001.png) · [contact-sheet.png](evidence/refinement-run-40079964688/refinement/medium-T06/contact-sheet.png) · [mobile-375.png](evidence/refinement-run-40079964688/refinement/medium-T06/mobile-375.png) · [mobile-390.png](evidence/refinement-run-40079964688/refinement/medium-T06/mobile-390.png) · [page-1-raw.txt](evidence/refinement-run-40079964688/refinement/medium-T06/page-1-raw.txt) · [page-1-layout.txt](evidence/refinement-run-40079964688/refinement/medium-T06/page-1-layout.txt) · [新PDF完整页面](evidence/refinement-run-40079964688/native-pdf-pages/medium-T06.png)
### medium-T10

蓝色导语、右上内容与下方分节完整；底部小标题分两行，正文和来源仍清楚，未见重叠或裁切。



[medium-T10.md](evidence/refinement-run-40079964688/refinement/inputs/medium-T10.md) · [manifest.json](evidence/refinement-run-40079964688/refinement/medium-T10/manifest.json) · [cards.html](evidence/refinement-run-40079964688/refinement/medium-T10/cards.html) · [preview.html](evidence/refinement-run-40079964688/refinement/medium-T10/preview.html) · [cards.pdf](evidence/refinement-run-40079964688/refinement/medium-T10/cards.pdf) · [card-001.png](evidence/refinement-run-40079964688/refinement/medium-T10/card-001.png) · [contact-sheet.png](evidence/refinement-run-40079964688/refinement/medium-T10/contact-sheet.png) · [mobile-375.png](evidence/refinement-run-40079964688/refinement/medium-T10/mobile-375.png) · [mobile-390.png](evidence/refinement-run-40079964688/refinement/medium-T10/mobile-390.png) · [page-1-raw.txt](evidence/refinement-run-40079964688/refinement/medium-T10/page-1-raw.txt) · [page-1-layout.txt](evidence/refinement-run-40079964688/refinement/medium-T10/page-1-layout.txt) · [新PDF完整页面](evidence/refinement-run-40079964688/native-pdf-pages/medium-T10.png)
### medium-T13

完整中篇超过 T13 容量；screen/print 可用高度 1221、占用约 1433。没有成功预览，不缩字或删原文。



[medium-T13.md](evidence/refinement-run-40079964688/refinement/inputs/medium-T13.md) · [overflow.json](evidence/refinement-run-40079964688/refinement/medium-T13/overflow.json) · 

## mixed-reading

### mixed-T04

中英文全宽段落可读，source/context 小标题和 interpretation/uncertain evidence 均完整，未见缺字或裁切。



[mixed-T04.md](evidence/refinement-run-40079964688/refinement/inputs/mixed-T04.md) · [manifest.json](evidence/refinement-run-40079964688/refinement/mixed-T04/manifest.json) · [cards.html](evidence/refinement-run-40079964688/refinement/mixed-T04/cards.html) · [preview.html](evidence/refinement-run-40079964688/refinement/mixed-T04/preview.html) · [cards.pdf](evidence/refinement-run-40079964688/refinement/mixed-T04/cards.pdf) · [card-001.png](evidence/refinement-run-40079964688/refinement/mixed-T04/card-001.png) · [contact-sheet.png](evidence/refinement-run-40079964688/refinement/mixed-T04/contact-sheet.png) · [mobile-375.png](evidence/refinement-run-40079964688/refinement/mixed-T04/mobile-375.png) · [mobile-390.png](evidence/refinement-run-40079964688/refinement/mixed-T04/mobile-390.png) · [page-1-raw.txt](evidence/refinement-run-40079964688/refinement/mixed-T04/page-1-raw.txt) · [page-1-layout.txt](evidence/refinement-run-40079964688/refinement/mixed-T04/page-1-layout.txt) · [新PDF完整页面](evidence/refinement-run-40079964688/native-pdf-pages/mixed-T04.png)
### mixed-T17

深色纵向编号路线和绿色小标题保持层级，正文与来源完整；两个段落分别出现“源。”“论。”单字短尾。

本例出现“源。”“论。”单字短尾；内容完整，但断行欠佳。混排可比较同组 T04/T18。

[mixed-T17.md](evidence/refinement-run-40079964688/refinement/inputs/mixed-T17.md) · [manifest.json](evidence/refinement-run-40079964688/refinement/mixed-T17/manifest.json) · [cards.html](evidence/refinement-run-40079964688/refinement/mixed-T17/cards.html) · [preview.html](evidence/refinement-run-40079964688/refinement/mixed-T17/preview.html) · [cards.pdf](evidence/refinement-run-40079964688/refinement/mixed-T17/cards.pdf) · [card-001.png](evidence/refinement-run-40079964688/refinement/mixed-T17/card-001.png) · [contact-sheet.png](evidence/refinement-run-40079964688/refinement/mixed-T17/contact-sheet.png) · [mobile-375.png](evidence/refinement-run-40079964688/refinement/mixed-T17/mobile-375.png) · [mobile-390.png](evidence/refinement-run-40079964688/refinement/mixed-T17/mobile-390.png) · [page-1-raw.txt](evidence/refinement-run-40079964688/refinement/mixed-T17/page-1-raw.txt) · [page-1-layout.txt](evidence/refinement-run-40079964688/refinement/mixed-T17/page-1-layout.txt) · [新PDF完整页面](evidence/refinement-run-40079964688/native-pdf-pages/mixed-T17.png)
### mixed-T18

深色面板与蓝色分节标题清楚，中英内容完整；下方留白较大，属于本例短内容的构图节奏。



[mixed-T18.md](evidence/refinement-run-40079964688/refinement/inputs/mixed-T18.md) · [manifest.json](evidence/refinement-run-40079964688/refinement/mixed-T18/manifest.json) · [cards.html](evidence/refinement-run-40079964688/refinement/mixed-T18/cards.html) · [preview.html](evidence/refinement-run-40079964688/refinement/mixed-T18/preview.html) · [cards.pdf](evidence/refinement-run-40079964688/refinement/mixed-T18/cards.pdf) · [card-001.png](evidence/refinement-run-40079964688/refinement/mixed-T18/card-001.png) · [contact-sheet.png](evidence/refinement-run-40079964688/refinement/mixed-T18/contact-sheet.png) · [mobile-375.png](evidence/refinement-run-40079964688/refinement/mixed-T18/mobile-375.png) · [mobile-390.png](evidence/refinement-run-40079964688/refinement/mixed-T18/mobile-390.png) · [page-1-raw.txt](evidence/refinement-run-40079964688/refinement/mixed-T18/page-1-raw.txt) · [page-1-layout.txt](evidence/refinement-run-40079964688/refinement/mixed-T18/page-1-layout.txt) · [新PDF完整页面](evidence/refinement-run-40079964688/native-pdf-pages/mixed-T18.png)
### mixed-T33

衬线双栏保持版面特征，全部原文、来源和页码可见；右侧窄栏使 uncertain 与 evidence 分行，英文阅读节奏更碎。

窄栏让 uncertain 与 evidence 分行；本例保留完整文字，但英文较多时阅读更零碎。

[mixed-T33.md](evidence/refinement-run-40079964688/refinement/inputs/mixed-T33.md) · [manifest.json](evidence/refinement-run-40079964688/refinement/mixed-T33/manifest.json) · [cards.html](evidence/refinement-run-40079964688/refinement/mixed-T33/cards.html) · [preview.html](evidence/refinement-run-40079964688/refinement/mixed-T33/preview.html) · [cards.pdf](evidence/refinement-run-40079964688/refinement/mixed-T33/cards.pdf) · [card-001.png](evidence/refinement-run-40079964688/refinement/mixed-T33/card-001.png) · [contact-sheet.png](evidence/refinement-run-40079964688/refinement/mixed-T33/contact-sheet.png) · [mobile-375.png](evidence/refinement-run-40079964688/refinement/mixed-T33/mobile-375.png) · [mobile-390.png](evidence/refinement-run-40079964688/refinement/mixed-T33/mobile-390.png) · [page-1-raw.txt](evidence/refinement-run-40079964688/refinement/mixed-T33/page-1-raw.txt) · [page-1-layout.txt](evidence/refinement-run-40079964688/refinement/mixed-T33/page-1-layout.txt) · [新PDF完整页面](evidence/refinement-run-40079964688/native-pdf-pages/mixed-T33.png)
