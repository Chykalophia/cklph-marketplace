# Cognitive load rules

Distinct from [`accessibility.md`](accessibility.md). WCAG is largely silent on
these; they are the difference between a diagram that can be *parsed* and one
that can be *understood without effort*. They help everyone and they are
load-bearing for autistic and ADHD readers, who pay a higher tax for ambiguity
and visual noise.

Sources of the framing: WCAG 2.2's COGA-derived success criteria (3.2.3
Consistent Navigation, 3.2.4 Consistent Identification, 2.4.11 Focus Not
Obscured) point at consistency and predictability but stop short of diagram
grammar; the rules below fill that gap.

---

## C1 — Predictable grammar across types

The same visual language means the same thing in every diagram, every type,
every brand. A dashed border is *always* optional-or-async. `accent` is *always*
"look here first." A double hairline is *always* `cat-3`.

Learn once, read forever. The moment a diagram redefines a convention locally,
every diagram in the set becomes something the reader has to re-learn — and
they will not know which ones to re-learn, so they re-learn all of them.

If a diagram genuinely needs a new convention, add it to the brand file, not to
the diagram.

## C2 — One reading order, made explicit

Pick left→right or top→bottom and hold it for the whole diagram. Where flow
matters, number the entry point — a small `01` eyebrow on the first node costs
nothing and removes the "where do I start" pause entirely.

Never rely on the reader inferring order from arrow direction alone in a diagram
with more than one entry point.

## C3 — Hard node ceiling

**9 visible elements.** Not a target — a ceiling.

Past 9, the skill's correct move is to **refuse and propose a split**: an
overview diagram plus a detail diagram, or two diagrams cut along the natural
seam. Offering the split is the helpful part; silently rendering 14 nodes is
not.

`faithful` import mode is the one documented exemption, and even there: above 9
the layout must be zoned, above 24 it must split.

## C4 — No crossing lines

Orthogonal routing, and where a crossing is truly unavoidable, an explicit
bridge/hop. Crossed lines force the reader to mentally disentangle two paths at
once, which is exactly the operation that costs the most for a reader with
working-memory constraints.

If you cannot route without crossings, the layout is wrong or the diagram is
over budget. Reorder the nodes before you reach for a bridge.

## C5 — Off-white paper, never pure `#fff`

Pure white at full brightness produces glare and, for some readers, visible text
shimmer. Every brand's `paper` is off-white by construction — `#fafaf7` for
CKLPH. Don't override it back to `#fff` for "cleanliness."

The `prefers-contrast: more` override (rule A7) is the exception: someone who
has asked for maximum contrast gets `#fff`, because they asked.

## C6 — Generous line-height and node padding

`line-height: 1.5` minimum, `node-padding: 16` minimum. Tight text is a sensory
problem before it is a legibility problem, and cramped nodes read as urgent even
when the content is not.

Whitespace is also where the "vibrancy" in [`design-thesis.md`](design-thesis.md)
comes from. Cutting padding to fit one more node trades the thing you wanted for
the thing you were told to avoid.

## C7 — No ambiguity in edge meaning

Every line style is either legended or directly labelled. A dashed line that
means "async" in one diagram and "planned" in another, with no legend in either,
is worse than an unlabelled solid line — it looks like it carries information
and it doesn't.

Line-style vocabulary, fixed:

| Style | Means |
|---|---|
| solid | actual, synchronous, present-state |
| dashed `4,3` | optional, async, planned, or transit-through |
| double hairline | high volume / aggregate |
| arrow both ends | genuinely bidirectional, not "they talk" |

## C8 — Nothing conveyed by hover

If it matters, it is visible. Hover has no keyboard equivalent, no touch
equivalent, and no print equivalent, and it hides information behind an action
the reader has to discover.

Tooltips are for *supplementary* detail only, and the diagram must be complete
without them.

## C9 — Consistent element position across a set

When a set of diagrams shares elements — the same system, the same lifecycle
stage, the same team — keep those elements in the same screen position across
all of them. A reader who has learned where "the database" sits should not have
to re-find it in diagram three.

This is the diagram-level version of WCAG 3.2.3 Consistent Navigation, and it is
the cheapest usability win in a multi-diagram deliverable.
