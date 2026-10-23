# Rendering contract (v2)

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

UTF-8 Markdown, at most 2 MiB. Standalone `===` divides cards except inside fenced
or indented code. Blank boundary lines are removed without stripping meaningful
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

## Trusted local assets

`--asset-root` defaults to the input file's directory. All image and logo references
are relative to that root, including logo references in a separately located brand
JSON. Paths are decoded, canonicalized and checked with realpath. Only regular
files contained within the real root are accepted. Symlinks may point within the
root, never outside it. There is no remote image download or URL fallback.

Only PNG, JPEG, and static WebP are supported. Extension, magic/MIME, structural
integrity, bytes and dimensions are checked before embedding. Chromium must also
successfully decode every embedded image. PNG/WebP animation, SVG/GIF, absolute
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
`--scale` 0.5–3 affects PNG pixels only. Contents must be prepared for their ratio;
there is no automatic shrinking, rewriting or pagination.

All formats require Chromium and mandatory screen AND print overflow checks.
The browser disables page JavaScript, blocks network requests and service workers,
and uses a restrictive CSP. Validated raster data URLs are the only image source.
The PDF is native browser printing, not a raster image assembly.

Successful output contains requested cards.html, card-NNN.png, cards.pdf, optional
preview.html/contact-sheet.png, and manifest.json. Manifest schema v2 includes:

- Input, styles, local assets, card sources and output SHA-256 hashes.
- Node/package/Chromium/Poppler versions; CSS dimensions and PNG scale.
- Original source line ranges, selected layouts, screen/print measurements.
- Explicit font, image decode and PDF QA, budgets, and `visualReview: not-performed`.

PDF QA checks exact page count and nonempty searchable text when content contains
text. CI additionally checks known English/Chinese snippets. Missing Poppler is a
warning normally and a failure with `--strict`; it is never silently recorded as
passed. Page count/text extraction does not prove semantic correctness or complete
glyph fidelity.

## Failure and resource contracts

Output directory must be absent or empty. Exports stage in a sibling directory and
publish only after validation. Existing files are never overwritten. Overflow exits
2 and writes only overflow.json with original card/source ranges. Fix content or
explicitly split it. Other failures exit 1 and do not publish incomplete exports.

Use `--json` for structured stdout success / stderr error objects. Errors contain
status, code, message, details and exitCode, not a stack or embedded source text.
Useful codes include INVALID_OPTIONS, INVALID_MARKDOWN, INVALID_METADATA,
INVALID_ASSET, OUTPUT_EXISTS, PREFLIGHT_FAILED, BROWSER_LAUNCH_FAILED,
CONTENT_OVERFLOW, RENDER_BUDGET, RENDER_TIMEOUT, IMAGE_DECODE_FAILED,
PDF_TOOLS_MISSING, PDF_PAGE_COUNT_MISMATCH and PDF_TEXT_MISSING.

Budgets: maximum 200 cards, 40 million PNG pixels/card, 200 million aggregate card
pixels (PNG scale counted for PNG exports), 256 MiB generated artifacts, and a
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
PDF checks. See docs/SHOWCASES.md for the README image provenance.
