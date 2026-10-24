# Rendering contract (phase 3)

M1 首次独立出图已发现容量问题并准备源码修复，仍待修复版本重测与视觉验收；44/48 个注册示例导出，四个溢出。精确失败与修复边界见 [阶段出图记录](../docs/REFINEMENT_M1_CALIBRATION.md)。

> 当前精修状态：13 套 v2 仍待新产物验收，35 套未变更设计保留 v1 验收。下面已有 48 套的历史结论不验证新设计。见 [R01–R12 计划](../docs/REFINEMENT_PLAN.md)。

Phase 3 adds bounded, opt-in semantic pagination to the v2 renderer. See
[the development plan](../docs/DEVELOPMENT_PLAN.md) for commit-specific code, local,
CI and visual-review evidence, and [showcase provenance](../docs/SHOWCASES.md) for
actual automatic-pagination exports. Existing v2 showcase results are historical
evidence, not a validation pass for automatic pagination.

## Setup and preflight

Node.js 20+, locked npm dependencies, Chromium, and local fonts are required.
Run `npm ci` and, where permitted, `npx playwright install chromium`.
`--browser PATH` or `CHROMIUM_PATH` selects an existing Chromium.
Never bypass a sandbox denial or browser security warning to make exports work.

```bash
node scripts/render.mjs --doctor
node scripts/render.mjs --doctor --strict --json
```

Doctor locates the browser but does not launch it. It checks package pins,
Fontconfig font coverage, and `pdfinfo` / `pdftotext` from Poppler. Missing font
inspection is explicitly unverified; strict Chinese rendering requires coverage.
Installed-font coverage is not a claim that Chromium selected or painted the
correct glyphs. Human visual review is still necessary. Windows/macOS without
Fontconfig can use non-strict mode, but font QA remains unverified until inspected.

## Input

UTF-8 Markdown, at most 2 MiB. Standalone `===` divides explicit sections except
inside fenced or indented code. In default `manual` mode each section is one card;
in `auto` mode a section may be subdivided, but its boundaries remain locked. Blank boundary lines are removed without stripping meaningful
indentation. `---` retains Markdown semantics. Empty cards are rejected.
Reference definitions are collected across cards with first-definition-wins
semantics. HTML stays escaped and unsafe link schemes do not become active links.

Optional metadata appears on the first nonblank, non-code line of a card:

```markdown
<!-- card: {"layout":"image-caption","image":"assets/photo.png","alt":"描述图片内容","caption":"图注","source":"出处说明"} -->
# 标题

正文内容。
```

Metadata is a single-line JSON object. Allowed string keys: `layout`, `eyebrow`,
`image`, `alt`, `caption`, `source`, `metric`, `label`. Unknown keys, nonstrings,
control characters, and unknown layouts fail. No user-provided CSS is accepted.
No YAML frontmatter is interpreted. Omit metadata for a legacy explainer card.

Layouts: cover, explainer, comparison, steps, image-caption, statistic, case-study,
quote. Comparison uses the first two top-level h2 sections as columns, preserving
additional sections below. Case study uses h2 sections as stages. Steps styles
top-level ordered lists. Statistic uses exact `metric` and `label` text. Quote uses
Markdown blockquotes. Missing optional fields do not produce invented content.

## Pagination modes and semantic boundaries

`--paginate manual` is the default and preserves v2's one-explicit-section-per-card
behavior. It supports all eight layouts and the metadata schema above. It does not
try to fit excess content by changing wording, shrinking fonts or adding cards.

`--paginate auto` enables semantic subdivision using the actual browser layout:

```bash
node scripts/render.mjs long-explainer.md --out output/auto-v1 \
  --paginate auto --theme editorial --format all
```

This phase supports only `explainer` and `steps`. Omitted metadata still selects
`explainer`; when a card metadata object is present, its only allowed key in auto
mode is `layout`. Other layouts fail with `PAGINATION_UNSUPPORTED_LAYOUT`. Any
additional card metadata, including `source`, `eyebrow`, `image`, `alt`, `caption`,
`metric` or `label`, fails with `PAGINATION_UNSUPPORTED_METADATA`; it is never
silently dropped, reassigned or repeated. Document-level footer and brand settings
remain separate from per-card metadata. Use manual mode for unsupported layouts
or metadata. Do not delete attribution just to satisfy automatic pagination.

