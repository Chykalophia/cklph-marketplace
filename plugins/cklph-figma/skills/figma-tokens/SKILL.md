---
name: figma-tokens
description: Extract a design's tokens from Figma — brand colors, the type scale, and spacing — into a reusable map, and check whether the target already defines them. Use after reading a Figma frame and before styling, so output references existing design-system values instead of hardcoded one-offs.
---

# figma-tokens — design tokens, not magic numbers

Pull the design's **tokens** once, map them, and reference the map everywhere. Then check whether the
**target system already defines them** — if it does, bind to those, don't re-create them.

## Get the tokens

`get_variable_defs` on a representative node returns the bound variables:

```jsonc
{ "Colors/Brand/FinCore/Purple": "#b41a83",
  "Colors/Brand/FinCore/Blue": "#00205c",
  "Font/Family/Headlines": "IBM Plex Serif",
  "Font/Size/Heading/H3": "44", "Font/Line Height/Heading/H3": "48",
  "Font/Size/Paragraph/P3": "16", "Font/Line Height/Paragraph/P3": "22",
  "Spacing/M": "24", "Section Padding/padding-section-medium": "80",
  "Container/container-large": "1280", "Border Radius/XSM": "8" }
```

Distill to a compact map you keep in working context: brand colors, the heading + paragraph scale
(size/line-height/weight), the spacing steps, container width, radius.

## Check the target first — reuse over redefine

Before applying any value, see if the target design system already holds it:
- **Elementor** → the Kit's `custom_colors` / `custom_typography` (see `cklph-elementor`'s
  `elementor-templates`). If the brand scale is already there, **reference it by id** (`__globals__`),
  don't paste hexes.
- **Tailwind / CSS vars** → the theme config / `:root` tokens. Bind to the variable, not the literal.

A value that exists in two places drifts. One source of truth = consistency for free, and it honors
"don't break what's already built."

## Apply consistently
- Headings/body → the type scale tokens (family + size + line-height + weight), not arbitrary px.
- Gaps/padding → the spacing steps (8/12/16/24/…), not eyeballed numbers.
- Colors → brand tokens; reserve raw hex for true one-offs only.

If the design uses a token the target lacks, **add it to the target's system once** (a new Kit global,
a new CSS var), then reference it — so the next page inherits it too.
