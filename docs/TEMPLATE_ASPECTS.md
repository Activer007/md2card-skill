# M9 / LIB-05: independent aspect candidates

Status: source implementation only, 2026-10-24. No new PNG, mobile screenshot,
PDF, real fit result or visual acceptance is claimed. The earlier local Chromium
sandbox denial has not been retried, reconfigured or bypassed. The integrated slice adds a command to the existing read-only CI workflow,
but does not itself enable Actions or dispatch a run. Authorized real validation
and independent pixel review remain prerequisites for acceptance.

## Scope and selection

This is one independently reviewable aspect slice, not a new gallery engine,
recipe system or claim of M9 acceptance. It also exposes supported aspect labels
in the existing gallery, without adding unverified previews. Only existing T04 and T21 gain independent 1:1 and 16:9
compositions. No template ID is added. The four previously accepted portrait
examples keep their existing status; no aspect inherits acceptance from another.

- T04 has safe title / introduction / H2 sections / source slots. Its editorial
  sequence can become a thesis rail or labeled reading rows while retaining the
  same DOM and every word. The landscape grid is for concise observations, not an
  excuse to claim that a long-form template fits long prose on a short canvas.
- T21 already separates a genuine supplied metric and label from evidence and
  limitations. Independent paired-headline and metric/source-rail arrangements
  give these slots new roles without inventing data.
- T07 is intentionally deferred. Its root / two branches / synthesis hierarchy
  consumes too many distinct reading levels for a first landscape slice at the
  unchanged mobile body floor. No global aspect flag enables it or the other IDs.
- Neither selected template accepts images. Therefore this slice needs no image
  ratios, crop policy change, new assets or resolver changes. Image-led variants
  require a separate future design and image acceptance matrix.

## Support matrix and geometry contract

| Template | 3:4 / portrait | 1:1 / square | 16:9 / slide |
| --- | --- | --- | --- |
| T04 | Existing full-width sectional essay, still awaiting acceptance | Left thesis rail + right section stack, pending real acceptance | Left title rail + right labeled section rows + bottom source band, pending real acceptance |
| T21 | Existing single-metric focus, still awaiting acceptance | Paired title / metric top panels + lower evidence grid, pending real acceptance | Left title / metric / source rail + full-height right evidence, pending real acceptance |
| Every other existing ID | Existing status unchanged | Rejected | Rejected |

`--size` remains the only named canvas selector; defaults remain 1080 × 1440,
manual pagination. Custom integer dimensions from 200 to 4096 match the same
absolute ratio tolerance as before: abs(width / height - target ratio) <= 0.002.
For example 1001 × 1000 is square, 1280 × 720 is slide, 1200 × 800 is unsupported.
The comparison uses integer cross-multiplication, avoiding the old floating-point
false rejection exactly at ±0.002 (for example 1002 × 1000). The tolerance window
itself is unchanged. Dimensions take precedence because there is no separate
user aspect override.

The frozen repository-owned TEMPLATE_ASPECTS enum supplies class names. A registry
entry lists supported enum IDs and aspectLayouts containing composition, example,
version and per-aspect status. resolveTemplateAspect validates actual dimensions
and template support, and returns only an enum object. Neither metadata strings
nor filenames become CSS classes. Public card `aspect` metadata remains unknown
and rejected by the parser; direct template validation rejects it too. There is
no `--aspect` switch or arbitrary aspect class. Unknown ratios/unsupported
combinations fail with TEMPLATE_ASPECT_UNSUPPORTED before renderer acquisition.

Document output gains data-template-aspect and the corresponding internal class
only for templates. Manifests record the resolved card aspect. All old portrait
selectors still apply without a square/slide override. No legacy theme/layout
CSS or semantic pagination logic changes. Auto still rejects template metadata
and accepts only layout-only explainer/steps; aspect support never implies auto.

## Independent layout hierarchy

T04 square keeps the title full width but moves the introduction into a narrow
left thesis rail. Original H2 sections remain sequential in a wider right column;
the source closes the full card. T04 slide moves the title into a left rail,
keeps the introduction above the right body, and makes each section a label/body
row. The source becomes a full-width lower evidence band. This is not stretched
portrait, three cramped newspaper columns, or only reduced padding.

T21 square pairs title and metric as two top panels; the metric label stays next
to its number. The lower evidence grid uses the full width, and the source closes
it. T21 slide is instead an asymmetric left metric rail and full-height right
reading column. Title, metric, complete label and source remain grouped on the
left. The right introduction, definition and limitation are vertically ordered.
DOM order and exact text remain unchanged across all three dimensions.

Aspect-specific titles and metric figures have their own hierarchy. No body,
list, table, code, caption, source or metric-label font is reduced. Body remains
0.043 × canvas width, notes remain 0.0335 × width, body line height remains 1.5.
No transform, zoom, crop, clipping, hidden text, line clamp or ellipsis is added.
Extra H2 sections and long sources remain in the DOM and grow intrinsic rows;
normal screen/print overflow rejection, not dropping sections, is the fallback.