The semantic intermediate representation retains the original Markdown tokens,
text, order and source locations. It creates these indivisible content units:

- Paragraphs, fenced or indented code blocks, blockquotes and images stay whole.
- A top-level list item stays whole, including its nested lists and other blocks.
  Lists may continue between items. Ordered lists retain the correct continuation
  start number instead of restarting at one.
- Tables may split only between body rows. Headers repeat intentionally on table
  fragments and are identified as repeated source content in provenance.
- Consecutive headings stay with the following content unit as one candidate group.
  Headings are not copied onto continuation cards.
- Explicit `===` boundaries never move. A card cannot absorb content from the next
  explicit section, even when unused space remains.

A terminal heading chain without following content fails with
`PAGINATION_ORPHAN_HEADING`; add the intended content or use manual mode. A locked
section containing only reference definitions retains one intentional empty card
instead of disappearing. Definitions still resolve across all sections.

Provenance offsets are half-open UTF-16 code-unit ranges, with 1-based inclusive
line ranges. Each atom and source-accounting segment includes its original-input
range as well as its normalized range. Leading BOM and CR/CRLF normalization match
manual parsing; the input file is never edited, both input hashes are retained,
and compact normalization counts avoid per-character manifest expansion.

The paginator greedily tries each next group with the current card, probing both
screen and print geometry. A group that overflows moves once to a new card; if it
still overflows there, pagination stops with `PAGINATION_ATOMIC_OVERFLOW` (exit 2)
and source information. There is no character-count fit estimate, hidden font
scaling, clipping, internal model call or automatic rewrite. The result is a
bounded greedy layout, not a globally optimized or editorially rewritten deck.
The optional `--balance-tail` pass below can adjust only each section's final pair.

Candidates reserve `200/200` footer numbering while the total is unknown. Once
pagination finishes, the full deck is built with exact final numbering and must
pass screen AND print overflow checks again before export. Image decoding, asset
checks, PDF validation and output staging still apply. A successful candidate
probe alone never authorizes publishing an unvalidated final deck.

Pagination limits are 2,000 semantic atoms, 4,000 candidate probes, 200 explicit
sections/output cards, and 10,000 reference definitions or source-accounting
segments. These caps reject excess input explicitly; nothing is truncated.
One candidate probe includes screen and print measurements; final full-deck
validation is separate. Existing input, asset, pixel, artifact and total-deadline
budgets also apply, so 200 cards is a ceiling rather than a guaranteed capacity.
Exhausting a pagination limit fails with `PAGINATION_BUDGET` (exit 1); a mismatch in
source coverage or ordering fails with `PAGINATION_COVERAGE` (exit 1). No partial
successful deck is published. See the failure contract for diagnostics.


### Optional sparse-tail balancing (M8 / VIS-06)

Add `--balance-tail` alongside `--paginate auto` to reconsider only the final two
cards of each explicit section. The boolean is absent/off by default; using it
with manual mode fails with `INVALID_OPTIONS`, rather than ignoring the request.
Auto still supports only `explainer` / `steps` and layout-only card metadata.
Templates and intentionally composed manual cards are not balancing targets.

