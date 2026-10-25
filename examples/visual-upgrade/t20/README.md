# T20 screenshot-stage 压力样例

从仓库根目录运行，所有 Markdown 的 `image` 引用相对于仓库根目录：

```sh
node scripts/render.mjs examples/visual-upgrade/t20/desktop-4x3.md --asset-root . --out output/stage-example --preview --strict
```

`original.md` 沿用仓库原有虚构研究工作台图像。其他正向样例中的 UI 为本项目原创测试画面，标为虚构；记录编号仅用于完整性测试，不是实际业务数据。HTML、PNG 和生成器以仓库 MIT 许可提供，没有引入 Guizang 的代码、外部图片或字体文件。

`generate-fixtures.mjs` 使用本机 Chromium 与本地字体重新生成四种截图，并在截图前断言夹具没有溢出；跨平台像素可能不同。`invalid-*` 必须拒绝，`overflow.md` 必须只产生溢出诊断。删除 `visualVariant` 可运行同文、同图的旧默认模式。

实际验收环境、完整 SHA-256 和手机/PDF 限制见 [M2a 说明](../../../docs/visual-upgrade/M2A_SCREENSHOT_STAGE.md)。
