# M1 exact-stage render calibration

[Run 40069835718](https://github.com/Activer007/md2card-skill/actions/runs/40069835718)
tested PR17 head `47d52a49e4b4c2ea3ff071bb73feec22118bb7b6`, exact tree
`843ff0c52b6e7c759375711a2e41bf205b92b4c9`. It did not test later family fonts,
flagship redesigns, footer modes, new series or new aspect pairs.

The run passed 337 tests with zero skipped. Legacy decks, semantic pagination,
optional tails, both existing authored series, gallery 51/51 and original
22-case aspect checks passed. It failed the template and pressure gates:

| Exact input | Used / available height (px) | Result |
| --- | --- | --- |
| Registered T20 | 1336.6875 / 1224 | overflow |
| Registered T32 | 1361.75 / 1224 | overflow |
| Registered T34 | 1287.234375 / 1224 | overflow |
| Registered T40 | 1527.40625 / 1249 | overflow |
| Pressure T24 medium-table, editorial | 1274.40625 / 1222 | overflow |
| Pressure T20 image-screenshot | 1432.4375 / 1224 | overflow |

44/48 registered examples exported. Failed cases produced diagnostics, not
clipped or partial images. The
[archive](https://github.com/Activer007/md2card-skill/actions/runs/40069835718/artifacts/12551070768)
contains 1,054 files; ZIP SHA-256:
`0a2310653a1d7394b525dac42cdcc97cef33283cb55f7d05dc4c7466c68fc31f`.

The source correction retains wide sequential T32/T34 reading bands, T24's
2.25em title and full-size three-column table, and T20's purple panels and
complete .36-card-height image frame. It recovers space from region furniture,
not words, font sizes, clipped content or weaker validation. The registered
landscape T20 picture remains at least 240px wide on the 351px card preview;
a complete tall screenshot in that frame is narrower and is not certified for
embedded-text reading. Its external description remains body-sized.

T40 allocates .8 canvas width to the full detail plate and places the supplied
key heading beside it. Caption, introduction, numbered explanations and source
remain full-width. Its body/note/H1 sizes are unchanged; local leading is 1.4
for introduction/list and 1.35 for caption/source. Including borders, the
original 48px image keys calculate to about 11.186px at the 351px preview.
This calculation is not a replacement for real phone measurements and review.

All 13 changed v2 designs remain awaiting visual acceptance until the corrected
exact stage is rerendered and independently checked in full PNG, both phone
widths and searchable PDF. The 35 unchanged v1 designs keep their historical
bindings. No later-stack pixels are used to certify this earlier composition.
