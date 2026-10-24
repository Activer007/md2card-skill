# Code review and targeted regression record

The historical v2 evidence and phase 3 acceptance are recorded separately below.
Phase 3 adds opt-in semantic pagination; historical passes are not evidence for
these new paths. Its own source review, real CI exports and scoped visual
inspection have now been completed.

This review combines source inspection, minimal reproductions, deterministic
failure injection, unit tests, and real-browser/PDF exports. Passing CI alone is
not evidence that all bugs are absent. Each finding below resulted in a concrete
behavior change and a focused regression, rather than only a wider happy-path run.

## Pre-merge source follow-up (2026-10-24)

A fresh audit of the exact PR head found and fixed two additional edge cases:

- Manual boundary trimming removed final newlines and blank lines from unclosed
  fenced code, including fences nested in lists and quotes. For example,
  `alpha\n~~~\ncode\n\n` lost both code newlines in manual mode while automatic
  mode preserved them. Trimming now uses parser-token content line counts to
  retain those boundaries. Closed-fence padding still trims normally; explicit
  partitions, metadata, indented code and source locations remain unchanged.
- The pinned Playwright PDF implementation has no PDF timeout option and uses an
  unbounded transport call. Passing `timeout` to a directly awaited PDF-to-path
  operation therefore did not enforce the render deadline. A stalled PDF plus
  stalled browser cleanup reproduced an export still pending with staging after
  its deadline. PDF generation now returns bytes through the shared deadline
  race; only the export owner writes them after buffer/header and output-budget
  checks. Late settlement cannot recreate staging or publish partial output.

Focused regressions compare terminal code against a separate Markdown parser,
cover backtick/tilde and closed/unclosed/nested fences, and inject late PDF
resolution/rejection, write failures, invalid buffers and exhausted output bytes.
An additional 5,625-case differential sweep produced 5,343 matching accepted
manual/automatic renderings and 282 expected empty-input/orphan-heading rejections,
with no remaining mismatch or unexpected error. The full local suite passed
138 tests and explicitly skipped 17 browser tests, with no failures. Local PDF
tool tests ran without Chromium. These are source/injected-test results, not new
real-browser export evidence; fresh exact-commit mandatory CI is required before
merging these fixes. The older 148-test CI evidence below predates them.

## Phase 3 source review (2026-10-23)

