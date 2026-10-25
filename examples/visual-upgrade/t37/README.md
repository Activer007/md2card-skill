# T37 photo-cover fixtures

Run from repository root (the fixtures deliberately use repository-relative
image references):

```sh
node scripts/render.mjs examples/visual-upgrade/t37/dark.md --asset-root . --out output/photo-cover --preview --strict
```

`dark`, `bright`, `portrait` exercise bottom-left, top-right and top-left text
regions respectively; `three-line` retains the full eleven-character title
at the original title size. The title breaks into three lines in the recorded
Windows/Chrome/font environment, not necessarily with every installed font.

The author manually checked the actual crop and quiet zone of these exact
synthetic images. `subjectSafety: clear` records that declaration; it does not
enable face recognition. The portrait is fictional and the existing image's
shoulder boundary is not represented as an uncropped full-body portrait.

`blocked-portrait`, `no-safe-zone`, `no-crop-permission`, `uncertain`,
`invalid-focus`, `invalid-role`, `invalid-remote` and `title-overflow` must fail.
For the first three, the evidence also exports the same input with only photo
fields removed, preserving complete images and all authored content.
`original` is the unchanged original T37 example with its asset path rebased.

See [the field contract](../../../docs/visual-upgrade/M2B_PHOTO_COVER.md) and
[the acceptance record](../../../docs/visual-upgrade/M2B_ACCEPTANCE.md).

## Sources and rights

New images in `assets/` were generated specifically for these tests using the
built-in OpenAI imagegen tool on 2026-10-26, without reference images. They are
synthetic scenes, not real photography, reportage or identifiable real people.
The original request was respectively: dark matte wall and unbranded ceramic
vase/branch on the right; luminous sky and calm shore with a small unbranded
boat at lower left; fictional adult woman on the right with quiet dark wall
on the left. None requested a third-party artist/style, brand or identity.

[assets/provenance.json](assets/provenance.json) pins original files/dimensions
and source identity. The two reused fixtures remain the previously disclosed
AI originals in `examples/templates/assets/`; see that directory's README and
provenance manifest. No photo was copied from Guizang or another third party.
The MIT repository license applies to original contributions to the extent
applicable; no exclusive AI copyright or third-party photo permission is claimed.
System fonts are used locally and are not redistributed.
