# 图库里的两种可选构图

离线打开 [图库](gallery/index.html)，从“产品截图”和“摄影封面”入口进入 T20 / T37 详情。用途搜索也支持这两个中文名称和 `screenshot-stage` / `photo-cover`。模板仍是 48 套，变体不是 T49、T50。

每组展示两张历史真实 Chromium 成品，同组正文、原图、品牌和来源相同，仅显式变体字段不同。桌面并排，窄屏上下排列，完整 PNG 可单独打开。原有默认注册缩略图、11 个同文预览及八组画幅链接保留。四张新增图片不计入默认 48 套验收，也不继承默认 portrait 的通过状态。

## 选择与限制

| 入口 | 用途 | 必要条件 | 不能承诺 |
| --- | --- | --- | --- |
| T20 screenshot-stage | 让完整产品截图优先于功能说明 | 可信本地图片、image / alt / caption、一个 H1、两个 H2 功能区；显式 visualVariant；portrait、manual | 不裁切、不补造 UI；长截图和微字不保证手机可读 |
| T37 photo-cover | 在照片安静区域叠加标题 | 单张可信本地照片、image / alt / caption / source、一个 H1；下列八个字段；portrait、manual | 不做主体检测；作者声明不等于自动安全判断 |

T37 的字段含义：`visualVariant=photo-cover` 启用构图，`imageRole=photo` 声明照片用途，`mediaFit=cover` 明确授权裁切，`focalX` / `focalY` 为 0–100 的位置百分比，`textZone` 选择文字区域，`mediaTone` 声明该区明暗底色，`subjectSafety=clear` 表示作者已经检查主体与文字区。示例使用 `top-right` / `light` / `0,50`，不可直接套用于未经检查的新图片。

无裁切许可、主体 `blocked` / `uncertain`、错误图片角色、焦点越界、无效文字区、额外行内图片、非支持画幅或正文溢出仍会拒绝。远程地址、路径穿越、SVG 等继续走原资源安全规则。回退默认 T37 时须明确移除全部八个字段；图库不自动更换模板或缩字。详见 [T20](visual-upgrade/M2A_SCREENSHOT_STAGE.md)、[T37](visual-upgrade/M2B_PHOTO_COVER.md) 原始契约。

## 原图与诚实披露

- T20 使用原创虚构 UI；记录和数字是演示内容，不代表真实产品或已上线功能。
- T37 使用已披露的 AI 合成海岸与小船图片，不是真实地点、实拍或摄影事实。
- T37 同文默认对照保留了原黑色品牌色，眉题等存在对比度不足，只作历史兼容对照；不会因此新增视觉通过声明。
- 两组独立代理审阅只覆盖精确样例。维护者逐图签收仍为 pending；本次图库交互验证不改变卡片历史验收。

## 证据与开发

[gallery-variants.json](gallery-variants.json) 固定两个历史归档的身份，以及四张 PNG、四份输入、独立报告、逐图记录和品牌文件的字节哈希。来源分别为 M2A `desktop-4x3`、M2B `bright`。新增文件是原始归档字节副本，不是概念图、截图拼贴或重新生成后冒用旧哈希。

`scripts/gallery-variants.mjs` 仅构建展示数据，不是能力注册表。模板 ID / version / aspects 取自 `scripts/templates.mjs`；画幅许可使用该模块的 `validateTemplateMetadata`。生成时验证固定 manifest、PNG 签名/尺寸/哈希、原始图片和品牌 logo、报告中的 input/artifact 身份、同组正文与基础元数据一致、独立视觉结论。未来版本不能自动借用旧像素。固定哈希是经审查的仓库信任起点，不是外部签名。

图库仍是本地 HTML + CSS + classic JS，原 CSP 不变。原生 details 和锚点提供无脚本回退；增强脚本仅在用途跳转时清除隐藏目标的筛选并展开目标详情。新图按 DOM 顺序加入资源审计；审计临时展开包含图片的 details，解码后恢复状态。

运行：

```sh
npm run gallery:build
npm run test:gallery
npm run gallery:check
node --test tests/screenshot-stage.test.mjs tests/photo-cover.test.mjs
node scripts/validate-gallery.mjs --allow-browser --browser /absolute/path/to/chromium --out validation/gallery-variants-new
```

浏览器输出目录必须为空。新增浏览器检查覆盖两个用途入口、键盘 Enter、被筛选目标、详情和来源展开、图像解码、哈希展示、桌面 / 375 / 390 / 640 重排及禁用 JavaScript。640×450 是 1280×900 的等效 200% 重排，不冒充浏览器原生缩放。

完整命令及字节相同的样例见 [examples/gallery-variants](../examples/gallery-variants/README.md)。本次结果与限制见 [图库复核](GALLERY_VARIANTS_REVIEW.md)。本改动不涉及渲染器或安全阈值，因此不重复全量渲染矩阵；保留相关拒绝专项。
