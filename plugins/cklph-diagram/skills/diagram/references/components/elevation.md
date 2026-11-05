# Elevation stack
One shadow looks cheap. Four layers, each with a job, looks built.

| Layer | Value | Job |
|---|---|---|
| border | 0 offset, 0 blur, 1px spread | the edge |
| ambient | 0 offset, 2px blur | soft light from everywhere |
| distance | 0 offset, 8px blur, negative spread | height above the page |
| inner ring | 1px inset, near-white | makes the card glow from within |

Scale: `0` flat · `1` ambient only · `3` + distance · `5` + stronger distance.

## Rules

- **Elevation must map to something real** — exposure, focus, layering. A
  five-step scale used decoratively is five steps of noise.
- **Elevation clarifies layering; it does not make things float.** Do not nest
  elevated surfaces without a reason.
- **Shadows never carry meaning, only separation.** Shadow-as-affordance lands
  around 1.1:1 in practice, far under the 3:1 non-text components need.
- Draw shadows as explicit blurred shapes rather than `feDropShadow` —
  exporters drop filter primitives silently.
- Keep shadow opacity under 0.2. Above that it reads as a drop-shadow effect
  rather than as light.
