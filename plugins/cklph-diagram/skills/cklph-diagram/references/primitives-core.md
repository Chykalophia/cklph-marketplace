# Core SVG primitives

Routed from SKILL.md §6. SKILL.md keeps the six connector rules as one line each, the arrow roles, and a one-line node box summary. This file holds the markup and the long form of every rule. The copied template already carries the background rect, the commented dotted-paper pattern, and all three arrow markers, so load this file when you need exact markup or a rule's edge cases.

Type-specialized primitives (lifeline, activation bar, region) live in the relevant type reference linked in SKILL.md §3.

> **Fork note.** Upstream writes these snippets in its own palette and runs
> 7–9px mono labels. Here every colour is a brand token (`var(--role)`, resolved
> per SKILL.md §0), every family is `var(--font-*)`, and every text size clears
> the 12px rendered floor (accessibility.md A5). The snippets below match what
> `scripts/build-examples.py` emits, so they pass `lint-a11y.py` as written.

## Background

**Default: clean paper, no dot pattern.** Single `<rect>` filled with `paper`. Don't wrap the diagram in a secondary container background — the diagram sits directly on the page.

```svg
<rect width="100%" height="100%" fill="var(--paper)"/>
```

**Optional: dotted paper variant.** When a long-form editorial diagram benefits from textured ground (essays, hero diagrams on a dedicated page), opt in by adding the `dots` pattern and a second rect:

```svg
<defs>
  <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="0.9" fill="var(--rule)"/>
  </pattern>
</defs>
<rect width="100%" height="100%" fill="var(--paper)"/>
<rect width="100%" height="100%" fill="url(#dots)" opacity="0.6"/>
```

Don't use the dot pattern when the diagram sits inside a product page, slide, or card — the texture compounds with surrounding chrome and reads as noise.

## Arrow markers (define all three, always)

```svg
<marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
  <polygon points="0 0, 8 3, 0 6" fill="var(--muted)"/>
</marker>
<marker id="arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
  <polygon points="0 0, 8 3, 0 6" fill="var(--accent)"/>
</marker>
<marker id="arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
  <polygon points="0 0, 8 3, 0 6" fill="var(--link)"/>
</marker>
```

| Arrow | Stroke | When |
|---|---|---|
| Default | `muted` | Internal, generic |
| Accent | `accent` | Primary / highlighted / headline |
| Link | `link` | HTTP/API calls, external systems |
| Dashed | `stroke-dasharray="5,4"` + any color | Optional, passive, return, async |

**Draw arrows before boxes** so z-order puts lines behind nodes.

## Mandatory connector rules

These six rules are **non-negotiable**. Run the pre-output checklist (SKILL.md §9) to verify before producing any diagram.

1. **Rounded right-angle (orthogonal) connectors are mandatory.** Never use diagonal `<line>` or straight slanted paths between nodes that don't share an x or y axis. Every bend must be a quarter-arc with `r=8` (or `r=6` minimum for tight layouts). See `references/type-architecture.md` for the elbow-path formula. Reserve plain straight `<line>` only for connections whose endpoints share the same x or y coordinate. Diagonal connectors are an automatic fail.

2. **Label-to-connector margin: 6–10px gap, always.** A label must never sit *on* its arrow — the connector must remain visible. Place the label centered above (or beside, for vertical segments) the line with a **minimum 6px gap** between the bottom of the label's mask rect and the connector stroke. The opaque mask rect prevents the arrow from bleeding through, but the *visible* gap between mask edge and line preserves the reader's ability to trace the connection. If the label is large enough that 6px feels cramped, push it to 8–10px. Never let the mask rect touch or overlap the stroke.

3. **No overlapping connectors.** Two connectors must never share the same stroke path, run parallel on top of each other, or be drawn on top of each other for any segment. When two orthogonal arrows must cross at a single point, apply the **bridge / hop** primitive (see `references/type-architecture.md` § Crossing arrows). When two arrows naturally want to overlap, offset their routing by ≥12px so each line is independently traceable. If you find yourself stacking connectors, redesign the layout — it means two nodes are too close, or the diagram is over budget (split into overview + detail).

4. **Shared edge → fan the attach points.** When two or more connectors enter or exit the *same edge* of a box, each must have its own distinct attach point along that edge — **no two connectors may share a single point on a box**. Spread the attach points evenly along the edge with **≥12px** between adjacent points (8px minimum for very small boxes). Routing rules:
   - For N connectors on an edge of length L, attach point `k` (1..N) sits at offset `L * k / (N + 1)` from the edge's leading corner.
   - **Order the attach points by the far endpoint.** Sort the connectors leaving one edge by the position of the node each one goes to, and assign attach points in that order; otherwise two lines cross right next to the box. A side carrying N points needs at least `2 × 16 + 12 × (N − 1)` px.
   - When the connectors fan out to destinations on different sides, route each one orthogonally from its own attach point — no merging strokes near the box.
   - When two parallel connectors run in the same direction, keep them ≥12px apart along their entire length, not just at the attach point. Each arrow must remain independently traceable end-to-end.

   No connector may hide another. If you can't tell two arrows apart at a glance, the layout has failed.

