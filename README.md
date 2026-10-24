# md2card-skill

把 Markdown 与长文整理成清晰、有设计感的知识卡片。

这是一个可放入 Codex 或 Claude Code 技能目录的独立 Skill，也是一个可以直接运行的本地渲染工具。先做内容编排，再选原创主题，最后导出 HTML、PNG 或保留文本层的 PDF。

## 选择成品与候选模板

[离线模板图库](docs/gallery/index.html) 从唯一注册表生成，提供家族、用途、图片需求和示例密度筛选。当前有 **48 个独立构图源码候选，4 个默认示例已经视觉验收**。只有 T01/T05/T17/T25 展示其真实历史 PNG；其余 44 套明确列为无预览的待验收候选，不用色板、概念图或其他模板图片冒充成品。

完整仓库下载后打开 `docs/gallery/index.html`；GitHub 文件页本身不运行 HTML。构建与证据校验见 [图库说明](docs/TEMPLATE_GALLERY.md)，新图库界面的手机、键盘、CSP 与逐图检查也仍待执行。

## 它能做什么

- 将笔记、教程、文章摘要整理为知识卡片，保留必要的出处、限定条件和不确定性。
- 提供 5 套原创主题与 8 种独立语义版式，主题、版式、品牌配置彼此分离。
- 默认用显式分页标记控制卡片数量；第三期增加可选的语义自动分页，不改写原文，也不偷偷缩小字体。
- 导出自包含 HTML、逐卡 PNG、原生文本 PDF，并检查内容溢出。
- 支持可信本地 PNG/JPEG/WebP 和 Logo；提供手机预览与联系表，无在线字体 CDN、账号、云同步、模型调用或自动发布。

## 真实渲染展示

以下展示及其验收记录来自第二期实现，不是第三期自动分页的验证证据。第三期代码、真实浏览器测试与视觉验收状态见 [分期开发计划](docs/DEVELOPMENT_PLAN.md)。

下图由本仓库命令实际导出，不是设计稿或外部产品截图。示例 PNG、PDF、手机预览和 manifest 由 CI 同时生成；复现命令见 [展示说明](docs/SHOWCASES.md)。

![八种语义版式的实际输出：封面、解释、对比、步骤、图注、数据、案例和引用](docs/images/layouts-contact-sheet.png)

### AI / RAG 概念解释

![RAG 原创示例：封面、流程示意、检索与生成对比及来源提醒](docs/images/showcase-ai.png)

### 技术教程

![本地 Markdown 导出教程：封面、运行步骤和溢出处理案例](docs/images/showcase-tutorial.png)

### 企业介绍（虚构示例）

企业示例正在修正页眉/页脚的虚构品牌一致性，新的真实预览待验收；旧截图不代表当前输入。见 [M3 修正记录](docs/TEMPLATE_M3.md)。

## 八种语义版式

默认 `manual` 模式支持下列八种版式；`auto` 模式仅支持 `explainer` 与 `steps`，具体限制见后文。

| layout | 用途 | 内容约定 |
| --- | --- | --- |
| `cover` | 封面 / 观点 | 大标题与少量说明 |
| `explainer` | 概念解释 | 默认版式，普通 Markdown 原样使用 |
| `comparison` | 双栏比较 | 前两个顶层二级标题分为两栏，后续内容保留在下方 |
| `steps` | 操作步骤 | 顶层有序列表显示序号与步骤块 |
| `image-caption` | 图片与图注 | `image`、`alt`、`caption` 搭配正文 |
| `statistic` | 数字 / 证据 | `metric`、`label` 与 `source`，不自动生成数字 |
| `case-study` | 案例过程 | 顶层二级标题组织问题、行动、结果等阶段 |
| `quote` | 引用 / 来源 | Markdown 引用块与 `source` 分开呈现 |

版式选择使用每张卡片第一条非空行中的可选 JSON 注释：

```markdown
<!-- card: {"layout":"statistic","metric":"8","label":"种语义版式","source":"本仓库的版式枚举"} -->
# 数字必须有解释

正文说明口径、含义和适用边界。
```

只接受明确字段，不允许任意 CSS 或 HTML。完整八版式示例见 [examples/layouts.md](examples/layouts.md)。

## 五种视觉方向

| 主题 | 风格 | 版式特点 |
| --- | --- | --- |
| `editorial` | 科学编辑 / 杂志感 | 暖白纸面、衬线标题、细双线页脚、砖红标记 |
| `minimal` | 克制极简 | 开放留白、侧边短线、轻量标题、青绿强调 |
| `midnight` | 深色技术 | 蓝黑底色、青色导引、结构边框、代码内嵌强调 |
| `notebook` | 学习笔记 | 淡横线、红色页边线、标注式标题、纸张质感 |
| `bold` | 大胆图形 | 粗边框、强标题线、反白小标题、方形引用块 |

