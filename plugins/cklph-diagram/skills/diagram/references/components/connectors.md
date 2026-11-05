# Connectors and terminators
Thirty-six treatments live in gallery demo 22. This file is the selection rule.

## Choose by job

| Job | Treatment |
|---|---|
| the default path | `standard` 2px, one terminator |
| the one path that matters | `cased` — heavy stroke with a ground-coloured core |
| planned / not yet built | `dashed` 10,6 |
| weak or inferred | `dotted` round-cap |
| standby, carrying nothing | `dashed` in a muted neutral |
| boundary or trust edge | `dash-dot` |
| volume or bandwidth | `ribbon` or `tapered`, width = quantity |
| many-to-one | `bundle` |
| direction without a marker | `gradient fade` or `graduated dash` |
| unavoidable crossing | `line-jump` |

## Terminators

`filled triangle` is the default and reads as one. Alternatives that change the
meaning rather than only the look: `open chevron` (lighter, still directional),
`dot origin` (marks the source, not the target), `bracket` (terminates without
pointing), `socket` (a port, not a destination), `crow's foot` (cardinality).

## Rules

- **Two treatments per diagram, three at the absolute most.**
- **Do not stack direction cues.** Taper plus gradient plus arrowhead is one idea
  said three times.
- **Never label the weak end.** Anything that fades, thins or glows loses
  contrast somewhere; keep labels on the solid portion.
- **One terminator vocabulary per diagram**, and legend it.
- Gradient strokes must use `gradientUnits="userSpaceOnUse"`. A horizontal line
  has a zero-height bounding box, which degenerates an `objectBoundingBox`
  gradient — silently in some renderers, invisibly in others.
