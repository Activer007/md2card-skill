# M3 implementation review and evidence

Base: merged PR #29, main `07ff4808dfd8fed73422d240dac5336ad1733566`. M3 was initially delivered as a separate Draft PR. The subsequent user-authorized review, fixes and merge are recorded in [PR30_REVIEW.md](PR30_REVIEW.md); the original evidence archive remains immutable.

Reviewed the final diff against the existing safety and artifact lifecycle. Only the opt-in branch collects geometry and writes diagnostics; render CSS, content parsing, template layouts, tail-balance occupied geometry, overflow checks, image trust boundary and original budgets remain unchanged. The new semantic dependency is pinned in evidence-source; a separate immutable compatibility proof covers only audit-disabled behavior. Historical proofs and gallery artifacts were not rewritten.

Findings resolved during implementation:

1. Metric text could be mistaken for the first body paragraph (T21), creating a misleading gap warning. It now has a distinct metric role and an explicit intervening-metric exception.
2. T38's intentional photographic spacing was treated as excessive title/body distance. Large photographic spacing is now an explicit exception; the raw measurements remain visible.
3. The collection budget test initially placed excess text outside the visible card, so clipping correctly omitted it before reaching the rectangle limit. The test now places all test text inside the card; it also exercises a shared ceiling across 200 cards.
4. The first T20 tall-phone run used legacy footer settings and hit the existing CONTENT_OVERFLOW gate. Final evidence uses the same poster settings as M2's established fixture. The first failure log and overflow report are retained; no input was rewritten and no safety threshold was weakened.
5. Threshold values now come from the same immutable versioned rule definitions emitted in the report, avoiding divergence between explanations and execution. Legacy/custom aspect labels derive from actual dimensions.

Validation on frozen runtime sources:

- Full unit suite: 623 tests, 621 passed, zero failed, two environment-conditional browser skips. The opt-in browser suite was separately forced: 13/13 passed, no skips.
- Existing export/pagination integration suite with required Chromium, Fontconfig and Poppler: 21/21 passed, no skips.
- Default compatibility: 108 independently generated HTML comparisons (96 older cases, 8 T20 stage cases, 4 photo-cover cases). Separate compatibility/tamper suite 3/3 passed; gallery check 48/48 remains unchanged.
- Real output matrix: 12 paths, 10 successful decks / 20 cards and two expected CONTENT_OVERFLOW refusals. Four existing series are included in full (5/3/3/3 cards).
- Screen and print JSON are checked against separately read title/source/footer Range boxes; the real-browser unit additionally verifies contain-painted width against the known 45 px result, full-bleed background exclusion and true footer overlap. Rule outcomes on the stored final JSON are independently asserted for both media.
- Eight representative default-disabled decks are compared against the verified main snapshot. HTML, preview HTML, PNG and native PDF page rasters match; stable manifest fields match after excluding timestamps, PDF byte identity and elapsed/output-byte counters. Enabled outputs retain those same rendered pixels.
- Default-disabled paths do not call the collector or produce a diagnostic artifact. Enabled paths count/hash the report within the existing output budget; deadline failure cleans staging and print-only hard overflow publishes only overflow.json.

The machine report is advisory. No aggregate pass score or automatic visual acceptance is introduced. Known and unresolved perceptual limitations are documented in M3_VISUAL_DIAGNOSTICS.md, including raster-internal whitespace/text, Range-vs-ink differences, intentional repetition and required human inspection of overlays. The implementation review inspected the small/wide screenshots, photo overlay, long title, short declaration, sparse report and T05 whitespace example; that inspection does not grant a human sign-off or change historical gallery acceptance.

Complete evidence: `docs/evidence/m3-visual-diagnostics.tar.xz`; extract it and open `index.html`. The archive includes all 10 successful decks with full visual-diagnostics.json, screen/print PNGs, original PDF and manifest, the two refusal reports, independent coordinate checks, inputs, frozen source snapshots and all final/iteration logs. `docs/visual-upgrade/m3-evidence.json` pins its SHA-256 and file count. Historical M2 evidence is referenced by the verified main base rather than copied into this archive.
