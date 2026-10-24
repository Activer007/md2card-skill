# M9 / LIB-05 / R12: purpose-led aspect layouts

> 当前 M2 的 48 个 standard / portrait 注册示例已独立复核（13 套 v3 / 35 套 v2）。T04/T21 四个既有画幅短例也有当前 M2 有界复核，但最终画幅注册绑定仍 pending；全部八个额外画幅组合保持待验收注册状态。四个新 R12 组合是独立 aspect-v1，仍待本阶段真实产物。

Updated 2026-10-24. R12 adds exactly four purpose-led pairs: **T05 square,
T13 square, T24 slide and T37 slide**. They are implemented but await visual
review. No successful local R12 PNG, phone capture or PDF inspection is claimed.
The inherited CLI help-path launch failure is retained below; it is not visual
evidence. Source-only tests and expected results below are not visual evidence.

T04 and T21 already provide independent square (1:1) and slide (16:9)
compositions. Their four exact short examples have current M2 full PNG, 375/390px
phone and native-PDF review in [the M2 acceptance](REFINEMENT_M2_ACCEPTANCE.md),
separate from immutable historical v1 evidence below. Final aspect-specific
registry binding remains pending, so all eight additional aspect pairs retain
`implemented-awaiting-visual-review` registry status. The four new R12 layouts
and this stage's complete 58-case run are still pending. No fixture review transfers
to different inputs, new layouts or unrelated controls. These eight aspect variants
add no template IDs and do not imply that all 48 templates support three ratios.

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

The current M2 run 40074554707 has 22 existing-aspect technical outcomes: 12
exports and 10 expected refusals. Independent visual review covers only the four
registered T04/T21 square/slide short fixtures, not all 12 exports or the new R12
inputs. Source tree and technical scope are bound in the M2 record above.

## Selected support, not a global aspect feature

| Template | 3:4 / portrait | 1:1 / square | 16:9 / slide |
| --- | --- | --- | --- |
| T04 | Full-width sectional essay; exact standard/portrait v2 reviewed in M2 | Left thesis rail and right section stack; exact v2 short fixture reviewed in M2; registry binding pending | Left title rail, right labeled rows and bottom source band; exact v2 short fixture reviewed in M2; registry binding pending |
| T21 | Single-metric focus; exact standard/portrait v2 reviewed in M2 | Paired title/metric panels and lower evidence grid; exact v2 short fixture reviewed in M2; registry binding pending | Left title/metric/source rail and full-height right evidence; exact v2 short fixture reviewed in M2; registry binding pending |
| T05 | Current v2 numbered full-width rows; exact portrait reviewed | Two-by-two numbered reading index; **awaiting visual review** | Rejected |
| T13 | Current v2 stacked declaration poster; exact portrait reviewed | Left slogan rail facing complete argument stack; **awaiting visual review** | Rejected |
| T24 | Current v3 report, table and decision stack; exact portrait reviewed | Rejected | Left decision rail and right complete table stage; **awaiting visual review** |
| T37 | Current v2 full-frame image over story band; exact portrait reviewed | Rejected | Full-frame image/caption at left, story rail at right; **awaiting visual review** |
| Other 42 IDs | Exact standard/portrait M2 examples reviewed; immutable versioned history retained | Rejected | Rejected |

T04 can reorder the visual roles of its title, introduction, sequential H2
sections and source without changing DOM order or words. T21 can move its supplied
metric, complete label, evidence and limitations into a different hierarchy
without inventing data. Neither accepts images. R12 T37 is the only selected image-led aspect variant;
it keeps its required resolver-validated raster input, original proportions, alt
and caption. T07's deeper root/branch/synthesis layout remains outside this scope.

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
0.043 × canvas width; notes remain 0.0335 × width. The current family-specific line heights and local
font roles are inherited unchanged; historical v1 measurements used body line-height 1.5.
At the measured 351/366px inner-card widths, body is approximately
15.09/15.74px and notes 11.76/12.26px. Both phone widths were inspected for the
accepted short examples. This is not a test of arbitrary font installations or
physical projection equipment.

There is no transform/zoom-based shrinking, crop, hidden text, line clamp or
ellipsis. Extra sections and long sources remain in the DOM. If the layout does
not fit, screen/print overflow rejection is the fallback.

## Historical 22-case evidence, not R12 results

