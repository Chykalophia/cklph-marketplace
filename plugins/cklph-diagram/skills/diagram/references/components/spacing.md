# Spacing grid
Everything on an 8px grid, then broken by a pixel or two where the eye
disagrees with the arithmetic.

| Token | Value |
|---|---|
| `grid` | 8 |
| `node-padding` | 16 |
| `gap-tight` | 16 |
| `gap-default` | 24 |
| `gap-loose` | 40 |
| `line-height` | 1.5 |

## Rules

- **Optical adjustment is the second half of the rule.** The grid gets you
  consistency; the manual nudge gets you correctness. Circles, triangles and
  anything whose visual centre differs from its bounding box will need it.
- Do not abandon the grid because of the exceptions — exceptions are only
  legible against a system.
- Parallel connectors need ≥12px separation, and attachment points on the same
  edge need ≥12px between them.
