# Real showcase provenance

README screenshots must be copied from successful real renderer exports, not
hand-drawn mockups. The original illustration PNGs in examples/assets are produced
by `node scripts/make-example-assets.mjs` using deterministic local raster drawing;
no external pictures, fonts, customers, or private data are involved.

Reproduce all showcase outputs:

```bash
npm ci
npx playwright install chromium
node scripts/render.mjs --doctor --strict
node scripts/validate-showcases.mjs
```

Linux strict verification also requires local CJK fonts, Fontconfig and Poppler.
CI installs fonts-noto-cjk and poppler-utils. Outputs are uploaded in artifact
`validated-cards-<commit SHA>` with a summary and per-deck manifest.

| README file | Actual generated source | Editable input |
| --- | --- | --- |
| docs/images/layouts-contact-sheet.png | validation/layouts/contact-sheet.png | examples/layouts.md |
| docs/images/showcase-ai.png | validation/showcase-ai/contact-sheet.png | examples/showcase-ai.md |
| docs/images/showcase-tutorial.png | validation/showcase-tutorial/contact-sheet.png | examples/showcase-tutorial.md |
| docs/images/showcase-enterprise.png | validation/showcase-enterprise/contact-sheet.png | examples/showcase-enterprise.md |

`validation/themes/` contains minimal, midnight, notebook and bold versions of all
eight layouts; editorial is `validation/layouts/`. Every showcase directory also
contains full-resolution individual PNGs, searchable PDF, standalone HTML,
responsive preview HTML, and the hash/QA manifest. View individual PNGs before
accepting text size or glyph fidelity; thumbnail contact sheets alone are not
sufficient visual QA. Actual visual inspection is separate from manifest's
`visualReview: not-performed` automated status.

The enterprise example is explicitly fictional. Its number “3” describes three
illustrative service stages, not real revenue, customers, conversion, or efficacy.
No sample quote is attributed to an invented external person or study.

The four README PNGs are copied byte-for-byte from the verified artifact below.
Do not substitute generated source HTML or static sketches for real screenshots.

## Verified source and acceptance