The immutable [input inventory](../examples/aspects/validation-plan.json) records
case definitions and input SHA-256 values. The first 22 cases preserve the earlier inventory. Planning labels are not
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

Landscape has materially less capacity. For the historical v1 typography, before
footer/source/gaps the unchanged insets left roughly 19.06 body-line-height units in portrait, 13.89 in square
and 7.11 in slide; narrower columns introduce additional wrapping. These are
arithmetic explanations, not universal capacity estimates. Actual results show
that both original portrait examples overflow in square and slide. Select the
authored short example or deliberately edit your own content; the renderer does
not perform that edit for you.

The four M9 inputs are original exercises. T21's 38/100 is explicitly fictional
teaching data with denominator, counting rule and learning-outcome caveat intact.
Long fixtures append pressure content without deleting metric, label or source.
No external images or fonts are downloaded; original composition and font
provenance remain unchanged.

## R12 scope and pending review

The four additional pairs answer different purposes, rather than stretching a
portrait canvas or enabling every aspect on each template:

- **T05 square:** four supplied list entries form a row-major two-by-two index.
  Input numbering remains unchanged, including non-one starts. Extra list items
  and nested content remain present. The existing 0–99 counter range still applies.
- **T13 square:** a left slogan rail balances a right premise/argument stack.
  Its body remains complete and readable, rather than being reduced below the
  giant portrait heading. Consecutive H1s remain one source-ordered title group.
- **T24 slide:** a decision rail sits alongside the real comparison table. The
  first H2 section owns the table stage, the second owns the decision, and extra
  sections span below without deletion. `display: contents` changes only layout
  boxes, not DOM order or native table semantics. This short fixture has two
  alternatives; the original three-row portrait input is tested unchanged too.
- **T37 slide:** full-frame image and caption sit beside the title/story, with
  attribution in its own full-width band. The v2 intrinsic frame and inherited `object-fit: contain`
  keep the entire image; no caption overlay, image rewrite or crop is added.

Each new pair has its own aspect-v1 identity, independent of its accepted parent
template version (T24 v3; T05/T13/T37 v2). None gains acceptance or evidence by
inheritance from a portrait template.

All R12 rules are appended in one isolated section of `assets/templates.css`.
Every selector names one exact template/aspect pair, leaving M3a portrait styles
and all M2 local typography roles unchanged. Square T05 gives its numeral its
own display size and clear top spacing; square T13 clears portrait-only H1
staggering inside its narrower rail. T37 keeps the intrinsic auto-height frame
and uses a slide-specific image-height ceiling without changing the contain rule. No body/note size, transform, zoom, clipping, hidden text, line clamp,
ellipsis or crop rule is introduced. Body/list/table text inherits 0.043 × width;
notes inherit 0.0335 × width. At a measured 351/366px inner-card width these target
15.09/15.74px body and 11.76/12.26px notes, above the 14px/11px floors. These are
source arithmetic, not newly measured R12 browser results. Density still changes
spacing only. Full PNG, phone and PDF inspection remains necessary.

The existing T05, T13, T24 and T37 portrait PNGs were inspected before design.
They are historical source references, not R12 previews. Their exact SHA-256s:

| Reference | SHA-256 |
| --- | --- |
| `docs/images/templates/T05.png` | `ea8b91888547a6396eb8d3059d97ab89828fb84949e512a532dcdd6e1f784f44` |
| `docs/images/templates/T13.png` | `365e802ef74ed593a72908356490978ebc8cc2d1649e1f9bbda5c1729bca353a` |
| `docs/images/templates/T24.png` | `1627089af1527d3330b38a8c59844f7d8d0eb51296ffb6730c1f57f5d14c41d8` |
| `docs/images/templates/T37.png` | `84caca513abb334d240e4ea69fcb9ff814bac885bf7b3ca0881bb5e732fb6f3d` |

The new text is original. T37 reuses the existing AI-generated, explicitly
non-documentary still life at 1536×1024, SHA-256
`6efb1be0ead9937892cc8dd2b6837877521fea4527a281c9a231a8b894bde6aa`.
No image generation or external asset download occurred. Its new source, original
portrait comparison and pressure input all resolve the same bytes beneath the
explicit trusted `examples/templates` asset root. The original caption and
metadata are not replaced in the original-source comparison.

## R12 bounded 58-case validation inventory