主题说明和扩展约定见 [references/themes.md](references/themes.md)。

## 快速开始：直接渲染

需要 Node.js 20+、npm 和可启动的 Chromium。首次安装依赖需要网络，渲染过程不读取远程图片、字体或脚本。

```bash
git clone https://github.com/Activer007/md2card-skill.git
cd md2card-skill
npm ci
npx playwright install chromium
node scripts/render.mjs --doctor

node scripts/render.mjs examples/rag-guide.md \
  --theme editorial \
  --out output/rag-editorial \
  --format all \
  --footer "AI 知识卡"
```

如果已有 Chromium，可加 `--browser /absolute/path/to/chromium`。Linux 可能还需安装浏览器系统依赖；受限环境中不要为了运行而关闭安全限制。中文输出需要本地可用的中文字体。

成功后，目录中包含 `cards.html`、`card-001.png` 等逐卡图片、`cards.pdf` 和 `manifest.json`。PDF 通过浏览器原生打印生成，不是把图片拼成 PDF。

输出目录必须不存在或为空，不会覆盖已有文件。内容放不下时，程序返回非零状态并提供可定位的诊断，不会把裁切后的文件冒充成功结果。手动或最终全套布局溢出会写入 `overflow.json`；自动分页的不可拆分单元溢出会提供带源位置的错误。所有格式，包括仅 HTML，都需要 Chromium 做排版检查。

## 作为 Skill 使用

仓库根目录就是完整 Skill 文件夹。下列步骤是用户自行安装的方式，不代表创建仓库后已自动安装到任何账户或应用。

### Codex：项目级安装

在你希望使用该技能的项目根目录运行：

```bash
mkdir -p .agents/skills
git clone https://github.com/Activer007/md2card-skill.git \
  .agents/skills/md2card-skill
cd .agents/skills/md2card-skill
npm ci
npx playwright install chromium
```

随后在 Codex 中输入：

```text
使用 $md2card-skill，把这篇文章整理成面向初学者的知识卡片。
保留关键出处，采用 editorial 主题，导出 PNG 和 PDF。
```

