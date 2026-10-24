# Optional footer modes

`--footer-mode legacy|poster|series|report` is a document-level presentation
option. The default is `legacy`. It is not card metadata, a template, a content
editor, or a new pagination algorithm.

```sh
node scripts/render.mjs example.md --out output/poster --footer-mode poster \
  --footer "AI-assisted example; independently verify factual claims."
node scripts/render.mjs example.md --out output/series --footer-mode series
node scripts/render.mjs example.md --out output/report --footer-mode report
```

## Behavior

- **legacy:** keeps the existing article/footer markup, `1 / 1` numbering, theme
  and template treatments. Omitting the option and selecting `legacy` produce
  identical HTML for the same inputs and styles. Mode-specific CSS is scoped to
  an opt-in attribute that legacy articles do not have. Adding those rules changes
  the stylesheet bytes/hash, not the default layout or footer DOM structure.
- **poster:** omits only the renderer-generated counter when the final deck has
  exactly one card. A multi-card deck still shows `1 / 2`, `2 / 2`, and so on.
  The footer element stays in normal flow, even if no footer text/brand is given.
  The responsive preview's external navigation caption still identifies its card.
- **series:** renders a bordered, emphasized page number with at least two digits,
  such as `01 / 08`. Numbers follow the final output order, including auto-generated
  pages, and grow normally to `200 / 200`; no leading digits are truncated.
- **report:** emphasizes the existing per-card source with a left rule, normal
  ink color and semibold weight, and emphasizes supplied footer text. The source
  stays in its original content location and is not moved, duplicated or invented.
  Existing theme/template source and footer font sizes are retained.

All modes preserve supplied footer text, brand name/logo, per-card sources, body
text, and AI/factual caveats. They neither recognize nor remove caveats by keyword.
Only poster's redundant single-card generated counter is omitted. Metadata remains
escaped plain text; no input becomes HTML, CSS, or a fetched URL. The option accepts
only the four exact lowercase values and rejects empty or unknown values.

## Pagination, exports, and API

Manual pagination remains the default, with explicit `===` boundaries unchanged.
The option can also be combined with `--paginate auto` and its existing optional
`--balance-tail`; it does not expand auto's layout-only metadata contract.
Per-card `source` metadata still fails explicitly in auto instead of disappearing.
Use manual mode when that metadata is needed. Attribution already authored in the
Markdown body and document-level footer/brand remain intact in auto mode.

Every auto probe reserves the widest `200 / 200` counter, including poster probes
that happen to contain one provisional card. Once the final count is known, the
entire deck is rebuilt with the selected mode and revalidated in screen and print.
The conservative probe may leave more room than a final one-card poster needs;
it never assumes the final deck is one page. Overflow continues to fail closed.

The same mode is used for HTML, responsive preview, PNG, PDF and contact sheets.
The export manifest records the effective `footerMode`, including `legacy` when
omitted. Programmatic `buildDocument`, `buildPreviewDocument`, and `exportCards`
use the camel-case `footerMode` option; invalid values reject rather than falling
back. The CLI maps `--footer-mode` to that field.

All exports still require Chromium for mandatory screen/print validation. Image
validation, source coverage, explicit boundaries, atomicity, pixel/input/output
budgets, deadlines, CSP, blocked networking, cleanup and atomic publication are
unchanged. These modes do not imply permission to delete, rewrite, shrink or hide
content to fit a chosen canvas.

## Verification status

Source-only tests cover the allowlist, pre-change markup snapshots, byte-equal
implicit/explicit legacy output, manual and auto wiring, widest probes, final
numbering, source/footer/brand/logo/caveat preservation, escaping, manifest mode,
and print-overflow rejection. Fake renderer measurements test lifecycle and
contracts only; they are not browser or visual evidence.

Actual PNG, phone-scale and native PDF visual verification of the opt-in modes
remains pending in an authorized browser environment. Existing legacy/template
acceptance does not automatically certify these new combinations or arbitrary
content. Review the actual chosen mode, template, dimensions, and supplied text
before publishing a new rendering.

## 独立验证矩阵

`node scripts/validate-footers.mjs --plan --out /tmp/footer-plan` 只检查源码；授权浏览器环境中去掉 `--plan` 后才执行真实出图。四种模式各覆盖一张卡和两张显式分页卡，共 8 例、12 张显式卡；另有 poster / series 各两例 legacy explainer 自动分页输入，分别要求最终单页和多页，合计 12 例。自动页数由实际测量决定，不预先编定。检查完整来源、作者页脚、AI/事实限定语和正确页号；每例导出 PNG、两种手机预览与原生 PDF。该矩阵不是新系列配方，也不代表已获视觉验收。

Legacy layout 自动分页案例记录实际手机字级，但不套用 48 套模板已独立设计的 14/11px 底线。原有 legacy 字体较小，需要放大阅读；默认版式保持不变，不把这些案例标为自然手机尺寸可读性验收。它们验证页脚模式在真实自动分配、最终页数与 screen/print 导出中的保全，独立视觉复核仍须明确这一限制。