- Renderer source commit: [`7df842dca5ff5bba237a9e5118e7e30b7af954c1`](https://github.com/Activer007/md2card-skill/commit/7df842dca5ff5bba237a9e5118e7e30b7af954c1). This is the code commit that generated the images, not the later documentation-only commit.
- Successful exact-commit workflow: [run 39964850729](https://github.com/Activer007/md2card-skill/actions/runs/39964850729); 93 tests passed with no failures or skips, plus 10 offline decks / 56 cards.
- [Artifact 12506646582](https://github.com/Activer007/md2card-skill/actions/runs/39964850729/artifacts/12506646582): `validated-cards-7df842dca5ff5bba237a9e5118e7e30b7af954c1`. Artifact ZIP SHA-256: `275a5b6628d0983e5b172a15c077c2c4f73e10239736ebd3519a2c1d6079d4e2`. Artifacts have finite retention; the committed PNGs and editable inputs remain reproducible.
- The four fresh contact sheets were visually accepted on 2026-10-23 at 13:55:56 UTC after correcting the excess viewport footer. Prior visual inspection covered all five theme contact sheets, the three example series, and representative full-resolution cards. This is not a claim of exhaustive glyph-by-glyph or pixel-by-pixel review.
- The README image files are unchanged copies of the following generated files. No cropping, retouching, or synthetic replacement was applied after export.

| Committed file | Source within the artifact | SHA-256 |
| --- | --- | --- |
| `docs/images/layouts-contact-sheet.png` | `layouts/contact-sheet.png` | `6e5c0db4cbf918190b2fd92775828f6df4ae124d249ea899e9a4d8e02f03105c` |
| `docs/images/showcase-ai.png` | `showcase-ai/contact-sheet.png` | `cac66d734762cb1f22201b4503631c814b8b7cab9d62919839856fc023666035` |
| `docs/images/showcase-tutorial.png` | `showcase-tutorial/contact-sheet.png` | `3346d1f37d5fa80722f27fa58c8e23e5a41ac9f5160714fcef213002aee75d0d` |
| `docs/images/showcase-enterprise.png` | `showcase-enterprise/contact-sheet.png` | `f8f150a4319efacf2dda748302acaf192c38bcb3fd031eb565c6b9fea4047a38` |

To reproduce this recorded source exactly, check out the source commit above, then run the commands at the top of this document. The current branch may contain later documentation-only changes.


## Phase 3 automatic pagination

The two additional README contact sheets are separate from the historical v2
images above. They are byte-for-byte real exports, with no crop, retouching or
synthetic replacement.

- Code source: [`c3ed7803a14d17628a68e324869a3d2a399f638c`](https://github.com/Activer007/md2card-skill/commit/c3ed7803a14d17628a68e324869a3d2a399f638c).
- Successful [run 39990564928](https://github.com/Activer007/md2card-skill/actions/runs/39990564928): 148 tests passed, zero failures or skips, strict environment/PDF verification, and all legacy showcases. The tested PR merge-preview commit is `58f712c2046e1f7af35a89a8e1f9deff7b056d0d`; its complete tree equals the source commit's tree `9350a9dffda064c852369faecd1b18b0864a8408`.
- [Artifact 12517956073](https://github.com/Activer007/md2card-skill/actions/runs/39990564928/artifacts/12517956073): `validated-cards-58f712c2046e1f7af35a89a8e1f9deff7b056d0d`. ZIP SHA-256: `d07127cf83144666c986d453891ece4b3c836fb8df3ffdb30f3d3c250fcba4ce`. The artifact has finite retention; the committed images and source examples remain available.
- Four automatic decks at 1080×900: paragraphs 5 cards (editorial), lists 7 (midnight), tables 6 (minimal), references 6 (notebook), totaling 24. Each includes HTML, PNG, searchable PDF, mobile preview, contact sheet and manifest. Exact page counts may differ under other fonts or environments.
- `pagination/summary.json` records the counts and checks. The oversized code example in `examples/pagination-atomic-error.md` returns expected `PAGINATION_ATOMIC_OVERFLOW`, exit 2, source lines 6–67, and no published output; see `pagination/atomic-error.json`.
- Visual review on 2026-10-23 covered all four contact sheets (24 thumbnail cards), plus full-size `lists/card-002.png`, `tables/card-002.png`, `paragraphs/card-002.png` and `references/card-004.png`. Numbering, repeated headers and explicit source partitions were intact; no clipping or missing glyphs were observed in this scope. This is not exhaustive full-size inspection of every glyph on every card. Automated manifests continue to mark visual review as not performed; this separate human record does not rewrite them.

| Committed file | Source within the artifact | Editable input | SHA-256 |
| --- | --- | --- | --- |
| `docs/images/pagination-lists.png` | `pagination/lists/contact-sheet.png` | `examples/pagination-lists.md` | `5d0e1e5caf915e0131a101ac870be13a7c066ff2fe23280355e5583bb0da0023` |
| `docs/images/pagination-tables.png` | `pagination/tables/contact-sheet.png` | `examples/pagination-tables.md` | `ebc9ea8219bec9664a167e8c1578cde1fb08fa73e6a66296b91249607f7a4774` |

To reproduce the full phase 3 acceptance output, check out the source commit
above, install the same locked dependencies, Chromium, local CJK fonts and
Poppler, then run in a fresh output location:

```bash
npm ci
npx playwright install chromium
node scripts/render.mjs --doctor --strict
node scripts/validate-showcases.mjs
node scripts/validate-pagination.mjs
```

The pagination command writes `validation/pagination/` and refuses existing
nonempty output directories. To reproduce only the README's two series:

```bash
node scripts/render.mjs examples/pagination-lists.md \
  --out output/pagination-lists-v1 --paginate auto --theme midnight \
  --width 1080 --height 900 --format all --strict --preview --contact-sheet
node scripts/render.mjs examples/pagination-tables.md \
  --out output/pagination-tables-v1 --paginate auto --theme minimal \
  --width 1080 --height 900 --format all --strict --preview --contact-sheet
```

The later documentation/image commit does not become the images' source commit.
Phase 3 remains opt-in, limited to explainer/steps with layout-only metadata;
manual is the default. Neither mode edits content or automatically shrinks text.
