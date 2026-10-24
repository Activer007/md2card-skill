# M9 / LIB-05: independently designed aspect layouts

Updated 2026-10-24. T04 and T21 each provide independent square (1:1) and slide
(16:9) compositions. **All four authored short examples have been inspected in
full PNG, 375/390px phone captures and native PDF output.** They add no template
IDs and do not imply that all 48 templates support three ratios.

The [second combined run](https://github.com/Activer007/md2card-skill/actions/runs/40056857307)
completed all 22 technical outcomes and the four new short-composition visual
reviews. Its head is `1dd3b44ef6444eb561b6fdda6c49f7ddaa17bd74`, with tree
`9d760e5566437a3fd7c053aa5a0e840dfa1d6fcc`. The
[third run](https://github.com/Activer007/md2card-skill/actions/runs/40058009275)
repeated the 22-case technical gate on tree
`2d0e7278196ee71cb0ab349c4ce8b10e9ca40f41` without errors. Machine reports retain
`not-performed` for their own visual-review field; independent pixel inspection
is a separate record, not a retroactive edit to the generated reports.

The independent acceptance and exact provenance are recorded in the
[upgrade acceptance](TEMPLATE_UPGRADE_ACCEPTANCE.md), with separate
[aspect provenance](aspect-upgrade-provenance.json). Acceptance is limited to the
reviewed fixtures, not new content, densities, custom sizes or display environments.
Relevant changes require fresh inspection or verified artifact identity before
carrying a prior visual conclusion forward.

## Selected support, not a global aspect feature

| Template | 3:4 / portrait | 1:1 / square | 16:9 / slide |
| --- | --- | --- | --- |
| T04 | Full-width sectional essay; registered standard example reviewed | Left thesis rail and right section stack; authored short example reviewed | Left title rail, right labeled rows and bottom source band; authored short example reviewed |
| T21 | Single-metric focus; registered standard example reviewed | Paired title/metric panels and lower evidence grid; authored short example reviewed | Left title/metric/source rail and full-height right evidence; authored short example reviewed |
| Other 46 IDs | See each registered example's acceptance | Rejected | Rejected |

T04 can reorder the visual roles of its title, introduction, sequential H2
sections and source without changing DOM order or words. T21 can move its supplied
metric, complete label, evidence and limitations into a different hierarchy
without inventing data. Neither accepts images. Image-led aspect variants and
T07's deeper root/branch/synthesis layout remain outside this selected scope.

`--size` is the named canvas selector: portrait 1080×1440, square 1080×1080,
slide 1600×900. Manual remains the default. Custom integer dimensions from
200 to 4096 must match the existing absolute ratio tolerance of 0.002, evaluated
with integer cross-multiplication. For example, 1001×1000 and 1002×1000 are square,
1280×720 is slide, and 1200×800 is unsupported. Valid dimensions do not guarantee
that the content fits.

Only the frozen repository-owned `TEMPLATE_ASPECTS` enum supplies internal CSS
classes. Registry `aspectLayouts` records composition, example, version and
per-aspect status. `resolveTemplateAspect` validates actual dimensions and support
before renderer acquisition. Public card `aspect` metadata and a `--aspect`
switch do not exist; unknown ratios/combinations return
`TEMPLATE_ASPECT_UNSUPPORTED`. Filenames and user metadata never become CSS.

Template documents and manifests record the geometry-derived aspect. Legacy
no-template behavior is unchanged. `auto` still accepts only layout-only
`explainer` / `steps`; aspect support does not authorize template auto-pagination.

## Independent hierarchy and unchanged reading floor

T04 square uses a full-width title, left thesis rail and wider right sequential
section column; its source closes the card. T04 slide uses a left title rail,
introduction above right-side label/body rows and a full-width bottom source band.
T21 square pairs title and metric at the top, with evidence below. T21 slide
keeps title, metric, label and source together on the left, with introduction,
definition and limitation vertically ordered on the right. These are distinct
grids, not stretched portrait canvases or a padding-only change.

Aspect-specific titles and metric figures have their own hierarchy. Body, list,
table, code, caption, source and metric-label fonts are not reduced. Body remains
0.043 × canvas width; notes remain 0.0335 × width, with body line-height 1.5.
At the measured 351/366px inner-card widths, body is approximately
15.09/15.74px and notes 11.76/12.26px. Both phone widths were inspected for the
accepted short examples. This is not a test of arbitrary font installations or
physical projection equipment.

There is no transform/zoom-based shrinking, crop, hidden text, line clamp or
ellipsis. Extra sections and long sources remain in the DOM. If the layout does
not fit, screen/print overflow rejection is the fallback.

## What the 22 actual cases establish

The immutable [input inventory](../examples/aspects/validation-plan.json) records
case definitions and input SHA-256 values. Its original planning labels are not
current run results; actual outcomes are in each run's `aspects/summary.json`.

| Input group | Cases | Actual outcome |
| --- | --- | --- |
| T04/T21 authored square and slide short examples | 4 | All exported; independent PNG, phone and PDF review completed |
| Same short source, each template across three ratios | 6 | All exported; identical source file/hash per comparison |
| Existing registered portrait source, across three ratios | 6 | Two portrait exports; four square/slide `allowed-overflow` results |
| Long atomic pressure paragraph, across three ratios | 6 | All six return required `CONTENT_OVERFLOW` |

Thus 12 cases export and 10 reject as specified. An allowed or expected overflow
is a successful boundary check, **not** an accepted card. No comparison source was
shortened, replaced or silently adapted to get a pass.

Landscape has materially less capacity. Before footer/source/gaps, the unchanged
insets leave roughly 19.06 body-line-height units in portrait, 13.89 in square
and 7.11 in slide; narrower columns introduce additional wrapping. These are
arithmetic explanations, not universal capacity estimates. Actual results show
that both original portrait examples overflow in square and slide. Select the
authored short example or deliberately edit your own content; the renderer does
not perform that edit for you.

The four new inputs are original exercises. T21's 38/100 is explicitly fictional
teaching data with denominator, counting rule and learning-outcome caveat intact.
Long fixtures append pressure content without deleting metric, label or source.
No external images or fonts are downloaded; original composition and font
provenance remain unchanged.

## Reproduce and interpret the gates

Source-only checks do not launch Chromium:

```sh
npm run test:aspects
npm run test:unit
```

In an authorized browser-capable environment with Chromium, CJK fonts and Poppler:

```sh
npm run validate:aspects
# Or render one chosen short example to a new, empty destination:
node scripts/render.mjs examples/aspects/T04-slide.md --size slide \
  --out output/T04-slide --strict --preview --format all
```

The runner requires a clean exact-commit checkout and an empty output directory.
It fixes the 22-case inventory and input/source/style hashes, checks all artifacts
and dimensions, preserves independent case failures, and records browser cleanup.
A launch denial or uncertain cleanup blocks further launches rather than retrying
or changing engines. It never changes acceptance state or the gallery.

Successful outputs must retain exact source/metadata and one searchable native
PDF page. Full source segments are checked against per-page `pdftotext -raw`;
`-layout` is retained for inspection but can interleave independent columns.
Every successful preview is captured at 375/390px, with measured card width,
scale, computed fonts, body/note floors and visibility checks. Hidden/nested-scaled
text fails. Long/allowed-overflow cases publish only their source-located overflow
diagnostic, not completed PNG/PDF/cards.html artifacts.

These automated checks, source-level doubles and independent pixel review serve
different purposes. Acceptance belongs to each exact template+aspect+input;
re-render and inspect after relevant changes. Never reuse portrait acceptance
or a green technical gate as evidence for an unreviewed aspect.