## Landscape capacity is materially smaller

These are arithmetic budgets, NOT browser measurements or a claim of fit:

| Canvas | Body / note px | Height after unchanged 5.2%-width top/bottom insets | Body-line-height units before footer, source and gaps |
| --- | --- | --- | --- |
| 1080 × 1440 | 46.44 / 36.18 | 1327.68 px | 19.06 lines |
| 1080 × 1080 | 46.44 / 36.18 | 967.68 px | 13.89 lines |
| 1600 × 900 | 68.8 / 53.6 | 733.6 px | 7.11 lines |

The actual card-content height is lower still after the footer. Reading columns
also wrap: T04's landscape section body is approximately 39% of canvas width,
roughly nine CJK body glyphs per line before font/spacing effects. Consequently
ordinary original portrait examples may fail in square or landscape. Unsupported
content is an honest rejection, never permission to shorten or shrink it.

At displayed widths 351 / 366 px the unchanged formulas imply body sizes 15.09 /
15.74 px and note sizes 11.76 / 12.26 px. These values must still be checked from
final computed styles and actual preview width at viewport 375 / 390, including
nested semantic text. Projection/landscape viewing is an additional validation
condition, not a waiver of these phone checks.

## Inputs and provenance

The four new short inputs are independently written original exercises, not
rewrites automatically substituted for user input. They preserve a complete
idea and source note without claims that every source fits:

- examples/aspects/T04-square.md and T04-slide.md require a title, thesis and
  three sequential observation sections. Sources say they are original exercises.
  No metric or image is needed or accepted.
- examples/aspects/T21-square.md and T21-slide.md require supplied nonempty metric
  and label. They explicitly identify 38 / 100 as fictional teaching data, define
  the denominator and counting rule, and retain the limitation that completion
  does not establish learning. No image is needed or accepted.
- T04-long.md and T21-long.md append an original atomic pressure paragraph without
  removing source/metric/label. Their expected outcome at all three ratios is
  CONTENT_OVERFLOW, still unverified until authorized real measurement.
- No external imagery, source claims or fonts are downloaded. System-font and
  repository MIT composition provenance remain as before.

examples/aspects/validation-plan.json is the 22-case, hashed source inventory.
For each template, it includes two aspect-specific cases and three same-source
comparisons (short, existing portrait example, long), each at all three ratios.
A comparison uses exactly the same file and SHA-256 across the three exports.
Short cases are unmeasured candidates; originals may overflow; long cases are
expected rejections. Every real-render/mobile/PDF/visual state is not-performed.

## Safe source-only checks

Run from the isolated source tree or later integrated repository:

```sh
node --check scripts/templates.mjs
node --check scripts/document.mjs
node --check scripts/render.mjs
node --test tests/aspects.test.mjs
npm run test:unit
MD2CARD_SKIP_BROWSER=1 MD2CARD_REQUIRE_BROWSER=0 npm test
```

The source test builds HTML as strings, rejects renderer acquisition for invalid
aspects, and uses explicitly fake in-process export/overflow doubles for manifest
and dual-media lifecycle assertions. It never launches Chromium. It proves enum
allowlisting, custom-ratio bounds, support matrix, unchanged auto/legacy paths,
exact source/DOM conservation, static mobile-floor declarations and candidate
provenance. None of those tests proves line wrapping, fit, real font metrics,
image pixels, PDF output, aesthetics or phone readability.

## Future authorized real validation plan

Do not run this plan locally under the recorded denial. Do not enable Actions or
create/dispatch a workflow without applicable user authorization. Once an allowed
browser environment and exact integration commit are authorized:

1. Record the commit/tree, runtime/Chromium versions, installed font identities,
   and SHA-256 of every input/style/module. Run all source regressions first.
2. For each validation-plan case, run the existing renderer with its exact input
   and `--size portrait|square|slide --strict --preview --format all`. Use a fresh
   output directory and preserve one-card manual boundaries. For example:

   ```sh
   node scripts/render.mjs examples/aspects/T04-slide.md --size slide --out validation/aspects/T04/slide --strict --preview --format all
   ```

   Success candidates are hypotheses, not assertions that may be forced to pass.
   An overflow must retain the original source and be recorded. Only a separate
   explicitly chosen new short example is permitted; do not replace the same-
   source comparison input to hide a failure.
3. Long cases must report CONTENT_OVERFLOW with overflow.json and no completed
   PNG/PDF/cards.html publication. Unexpected success is a test failure requiring
   investigation of measurement/containment, not an acceptable clipped image.
4. At screen and print, inspect every measured element and final footer. Confirm
   export PNG dimensions, all text/metadata exactly once, grid hierarchy, no
   overlapping grid children, glyphs, sources, labels, metric/denominator linkage,
   extra sections and long-source failure. Include compact/standard/editorial
   spacing presets and ensure no font-size drift.