All greedy packing finishes first. A pair is eligible only when, in both screen
and print, the last card occupies at most 35% of its available content height and
the preceding card is at least 25 percentage points fuller. Occupancy is the
browser's measured descendant bottom extent relative to the content origin, not
character count, guessed line count, or scrollHeight (which includes the stretched
container's unused space). Internal gaps and repeated table headers count.

The pass considers at most eight suffix boundaries, moving one or more **original
whole groups** from the penultimate card to the start of the last card. Both stay
nonempty; earlier cards and card counts are unchanged. Paragraphs, heading groups,
list items with nested content, code, images, and quotes are never cut. Table rows
use the existing semantic row boundaries and traced repeated headers. Order,
numbered-list starts, explicit `===` partitions and exact-once atom coverage stay
unchanged. The pass never merges explicit sections or tries to fill all whitespace.

Every candidate pair requires two probes, one per card, each containing screen
AND print measurements. Acceptance requires both cards to fit in both media, the
last card's utilization to increase in both, and each media's absolute utilization
gap to improve by at least five percentage points. Among viable candidates it
chooses the smallest worst-media gap, with the first candidate winning ties.
Search stops on exact balance, exhausted boundaries, or its finite limits.

There are at most 64 additional probes across the deck and eight candidate pairs
per section, all charged inside the unchanged 4,000-probe global ceiling. Required
greedy work cannot be starved by this optional pass. If fewer than two probes
remain, the pass stops for that pair; already measured improvements may be retained.
It never raises card, image, pixel, artifact, or deadline budgets. Browser errors,
invalid overflow responses, budget-guard exceptions and deadline failures still
fail closed; they are not swallowed as cosmetic fallbacks.

Missing occupied geometry, nonfinite/negative/invalid dimensions, or inconsistent
canvas geometry on a fitting candidate preserve the whole original greedy pair,
even if an earlier candidate looked viable. Overflowing candidates are rejected
without scoring geometry; exceeding available height is expected on an overflow. Values exceeding available height by more than
the existing one-pixel overflow tolerance are invalid. No-improvement and
ineligible pairs also stay greedy. This is bounded sparse-tail adjustment, not
global optimization and not a promise that every short last page can improve.

The manifest keeps total `pagination.probes`, `greedyProbes`, and
`pagination.balance`: enabled state, algorithm, outcome, attempts, balancing probes,
applied partition count, limits, policy, and per-partition fallback/termination,
measured before/after utilization and candidate outcomes. Requested-but-unapplied
balancing is not reported as a successful improvement. The ordinary algorithm is
`greedy-semantic-browser-v1`; opt-in uses `greedy-semantic-browser-tail-v1` with
`bounded-tail-groups-v1` as the optional pass. Final exact-count screen/print,
coverage, assets, image decoding, PDF and output-staging checks remain mandatory.

Source-only tests and the scoped real-browser acceptance evidence are documented in
[TAIL_BALANCING.md](../docs/TAIL_BALANCING.md). No mock measurement demonstrates
actual typography, line wrapping, pixel quality or searchable PDF correctness.


## Trusted local assets

`--asset-root` defaults to the input file's directory. All image and logo references
are relative to that root, including logo references in a separately located brand
JSON. Paths are decoded, canonicalized and checked with realpath. Only regular
files contained within the real root are accepted. Symlinks may point within the
root, never outside it. There is no remote image download or URL fallback.

Only PNG, JPEG, and static WebP are supported. Extension, magic/MIME, structural
integrity, bytes and dimensions are checked before embedding. Chromium must also
successfully decode every embedded image. PNG IDAT is additionally inflated with a
64 MiB output cap and validated for exact scanline lengths and filter bytes,
including Adam7 interlace, because browser decoders may tolerate corrupt data.
PNG/WebP animation, SVG/GIF, absolute
paths, protocol-relative URLs, any URI scheme including data/file/http, path
traversal and escaped symlinks fail closed.

Limits: 8 MiB per asset; 32 MiB unique assets; 20 million pixels per image; maximum
8192 pixels per side; 64 MiB cumulative embedded data URLs; 100 million cumulative
decoded image pixels. Cache hits still count toward embedding budgets. Repeated
brand logos are included in the document-level budget. Final HTML is capped at
64 MiB. Use smaller images or split the deck rather than bypassing checks.

Brand JSON is at most 16 KiB and accepts only `name` (up to 100 characters),
`accent` (#RGB or #RRGGBB), and `logo` (local asset reference). Brand colors do not
automatically guarantee contrast; inspect the actual selected theme.

## CLI and output

```bash
node scripts/render.mjs examples/layouts.md --out output/layouts-v1 \
  --theme editorial --format all --preview --contact-sheet --strict
```

The canonical document uses fixed card dimensions. `--preview` adds responsive,
script-free `preview.html` without changing the canvas or export measurements.
`--contact-sheet` adds a four-column PNG with 270 CSS-pixel thumbnails. It is a
review aid, not a replacement for individual images or mobile-size readability QA.

`--format` accepts all, html, png, pdf, or combinations. Presets: portrait
1080×1440, square 1080×1080, slide 1600×900. Custom width/height: integers 200–4096.
`--scale` 0.5–3 affects PNG pixels only. Contents must be prepared for their ratio.
`--paginate` accepts `manual` (default) or `auto`; neither mode shrinks or rewrites
text. Auto mode can add cards only at the supported semantic boundaries above.

All formats require Chromium and mandatory screen AND print overflow checks.
The browser disables page JavaScript, blocks network requests and service workers,
and uses a restrictive CSP. Validated raster data URLs are the only image source.
The PDF is native browser printing, not a raster image assembly.

Successful output contains requested cards.html, card-NNN.png, cards.pdf, optional
preview.html/contact-sheet.png, and manifest.json. The manifest includes:

- Input, styles, local assets, card sources and output SHA-256 hashes.
- Node/package/Chromium/Poppler versions; CSS dimensions and PNG scale.
- Original source line ranges, selected layouts, screen/print measurements.
- Pagination mode, bounded probe usage and structured semantic/source provenance
  for automatic output, including explicit-section origin, coverage and intentional
  repeated table headers. A generated card may cover only part of a source section;
  the provenance record is the authority, not a guessed line range from its index.
- Explicit font, image decode and PDF QA, budgets, and `visualReview: not-performed`.

PDF QA checks exact page count and nonempty searchable text when content contains
text. CI additionally checks known English/Chinese snippets. Missing Poppler is a
warning normally and a failure with `--strict`; it is never silently recorded as
passed. Page count/text extraction does not prove semantic correctness or complete
glyph fidelity.

## Failure and resource contracts

Output directory must be absent or empty. Exports stage in a sibling directory and
publish only after validation and successful browser cleanup. Existing files are
never overwritten. Manual or final-deck geometry overflow uses `CONTENT_OVERFLOW`
(exit 2) with an `overflow.json` diagnostic and original card/source ranges.
Automatic pagination uses `PAGINATION_ATOMIC_OVERFLOW` (exit 2) when an indivisible
group cannot fit an empty card; its error details identify the affected source.
Neither path publishes clipped exports. Other failures exit 1 and do not publish
incomplete exports.

For atomic overflow, first inspect the cited unit. Choose a larger suitable canvas,
use manual layout, or explicitly edit the source. Adding a boundary around an
already oversized atomic block cannot make the block itself smaller. The renderer
never changes its wording or drops metadata to recover. Unsupported layout and
metadata errors are resolved by using manual mode or an intentional source change,
not by silently downgrading the layout.

Use `--json` for structured stdout success / stderr error objects. Errors contain
status, code, message, details and exitCode, not a stack or embedded source text.
Useful codes include INVALID_OPTIONS, INVALID_MARKDOWN, INVALID_METADATA,
INVALID_ASSET, OUTPUT_EXISTS, PREFLIGHT_FAILED, BROWSER_LAUNCH_FAILED,
CONTENT_OVERFLOW, RENDER_BUDGET, RENDER_TIMEOUT, IMAGE_DECODE_FAILED,
PDF_TOOLS_MISSING, PDF_PAGE_COUNT_MISMATCH and PDF_TEXT_MISSING. Phase 3 adds
PAGINATION_UNSUPPORTED_LAYOUT, PAGINATION_UNSUPPORTED_METADATA,
PAGINATION_ATOMIC_OVERFLOW, PAGINATION_BUDGET, PAGINATION_COVERAGE,
PAGINATION_ORPHAN_HEADING, PAGINATION_STRUCTURE and PAGINATION_MEASUREMENT.
Unsupported input, budget, coverage and invalid measurement
failures exit 1; they never permit discarding content or skipping browser checks.

Budgets: maximum 200 cards, 40 million PNG pixels/card, 200 million aggregate card
pixels including contact-sheet pixels (PNG scale counted for PNG exports),
40 million contact-sheet pixels and 32767 pixels per contact-sheet side,
256 MiB generated artifacts, and a
120-second render deadline. `--timeout-ms` accepts 1000–600000. Chromium receives
bounded operation timeouts and is closed on the total deadline. File/system-tool
operations are separately bounded where supported; this is not an OS-level memory
sandbox. Do not render untrusted files outside the explicit asset boundary.

## Tests and reproducible showcases

`npm test` includes unit and browser integration tests. In unsupported sandboxes,
`MD2CARD_SKIP_BROWSER=1 npm test` explicitly skips browser tests; this is not an
export-validation pass. CI sets MD2CARD_REQUIRE_BROWSER=1 and
MD2CARD_REQUIRE_PDF_CHECK=1, so missing browser/PDF tools fail.

`node scripts/validate-showcases.mjs` renders eight layouts in five themes and
three original series under validation/. It verifies artifact hashes and strict
PDF checks. See docs/SHOWCASES.md for the README image provenance. Those historical
v2 renders do not demonstrate automatic pagination.

Phase 3 verification must independently cover manual-mode regression, semantic
coverage and ordering, locked boundaries, heading groups, nested list items,
ordered-list continuation, table-header provenance, unsupported metadata/layouts,
atomic overflow, screen/print differences, budgets, cleanup and final-deck checks.
Record real-browser exports and the scope of visual review separately for the
exact code being checked; current evidence is linked in the development plan.
`node scripts/validate-pagination.mjs` exercises four automatic decks and an
expected atomic-overflow failure. A denied local Chromium launch is a blocked
check, not a reason to bypass sandbox restrictions or report browser tests as
passing.

## Composed template contract (48 designs, opt-in)

`--list-templates` prints repository-owned contracts; `--template T01` selects one
for a whole manually paginated deck. Alternatively, first-line metadata accepts
`template` and optional `density` (`compact`, `standard`, `editorial`). A template
implies its semantic layout. Explicit conflicting layouts or CLI/per-card IDs
fail instead of silently reinterpreting content. IDs are allowlisted and never
used as a filesystem path, CSS or HTML input. Templates remain independent of
legacy themes; changing a palette does not create another counted design.

All 48 designs support 3:4 and manual pagination. Only T04/T21 additionally
support the independently composed square/slide layouts described below. Automatic mode
still rejects template/density metadata and supports layout-only explainer/steps.
Text-only designs reject image metadata and inline images rather than hide them.
Raw HTML escaping, local asset validation, all output/resource budgets, screen
and print overflow checks and native searchable PDF verification remain in force.

Template title/intro/section slots are derived from the safe Markdown tokens. A
leading group of H1 headings becomes one visual title group; no wording, section,
quote, list, source or explicit `===` boundary is rewritten. A later H1 remains in
its original section. Density alters gaps only, not font sizes. The mobile base is
0.043 × canvas width and notes are 0.0335 × canvas width, giving 15.09px / 11.76px
at the 351px inner card width of the 375px preview. Actual nested text is measured
in real Chromium, not inferred only from these tokens. Real pixels still require
independent pixel review: typography checks do not prove composition quality or glyph safety.

M3 adds opt-in T21 metric/label rendering. Both are required nonempty strings
for this design and are escaped as text; missing fields fail with
`TEMPLATE_METADATA_REQUIRED`. Other templates reject unsupported metric/label
fields instead of discarding them. Legacy statistic behavior is unchanged.
Implemented candidates without real artifact review remain unaccepted.

M4 image contracts distinguish text-only, required metadata images, and inline
image records. Required images fail if absent; inline-only templates reject
metadata image/caption fields they cannot display. T38 needs exactly two H2
records with one inline image each. All assets still use the same local resolver
and budgets. Image frames preserve full content with object-fit: contain; no
crop is implied by the template. Image provenance accompanies source assets.

M7 validates strict paired records from parser-token shape. T43/T47/T48 require
standalone, unlinked image paragraphs and explanations in their declared H2
records; mixed text/image paragraphs fail rather than being split. T44 requires
two sibling quote blocks in each of its first two comparison sections; nested
quotes do not count as options. T39/T40 figure ordering is repository-owned and
cannot be set by input metadata. Every supplied source fragment remains intact.

## Independent aspect layouts (M9, scoped acceptance)

Only T04 and T21 currently implement independent square (1:1) and slide (16:9)
compositions in addition to portrait. The four registered standard-density short
examples have actual full PNG, 375/390 phone and native-PDF visual acceptance;
this does not extend to arbitrary content or dimensions. Other templates still
reject those ratios. Use --size or
matching custom dimensions; public aspect metadata is not supported. The existing
0.002 ratio tolerance is unchanged. The registry exposes per-aspect composition,
example and status, while manifests record the actual derived aspect. Mobile
body/source floors, manual defaults, auto rejection and overflow checks remain
unchanged. A portrait source may legitimately overflow in square/slide. See
[the aspect contract and exact validation evidence](../docs/TEMPLATE_ASPECTS.md).
