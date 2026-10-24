# Family grammar and local typography

This is the design contract for the R04/R05/R07 refinement round, not visual acceptance evidence. All 48 compositions keep their own source/slot contracts. Shared typography changes **T01–T48**, including the independent T04/T21 square and slide treatments. Their old raster/PDF reviews remain historical evidence, not acceptance of this revision. New screen, print and actual-mobile-width render review is required.

## What a family controls

A family supplies a coherent hierarchy, reading rhythm and relationship between display type, body text, numerals, quotations and provenance. It is not a paper color, an eyebrow label, a repeated rounded box or a footer preset. The individual composition still determines its structure. For example, Swiss list rows, a comparison, a branching map and paired navigation do not become the same layout merely because they share fonts.

`typographyForFamily()` in `scripts/typography.mjs` is the closed source of font-role and rhythm metadata. Its deterministic `templateTypographyCss()` block is checked against `assets/templates.css`. These are repository-owned values; Markdown cannot choose a font, add CSS, insert HTML, or request a network resource.

## Twelve distinct grammars

| Family / IDs | Primary hierarchy and reading behavior | What must stay distinct within the family | Role and rhythm character |
| --- | --- | --- | --- |
| Editorial / T01–T04 | A publication hierarchy: masthead or title, real lead, then evidence. Title and quotations have book-like contrast against explanatory text. | T01 asymmetric lead/sidebar; T02 quotation before evidence; T03 full portrait and reading column; T04 continuous full-width sections. | Serif display and quote; sans body and provenance; body leading 1.52, paragraph rhythm ×1.04. |
| Swiss / T05–T08 | Alignment and measured whitespace do the work. Original numbers act as navigation, not medals or invented progress. | T05 open index rows; T06 unequal comparison; T07 root/branches/synthesis; T08 paired sequential navigation. | Sans display/body; geometric numeral role; mono provenance; leading 1.46, rhythm ×0.90. |
| Bauhaus / T09–T12 | Geometric shapes organize empty areas and relationships, never encode unsupported facts. Strong type precedes spatial modules. | T09 geometric cover; T10 conceptual collage; T11 circular title nodes; T12 four equal conceptual regions without axes or scores. | Geometric display/numerals/quote; sans explanations; leading 1.48, rhythm ×0.94. |
| Brutalist / T13–T16 | Oversized text, hard edges and visible structural rules. Contrast belongs to the statement or comparison, not arbitrary decoration. | T13 offset declaration and open argument rows; T14 action ticket; T15 shared-wall comparison; T16 offset opinion sheets with full-width explanations. | Emphatic local display; sans body; mono numeric/source roles; leading 1.44, rhythm ×0.86. |
| Technology / T17–T20 | An instrument hierarchy: name the mechanism, separate inputs and evidence, retain code and interface context. Chrome never pretends to be functioning UI. | T17 linked mechanism modules; T18 command/result terminal; T19 shared-input module matrix; T20 open features leading to a complete interface plate. | Humanist display/body/quote; mono values and provenance; code has its own local mono stack; leading 1.48, rhythm ×0.92. |
| Business / T21–T24 | The authored metric or evidence leads, with definition, denominator and limitation inseparable from it. No synthetic charting or “winner” decoration. | T21 one metric/definition band and evidence rows; T22 three actual measures; T23 problem/action/result; T24 full-size three-column report. | Sans display/numerals, humanist body, serif quotation; tabular lining numerals; leading 1.46, rhythm ×0.94. |
| Journal / T25–T28 | Reading actions and interpretation are visibly different from the original excerpt. Labels and margins support retrieval rather than simulate handwriting. | T25 excerpt and notes; T26 tasks/annotations; T27 authored time labels; T28 original numbered index slips. | Serif display, humanist body, literary quotation, mono indexing/source; leading 1.58, rhythm ×1.08. |
| Eastern / T29–T32 | Horizontal literary type, open space and deliberate pauses. Attribution and interpretation remain separate. No forced vertical text, fake calligraphy or fabricated historical authority. | T29 open reading folio and inset note; T30 poem with a clearly decorative landscape; T31 quotation and nonverbal geometric seal; T32 wide sequential excerpt/interpretation. | Literary serif display/body/quote, quiet humanist source; leading 1.60, quotation 1.82, tracking .015em, rhythm ×1.12. |
| Newspaper / T33–T36 | Report-like hierarchy and documentary sequence, with references visible. Rules divide information regions rather than underline every word. | T33 masthead and columns; T34 wide main analysis and inset note; T35 separately attributed clippings; T36 authored dated event ledger. | Serif display and literary body; mono numerical labels, sans source; leading 1.48, rhythm ×0.94. |
| Film / T37–T40 | The picture is evidence or scene, not a postage stamp. Story, caption and source stay outside the image with readable type. | T37 full-width still/story band; T38 paired contact prints; T39 complete portrait and story sidebar; T40 explicitly supplied detail plus numbered annotations. | Serif display/quote, humanist narrative, mono source/index; leading 1.50, rhythm ×1.02. |
| Pop / T41–T44 | Conversational reading, clear scene sequence and high-contrast shape vocabulary. Large pictures carry narrative, not generic decorative icons. | T41 question/answer blocks; T42 original numbered stickers; T43 two establishing scenes and panoramic resolution; T44 matched dimensions and paired dialogue. | Rounded local display/quote, sans body, mono numbers; leading 1.44, rhythm ×0.90. |
| Nature / T45–T48 | Specimen and observation, material and context, action and illustration. Images stay complete; the design never implies scientific identification or product efficacy. | T45 full-measure introduction and specimen/observation pair; T46 material scene; T47 ingredient ledger and generous illustrated methods; T48 equal specimen plates with shared limits. | Literary display/quote, humanist body, serif provenance; leading 1.56, rhythm ×1.06. |

