# M2b T37 照片封面：独立验收

日期：2026-10-26。基线：main `38bd0dbd44c8b85e3875fa70280f6d63167ed1c0`
（已合并 PR #28）。本次只交付 Draft PR，不合并；复用原 worktree。

## 结果与范围

T37 新增显式 `photo-cover`：作者声明照片角色、允许裁切、指定焦点和文字区，
并确认主体安全后，标题才叠在图上。默认 T37 仍显示完整图像。
实际白/黑前景色直接作用于 H1、眉题、强调和链接等文字元素，避免品牌色或
主题色覆盖。原图字节与尺寸、alt、图注、原文、来源、品牌、logo 和页脚均保留。

这是作者检查后的构图工具，不是自动人脸识别或主体避让系统。只能证明这些
明确样例的呈现，不能证明任意照片的语义安全。字段、资格与回退步骤见
[M2B_PHOTO_COVER.md](M2B_PHOTO_COVER.md)。

独立脚本运行 **20 条路径：12 份成功输出，8 个预期拒绝**。成功输出包括
4 份照片封面、4 份同文默认对照、3 份拒绝后的明确回退和原 T37 默认例。
代理逐一查看每份的完整 PNG、375/390 预览与原生 PDF 页图，共 48 个视图；
另单独查看存在光栅差异的竖图 screen/print 两个视图。不是仅查看缩略拼图，
也不代表维护者已经亲自逐图审阅。

| 输入 | 构图/结果 | 视觉结论 |
| --- | --- | --- |
| dark | 左下、深底白字、右对齐裁切 | 花枝和陶瓶保留，标题不覆盖主体；强调字仍为白色 |
| bright | 右上、浅底深字、左对齐裁切 | 小船与岸线保留，标题位于天空；斜体可读 |
| portrait | 左上、深底白字、右对齐裁切 | 虚构人物面部/头部无文字遮挡；链接文字保持白色 |
| three-line | 左下三行标题 | 原文、字号不变；底板仍在安全区内，不靠缩字通过 |
| blocked-portrait | 拒绝；去掉照片字段后默认输出 | 竖图完整保留头、手与器物，标题在图外 |
| no-safe-zone | 拒绝；默认回退 | 桌面物件完整保留，不叠字 |
| no-crop-permission | 拒绝；默认回退 | 没有授权就不裁切 |
| uncertain | INVALID_METADATA | 不以推测替代作者的主体安全确认 |
| invalid-focus | INVALID_METADATA | -1/101 不夹紧、不转成默认坐标 |
| invalid-role | INVALID_METADATA | screenshot 不能借用照片裁切 |
| invalid-remote | INVALID_ASSET | 沿用可信本地素材边界，未下载远程图片 |
| title-overflow | CONTENT_OVERFLOW | screen/print 均为 photo-text-zone；没有成功导出或缩字 |

实测 cover 可见原图宽度约 1228.82/1536 像素；深色/人像从 x≈307.18 开始，
亮色从 x=0 开始，全部保留高度 1024。原始完整 PNG 仍嵌入 HTML，哈希与
默认图完全一致，并随证据包单独提供。焦点是 CSS object-position 百分比，
不是“指定该人物且保证保留”的识别结果。

## 颜色、文字和既存限制

本轮故意把品牌强调色设为纯黑，检验主题色不会重新污染 on-media 文字。
计算样式与 screen/print/手机均验证：深色区文字 `#fff`，亮色区文字 `#111`。
小范围底板分别为黑色 0.76 和白色 0.84 alpha，只包住标题，不遮罩整幅照片。
按最不利白/黑照片像素计算的 sRGB 对比度下界约 10.83:1 / 13.02:1。
这项颜色分析不等于识别照片主体，也不保证任意正文品牌配色的可读性。

12 份输出的额外 screen/print 捕获中，22 张与对应导出 PNG 像素完全相同；
竖图回退的 2 张仅在嵌入图像范围内不同（各 234419 像素、最大通道差 28/255），
已分别查看：人物、手、器物及文本均完整，没有将其伪称为逐像素一致，也没有
引入全局像素容差。详见 visual-review 中的精确边界与统计。

**发现并保留的旧限制**：纯黑品牌色使默认 T37 的眉题、加粗标题或链接
在深底上对比不足；同文 dark/bright/portrait 与 original 对照均记录了这一点。
这些默认对照只通过兼容性验证，不能被标为新的视觉验收通过。新照片封面的
标题区不受此问题影响；默认输出按任务要求不改。正文等图外区域仍使用旧主题
配色，使用者应选择合适品牌色，后续可单独处理默认色彩对比。