个人级目录可使用 `~/.agents/skills/md2card-skill`。本地发现路径和更新行为以 [Codex 官方技能文档](https://developers.openai.com/codex/skills)为准；如果没有识别到新技能，重启会话后检查技能列表。

### Claude Code：项目级安装

在项目根目录，将同一个完整仓库放入 `.claude/skills/md2card-skill`：

```bash
mkdir -p .claude/skills
git clone https://github.com/Activer007/md2card-skill.git \
  .claude/skills/md2card-skill
cd .claude/skills/md2card-skill
npm ci
npx playwright install chromium
```

使用 `/md2card-skill`，或明确要求采用此技能。个人级目录为 `~/.claude/skills/md2card-skill`，具体加载方式见 [Claude Code 官方技能文档](https://code.claude.com/docs/en/skills)。这份目录安装说明面向本地会话，不承诺自动同步到云端产品。

也可以将下载或克隆后的整个文件夹复制到对应目录。不要只复制 `SKILL.md`，它会调用同目录中的脚本、样式和参考文档。已存在同名目录时先检查内容，不要直接覆盖。

## Markdown 分页

`--paginate manual` 是默认模式，保留现有行为。在代码围栏与缩进代码之外，用独占一行的 `===` 分隔卡片：

```markdown
# 第一张：一个核心观点

用短段落解释观点，并保留必要上下文。

===

# 第二张：一个具体例子

用例子说明，而不是重复上一张。
```

- 围栏代码块里的 `===` 是代码，不会分页。
- `---` 保留普通 Markdown 语义；前后空行时是横线，不是分页。
- 不使用 YAML frontmatter，标题等元信息通过命令参数传入。
- 支持标题、段落、列表、引用、链接、代码和表格。
- 原始 HTML 会转义；图片仅接受可信资源目录内经验证的本地 PNG/JPEG/WebP。
- 引用式链接定义可跨卡片使用；缩进代码首行的空格会保留。

完整原创示例：[RAG 入门四张卡片](examples/rag-guide.md)。解析边界示例：[代码中的分页符](examples/separator-demo.md)。

### 可选语义自动分页（第三期）

需要保留长文原样、但允许增加卡片数量时，可选择 `--paginate auto`。第三期已完成独立源码复核与真实浏览器验收：148 项测试全部通过，四套新案例共 24 张卡片；具体提交、视觉检查范围与剩余限制见 [分期验收记录](docs/DEVELOPMENT_PLAN.md)。默认仍为 `manual`，自动分页不是内容编辑。

```bash
node scripts/render.mjs long-explainer.md --out output/long-explainer-v1 \
  --paginate auto --theme editorial --format all
```

- 仅支持 `explainer` 和 `steps`，每个显式分段的卡片元数据仅允许 `layout`。其他版式报 `PAGINATION_UNSUPPORTED_LAYOUT`；`source`、`eyebrow` 等额外字段报 `PAGINATION_UNSUPPORTED_METADATA`，不会被忽略或悄悄删除。需要这些元数据时继续使用 `manual`。
- `===` 是锁定边界。自动分页只能在一个显式分段内部继续拆分，不跨边界合并内容。
- 保留原始 Markdown token、文字、顺序和来源。段落、代码块、引用块、图片以及含嵌套内容的顶层列表项不可拆开；有序列表续页保留起始编号。表格可以在行之间拆开，重复的表头会在来源记录中注明。
- 连续标题与后续内容单元组成一组，避免单独落在页尾。浏览器分别测量屏幕与打印布局，贪心地尝试放入当前卡片，放不下时将整组移至下一张。
- 单组放在空白卡片仍溢出时，以 `PAGINATION_ATOMIC_OVERFLOW` 和源位置失败，不裁切、不缩字、不调用模型，也不自动删改内容。可以调整画布、改用手动分页，或在你明确同意后修改原文。
- 分页最多处理 2,000 个语义单元、4,000 次候选探测、200 张卡片，并继续遵守资源、像素和时间预算。探测时预留 `200/200` 页脚；最终使用实际页数再次检查全套卡片的屏幕与打印布局。

完整拆分规则、错误码与可追溯记录见 [渲染契约](references/rendering.md)。自动分页是几何排版辅助，不是内容策划、事实核查或逐页视觉验收。

以下两张联系表来自第三期真实导出，未经裁切或修图，来源和 SHA-256 见 [展示记录](docs/SHOWCASES.md#phase-3-automatic-pagination)。

#### 列表跨页保留编号

[原始列表示例](examples/pagination-lists.md) 从 7 开始编号，自动生成 7 张卡片；顶层列表项及其嵌套内容保持完整。

![自动分页列表：七张卡片保留原文及从 7 到 18 的连续步骤编号](docs/images/pagination-lists.png)

#### 表格按行分页并重复表头

[原始表格示例](examples/pagination-tables.md) 自动生成 6 张卡片。续页重复原始表头，并在 manifest 中记录表头来源；不会拆开单行或丢弃内容。

![自动分页表格：六张卡片按完整行拆分并保留续页表头](docs/images/pagination-tables.png)

其他可复现示例：[长段落](examples/pagination-paragraphs.md)、[引用及显式边界](examples/pagination-references.md)、[超大代码块的预期失败](examples/pagination-atomic-error.md)。这组验收使用 1080×900 画布；更换字体或尺寸后页数可能变化。只支持 `explainer` / `steps` 及 `layout` 元数据，不自动改写、删减或缩字。

## 本地图片与品牌

默认资源边界为输入 Markdown 所在目录，也可以显式指定 `--asset-root DIR`。图片引用相对此目录解析，而不是相对品牌 JSON 所在目录。

```markdown
![流程示意](assets/retrieval-pipeline.png)
```

```bash
node scripts/render.mjs examples/showcase-ai.md \
  --out output/ai-v1 --brand examples/brand.json \
  --preview --contact-sheet --strict
```

品牌 JSON 只接受 `name`、十六进制 `accent`、本地 `logo`。`--preview` 生成无需脚本的手机阅读页面；`--contact-sheet` 生成整套卡片缩略联系表。预览缩放不改变导出画布尺寸。

不接受 SVG、GIF、远程地址、`file:` / `data:` 输入、绝对路径或越界软链接。文件扩展名、真实 MIME、文件体积与像素尺寸均检查，浏览器还会实际解码图片。完整资源限制见 [渲染契约](references/rendering.md)。

## 常用参数

```bash
# 深色主题，PNG 与 PDF
node scripts/render.mjs cards.md --out output/dark-v1 \
  --theme midnight --format png,pdf

# 方形卡片；需要按更短画布重新组织内容
node scripts/render.mjs short-cards.md --out output/square-v1 \
  --size square --theme minimal --format png

# 自定义尺寸；scale 只改变 PNG 像素密度，不改变文字排版
node scripts/render.mjs cards.md --out output/custom-v1 \
  --width 1200 --height 1600 --scale 2 --format all

node scripts/render.mjs --help
```

默认 `portrait` 为 1080×1440；`square` 为 1080×1080；`slide` 为 1600×900。不同画幅容量不同，不保证同一份内容直接通用。宽屏卡片也不等于可编辑幻灯片。

完整参数、输出契约与故障处理见 [references/rendering.md](references/rendering.md)。

## 质量与边界

见 [分期开发计划](docs/DEVELOPMENT_PLAN.md) 与 [源码审查及定向回归记录](docs/CODE_REVIEW.md)。后者记录具体缺陷、最小复现、修复和剩余限制，不以 CI 通过代替代码审查。

第二期历史验收：代码提交 [`7df842d`](https://github.com/Activer007/md2card-skill/commit/7df842dca5ff5bba237a9e5118e7e30b7af954c1) 已完成独立源码复核；[CI](https://github.com/Activer007/md2card-skill/actions/runs/39964850729) 通过 93 项测试（0 跳过），实际验证 10 套、56 张卡片。README 的四张展示图来自该提交的真实导出并已单独复核；检查范围与图片哈希见上述记录。

Skill 会指导内容规划、主题选择、渲染和逐页检查。程序检查几何溢出；选择 `auto` 时按受支持的语义边界分页，但不会判断观点是否正确、改写原文或审核引用。第三期的本地测试、真实 CI 与视觉验收在上述记录中单独列明；本次视觉检查覆盖四套联系表和代表性原尺寸卡片，不是对所有字形的穷尽检查。

- 本地系统字体会影响换行。需要稳定输出时，固定操作系统、字体、依赖与浏览器版本。
- 导出后仍应检查每张图的中文字符、标题换行、表格、代码和页脚，并验证 PDF 文本层。
- 不提供账号、云同步、内置模型调用、PPTX、SVG、Mermaid、数学公式、动画或一键发布。
- 自动分页需显式开启，限于上述受支持的内容；不提供 AI 改写或内置模型。已有八种版式仍可使用默认手动分页。
- `--strict` 要求可验证的本地中文字体覆盖和 Poppler PDF 工具。字体覆盖检查不等于实际字形或逐页视觉验收。
- manifest 记录输入/样式/资源/产物 SHA-256、工具版本、屏幕/打印溢出结果和 PDF 检查状态；自动分页还记录模式、语义覆盖和各卡片来源。人工视觉检查始终单独标记。
- 本仓库不包含第三方字体，不获得字体、商标或外部内容的再分发权。

维护时可运行：

```bash
npm test
npm run test:integration
node scripts/validate-showcases.mjs
node scripts/validate-pagination.mjs
```

集成测试需要能运行 Chromium 的环境。不要把依赖或浏览器缺失造成的失败误报为渲染验证通过。

## 项目结构

```text
SKILL.md                 技能入口与工作流程
agents/openai.yaml       Codex 界面元信息
assets/themes.css        五套原创主题与设计 token
assets/layouts.css       通用排版与八种语义版式
scripts/                 Markdown 解析与本地导出
references/              内容风格、主题与渲染说明
examples/                原创示例与本地演示资源
docs/DEVELOPMENT_PLAN.md  分期任务、验收条件与验证状态
tests/                  解析与导出测试
```

## 灵感来源与许可

产品方向受到 [mdcard.cn](https://mdcard.cn/) 及 [agnostic-ap/md2card](https://github.com/agnostic-ap/md2card) 的启发：让 Markdown 更适合以卡片形式阅读和分享。

这是独立编写的原创实现，不是上述项目的 fork，也与其维护者或服务不存在隶属、授权或背书关系。没有复制其源代码、CSS、模板、品牌图形或文案；主题使用编辑设计、极简、深色技术、横线笔记与图形海报等通用设计语言重新创作。

本仓库原创代码、样式和文档采用 [MIT License](LICENSE)。依赖项、外部链接内容与用户输入各自保留原有许可和权利；本许可不覆盖它们。详见 [NOTICE](NOTICE)。

## 成品模板库升级（进行中）

成品模板是完整构图，不把主题 × 配色 × 画幅算成模板数量。新版工作按 [九个中等规模里程碑](docs/VISUAL_MILESTONES.md) 分批推进；首批目标 24 套，最终目标 48 套，均须经过源码审查和真实 PNG / 手机 / PDF 验收。

M1 已完成四套设计的源码、真实导出与逐图验收：T01 编辑专题侧栏、T05 瑞士数字索引、T17 深色机制轨道、T25 便签阅读摘记。当前验收数量为 4，不是 24 或 48；范围、限制与精确来源见 [模板验收记录](docs/TEMPLATE_ACCEPTANCE.md)。

以下均是本仓库实际导出的原始 PNG，不是概念设计图：

| T01 编辑专题 | T05 数字索引 |
| --- | --- |
| ![T01 专题与侧栏](docs/images/templates/T01.png) | ![T05 原始编号清单](docs/images/templates/T05.png) |
| T17 深色机制 | T25 阅读便签 |
| ![T17 机制轨道](docs/images/templates/T17.png) | ![T25 摘句与批注](docs/images/templates/T25.png) |

```bash
node scripts/render.mjs --list-templates
node scripts/render.mjs examples/templates/T01.md --out output/T01 --preview
node scripts/render.mjs my-note.md --template T25 --out output/my-note
```

也可在卡片第一行选择 `<!-- card: {"template":"T05","density":"standard"} -->`。模板仍只支持默认手动分页。全部模板支持 3:4；T04/T21 另外提供独立重排的 1:1 / 16:9 源码候选，真实视觉验收待完成，其他模板明确拒绝这些画幅；原五主题与八版式的默认行为保持不变。`compact` / `standard` / `editorial` 只改变间距，不缩小正文。新模板使用独立手机字阶，在 375 / 390px 视口的实际 351 / 366px 卡片宽度上检查正文和来源字号。

每套模板的用途、推荐长度、结构、图片需求、不适用场景、来源与完整输入都在 `--list-templates` 输出中。推荐字数只是选型参考，实际溢出检查不会被绕过；不合适的内容应换模板或保留原文增加显式分段，不能静默删字。

### 下一批候选（待视觉验收）

M2 新增 T02/T06/T09/T10/T13/T14 六种独立构图，当前仅完成源码实现与测试。已验收成品仍为 4 套；使用说明和待验证边界见 [M2 候选记录](docs/TEMPLATE_M2.md)。

M3 的 T18/T21/T22/T26/T29/T30 六种技术、证据与阅读构图也已完成源码实现。累计实现 16 套、已验收仍为 4 套；详见 [M3 候选记录](docs/TEMPLATE_M3.md)。

M4 的八种报刊、摄影、波普与生活构图已实现，首批 24 个候选覆盖 12 个家族。已验收仍为 4 套，新增图片与输入契约见 [M4 候选记录](docs/TEMPLATE_M4.md)。

M5 新增八种编辑、网格、节点和观点构图，累计实现 32 套、已验收仍为 4 套，见 [M5 候选记录](docs/TEMPLATE_M5.md)。

M6 新增八种系统、案例、表格与学习构图，累计实现 40 套、已验收仍为 4 套，见 [M6 候选记录](docs/TEMPLATE_M6.md)。

M7 补齐八种资料、分镜和生活比较构图，48 个候选均已实现、12 家族各 4 套；已视觉验收仍仅 4 套。见 [M7 候选记录](docs/TEMPLATE_M7.md)，不要把实现数量等同成品数量。

### 可选系列配方（M9 源码候选）

新增两份可选原创中文起点：[证据阅读，固定 5 张](examples/series/evidence-reading.md) 与 [均值教程，直接从正文开始的 3 张](examples/series/mean-tutorial.md)。每张显式选择现有模板，以 `===` 锁定边界；不会自动插封面、总结、CTA、重排或增加卡片，也不授权改写用户原稿。

新系列真实导出与视觉验收仍待进行，不能继承 M1 旧样例的通过结论；已验收模板仍仅 4 套。品牌资源路径、虚构数据/代码口径、源码测试及将来获准后执行的 PNG / 全卡手机 / PDF 验证步骤见 [系列配方说明](docs/SERIES_RECIPES.md)。没有真实新产物前不展示替代缩略图。

M8b 的 Notebook 标题避线、三档密度与图文/代码/表格压力样例见 [压力验证说明](docs/VISUAL_STRESS.md)。源码检查不代表新模板已通过真实出图，四套历史默认图仍需逐像素回归。

T04/T21 的多画幅构图、完整原文三画幅比较和 22 个实际验证案例见 [独立画幅说明](docs/TEMPLATE_ASPECTS.md)。不新增模板 ID，不把缩放或画幅当作新成品；当前验收仍只覆盖四套 M1 默认 3:4 示例。

本轮 LIB / VIS / QA 全清单的源码交付与尚待验收门槛见 [逐项状态](docs/VISUAL_BACKLOG_STATUS.md)。
