# Renderer reference

The deterministic renderer takes already-paginated Markdown. It does not call an AI
API, rewrite text, infer card boundaries, or shrink content to hide a fit problem.

## Setup

From this skill folder, use Node.js 20 or newer:

```bash
npm ci
npx playwright install chromium
```

Package installation and the initial browser download need network access. Once
installed, rendering does not fetch external resources. On a machine that already
has Chromium, use `--browser /absolute/path/to/chromium` or `CHROMIUM_PATH`.
On Linux, Chromium may also need OS libraries; install those through the normal,
authorized environment setup. Do not weaken a sandbox to make rendering work.

Install a local CJK font if the environment cannot render Chinese. The repository
uses system font stacks and bundles no fonts. Font substitutions may change line
breaks; repeat visual review on the actual export machine.

## Input contract

- UTF-8 Markdown, maximum 2 MiB and 200 cards per deck.
- A standalone `===` line outside fenced code splits cards.
- Empty leading, trailing, or intermediate cards are rejected.
- Backtick and tilde fences protect literal `===` lines inside code.
- For a normal horizontal rule, use `---` with a blank line before and after it.
  Ordinary Markdown setext-heading rules still apply in other contexts.
- No YAML frontmatter; use `--title`, `--footer`, and `--lang` instead.
- Raw HTML renders as literal text. Markdown images are rejected explicitly.
- Basic Markdown headings, lists, tables, links, blockquotes, and code work.
- Math, Mermaid, SVG, PPTX, animation, and image composition are outside this renderer.

Example:

````markdown
# First card

A compact explanation.

```text
===
This is literal code, not a new card.
```

===

# Second card

Another idea.
````

## CLI

```bash
node scripts/render.mjs ./cards.md \
  --out ./output/cards-v1 \
  --theme editorial --size portrait --format all \
  --footer "Research notes" --title "Knowledge cards" --lang en
```

| Option | Values / behavior |
| --- | --- |
| `--out` | New or empty output directory; default `./output/<input-name>` |
| `--theme` | `editorial` (default), `minimal`, `midnight`, `notebook`, `bold` |
| `--format` | `all` (default), `html`, `png`, `pdf`, or a comma-separated list |
| `--size` | `portrait` 1080×1440 (default), `square` 1080×1080, `slide` 1600×900 |
| `--width`, `--height` | Override canvas dimensions in CSS pixels; integers 200–4096 |
| `--scale` | PNG pixel density 0.5–3; default 1; does not change layout or PDF page size |
| `--footer` | Optional footer text; empty by default; index is always shown |
| `--title` | HTML document title; default input filename; does not add a visible card heading |
| `--lang` | HTML language tag; default `zh-CN` |
| `--browser` | Absolute path to a locally installed Chromium executable |
| `--help`, `--version` | Show current usage or renderer version |

The renderer refuses configurations above 40 million PNG pixels per card. A smaller
`--scale` reduces PNG resolution, not text size or overflow. A wide slide-sized card
is not an editable slide deck and cannot hold the same text as a portrait card.

## Outputs and status

Successful output includes the requested formats plus `manifest.json`:

```text
cards.html       Self-contained document with inline CSS, when requested
card-001.png     One image per card, when requested
card-002.png
cards.pdf        One native-text page per card, when requested
manifest.json    Dimensions, theme, count, artifacts, and fit measurements
```

HTML contains no client scripts or remote image/font dependencies. Hyperlinks stay
clickable, so opening one later is a separate user action that can access the network.
PDF is produced by Chromium's print pipeline, not by wrapping PNG screenshots; text
is intended to remain selectable and searchable. Check actual glyphs and extraction
when the downstream use depends on searchability.

All formats, including HTML-only output, use Chromium to check both screen and print
layout. Fit checks include content dimensions, footer separation, wide descendants,
and scrollable code/table content. They do not judge editorial quality.

- Exit `0`: requested files and manifest were written successfully.
- Exit `2`: overflow; `overflow.json` identifies affected cards and source lines.
  No clipped HTML, PNG, or PDF is published as a successful export.
- Other nonzero exit: invalid input, missing dependencies, browser failure, or another
  operational error. Report the real error, not a claimed successful export.

An existing nonempty output directory is never overwritten. After fixing a failed
card, choose a new output directory or deliberately remove/move the old diagnostics.
Do not delete unrelated files to clear a path.

## Troubleshooting

**Content overflow:** shorten repetition, add a meaningful `===` boundary, or use a
user-approved size change. Do not bypass validation by clipping or hiding content.

**Browser unavailable:** verify package installation and the actual executable.
If the environment prohibits browser process creation or lacks required system
libraries, explain the blocker and use a suitable authorized environment. HTML-only
is not a way to skip the validation requirement.

**Missing CJK characters:** install an appropriate local font through permitted setup
or render in an environment that has one. Recheck line breaks and the PDF text layer.

**Misaligned code:** use a compact fenced example. Long lines wrap instead of leaving
the card, so reformat a long expression when wrapping obscures its structure.

**Table feels cramped:** reduce columns, simplify labels, or split the comparison.
Making the font smaller is not a substitute for a readable card.
