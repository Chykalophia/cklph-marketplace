# Stroke discipline
The fastest single upgrade available.

| Treatment | Value | Verdict |
|---|---|---|
| pure black | `#000000` | never — reads as clipart |
| neutral at opacity | darkest neutral at 60–80% | good |
| tinted from fill | stroke derived from the fill's own hue | better |
| tinted + inner ring | plus a near-white 1px inset | best |

## Rules

- **Never `#000`.** Use the darkest neutral at 60–80%, or derive the stroke from
  the fill so the edge belongs to the shape.
- **On non-neutral grounds, tint the border toward the same hue.** Do not
  introduce a new hue for an edge.
- Weight scale: `0.8` background relations · `1.2` default · `2.0` emphasis ·
  `3.0+` neubrutalist only.
- A meaning-bearing border needs 3:1 against its ground. Decorative hairlines do
  not, but they also must not be the only thing defining a node.