375/390 预览中的标题和主体可辨，正文/来源/声明保留；眉题和脚注是较小的辅助
文字，不宣称所有视力条件下均可舒适阅读。三行标题仅在本次字体/画幅条件下
成立，其他字体或更长标题必须重新测量。人像照片原本就是近景，照片边界处的
肩部不被宣传为完整全身；只接受这张已查看的虚构人物练习。

## 兼容与安全

- 96 个原有独立默认 HTML 基线逐一相同，不更新旧期望值；另验证 8 个既有
  T20 screenshot-stage 样例 HTML 与基线 renderer 完全一致。
- 直接执行固定 main Git archive 的旧 parser、CSS、renderer；原 T37 的
  HTML、PNG 和原生 PDF 页图 SHA-256 完全相同。PDF 文件包含生成时间，
  不以整份 PDF 字节相同替代页面和文字验证。
- 新的兼容性证明接在不可变的 body-size/M2a 证明后，绑定执行源与仓库源，
  包含新增条件测量的 browser 模块；不为照片封面继承旧图库证据。
- 所有 12 份 PDF 通过真实 Poppler 工具及从原始输入提取的文字片段检查，
  使用 NFC 和去空白，不用 NFKC、截图 OCR 或产物倒推期望值。
- 非法 URL/file/data/绝对路径/穿越/SVG、错配模板/角色、缺失字段、非数字焦点、
  多图、无/多 H1、横版/方版与自动分页由定向测试覆盖。默认其他模板不能裁切。
- 原模板 CSS、原 T37 示例/图像、注册版本及 48 模板图库保持不变。

另以未修改的 `examples/templates/T37.md`、不加品牌、默认 legacy 页脚和
medium 字号补验，HTML、preview HTML、PNG、PDF 页图与 main 全部逐字节相同。
这组 PNG、375/390 和 PDF 页图也逐一查看，默认金色眉题正常；证据在
`original-unbranded/`，不混入纯黑强调色压力样例的结论。

最终检查记录：完整 unit 首轮 608 项中 606 通过；过程中补齐证明文件导致
2 个已加载旧证明哈希的图库测试失败。停止修改证明后，完整受影响组和新增
T20 兼容测试重新运行 50/50 通过。最终两变体定向 12/12、真实浏览器集成
21/21（强制浏览器/PDF，无跳过）、gallery:check 48/48 通过。保留原失败日志
及重跑日志，不把首轮改写为全绿。最后新增的兼容测试属于该 50 项重跑。

## 证据与复跑

入口和完整归档的哈希见 [m2b-evidence.json](m2b-evidence.json)。为压缩重复嵌入
原图的 HTML/PNG/PDF，归档采用 tar.xz；没有删减完整对照或将 PDF 栅格化代替。
使用 `tar -xf t37-photo-cover-m2b.tar.xz -C <空目录>` 解包后打开
`index.html`，可以并列查看完整图像/封面/拒绝原因，访问原始输入、完整 PNG、
375/390 图、原生 PDF、PDF 页图和文字提取结果；`originals/` 保存完整原图。
`report.json` 是自动报告，保留 `visualReview: pending` 原值；其对应的
`visual-review.json` 独立记录逐图人工代理检查、哈希和保留项，不篡改机器记录。

本机 Chrome 156.0.8078.48、Node 24.16.0、真实 MSYS2 Fontconfig 2.18.3、
Poppler 26.09.0；本地字体信息保存在各 manifest 中，不分发字体或工具二进制。

```sh
git archive --format=tar -o baseline.tar 38bd0dbd44c8b85e3875fa70280f6d63167ed1c0
# 解包到 validation/m2b/baseline，确保 Node 能解析已安装依赖。
# 真实 Fontconfig/Poppler 在 PATH；不得用占位程序替代。
node scripts/validate-photo-cover.mjs --allow-browser --baseline-root validation/m2b/baseline --out validation/m2b/new-run --browser "path/to/chrome"
```

输出目录必须为空；样例清单不符、历史源码不符或预期拒绝被放行均失败。
新合成图片来源、生成意图、原始哈希与权利范围见
[样例说明](../../examples/visual-upgrade/t37/README.md)。没有复制 Guizang 的
AGPL 模板、图片或字体；[Issue #1](https://github.com/op7418/guizang-social-card-skill/issues/1)
仅作为“父元素颜色不能覆盖子标题颜色”问题参考，代码独立实现。
