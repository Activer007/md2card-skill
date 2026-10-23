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

The README files are populated from the verified CI artifact during release review.
Do not substitute generated source HTML or static sketches for missing screenshots.
