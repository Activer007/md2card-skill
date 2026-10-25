# PR #29 review follow-up

Reviewed the opt-in T37 crop permission contract, renderer, overflow gates, source retention and validation evidence against main `38bd0dbd44c8b85e3875fa70280f6d63167ed1c0`.

Fixed two validation defects: the geometry gate now rejects object-position differing from the author's focal coordinates and a missing/wrong local contrast backing; reinspection waits for image decoding before screen/print/mobile captures. The regression test also uses fileURLToPath so checkout paths containing spaces work.

The targeted suite passed 8/8. A fresh real Chromium run completed all 20 paths: 12 exports with screen/print/mobile and native PDF checks, and eight expected refusals including CONTENT_OVERFLOW. The original default HTML, exported PNG and rasterized native PDF still match pre-feature main exactly. No rendering source or resource limit changed in this follow-up.

`docs/evidence/pr29-review.tar.xz` contains the full fresh report, logs, RGB pixel comparison and two corrected captures. Of 80 compared PNG files, 78 match the original evidence exactly. The two reinspection captures for blocked-portrait-default differ by 234419 pixels, maximum channel delta 28; after decode waiting, they now match the actual exported card PNG exactly. This was a capture readiness defect, not a new layout or crop. The original evidence archive remains immutable.

Subject safety remains author-declared. These checks do not detect faces, image semantics or perceptual contrast, and do not promote human visual review to accepted. Existing default brand-accent contrast limitations remain documented in the M2b delivery.

Final full unit run: 610 tests, 609 passed, zero failed, one environment-conditional browser test skipped. Real Chromium validation above was explicitly required and completed. Gallery check: 48/48. Full unit log is included in the supplemental archive.
