# 分阶段本地交付

2026-10-25。交接要求中的本地修复、证据复核、图库集成与文档整理已完成。三个候选工作区保留，各自没有新提交或实际暂存。远端只有此前单独授权的PR20合并；本地修复未推送，PR21/22仍为Draft。本文件不声称整个R01–R12计划或跨平台渲染已全部验收。

## 对应分支与交付方式

| 阶段 | 本地分支 / HEAD | 后续对应操作 | 候选文件 |
| --- | --- | --- | --- |
| 0–1，同文绑定 | `codex/handoff-r4-evidence` / `7a66826e9abd60bf461fa10d358093948455721b` | PR20已合并；其本地补充应另开PR，目标`refine/r3-footer-modes` | 11修改、144新增，共155 |
| 2，系列接续 | `codex/r5-series-evidence` / `2229b0e73147a27f5e2273208fded6497521a57a` | 带入前序修复后更新PR21，保留其历史 | 12修改、249新增，共261 |
| 3–4，画幅及整合 | `codex/r6-aspect-evidence` / `215976eeeaa1f70d6a6820530fb20fcc7bdf8790` | 带入前序修复后更新PR22，保留其历史 | 22修改、662新增，共684 |

工作区分别位于 `E:/LHA/codex-worktree/handoff-r4-evidence/md2card-skill`、`E:/LHA/codex-worktree/r5-series-evidence/md2card-skill` 和 `E:/LHA/codex-worktree/r6-aspect-evidence/md2card-skill`。三个HEAD均与各自已核对的远端PR head相同；本地独有提交列表均为空，暂存列表均为空。

[逐文件候选清单](handoff-candidates.json)列出每阶段相对自身HEAD的**全部文件路径**、新增/修改、字节数、当前SHA-256、修改前SHA-256，以及与前一候选的相同/不同/新增关系。这是供用户逐文件选择的暂存名单，不是已执行的暂存。清单自身只列路径、不计算自身摘要；其他文件均有摘要。

后续阶段是累计候选。R5有154个候选文件与R4字节相同；R6有251个与R5相同。其他差异可能同时包含远端原有阶段增量和本地整合，不能把三份累计补丁一起套到同一分支。每阶段已跟踪文件的完整二进制差异保存在当前工作区的 `validation/handoff/r4-delivery-tracked.patch`、`r5-delivery-tracked.patch`、`r6-delivery-tracked.patch`；其SHA-256见清单。新增文件不包含在这些补丁内，须使用清单和原工作区查看。

## 修改重点与证据

- R4：`.gitattributes`固定LF/二进制契约；Windows路径与时序测试修正；`evidence-source.mjs`、`evidence-archive.mjs`、`bind-refinement-evidence.mjs`从固定来源和原始ZIP重建真实绑定。`comparison-evidence.mjs`及图库验证拒绝来源、输入、版本、PDF、PNG或拒绝诊断被替换。原始22例核验为17导出/5拒绝，三组同文仅11预览/1拒绝进入图库。见[同文复核](COMPARISON_REVIEW.md)与[R4界面复核](GALLERY_UI_REVIEW.md)。
- R5：保留PR21历史和四组配方，核验run40079867143四组14卡。56张full/mobile/native-PDF页面及连读结论独立记录，包含新增两组三卡，不借用portrait单例。见[系列复核](SERIES_PR21_REVIEW.md)。这份验收限定PR21来源树。
- R6：`aspect-source.mjs`与`validate-aspects.mjs`在执行前拒绝不同语义根，使用真实路径限制输入、资源根与图片引用；Windows相似前缀、越界junction和合法根内junction回归实际执行。新增`aspect-evidence.mjs`和独立证据注册表，对八个指定短例绑定精确输入、独立版本、实际PNG/375/390/PDF。58技术案例核验为28导出、8允许溢出、14预期压力溢出、8不支持比例拒绝；其他50例不授予视觉结论。见[画幅复核](ASPECT_PR22_REVIEW.md)。
- PR22的同文证据改用run40079964688实际产物，保持来源一致性。11张PNG、22张手机图和11张重新栅格化的原生PDF页面与已查看像素逐字节相同，因此保留原观察及限制，同时绑定新PDF身份。见[当前同文复核](COMPARISON_PR22_REVIEW.md)。旧PR20记录没有重写。
- 图库仍为48个注册模板、11个同文预览，八个画幅证据通过模板详情中的原生链接展示。README、SKILL、reference、内容/系列/画幅/图库/状态文档已对齐；原有renderer状态声明是CI当时状态，当前画幅验收由独立证据注册表核验。

## 实际验证结果

Node24.16.0。环境中的npm包装器不可用，使用package.json对应的直接Node命令。以下完整源测试均设置`MD2CARD_SKIP_BROWSER=1`，再执行`node --test tests/*.test.mjs`；新增测试也逐一出现在`test:unit`中。

