# Palette discipline
A tinted neutral ramp plus at most two accents.

| Role | Steps |
|---|---|
| neutral ramp | 50 / 100 / 200 / 300 / 500 / 700 / 900 |
| accent 1 | the focal signal, 1–2 elements per diagram |
| accent 2 | one secondary category, optional |
| categorical | 5 maximum, each with a non-colour cue |
| sequential | 6 steps, monotonic in lightness |
| diverging | 5 steps around a meaningful midpoint |

## Rules

- **The neutrals carry a tint.** Every step holds a trace of the accent hue —
  that shared tint is what makes a palette feel authored rather than assembled.
- **Saturated primaries read as clipart.** Restrained saturation, always.
- **Two accents is the ceiling.** A third is almost always a category that
  should have been a shape.
- Every text role clears 4.5:1 on its ground; verify with
  `brand-tokens.py <slug> --check` in both modes rather than by eye.
- A brand accent that fails as small text gets darkened in the same hue, and the
  substitution gets recorded in the brand file.
