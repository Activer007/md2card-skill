# 图库变体真实样例

这四份输入从已有 M2A / M2B 独立归档逐字节复制。每组只改变显式变体字段；原图、正文、来源不变。T20 是原创虚构 UI；T37 是 AI 合成练习，非实拍。不要将样例安全声明复制到未经检查的新图片。

在仓库根目录运行，需正常的 Chromium / 中文字体 / PDF 工具环境，输出目录须为空：

```sh
node scripts/render.mjs examples/gallery-variants/desktop-4x3-default.md --asset-root . --size portrait --paginate manual --body-size medium --footer-mode poster --format all --strict --preview --out output/gallery-T20-default
node scripts/render.mjs examples/gallery-variants/desktop-4x3-stage.md --asset-root . --size portrait --paginate manual --body-size medium --footer-mode poster --format all --strict --preview --out output/gallery-T20-stage
node scripts/render.mjs examples/gallery-variants/bright-default.md --asset-root . --size portrait --paginate manual --body-size medium --footer-mode poster --brand examples/gallery-variants/photo-brand.json --footer "版式练习 · 不构成事实记录" --format all --strict --preview --out output/gallery-T37-default
node scripts/render.mjs examples/gallery-variants/bright-photo.md --asset-root . --size portrait --paginate manual --body-size medium --footer-mode poster --brand examples/gallery-variants/photo-brand.json --footer "版式练习 · 不构成事实记录" --format all --strict --preview --out output/gallery-T37-photo
```

T37 品牌文件刻意保留历史黑色 accent：默认对照眉题存在已知低对比问题，仅供兼容对照，不作为推荐配色或新的视觉验收。photo-cover 的 `cover` 是显式裁切许可，`subjectSafety=clear` 是作者检查声明，不是自动主体检测。默认回退须移除全部八个变体字段。

图库使用历史真实输出；以上命令使用当前代码，复现像素还需匹配字体/浏览器/操作系统。哈希、独立审阅及用途边界见 [图库说明](../../docs/GALLERY_VISUAL_VARIANTS.md) 和 [固定证据](../../docs/gallery-variants.json)。
