# Content planning and editorial style

Read this when adapting prose, not when the user only wants an unchanged export.

## Start with the reader's task

A useful card helps someone understand one distinction, remember one process, or
make one decision. Pick the central question before inventing section headings.
The number of cards follows the information and the user's constraints.

Possible structures, not mandatory templates:

- **Explainer:** question → mechanism → example → limitation.
- **Reading notes:** central argument → supporting evidence → interpretation.
- **How-to:** goal → prerequisites → steps → verification.
- **Comparison:** shared criteria → differences → trade-offs → recommendation.
- **One-card summary:** clear title → compact explanation → useful takeaway.

Skip generic “What is…” openings if the reader already knows the context. A final
card need not be a summary if it only repeats the preceding cards.

## Write for small, fixed canvases

Use a title that communicates a claim or question. Let body copy carry nuance.
Two or three distinct content blocks often read better than many tiny sections.
Balance whitespace by varying hierarchy and grouping, not by adding filler.

At the default portrait size, approximately 180–300 Chinese characters or
90–150 English words is a useful initial range for an ordinary content card.
It is not a limit or fit guarantee: headings, lists, code, tables, font availability,
and theme structure materially affect capacity. Render to decide.
A cover can be shorter, but do not make a sparse cover unless the sequence needs one.

Prefer:

- Concrete headings: “先找到证据，再组织回答” instead of “核心赋能逻辑”.
- Short paragraphs that retain connections between ideas.
- One comparison table when readers need common criteria.
- A quote block for one actual quotation or a concise takeaway, clearly distinguished.
- A compact example only when it explains the principle better than more description.

Avoid:

- Unsupported superlatives, invented statistics, and guaranteed outcomes.
- An emoji at every heading, all-bold paragraphs, and repeated slogan-like endings.
- Decorative code blocks for ordinary prose.
- A dense table of many columns that becomes illegible on a phone.
- Squeezing important caveats into a tiny footnote.

## Preserve source integrity

A short card can be misleading even when each sentence is technically true. Keep
scope, date, uncertainty, and exclusions that change the interpretation.

If the source says a result occurred in a limited experiment, do not promote it to
a general promise. If a number lacks a source, either verify it or omit it.
Label hypothetical examples. Keep actual quotations faithful and attributed; use
paraphrase when an excerpt would be too long for the card or exceeds permitted use.

A short inline source link works for a narrow claim. A source card works when several
claims need context. Never fabricate a reference to fill that card. Preserve the
readable source name, not just a raw URL.

## Fix overflow without damaging the message

1. Remove repetition, not evidence or qualification.
2. Reduce unnecessary headings, list nesting, and overlong labels.
3. Divide at a semantic boundary; carry enough context to the next card.
4. If the user requires a fixed count or verbatim text, explain the fit conflict and
   offer an appropriate dimension or structure change rather than silently editing.
5. Render again and inspect the whole series.

The CSS permits long words and code lines to wrap and keeps table cells inside the
canvas. This prevents horizontal spill, not information overload. A visually awkward
wrap remains an editorial problem even when the overflow test passes.
