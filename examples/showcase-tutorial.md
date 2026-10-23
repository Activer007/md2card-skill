<!-- card: {"layout":"cover","eyebrow":"BUILD NOTES / 01"} -->
# 从 Markdown
# 到可检查的卡片

保留文本，明确边界，拒绝静默裁切。

一份可在本地复现的短教程。

===

<!-- card: {"layout":"steps","eyebrow":"BUILD NOTES / 02"} -->
# 三步完成导出

1. 写好内容，用 === 显式分页。
2. 运行 doctor，检查字体、浏览器与 PDF 工具。
3. 导出后查看 manifest 和实际图片。

```bash
node scripts/render.mjs --doctor
node scripts/render.mjs notes.md \
  --out output/notes-v1 --preview
```

输出目录为空才会写入，不覆盖旧结果。

===

<!-- card: {"layout":"case-study","eyebrow":"BUILD NOTES / 03"} -->
# 当内容放不下时

## 看到什么

程序返回 CONTENT_OVERFLOW，并生成 overflow.json。

## 如何处理

定位源文件行号，删去冗余或添加一个明确的分页边界。

## 不要做什么

不要隐藏溢出，也不要用难以阅读的小字伪装成功。
