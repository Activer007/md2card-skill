# Optional sparse-tail balancing

Updated 2026-10-24. `--balance-tail` is implemented and has real greedy/opt-in
export evidence, not only controllable-geometry tests. The
[third combined run](https://github.com/Activer007/md2card-skill/actions/runs/40058009275)
passes all four paired gates on tree
`2d0e7278196ee71cb0ab349c4ce8b10e9ca40f41`.
Paragraph, locked-partition and table outputs already have independent full-PNG
and native-PDF review from preceding runs.

The new 1100px-high list pair also passed independent full-PNG/native-PDF review.
Item 17 moves intact with its nested bullets: the last pages change from 3+1 to
2+2 items, with numbering 17/18 preserved. All four paired cases now have scoped
technical and visual evidence; see the [upgrade acceptance](TEMPLATE_UPGRADE_ACCEPTANCE.md).

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

## Observed paired results

The source text, fonts, dimensions and rendering options are identical within
each greedy/opt-in pair. All use width 1080, minimal theme, scale 1 and auto
pagination without template metadata.

| Fixture | Height | Actual result |
| --- | --- | --- |
| Six paragraphs | 650 | Two pages change from `[5, 1]` to `[3, 3]` complete groups |
| Locked partitions | 650 | Five pages change from `[5, 5, 1, 5, 1]` to `[5, 3, 3, 3, 3]`; both partitions stay separate |
| Original ordered list | 1100 | Five pages retained; one complete group moves from page 4 to page 5 |
| Original table | 900 | Six pages retained; two complete row groups move from page 5 to page 6 |

For paragraphs and each locked tail, both-media occupancy changes from
87.27% / 13.26% to 50.26% / 50.26%. For the table pair it changes from
88.09% / 25.92% to 57.00% / 57.00%. The newly measured list tail changes from
95.13% / 32.05% to 66.72% / 60.46%. These are measured layout extents including
gaps/headers, not ink coverage or a promise that every tail can be balanced.

The earlier 1200px list calibration produced four evenly filled three-item pages.
It correctly did not move anything because the policy did not apply; that no-op
was not accepted as proof of list redistribution. The 1100px case preserves the
same original input and thresholds rather than deleting items or relaxing the
35% sparsity policy.

The gate checks exact source markers/order in HTML, preview and extracted PDF;
source atoms/partitions, original numbering 7–18, complete table headers and
repeated-header provenance; unchanged page counts; and byte-identical earlier
PNGs outside each partition's final pair. Final screen and print overflow checks
and all resource/probe budgets still apply.

The tail suite creates previews but does not record a fresh 375/390px screenshot
matrix. Its visual claim is paired full-size PNG/native PDF inspection, not a new
mobile-type-scale acceptance. A dedicated real heading-chain/print-only-fault
visual matrix is not claimed; controllable fault/atomicity tests remain separate.

## Reproduce safely

Source-only tests:

```sh
node --test tests/pagination.test.mjs tests/tail-balance.test.mjs tests/options.test.mjs
npm run test:unit
```

In an authorized environment with Chromium, CJK fonts and Poppler:

```sh
npm run validate:tail
# Or use the optional behavior on your own supported source:
node scripts/render.mjs long-explainer.md --out output/balanced \
  --paginate auto --balance-tail --theme minimal --format all --preview
```

Use an empty/new output directory. `validate:tail` exports and compares all four
pairs, collects failures, verifies source and artifact hashes, and writes
`validation/tail/summary.json`. A technical pass retains its generated
`pending-independent-pixel-review` status until a separate inspection record
exists. Source tests use controlled geometry/faults and do not launch Chromium;
explicitly skipped browser tests are not rendering evidence.

The recorded local browser denial is not retried or bypassed. Real validation
comes from the separately authorized existing read-only CI environment. A
published branch or a successful run does not authorize a merge or deployment.

This feature does not change default greedy/manual behavior, support arbitrary
layouts in auto mode, or force sparse locked sections to fill. Content fidelity
and explicit boundaries take precedence over cosmetic improvement.