| 范围 | 总数 | 通过 | 失败 | 跳过 | 实际日志 / 记录 |
| --- | ---: | ---: | ---: | ---: | --- |
| R4完整源测试 | 518 | 500 | 0 | 18 | R4工作区`validation/handoff/comparison-reviewed-full-tests.log` |
| R5完整源测试 | 528 | 510 | 0 | 18 | R5工作区`validation/handoff/r5-full-tests.log` |
| R6完整源测试 | 582 | 564 | 0 | 18 | `validation/handoff/r6-final-source-tests.log` |
| R6来源与画幅定向 | 47 | 47 | 0 | 0 | `validation/handoff/r6-aspect-source-tests-final.log` |
| 画幅证据攻击回归 | 27 | 27 | 0 | 0 | 全量582项包含全部27项 |
| 最终入口文档定向复验 | 17 | 17 | 0 | 0 | `validation/handoff/r6-final-doc-check.log` |
| 最终真实图库浏览器 | 66 | 66 | 0 | 0 | [365个输入摘要、29张截图及独立观察](gallery-pr22-ui-review.json) |

每次18跳过分别为17个卡片导出/分页浏览器测试及1个缺少完整Poppler工具的真实文本检查；没有将其计为通过。实际CI卡片产物和本地图库浏览器分别报告，不能互相替代。`node scripts/build-template-gallery.mjs --check`及`git diff --check`在最终候选通过。完整源测试后的修改仅为文档、证据记录与交付清单；入口文档另经17项定向复验，最终365个UI受测输入摘要保持不变。

失败历史保留：R6接续初期旧PR20证据因语义不一致被拒绝，之后使用PR22真实产物修复，未放宽身份检查；前一次图库65项页面通过但关闭超时，整轮仍为失败，确认进程退出后本轮66项通过。前序GPU限制、PDF提取差异等记录也未改写。

## 按交接要求的最终审计

审计依据原包`COPY_TO_CODEX.md`和`REVIEW-CHECKLIST.md`，不是根据现有成果缩减范围。原包四个SHA-256保持一致。逐项证据如下：

| 要求 | 当前证据与结论 |
| --- | --- |
| 保留本地修改、核对origin/分支/HEAD/远端 | 三个工作区保留；候选清单核对origin和HEAD；GitHub只读核实PR20已合并、21/22仍Draft；原main未覆盖 |
| 重建丢失binder，不借用历史测试数量 | 新来源/ZIP/binder实现及攻击回归；本次各阶段实际测试日志与摘要独立记录 |
| 同一来源快照、真实bytes、版本、PNG/PDF及拒绝身份 | 固定commit/tree/archive、Git blob和SHA核对；全部22例绑定；T13中篇仍为原输入拒绝，无成功预览替代 |
| 不执行不可信sourceRoot代码 | 外部根仅作数据；本地执行语义必须与来源一致，不同根测试在命令/浏览器前拒绝 |
| series保留历史、展示接续方式并独立检查新增系列 | carry-forward清单及每阶段文件比较；四组14卡独立来源/视觉/连读记录 |
| sourceRoot混用与路径/链接越界防护 | 两个不同语义根、Windows真实junction越界/相似前缀/根内合法路径测试；47项定向无跳过 |
| 不削弱溢出、图像比例、隐藏内容、来源及失败关闭 | renderer、样式、源Markdown和原图相对各阶段HEAD未改；验证器只加强来源与路径边界；原严格回归保留并通过 |
| 八个画幅必须有真实产物和独立复核 | 58技术案例247原始文件核验；8例32张图独立查看，绑定独立版本；7例完整、1例明确保留断行限制 |
| 所有新增测试进入聚合；跳过/未执行不当通过 | `test:unit`包含全部新测试；完整glob582项及18跳过明列，不声称本地卡片浏览器通过 |
| 最终gallery:check与真实UI分别核验 | 最终生成一致；真实Chrome66项、29张截图、365个输入摘要；无脚本和8组48链接均覆盖 |
| 文档、历史及证据范围一致 | 当前入口对齐；历史机器not-performed/pending保留，独立复核与集成记录明确承接，不倒改旧记录 |
| 无凭据、缓存、本机配置、无关产物或工作流变更 | 候选路径逐项核对；下载ZIP/日志/缓存/工具脚本保持在忽略目录；新增PNG/PDF是列明的真实验收证据 |
| 精确文件清单、本地独有提交及手工提交推送 | 清单列全部路径和摘要；独有提交与实际暂存均为空；用户确认和发布仍由用户操作 |

## 保留边界及后续顺序

1. 用户先查看逐文件名单与各工作区差异，再选择提交；本任务没有执行提交、push、新建远端PR或合并PR21/22。先发布PR20补充，再向PR21、PR22正常带入；不强推、不自动更改PR base。
2. 原生slide PDF实测1200×675.12pt，完整页面未裁剪；本机pypdf与CI文本提取存在Unicode差异，未宣称本机精确Unicode通过。T04短尾、T17/T33混排限制等保留，不冒充已修复。
3. Windows卡片导出与CI字体等价、其他内容/密度/画幅、屏幕阅读器、原生菜单缩放和跨浏览器均不在此次通过范围。相关变化须重新渲染和验收。
4. R08页脚的新视觉验收保持自身pending状态；它不是本交接三阶段遗漏的验收任务。合并后的发布树仍需按实际输入变化验证，不直接承接本地未提交候选结论。
