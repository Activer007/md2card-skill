# 成品模板验收记录

本页只计入实际实现、真实导出并逐图审阅的设计。配色、字体、尺寸变体不重复计数。**当前验收 4 套，首批目标 24 套，完整目标 48 套。** 后续规划见 [视觉里程碑](VISUAL_MILESTONES.md)。

## visual-m1

日期：2026-10-24。模板版本：1。范围：T01、T05、T17、T25 的注册示例，默认 standard 密度、3:4、1080×1440、manual。此验收不表示任意长文、任意字体环境或所有密度组合都能放入一张卡片；实际导出仍强制检查 screen/print 溢出。

### 精确代码与真实产物

- 源码提交：[e3de9ac46c04865a113ef9569860517ec4650d87](https://github.com/Activer007/md2card-skill/commit/e3de9ac46c04865a113ef9569860517ec4650d87)。
- 完整代码树：`e19020270a6e4e618eea4b8a7bcb613d454c1157`。CI 的合并预览 `46142d43379c45fc2d3653b8d51fd33cfde84400` 与该提交完整树一致。
- [真实 Chromium / PDF CI 40049224481](https://github.com/Activer007/md2card-skill/actions/runs/40049224481) 全部成功，169 项测试通过，0 失败、0 跳过。
- [原始 CI 产物](https://github.com/Activer007/md2card-skill/actions/runs/40049224481/artifacts/12542488042)：保留完整 PNG、两种手机预览、HTML、原生 PDF、manifest、同文比较与容量错误报告。CI 产物有保留期限；本仓库保存未改动的四张真实 PNG，输入和命令可以重新导出其他文件。
- ZIP SHA-256：`5a51aa791bb55d47847d63161e05e54cc130c799f2aad16b8a9a63197259d9be`。32 项产物/手机预览哈希已逐项核对；详见 [机器可读来源记录](template-m1-provenance.json)。

| 设计 | 真实 PNG | 原始输入 | 构图区别 |
| --- | --- | --- | --- |
| T01 专题封面与侧栏导读 | [查看](images/templates/T01.png) | [Markdown](../examples/templates/T01.md) | 编辑标题组、首字与非对称侧栏 |
| T05 大数字索引清单 | [查看](images/templates/T05.png) | [Markdown](../examples/templates/T05.md) | 大索引数字与完整列表项逐行对齐 |
| T17 荧光重点机制解析 | [查看](images/templates/T17.png) | [Markdown](../examples/templates/T17.md) | 深色仪表标题与连接的机制模块 |
| T25 便签式阅读摘记 | [查看](images/templates/T25.png) | [Markdown](../examples/templates/T25.md) | 独立便签引用、阅读批注与出处 |

### 手机与 PDF 复核

四张示例均检查原尺寸 PNG、375 / 390px 视口截图和 Poppler 栅格化的 PDF 页面；PDF 每份一页，保留可检索文本。观察范围内没有发现裁切、乱码、缺字、来源遮挡或正文重叠。源码结构检查与肉眼阅读互相补充，不宣称对所有字形、所有输入的穷尽证明。

实际手机卡宽为 351 / 366px。各模板最终计算正文下限分别为 **15.093 / 15.738px**，出处/标签下限为 **11.7585 / 12.261px**。检查的是实际渲染文本，不是仅把原图像素或视口宽度当成可读性证据。

T01 侧栏较窄、采用有意的不对称留白；适合短导读，不用于长段落栏文。T17 较密，仍维持完整字号与两级读序。T05、T25 的较宽松构图是设计选择，不靠添加无意义内容填满页面。

### 同文比较与容量边界

[统一短文](../examples/template-comparison.md) 原样分别送入 T01 / T17，画布相同，输入 SHA-256 均为 `b475df920e7b57829a6458f98c4636f2b874c457d2d254a088e6f36e2d386553`。两者原文一致而构图明显不同；对应 PNG/PDF 在产物 `templates/comparison/`。

四个候选各接受一次超长完整段落测试，均得到预期的 `CONTENT_OVERFLOW`，只留下诊断，没有缩字、隐藏内容或发布裁切输出。这个测试证明拒绝边界，不表示超长内容已获美术验收。推荐长度是选择引导，不是成功保证。

T05 固定索引轨道明确支持最终编号 0–99，超出返回 `TEMPLATE_LIST_RANGE`。测试覆盖起点 7、98、99、100、123456789；不会改成从 1 开始，较宽编号可改用原有 steps 版式。

### 源码审查与具体修复

本地 148 项单元/故障测试全部通过；另有 1,728 组独立差分检查覆盖标题、连续 H1、段落、引用、列表、表格、代码、引用链接与转义 HTML。模板 title/intro/section 槽拼回的 HTML 与原解析输出一致，未选择模板的旧渲染不变。

审查和真实输出分别发现并修复：

1. 预览漏传模板 CSS，导致预览与导出不同。修复并加入不启动浏览器的导出回归。
2. 空 ID / 空 density 的真值判断会静默回退。改为字段存在性校验。
3. 模板未呈现的 metric / label / alt / caption 被接受后丢弃。改为明确拒绝不支持字段。
4. 旧 theme 类会渗透到成品模板。模板卡不再携带旧主题类，旧调用不变。
5. 大列表起点可能超出固定索引轨道。加入完整列表编号范围校验，不重编号。
6. T01 与 T17 在真实字体中分别超高 62 / 168px。仅调整结构间距和分区留白，原文和正文字阶均未改变；修复后重新导出并逐图复核。

没有用降低字号、删除文字或关闭溢出检查来通过验收。历史失败报告与最终成功范围分开记录。

### 复现

```bash
npm run test:unit
node scripts/validate-templates.mjs
node scripts/render.mjs examples/templates/T17.md --out output/T17 --strict --preview
```

完整验证需要可运行 Chromium、中文字体和 Poppler 的允许环境。当地系统字体不同可能改变换行；不能把本页记录视为其他环境已通过。无远程资产、在线字体、上游模板代码或品牌素材，示例文字均为原创，来源没有假署名。
