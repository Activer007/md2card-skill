# Five basic themes for generic layouts

This reference covers the **five basic themes for generic semantic layouts**.
The skill also provides **48 composed templates across 12 design families**;
start with the [template catalogue](../docs/TEMPLATE_CATALOG.md) for new card designs.
Those templates have independent styles and do not inherit this theme CSS.
Template family names are not additional `--theme` values. Preserve an explicit
theme request or a request to render untemplated Markdown verbatim instead of
switching it to a template.
Automatic pagination uses only the supported generic layouts, not composed templates.

All five designs are original CSS in `assets/themes.css`. They use local system
fonts and CSS geometry, not images, proprietary templates, or downloaded fonts.

| Theme | Character | Useful for | Distinctive structure |
| --- | --- | --- | --- |
| `editorial` | Warm scientific editorial | Explanations, reading notes, research summaries | Serif headlines, inked top edge, small rust tab, double-rule footer |
| `minimal` | Quiet and contemporary | Clear comparisons, concise professional notes | Open whitespace, left-edge accent, lighter headline weight, unboxed footer |
| `midnight` | Dark technical notebook | Technical concepts, code, systems | Cyan rail, framed canvas, corner registration, inset code accent |
| `notebook` | Organized study notes | Lessons, revision cards, step-by-step learning | Subtle ruling, red margin, annotated headings, paper-colored blocks |
| `bold` | Confident graphic poster | Short practical ideas, announcements, strong contrasts | Heavy outer frame, headline rule, inverted subheads, square quote shadow |

## Choosing without overfitting

Once the generic theme/layout route is appropriate, choose among these five themes.
Use content and audience, not arbitrary industry associations. A technical topic
can be `minimal`; a humanities reading note can be `midnight`. Ask only when the
visual direction is central and the user supplied no preference. Otherwise choose
one appropriate theme and proceed.

Portrait is the default reading format. Square has less vertical room. Slide is a
wide knowledge card, not an editable presentation deck, and usually needs much less
text. Do not assume the same Markdown will fit every aspect ratio.

## Design tokens and extension contract

The renderer sets `--card-width` and `--card-height` as CSS pixel lengths. The theme
uses them for the fixed canvas and proportional typography and padding.

Expected DOM:

```html
<main class="deck">
  <article class="card theme-editorial">
    <div class="card-content">…rendered Markdown…</div>
    <footer class="card-footer">
      <span class="footer-text">…optional user text…</span>
      <span class="card-index">…page index…</span>
    </footer>
  </article>
</main>
```

Keep the content and footer in separate flex rows. The content row must have
`min-height: 0` so overflow remains measurable against its reserved space.
Do not absolutely position the footer over text. Decorative pseudo-elements must
stay behind content and must not contain essential information.

Each theme defines `--ink`, `--muted`, `--paper`, `--accent`, `--line`, and `--panel`.
When adapting a palette, verify text, links, code, table headers, and footer contrast.
Do not rely only on color for a distinction; preserve headings and labels.

System font stacks prefer available CJK sans/serif fonts. Fonts are not bundled or
licensed by this repository. Using a named font in a fallback list does not install
it. For reproducible output, render with the same operating system, installed fonts,
Node dependencies, and Chromium build.

## Visual review priorities

Check dense cards as well as the shortest one. Look for balanced grouping, not a
uniform amount of text on every page. Avoid a tiny text island at the top of a huge
canvas unless the user wanted a cover. The theme should support hierarchy rather
than add ornaments to every block. See the full checklist in `SKILL.md`.


## Version 2 architecture

Themes in assets/themes.css define palette/font tokens and decorative direction.
assets/layouts.css defines canvas geometry, typography rules and eight semantic
layouts. A validated brand JSON supplies optional name, hex accent and local logo,
without arbitrary CSS. Choose layout independently of theme. All five themes are
rendered against all eight layouts by scripts/validate-showcases.mjs.