5. Capture each successful actual preview at viewport 375 and 390 with measured
   card width, scale and minimum computed body/note sizes. Inspect actual images
   at natural displayed width, not just scaled HTML or arithmetic. Record any
   empty-row or source-placement weakness and revise/re-render the same input.
6. Check landscape additionally on a 1600 × 900 presentation display; record that
   viewing condition separately. Verify all glyphs at original resolution.
7. Inspect every native PDF page; use pdfinfo/pdftotext for exact page boundaries,
   searchable text, source/metric/label completeness, and the same-source markers.
   Record artifact SHA-256 and versioned manifests for PNG, HTML, previews and PDF.
8. Run legacy/no-template and unsupported-aspect/auto regressions, custom sizes
   near tolerance on both sides, complete source pressure cases, and title/label/
   source lengths. A tiny valid custom canvas is not automatically a fit promise.
9. Human-review all resulting cards, all mobile images and PDFs. Only update the
   specific template+aspect acceptance after all four quality gates pass. Do not
   increase the template count or reuse portrait acceptance for new aspects.

## Integration boundaries

The original isolated source pack was integrated as additive hunks, preserving
all 48 M6/M7 entries, image contracts, tail balancing, series and gallery checks.
No template ID, recipe logic or browser engine is added. Registry edits add aspect
metadata; document markup adds geometry-derived attributes; render changes are
help/import/manifest bookkeeping. Integration also adds one existing-workflow
validation command and gallery support labels, without permission or action-SHA
changes. The gallery binds acceptance to its precise per-aspect evidence, not
the support list, and supplies no unverified square/slide preview.

## Executable future gate: validate:aspects

The pending plan now has a bounded executable implementation:
`npm run validate:aspects` invokes `scripts/validate-aspects.mjs`. It is prepared
for a future expressly authorized real-browser environment only. It was NOT run
here, and no Actions configuration or permission is added by this command.
`npm run test:aspects` runs source tests and in-process doubles only.

The runner requires a clean exact-commit checkout and an empty validation/aspects
output directory. It validates the existing 22-case inventory, refuses additional
cases, pins input/source/style hashes, and preserves each comparison file. Every
started case receives a result and independent failures do not truncate later
cases. Global malformed-inventory/dirty-checkout/stale-output preconditions fail
before browser acquisition. A browser launch denial, mobile deadline or uncertain
browser cleanup instead records subsequent cases as blocked without retrying a
launch or trying another engine. Nested close-browser failures on otherwise
expected CONTENT_OVERFLOW results are treated as failures, not successful bounds.

- Every export requests manual pagination, exact registered dimensions, scale 1,
  all formats, strict verification and preview. Exact card count, source hash,
  template/aspect identity, stylesheet hashes, all artifact byte counts/hashes,
  PNG dimensions and manifest hash are checked.
- A short candidate must export successfully or report a failed candidate. An
  existing portrait-source comparison may export OR return allowed-overflow.
  A long input must return expected-overflow; unexpected export is a failed gate.
  Both overflow outcomes must publish only overflow.json, with the correct source
  filename/line range, dimensions and an actual screen/print overflow diagnostic.
  No smaller input is substituted, and no overflow is relabeled visual acceptance.
- Export HTML and preview must retain every original safe-parser slot in order
  and all source/metric/label/eyebrow metadata exactly once. Native PDF inspection
  requires one searchable page and strict Poppler availability. The full set of
  original visible text segments is separately verified against per-page
  pdftotext -raw extraction. Physical -layout text can interleave independent
  columns and is NOT used to decide whether a paragraph survived. The raw text
  evidence is saved with a hash; checking one convenient marker is insufficient.
- Each successful card is loaded in an actual Chromium preview at viewport 375
  and 390. The audit records actual card width/height, scale, export dimensions,
  computed font family/size/line height, body/note effective sizes and page count.
  It enforces the unchanged .043w / .0335w floors AND the 14px / 11px mobile floors,
  expects the current 351px / 366px inner widths, includes nested text nodes,
  rejects hidden source nodes and unexpected nested transform/zoom, and captures
  each real card screenshot with dimensions/bytes/hash. An overall bounded mobile
  deadline covers fonts, viewport changes, audit and screenshot browser waits.
- All case failures and cleanup diagnostics are preserved in summary.json. A
  successful technical run still says visualReview: not-performed and changes no
  registry acceptance, gallery, template count or source file. Human inspection
  of actual PNG/mobile/PDF artifacts remains a separate required gate.

Source tests exercise aggregation, all outcome categories, complete PDF segment
checking in logical order, wrong hashes, malformed plans, stale/dirty preconditions,
strict export options, computed-type guardrails, hidden/nested-scaled text,
independent mobile-width failures, launch denial, nested cleanup uncertainty and
mobile timeout. They inject every browser/subprocess/PDF boundary; their synthetic
PNG headers and temporary fake exports are protocol fixtures, never real artifacts
or geometry evidence. All temporary fixtures are deleted after tests.
