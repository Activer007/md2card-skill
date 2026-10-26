# 文档导航

[返回首页](../README.md) · [48 套模板效果](TEMPLATE_CATALOG.md) · [Skill 使用指南](SKILL_USAGE.md)

## 使用与选型

| 需要的信息 | 文档 |
| --- | --- |
| 看模板效果、用途、画幅和输入 | [图文目录](TEMPLATE_CATALOG.md)、[下载后打开的筛选图库](gallery/index.html) |
| 安装 Skill、自然语言调用、排错 | [Skill 使用指南](SKILL_USAGE.md) |
| 按内容推荐模板 | [只读推荐与角色入口](../references/recommendations.md) |
| Markdown、分页、字号、图片、品牌、CLI 参数 | [渲染手册](../references/rendering.md) |
| 五种主题与扩展约定 | [主题说明](../references/themes.md) |
| 文章如何编排成卡片 | [内容编排指南](../references/content-style.md) |
| 模板支持哪些画幅 | [画幅契约与独立示例](TEMPLATE_ASPECTS.md) |
| T20 产品截图 / T37 摄影封面 | [构图示例与条件](GALLERY_VISUAL_VARIANTS.md) |
| 公众号 21:9 主封面和 1:1 分享封面 | [可运行配对示例](../examples/wechat-covers/README.md)、[M4 工具契约](visual-upgrade/M4_WECHAT_COVERS.md) |
| 多张系列、尾页与页脚 | [系列配方](SERIES_RECIPES.md)、[可选尾页平衡](TAIL_BALANCING.md)、[页脚模式](FOOTER_MODES.md) |
| 可选视觉诊断 | [测量规则、模板例外与误报](visual-upgrade/M3_VISUAL_DIAGNOSTICS.md) |
| T37 品牌色文字可读性 | [默认配色修复](T37_DEFAULT_CONTRAST.md) |

公众号发布前预检与真实平台核对属于后续工作；已有本地配对预览不代表微信后台验收。

## 开发与维护

```sh
# 从同一模板注册表和已校验图片更新图文目录及首页精选
npm run docs:build
npm run docs:check
npm run test:docs

# 原有离线 HTML 图库校验
npm run gallery:check
```

目录生成器为 `scripts/build-template-catalog.mjs`，调用原有 `buildGalleryModel`。不维护第二份模板能力清单，不启动浏览器，不生成或替换卡片 PNG。首页精选只是 12 个模板 ID 的编辑选择，其名称、用途和图片仍读取原注册与证据。

测试按改动范围选择。开发环境、严格验证、发布检查与历史基线见[本地质量门禁](LOCAL_QUALITY_GATE.md)；卡片视觉或输出语义变化不能用文档链接检查代替。GitHub Actions 不是本地使用的前提。

| 目录 | 内容 |
| --- | --- |
| `SKILL.md` | 助手的技能入口和工作流程 |
| `scripts/` | 解析、渲染、推荐、配对与验证工具 |
| `assets/` | 主题、排版与模板样式 |
| `examples/` | 原创输入与本地素材 |
| `references/` | 参数、内容与主题手册 |
| `docs/` | 效果展示、使用指南与验证记录 |
| `tests/` | 自动测试 |

## 历史展示与验证记录

下列文件保留各自的输入、源码版本和验收范围。历史截图与运行编号不证明任意新输入通过；不同阶段的失败和限制不会因首页精简而删除。

| 内容 | 原始记录 |
| --- | --- |
| 早期主题示例、自动分页联系表 | [展示与复现命令](SHOWCASES.md)、[阶段计划](DEVELOPMENT_PLAN.md) |
| 模板早期版本与当前注册样例 | [M1](TEMPLATE_ACCEPTANCE.md)、[模板升级](TEMPLATE_UPGRADE_ACCEPTANCE.md)、[M2](REFINEMENT_M2_ACCEPTANCE.md) |
| 同文对照、系列与画幅 | [同文复核](COMPARISON_PR22_REVIEW.md)、[系列复核](SERIES_PR21_REVIEW.md)、[画幅复核](ASPECT_PR22_REVIEW.md) |
| 离线图库及可选构图 | [图库说明](TEMPLATE_GALLERY.md)、[PR22 图库复核](GALLERY_PR22_UI_REVIEW.md)、[变体图库复核](GALLERY_VARIANTS_REVIEW.md) |
| 源码审查、压力检查与已知限制 | [源码审查](CODE_REVIEW.md)、[压力验证](VISUAL_STRESS.md)、[历史与当前状态](VISUAL_BACKLOG_STATUS.md) |
| 精修与后续规划 | [精修计划](REFINEMENT_PLAN.md)、[视觉里程碑](VISUAL_MILESTONES.md) |

原创代码、样式与文档使用 [MIT License](../LICENSE)。独立实现与灵感来源见 [NOTICE](../NOTICE)；素材说明和原图出处见[素材目录](../examples/templates/assets/README.md)。
