# Optional sparse-tail balancing: source candidate

Status: implemented source candidate for M8 / VIS-06. Real Chromium rendering,
PNG/PDF artifacts and independent visual acceptance are **pending**. The local browser
launch was previously denied by the sandbox; this work never retries, bypasses,
or changes that restriction. Execution in Actions requires a separate applicable authorization; publishing this draft does not authorize a merge.

## Design and scope

`--balance-tail` is an explicit boolean rather than a new pagination mode. This
keeps `--paginate manual` and default greedy `auto` behavior stable, distinguishes
subdivision permission from optional cosmetic redistribution, and rejects the
meaningless manual combination. Direct API callers use `balanceTail: true`.

Implementation lives in `scripts/tail-balance.mjs`; semantic parsing/rendering and
coverage witnesses are unchanged. The paginator retains original page-group
membership and accepted measurements during greedy packing. Only after the full
greedy deck exists does it revisit each explicit partition's last two pages.
No source token, atom, group or list/table container is modified. Moving a suffix
of existing groups preserves order and heading chains by construction. Re-rendering
through `renderSemanticCard` retains numbered starts and repeated-header provenance.

The DOM measurement adds `occupied.height` while preserving all existing overflow
checks and `used`/`available` data. Measuring descendant bottom extent, including
the intrinsic `.card-body` box, avoids the false 100% utilization that results
from a flex-stretched container's scrollHeight. This is layout occupancy, not ink
coverage or an aesthetic judgment. It includes intervening gaps and table headers.

The algorithm only targets a tail at most 35% full with a predecessor at least
25 percentage points fuller, in both media. It demands five percentage points of
gap improvement in both, plus increased tail occupancy and zero overflow on both
candidate pages. It minimizes the worst of the two media gaps. This conservative
scope is deliberate: manual layouts, single-card sections, ordinary short endings,
and intentionally locked whitespace remain unchanged.

The first eight movable boundaries are considered in nearest-boundary order.
At most 64 balancing probes draw from the existing 4,000-probe pool, never from a
new allowance. Two probes are reserved before beginning a candidate; each probe
measures both media. All required greedy probes finish first. The original global
card, atom, asset, output-size, pixel and deadline budgets are unchanged, and final
full-deck validation still runs. Browser/measurement faults, resource-guard throws
and deadlines propagate instead of turning a failed safety check into success.

Missing or malformed occupancy information causes an explicit per-partition
fallback. Even a later otherwise-fitting malformed candidate invalidates prior
provisional choices for that pair. Overflowing candidates are rejected without
scoring occupancy, because excess occupied height is normal during overflow. A valid measured improvement may survive search-budget exhaustion;
no-improvement leaves the original pair untouched. Search limits, selected
candidate, provisional candidates, fallback and termination are all reported.

## Source-only verification

Run `npm run test:unit` or the dedicated source tests:

```sh
node --test tests/pagination.test.mjs tests/tail-balance.test.mjs tests/options.test.mjs
```

`tests/tail-balance.test.mjs` is authored independently against the behavior
contract. It exercises controllable geometry and faults without starting Chromium.
The full suite can be run in this restricted environment only with explicit browser
skipping (`MD2CARD_SKIP_BROWSER=1`, and no `MD2CARD_REQUIRE_BROWSER=1`). Skips are
not rendering evidence. Test totals and executed commands belong in the delivery
report, not a claim that the pending visual milestone is accepted.

## Executable real-browser gate and remaining acceptance

This plan is intentionally not an Actions enablement, workflow dispatch or merge.
It may run only after the owner authorizes a suitable browser-capable environment.
The existing read-only workflow gains one validation command, without changing permissions or enabling Actions. `npm run validate:tail` exports four greedy/opt-in pairs, collects all case failures, verifies HTML/preview/PDF source markers, locks partitions, checks ordered starts and repeated table headers, hashes artifacts, and records both-media balancing evidence. The 1080 × 650 paragraph geometry is an explicit uncalibrated assertion and will fail rather than silently count an unchanged tail as accepted.

1. Calibrate the executable paired baseline/opt-in gate using
   `examples/pagination-tail.md` and `pagination-tail-locked.md`. The current hypothesis is minimal theme,
   1080 × 650, scale 1, auto, no template, identical fonts/browser for both runs.
   These dimensions have **not** been browser-verified. Confirm the six paragraphs
   actually fit as five one-line groups and one on the tail, and fail or explicitly
   recalibrate the fixture if not. Never infer a pass from this proposed size.
2. Assert the baseline is `[5, 1]`, opt-in is `[3, 3]`, page count unchanged, and
   measured gaps improve under the declared threshold in screen and print. Check
   every marker exactly once in independent exported-DOM and extracted-PDF text,
   including source order, hashes, manifest atom ranges and exact numbering.
3. The runner also exports ordered-list and table fixtures, plus two explicit
   partitions and a three-page partition. It compares earlier-page PNG hashes to the
   greedy baseline and proves no cross-boundary moves. Add a dedicated real heading-chain case before final acceptance. Preserve list start values;
   verify repeated table headers independently in DOM/PDF and their provenance.
4. Exercise screen-fit/print-overflow candidates with a repository-owned test-only
   print style applied through a measurement adapter, never user CSS. Assert the
   optional candidate is rejected and final screen/print checks still run. Keep
   this specialized geometry test separate from ordinary exported artifacts.
5. Export and inspect an oversized paragraph, nested list item, quote, image, and
   code block. They must remain atomic; oversized fresh-page blocks must fail with
   `PAGINATION_ATOMIC_OVERFLOW`, not split or clip. Include intentionally sparse
   locked sections and valid nonimproving tails that stay identical to greedy.
6. Archive per-run commit SHA, command, font/browser/Poppler versions, input/style/
   artifact hashes, both manifests, all PNGs, PDFs, mobile preview and contact sheet.
   Require mandatory browser/PDF tooling in that approved CI run. Inspect every PNG
   and final PDF for clipping, source loss, heading/list semantics, CJK/Latin glyphs,
   footer collisions, repeated headers, and whether the less sparse ending actually
   improves the series. Source tests and CI success alone cannot accept the design.

Acceptance remains pending until these outputs exist and the independent pixel review is
recorded for the exact code and fixtures. This slice does not close M8's unrelated
image, table typography, density or title-review tasks, nor any M9 gallery task.
