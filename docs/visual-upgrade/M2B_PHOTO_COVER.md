# M2b: T37 opt-in photo cover

Decision: defaults remain complete `contain` images. Only portrait T37 may opt in.
No AGPL template, CSS or asset is incorporated. Guizang Issue #1 is a problem
reference: explicit heading styles can override inherited light foreground.
This implementation assigns on-media foreground directly to the actual text.

## Author contract

All eight fields are required together; there is no inferred crop permission.

| Field | Accepted value | Meaning |
| --- | --- | --- |
| visualVariant | `photo-cover` | Explicit T37 composition |
| imageRole | `photo` | Author declares a photograph or disclosed synthetic photo; never a screenshot/evidence diagram |
| mediaFit | `cover` | Explicit permission to crop this image |
| focalX, focalY | JSON numbers, finite 0–100 | CSS object-position percentages; not face coordinates or guaranteed subject preservation |
| textZone | `top-left`, `top-right`, `bottom-left`, `bottom-right` | Author-selected bounded corner region |
| mediaTone | `dark`, `light` | Tone of the chosen region; explicit white/dark text with a small local backing |
| subjectSafety | `clear` | Author checked the chosen crop AND text region; `blocked`/`uncertain` are explicit refusal states |

Nonempty local image, alt, caption and source are mandatory. Use exactly one H1
and one metadata image. Other content is retained; long text can fail overflow.
Only portrait is implemented. This does not extend T20 crop rights or any other
template's roles. Crop fields without the opt-in, or on another template, fail.

## Eligibility and fallback

Before choosing `clear`, inspect the complete original and proposed crop: no
face, essential subject, labels or evidence may be cut or covered. Select a
quiet corner. Never declare `clear` on behalf of an unknown photographer.
The renderer checks enum/type/range, image trust and text geometry, **not image
semantics**. It does not detect faces or independently verify the declaration.

Missing cover permission, missing/unknown zone, blocked/uncertain subjects,
invalid focus and text extending beyond its region are errors. No silent mode
change, shrink, rewrite or whole-image dark veil is allowed. To fall back,
remove all eight fields above and retain image/alt/caption/source and text:
default T37 shows the complete original. A long default card may still require
manual splitting; fallback is not a universal fit promise.

Source bytes remain embedded unchanged with original dimensions/alt; only the
authorized view is cropped. Caption, story, source, brand and footer stay below
the photo, outside the overlay. Title is native HTML/PDF text. Export remains
subject to the existing strict font, PDF and screen/print overflow checks.

## Evidence and limits

New independent fixtures and evidence must not inherit default gallery approval.
Review full images, 375/390 previews and native PDFs individually, including the
actual foreground on emphasis/links/code, subject position and three-line title.
Original AI-generated fixtures carry a synthetic/fictional declaration; they
are not records of real people or places. No third-party photo license is inferred.