The plan records base revision `e1ad19f00ec44c90ff54e83694a42f547f437566`, exact
input hashes and unperformed review flags. It preserves the original 22 cases and
adds 9 per new pair, 36 total. An expectation is not an actual render result.

| New cases per pair | Number across four pairs | Required future outcome |
| --- | ---: | --- |
| Authored short example at selected aspect | 4 | Export candidate; independent visual review still required |
| Identical short input at portrait and selected aspect | 8 | Both export candidates; unchanged input hash |
| Original registered portrait input at both supported aspects | 8 | Export or source-located overflow; never substitute shorter input |
| Same appended long atomic pressure source at both aspects | 8 | Required `CONTENT_OVERFLOW`; no completed artifacts |
| Unimplemented named aspect plus 1200×800 custom ratio | 8 | Required `TEMPLATE_ASPECT_UNSUPPORTED` before renderer acquisition |

Across the complete 58-case plan, there are 22 required-export candidates,
14 original-source cases that may overflow, 14 required-overflow cases and
8 required-refusal cases. Thus a theoretical all-original-fit test double has
36 exports, not 36 visually accepted cards. No new actual capacity conclusion
is claimed. The full-frame T37 mobile audit checks source dimensions, loaded
image, `contain`, no clipping/nested scaling and visible image/caption. It compares
the actual contain-painted rectangle with image and ancestor clip boundaries,
including the card: intrinsic IMG `overflow: clip` alone is not evidence of crop.
Paint containment, non-visible content-visibility, individual rotate/translate and
other unsupported paint geometry fail closed. These are source-tested measurement
guards, not new visual acceptance; the generic overflow guard is unchanged. Source
HTML and export manifests must retain exact raster hashes, alt and caption.
Searchable native PDF verification now also checks the complete caption text.

Review each new short pair in full PNG, at both phone widths, and native PDF.
Check source order and counter values, balanced title/body hierarchy, complete
claim/limitation/table/image caption, readable notes, full frame and no
text/figure collision. Review the unchanged original comparison only if it
exports. Overflow/refusal is a successful boundary check, never visual acceptance.
Relevant shared typography changes also invalidate reuse of older visual evidence.

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
node scripts/render.mjs examples/aspects/T37-slide.md --size slide \
  --asset-root examples/templates --out output/T37-slide --strict --preview --format all
```

The runner requires a clean exact-commit checkout and an empty output directory.
It fixes the 58-case inventory and input/source/style/image hashes, checks all artifacts
and dimensions, preserves independent case failures, and records browser cleanup.
A launch denial or uncertain cleanup blocks further launches rather than retrying
or changing engines. It never changes acceptance state or the gallery.

Successful outputs must retain exact source/metadata and one searchable native
PDF page. Full source segments are checked against per-page `pdftotext -raw`;
`-layout` is retained for inspection but can interleave independent columns.
Every successful preview is captured at 375/390px, with measured card width,
scale, computed fonts, body/note floors and visibility checks. Hidden/nested-scaled
text fails. Long/allowed-overflow cases publish only their source-located overflow
diagnostic, not completed PNG/PDF/cards.html artifacts. The eight unsupported
combinations run the actual exporter with fail-closed preflight/browser seams;
they must return `TEMPLATE_ASPECT_UNSUPPORTED` before acquiring a renderer and
publish no render artifacts, even if earlier browser cases were blocked.

These automated checks, source-level doubles and independent pixel review serve
different purposes. Acceptance belongs to each exact template+aspect+input;
re-render and inspect after relevant changes. Never reuse portrait acceptance
or a green technical gate as evidence for an unreviewed aspect.


## CLI safety boundary

The aspect validator now parses arguments before any output directory or runtime
work. `--help` only prints usage; unknown, duplicate or incomplete arguments fail
before runtime. Actual execution requires `--allow-browser` (included by the
`validate:aspects` npm script), which is only an accidental-invocation guard, not
permission to bypass an environment or user denial. The default entrypoint must
not be used as a source-only command. Source tests inject all runtime dependencies.

During this source round an attempted `--help` on the inherited argument-ignoring
entrypoint mistakenly entered validation. One Chromium launch failed under the
known local sandbox restriction; all 49 later browser cases were blocked, with no
PNG/PDF produced. No alternate route or retry followed. This is failure evidence,
not a rendered or visually accepted case. The strict parser and source-only CLI
regressions prevent that help-path recurrence.
