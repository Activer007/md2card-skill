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
