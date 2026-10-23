# Code review and targeted regression record

This review combines source inspection, minimal reproductions, deterministic
failure injection, unit tests, and real-browser/PDF exports. Passing CI alone is
not evidence that all bugs are absent. Each finding below resulted in a concrete
behavior change and a focused regression, rather than only a wider happy-path run.

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
- No automatic pagination or rewriting is implemented. Measured semantic
  pagination remains a separately scoped later-stage candidate.

## Accepted evidence

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