The opt-in path has completed independent core source review and 127 local unit
tests. A separate full local run passed 131 tests and explicitly skipped 17
browser tests, with no failures. The final input-record-limit/index-validation
delta also passed an independent focused recheck. The real Chromium/PDF
[CI run 39990564928](https://github.com/Activer007/md2card-skill/actions/runs/39990564928)
passed all 148 tests with zero failures or skips. It checked code commit
[`c3ed7803a14d17628a68e324869a3d2a399f638c`](https://github.com/Activer007/md2card-skill/commit/c3ed7803a14d17628a68e324869a3d2a399f638c)
through merge preview `58f712c2046e1f7af35a89a8e1f9deff7b056d0d`; both complete trees
are `9350a9dffda064c852369faecd1b18b0864a8408`. Fake measurements are not export QA.

The run retained 10 legacy decks / 56 cards and exported four new automatic decks:
paragraphs 5, lists 7, tables 6 and references 6 cards. All 24 new cards passed
screen/print checks, source coverage, artifact hashes and native searchable-PDF
validation. Oversized code returned the expected `PAGINATION_ATOMIC_OVERFLOW`
(exit 2) without publishing clipped or partial output.

Visual acceptance covered all four new contact sheets and full-size
`lists/card-002.png`, `tables/card-002.png`, `paragraphs/card-002.png` and
`references/card-004.png`. Numbering, headers and explicit partitions were intact;
no clipping or missing glyphs were observed in that scope. This is not exhaustive
full-size glyph-by-glyph inspection. See [SHOWCASES.md](SHOWCASES.md#phase-3-automatic-pagination)
for immutable image provenance and reproducible commands. At the recorded
`c3ed7803` acceptance snapshot, phase 3 was a draft and not merged. Later review
fixes, exact-head CI and current merge status are recorded separately in
[PR #2](https://github.com/Activer007/md2card-skill/pull/2).

The independent review compared 576 complete-partition combinations with the
manual renderer and 121 forced-fragment cases using a separate HTML parser.
It checked inline trees/links, nested items, ordered starts and repeated headers.
Two resource findings were fixed before publication:

- Dense per-character/newline source maps amplified small inputs into enormous
  manifests. Export compact normalization counts and exact atom/accounting ranges;
  count the serialized manifest in the output byte cap. A 100,000-newline fixture
  now has a compact manifest rather than per-newline objects.
- Fingerprinting a shared table header once per row multiplied embedded image
  work. Fingerprint each shared container once and each atom by its own tokens
  plus container identity; test a 1 MiB header shared across 500 rows.

Parse-time witnesses compare reconstructed semantic output with the full original
parser output, guard subsequent source/token/container mutation and reject
unexplained nonblank source. They do not claim glyph or visual correctness.

## Historical v2 findings

| Finding | Reproduction / evidence | Fix | Regression |
| --- | --- | --- | --- |
| Leading indented code became ordinary text | A card beginning with four spaces lost indentation through string trim | Trim blank boundary lines only, preserving meaningful spaces | Markdown tests cover leading code, trailing spaces and fenced/indented `===` |
| Reference definitions failed across cards | A reference on one card was defined on another | Collect shared safe definitions before rendering cards; preserve first definition | Cross-card links and images, unsafe references and code-contained definitions |
| Steps restarted user numbering | Markdown starting `4.` rendered decorative `01`, `02` | Use native list-item counter so HTML ol start is retained | Structural start-value check and real PDF `04` / `05` extraction |
| Image dimensions did not prove pixel integrity | Valid PNG header/chunk checksums with invalid IDAT passed complete/naturalWidth; the browser also tolerated decode() | Await native decode and independently validate bounded PNG inflation, exact scanline lengths and legal row filters, including Adam7 | Malformed PNG is rejected with IMAGE_DECODE_FAILED before acquiring a browser; genuine JPEG/WebP are decoded/exported in Chromium |
| Browser leaked at startup deadline boundary | Injected clock expired after renderer acquisition but before try/finally; close was never called | Establish ownership before every post-launch deadline check | Deterministic fake clock test verifies one close call without launching Chromium |
| Cleanup masked the primary error and leaked staging | Injected cards.html write failure plus close rejection replaced the write error and skipped rm | Independent cleanup attempts, preserve original error, remove staging even when close fails; close before successful publication | Injected write/render/context failures and cleanup-only failure assert original error and no partial output/staging |
| Contact sheets contained an empty viewport footer | Three/four-card exports used a 600px full-page capture for a 400px deck | Capture the deck element itself, retaining its deliberate padding | Actual PNG dimensions checked for 1, 3, 4 and 5 cards |
| Contact-sheet work escaped deck budgets | 200 cards at 200×4096 passed the card budget but implied a 1180×277500 sheet | Preflight exact sheet dimensions, cap side/pixels, include it in total budget | Pure unit reproduction rejects the extreme sheet before browser acquisition |
| Browser initialization and cleanup could wait forever | A pending newContext exceeded a 50 ms startup timeout with no close attempt; a primary failure plus pending browser.close left staging and never returned | Cover context/route/page startup and non-writing browser waits with the deadline; bound each close attempt and continue independent staging cleanup | Injected pending initialization, evaluation and close promises; late settlement/rejection; primary-error identity and no publication/staging |

## Safety checks reviewed

- Asset references are restricted to a realpath-contained local root; remote,
  file/data/absolute paths, traversal and escaped symlinks are rejected.
- Raster extension/MIME, structure, bytes, dimensions and cumulative embedding /
  decoded-pixel costs are checked. Repeated references and repeated logos count.
- Raw HTML is escaped. Metadata and brand configuration are allowlisted; no
  arbitrary CSS, scripts or external resource loading are introduced.
- Screen and print overflow remain mandatory. PDF page count and searchable text
  are independently checked; strict CI cannot silently skip browser/Poppler QA.
- Output is staged and existing user files are never overwritten. The export API's
  dependency seam exists for deterministic fault injection; the CLI always uses
  the real implementations and the same safety checks.

## Remaining limits

- Installed-font coverage does not prove actual glyph painting or semantic
  correctness. Real card images still need visual inspection.
- PNG compressed-pixel integrity is checked directly. JPEG/WebP use bounded
  structural validation plus Chromium decoding; no claim of a complete independent
  codec implementation is made. Browsers can be permissive about damaged inputs.
- Resource limits are practical guards, not an operating-system memory sandbox.
  Filesystem cleanup can itself be denied or fail; the original failure is
  preserved and cleanup failures are reported separately where possible.
- Browser cleanup has a separate grace period of at most five seconds (or the
  configured render timeout, if shorter). A cleanup timeout explicitly reports
  that Chromium shutdown could not be confirmed; it does not claim to force-kill
  the browser. Filesystem and external-command completion still depend on their
  own operating-system/tool behavior; the deadline is not an OS process sandbox.
- Automatic pagination was outside v2. Phase 3 adds the separately scoped
  `--paginate auto` path for explainer/steps with layout-only metadata. Manual
  remains the default; neither mode rewrites or silently shrinks content.

## Pre-merge v2 follow-up

A subsequent source audit fixed the pending browser-initialization/cleanup finding
listed above. Commit [`e1de0a0`](https://github.com/Activer007/md2card-skill/commit/e1de0a0047c2783d19a81a8aeac4b5d0c1b45a4f)
passed [100/100 real CI tests](https://github.com/Activer007/md2card-skill/actions/runs/39986489000)
with zero skips, plus 14 independently rerun lifecycle tests. PR #1 was normally
merged as `39c875ff94403045282af6cf22dd3f01e8801977`, with an identical complete tree.
The separate [post-merge run](https://github.com/Activer007/md2card-skill/actions/runs/39987907582)
was cancelled during environment package installation before tests. Available
logs do not establish whether cancellation was a timeout or a manual action;
it is not recorded as a passing run or as a code-test failure.

## Historical v2 accepted evidence

Independent source re-review approved the fixes in code commit
[`7df842dca5ff5bba237a9e5118e7e30b7af954c1`](https://github.com/Activer007/md2card-skill/commit/7df842dca5ff5bba237a9e5118e7e30b7af954c1)
with no additional blocker identified in the reviewed paths. The focused review
ran 30 targeted tests successfully. The complete exact-commit
[CI run](https://github.com/Activer007/md2card-skill/actions/runs/39964850729) passed 93 tests with zero failures or skips,
including real Chromium/PDF regressions; 10 offline decks / 56 cards were rendered.
The [PR merge-preview run](https://github.com/Activer007/md2card-skill/actions/runs/39964856912) also passed.

Visual acceptance is recorded separately in [SHOWCASES.md](SHOWCASES.md) and
[DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md). Source review, focused failure injection,
full CI and visual inspection provide complementary evidence, not a proof that
all bugs are absent. Later edits require their own checks. The PR records the
final documentation/image commit and its separate CI status.

