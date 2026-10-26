# Skill 使用指南

[返回首页](../README.md) · [模板效果](TEMPLATE_CATALOG.md) · [完整参数](../references/rendering.md)

## 安装完整 Skill

Skill 需要整个仓库，不能只复制 `SKILL.md`；脚本、样式、模板、依赖与资源须保持原目录关系。首次安装需要网络；卡片渲染使用本地图片、字体和浏览器。

| 工具 | 项目级目录 | 个人级目录 | 调用方式 |
| --- | --- | --- | --- |
| Codex | `.agents/skills/md2card-skill` | `~/.agents/skills/md2card-skill` | 明确指定 `$md2card-skill` |
| Claude Code | `.claude/skills/md2card-skill` | `~/.claude/skills/md2card-skill` | `/md2card-skill` 或明确指定技能 |

`~` 表示当前用户目录。项目级安装命令见 [README](../README.md#使用-skill)。个人级安装时，将 clone 的目标路径替换为表中路径，再进入该目录安装依赖。Windows 可在 PowerShell 中运行；不要原样使用其他人的用户目录。

同名目录已存在时，先查看 `git status` 和远端地址，保留本地改动；不要删除或覆盖已有技能。调用者未识别到新技能时，重新打开会话并检查技能列表。发现机制以 [Codex 官方说明](https://developers.openai.com/codex/skills) 和 [Claude Code 官方说明](https://code.claude.com/docs/en/skills) 为准；本项目不自动安装到其他账户或同步至云端。

## 环境准备

在技能仓库根目录执行：

```sh
npm ci
npx playwright install chromium
node scripts/render.mjs --doctor
```

需要 Node.js 20+。已有 Chrome/Chromium 时，可跳过浏览器下载并使用 `--browser` 指定可执行文件。Linux 可能需要安装浏览器系统依赖；不要通过关闭安全隔离来规避环境问题。

中文需要系统可用字体；字体不同会改变换行。PDF 由 Chromium 原生打印生成。严格 PDF/字体核验还需要 Poppler、Fontconfig 等工具，参见[本地环境与质量门禁](LOCAL_QUALITY_GATE.md)。`--doctor` 用于报告环境问题，不代表任何一份文稿已通过排版检查。

## 把需求说清楚

新建卡片或请求推荐风格时，优先从 [12 个家族、48 套成品模板](TEMPLATE_CATALOG.md)选型。
`editorial`、`minimal`、`midnight`、`notebook`、`bold` 是另外五种基础主题，配合八种通用版式使用；不是全部模板。
成品模板不继承这些主题样式，也不支持自动分页。你已指定模板、基础主题或要求原样渲染时，助手应沿用该选择。

提供文章或文件路径，并说明读者、用途、是否允许改写、张数偏好、字号和导出格式。已经提供的信息无需重复确认。

**整理文章：**

```text
使用 md2card-skill，将 article.md 整理成面向初学者的知识卡片。
允许重新组织段落，但保留事实、数字、出处和适用条件。
先推荐三种风格与适用结构，选定后导出 PNG、PDF 和可编辑 Markdown。
```

**原样渲染：**

```text
使用 md2card-skill 渲染 cards.md，保留全部原文和 === 分页。
按文稿中指定的模板生成，正文用中等。遇到溢出先报告位置，
不要删字、缩字、换模板或增加分页。
```

**沿用品牌：**

```text
使用 md2card-skill，将这份阅读笔记制作成 T25 卡片，正文用“大”。
品牌配置使用 examples/brand.json，图片只从我指定的资源目录读取。
保留来源，不加结尾推广页；生成 PNG、PDF 和手机预览。
```

**摄影封面：**

```text
使用 md2card-skill 的 T37 photo-cover。先展示原图并与我核对裁切许可、
焦点、标题位置和主体安全区，确认后再导出。保留图注和来源。
```

摄影封面有显式元数据和资格限制；未确认裁切时可选完整图片的默认 T37。[具体字段](GALLERY_VISUAL_VARIANTS.md)。

**公众号封面对：**

```text
使用 md2card-skill，分别处理 wide.md 和 square.md，两份都只有一张卡片。
核对我选择的 T01/T21 与 21:9 / 1:1 支持范围，让我确认两份标题、
数字、单位、来源和限定条件后再导出。只写入新的本地输出目录。
```

`--author-confirmed` 只记录作者声明；工具不认证语义等价，也不接入公众号后台。[完整配对示例](../examples/wechat-covers/README.md)。

## 从模板效果到自己的成品

1. 在[全部模板](TEMPLATE_CATALOG.md)找到适合内容的构图，查看图片要求、画幅和结构限制。
2. 打开该模板的 Markdown 示例，按相同结构组织自己的材料。模板推荐只给候选和条件，不保证内容放得下。
3. 明确是否允许编辑原文。只要求渲染时，保留文字和分页；内容过长需要作者决定改写、拆卡或其他调整。
4. 在新的空目录导出，查看原尺寸 PNG、手机预览和 PDF 文字层，核对来源与数字。

## 常见问题

| 情况 | 处理方式 |
| --- | --- |
| Skill 未被识别 | 检查目录是否包含根 `SKILL.md` 和完整仓库，重新打开会话；目录发现方式以宿主官方说明为准 |
| 找不到浏览器 | 运行 `--doctor`；安装 Chromium 或用 `--browser` 指向已有浏览器 |
| 中文缺字或换行不同 | 安装合适中文字体，固定生成环境后重新导出 |
| 图片或 Logo 路径失败 | 路径相对 `--asset-root`，默认是 Markdown 所在目录，不是品牌 JSON 所在目录 |
| `CONTENT_OVERFLOW` | 查看诊断位置；增加字号后也可能触发，不自动缩字掩盖问题 |
| 不支持某模板/画幅 | 查[注册范围](TEMPLATE_ASPECTS.md)，不要直接拉伸或裁切竖版成品 |
| 输出目录已存在 | 使用新目录或已经确认无内容的空目录，不覆盖旧结果 |

参数、分页边界、品牌格式与错误码见[渲染手册](../references/rendering.md)。