5. **A connector must not pass behind a box that isn't its source or destination — except when the box is geometrically unavoidable on a direct orthogonal path.** Reroute around intervening boxes by default. The only legitimate exception is when a cross-cutting node (e.g., a footer service, a horizontal layer bar) physically sits between the connector's source and destination on the only straight path between them. In that exception:
   - The stroke must be **dashed** (e.g., `stroke-dasharray="4,3"`) to signal "transit, not interaction" — it tells the reader the intervening box is not an endpoint.
   - The label sits at the **visible end** of the connector (typically near the source) so it doesn't fall behind the intervening box.
   - No marker (arrowhead) may land on the intervening box's edge — the marker resolves at the true destination only.

   When in doubt, reroute. The exception exists for the narrow case where rerouting is geometrically impossible, not as a shortcut to avoid layout work.

6. **A label mask must not overlap a node drawn after it.** Rule 2 keeps the label off its own connector; this one keeps it off the boxes. Because nodes are painted after labels, a mask that lands partly inside a node is covered by the node fill and the text renders as a fragment sitting on the node border. Place the label on a segment of the connector that runs through open canvas — for a connector leaving a node's right edge, that means clearing the node's `x + width` before the mask starts. A mask fully *inside* a node is a badge chip and is fine; a mask overlapping a zone container is fine too, since zones are painted first. From a repository checkout, verify with `python3 <repo-root>/scripts/verify-geometry.py <file>`.

## Node box — full pattern

```svg
<!-- 1. Opaque paper mask — prevents arrows bleeding through transparent fills -->
<g data-node="1">
  <!-- 1. Opaque paper mask — prevents arrows bleeding through tinted fills -->
  <rect x="X" y="Y" width="W" height="H" rx="6" fill="var(--paper)"/>
  <!-- 2. Styled box: FILL / STROKE per the node-treatment table (SKILL.md §5).
       A category colour always ships with a shape cue too (rx or dash) — A1. -->
  <rect x="X" y="Y" width="W" height="H" rx="6" fill="FILL" stroke="STROKE" stroke-width="1.2"/>
  <!-- 3. Type tag: 12px mono, tracked. At the 12px floor a boxed tag pill no
       longer fits a 88px node, so the tag is bare text in the top-left. -->
  <text x="X+12" y="Y+24" fill="var(--muted)" font-size="12"
        font-family="var(--font-mono)" letter-spacing="0.08em">API</text>
  <!-- 4. Node name (brand sans — human-readable) -->
  <text x="CX" y="Y+48" fill="var(--ink)" font-size="16" font-weight="600"
        font-family="var(--font-sans)" text-anchor="middle">Node Name</text>
  <!-- 5. Technical sublabel (brand mono) -->
  <text x="CX" y="Y+68" fill="var(--muted)" font-size="12"
        font-family="var(--font-mono)" text-anchor="middle">tech:port</text>
</g>
```

## Arrow labels — always mask, always with margin

Every arrow label needs an opaque rect behind it. Without one it bleeds through the line. **And the label must sit with a visible gap above the connector — never on top of it.**

```svg
<!-- 16px mask for 12px text, its bottom edge 16px clear of the stroke at ARROW_Y. -->
<rect x="MID_X-24" y="ARROW_Y-32" width="48" height="16" rx="2" fill="var(--paper)"/>
<text x="MID_X" y="ARROW_Y-20" fill="var(--muted)" font-size="12"
      font-family="var(--font-mono)" text-anchor="middle" letter-spacing="0.06em">WRITE</text>
```

Rules:

- ≤14 characters, all-caps, centered on segment midpoint.
- **Mandatory 6–10px gap** between the bottom of the mask rect and the arrow stroke. The connector must remain visible — a label that hides its own arrow is a hard fail.
- Never `writing-mode` vertical.
- For vertical segments, place the label to the side (not on the line) with the same 6–10px horizontal gap.

## Legend — horizontal strip at the bottom

**Never put the legend inside the diagram area.** Place as a horizontal strip after all nodes, with a hairline separator:

```svg
<line x1="32" y1="LEGEND_Y-16" x2="VIEWBOX_W-32" y2="LEGEND_Y-16"
      stroke="var(--rule)" stroke-width="1"/>
<!-- Items — horizontal row, ~192px apart. Each key repeats the shape cue it
     explains (rx, dash), so the legend works in greyscale. -->
<rect x="32" y="LEGEND_Y" width="16" height="16" rx="0" fill="none" stroke="var(--cat-1)" stroke-width="1.2"/>
<text x="60" y="LEGEND_Y+15" fill="var(--muted)" font-size="12"
      font-family="var(--font-mono)">Square = pipeline</text>
```

Expand SVG `viewBox` height by ~64px.

## Accessible SVG contract

SKILL.md §12 lists these six points one line each; this is the long form.

Every diagram is an accessible figure by default:

1. Its `<svg>` carries `role="img"` and `aria-labelledby` naming the diagram's `<title>` and `<desc>`.
2. `<title>` is the first child of `<svg>`, before `<defs>`. Assistive technology may ignore a title placed later.
3. The IDs are prefixed per diagram and variant: `<slug>-title` / `<slug>-desc`, where the slug matches the file (`loop`, `loop-dark`, `loop-full`). Bare `title` / `desc` IDs are banned — two inline diagrams would otherwise share one ID, and the second could be announced with the first's name.
4. `<title>` is the short name of the subject — roughly the page `<h1>`, and about 60 characters or fewer.
5. `<desc>` is one sentence stating what the diagram shows in terms a reader needs without the image. Describe the content, not the geometry: “Org chart showing a command center routing work to specialist agents and escalation owners,” not “A box at the top with five boxes below it.” A shape-by-shape narration is worse than no useful description.
6. Decorative-only SVG, such as the specimen glyphs in `assets/icons.html`, carries `aria-hidden="true"` instead.