The body line-height values are intentionally modest differences. A paragraph rhythm multiplier affects the existing paragraph gap, not text size. Composition-specific display sizes and quotation rhythms remain distinct. Code, table explanations, lists and metric labels are real body text, not footnotes.

## Eight flagship changes

- **T05:** enlarged original numerals form a stable left rail, with open rules and one dominant title. The source list start is retained. Numerals are not reset or turned into progress labels.
- **T13:** the two supplied headings form an offset declaration. Open argument rows replace the paired boxed-panel motif. No extra slogan is generated.
- **T20:** a quiet instrument-like label, unboxed functional explanations and one full-width interface plate. The original 1400×900 illustration uses its actual proportions rather than a shallow stage. Embedded interface text is not promised to meet body-text thresholds; all meaningful explanation stays outside the picture.
- **T21:** in portrait only, the number shares a focal band with its complete label, then full-measure evidence rows explain interpretation. No proportional bar, percentage fill or invented comparison is generated. Square/slide remain separate structures.
- **T29:** an unboxed literary title, large open quotation and deliberately inset interpretation. Source hard breaks remain intact, and nothing is attributed to an invented author.
- **T37:** a full-width full-frame landscape image inside the measured content box leads the card; caption, title and narrative follow beneath. A contain ceiling at .52 card height supports tall source images without cropping. For the standard 1080×1440 canvas, the 1536×1024 example uses the approximately 968px content width without negative margins; the complete image remains below the ceiling. The generic overflow guard is unchanged.
- **T43:** the two first scenes use their full column width and natural 900×480 proportions; the final 1200×360 scene spans both columns at natural height. Captions/dialogue remain selectable text below the picture, without overlaid bubbles or image alterations.
- **T45:** the introduction uses the full card measure, followed by a materially larger botanical specimen beside the observation. The source image is neither cut out anew nor cropped. The plant is visual context, not a diagnostic illustration.

## Image-led narrative rather than icon placement

The same treatment extends to **T47** and **T48**:

- T47 allocates 45% of the method-row tracks to the complete picture, rather than the old fixed 4.5em thumbnail column. Operation text remains in the other track at full body size. The ingredients form an open ledger, not another panel.
- T48 uses two equally weighted specimen columns. Each name, full picture and same-order field list remains grouped; all later limitation sections span the full width. Neither column receives a recommendation, rating or winner cue.
- T43/T47/T48 have width 100%, natural height and no small image-height cap. The unchanged PNG files contain all their original scene/figure content. There is no claim that a source-only test proves the perceived illustration quality or final fit.
- T20 and T45 also retain natural height, with .44 and .45 card-height contain ceilings respectively for alternate tall inputs. The default assets fit below those ceilings. A very different source aspect, longer caption or more content must still pass screen/print measurement; a contain ceiling is not a universal fit guarantee.
- T38/T39/T40 and the other existing image structures are not collapsed into the flagship's frame shape. Explicit source detail/crop intent and the original source bytes stay unchanged.

## Offline font behavior and diagnostics

The five public roles are `display`, `body`, `numeric`, `quote` and `source`. Code separately uses the local mono stack. The role stack IDs are `sans`, `humanist`, `geometric`, `emphatic`, `serif`, `literary`, `rounded` and `mono`.

Every stack lists installed font **names**, includes CJK candidates and ends in a generic fallback. No font files, webfont stylesheet, download script or third-party license payload is bundled or copied. An unavailable commercial/system font name is only a preference, never a dependency or permission to fetch it.

`--doctor` retains its glyph-coverage checks and adds `fonts.typography` plus the `font-roles` check. These report:

1. The installed candidates for each fixed local stack, using exact case-insensitive names and Fontconfig aliases.
2. The first installed candidate or a clearly labeled generic fallback. If scanning failed, the result is unverified rather than a guessed installed font.
3. The five-role plan and rhythm for each of the twelve families.
4. `browserSelection: "unverified"`. Font inventory cannot prove the browser's selected face, glyph fallback, line breaks, weights or visual distinction.

A generic fallback is allowed and does not by itself fail strict mode. Missing required CJK glyph coverage retains the existing strict-mode failure. Fontconfig absence remains an explicit warning/unverified result. No diagnostic starts Chromium or changes the machine. When multiple roles resolve to the same installed face, inspect the resulting hierarchy and spacing instead of claiming unavailable typefaces were used.

## Accessibility, preservation and acceptance boundaries

- The body floor remains .043 × canvas width and notes .0335 × canvas width. At the real **351px inner preview width**, these are **15.093px** and **11.7585px**, above the 14px/11px requirements. At 366px they are 15.738px and 12.261px. These are nominal CSS sizes; actual rendered legibility still requires inspection.
- Compact/standard/editorial density only changes space. It cannot select smaller fonts, compress text, scale the card, clamp lines, hide overflow, truncate labels or discard source content.
- All 48 compositions retain their existing safe Markdown data structure. Title, paragraph, list, quotation, table, code, source metadata and original image payloads are preserved. Additional supported content must remain present and either fit or fail normally.
- M1's wide T32/T34 reading arrangements remain sequential, not two cramped columns; T34's artificial drop cap stays removed.
- Repository-owned aspect rules remain the final CSS section. The T21 portrait-specific restructuring does not leak into its square/slide grids, but shared typography still invalidates the previous rendered acceptance for all four T04/T21 non-portrait variants.
- Source tests check registry/CSS consistency, role fallbacks, nominal floors, spacing-only density, full-image policies, all-template source preservation and unchanged aspect routing. They are not PNG/PDF or visual acceptance. New CI renders, overflow/tail checks, font-dependent line wrapping and human visual review remain required.
