# Layout grid, per-type budgets, page layout, and summary cards

Routed from SKILL.md §7 and §8. SKILL.md keeps the grid rule in one line, the universal complexity limits, and the split rule. This file holds the full grid table, every per-type budget row, the page layout, and the summary card pattern.

## Layout & Spacing

### 4px grid

**Structural geometry, divisible by 4:** node origins, widths, heights, gaps, padding. Off-grid by design: type sizes (role ramp in `references/output-spec.md`, floored at 12px rendered in this fork — accessibility.md A5), radii, data-derived positions, text baselines, arrow markers, `.5` offsets that keep 1px strokes crisp, stroke widths, opacity, and the 22×22 dot-pattern.

| Category | Allowed values |
|---|---|
| Node width / height | 80, 96, 112, 120, 128, 140, 144, 160, 180, 200, 240, 320 |
| Gap between nodes | 20, 24, 32, 40, 48 |
| Padding inside boxes | 8, 12, 16 |
| Border radius | 4, 6, 8 |

### Complexity budget (per diagram)

These are the per-type limits. The universal rows in SKILL.md §7 (9 nodes, 12 arrows or transitions, 2 coral elements, 2 annotation callouts, and the motion limits) apply to every type on top of these, and a semantic pattern's own budget in [semantic-patterns.md](semantic-patterns.md) can only tighten them.

| Limit | Rule |
|---|---|
| Max lifelines (sequence) | 5 |
| Max combined fragments (sequence) | 1 (default); 2 only if each is single-region `opt`/`loop` |
| Max `alt` regions (sequence) | 2 |
| Max fragment nesting (sequence) | 1 |
| Max lanes (swimlane) | 5 |
| Max items (quadrant) | 12 |
| Max entities (ER) | 8 |
| Max nesting levels (nested) | 6 |
| Max tree depth | 4 |
| Max org chart depth | 4 |
| Max org chart nodes | 12 |
| Max layers (layer stack) | 6 |
| Max circles (venn) | 3 |
| Max layers (pyramid) | 6 |
| Max radar axes | 5 |
| Max radar series | 5 |
| Max focal radar series | 1 |
| Max polar categories | 8 |
| Max polar series | 1 |
| Max focal polar categories | 1 |
| Max bars (bar chart) | 8 |
| Max bars (waterfall) | 8 incl. totals, 1 subtotal |
| Max cells (treemap) | 8 |
| Max series (line chart) | 5 |
| Max tasks (Gantt) | 12 |
| Max points (scatter plot) | 30 |
| Max stages / nodes / flows (sankey) | 3 / 8 / 12 |
| Max categories (fishbone) | 6 bones, 3 sub-causes each |
| Max components / links (wardley) | 9 / 12, 2 movement arrows |
| Max columns / cards (kanban) | 5 / 12 total, 4 per column |
| Max stages / rows (user journey) | 6 / 3, 2 pain markers |
| Max zones / nodes / paths (deployment) | 3 / 6 / 8, 9 artifacts |
| Max nodes / edges (dependency) | 9 / 14, 4 ranks, 1 cycle |
| Max classes / relationships (UML class) | 7 / 8, 5 members per compartment |
| Max activities / slices / cards (story map) | 5 / 3 / 12 |
| Max tables / columns / FKs (db schema) | 5 / 8 shown / 6 |

If you exceed, split into two diagrams (overview + detail).

### Placement recipe — before any coordinates

Adapted from Archify's authoring defaults. Decide these in order, then write the
coordinates into the source (`diagram-source.md`):

1. **Find the main path** — the journey the diagram exists to show. Lay it on one
   axis (left→right, or top→bottom for a stack) with nothing between its nodes.
2. **Classify every other edge** before placing its node:
   - *branch / store* — hangs off the main path to one side;
   - *return* — runs back against the main direction, routed around the outside,
     dashed if async;
   - *second entrance* — another way in; enters from the side the main entrance
     doesn't use;
   - *fan-out* — one node to several; the targets sit in a row or column so their
     lines spread from one side.
3. **Budget each gap from what crosses it.** A gap that carries a labelled line is
   at least that label's mask plus 8px: `label_mask_width(label) + 8`. A 4-letter
   label needs ~52px; the 14-character maximum needs ~132px. An unlabelled gap
   needs 32px or more (16px minimum segment each side of a corner).
4. **Size a fan-out side for its lines:** a side carrying N attach points is at
   least `2 × 16 + 12 × (N − 1)` px (16px corner gutters, 12px between points).
5. **Size every box from its text** (below), then snap up to the grid.

### Layout rules the source validator enforces

`diagram_source.py` checks these on the source, before anything is drawn.

| Rule | Error | Warning |
|---|---|---|
| **Text fit.** A box node's label (16px sans 600), sublabel and tag (12px mono) fit its width minus 8px each side. Width is estimated per character: wide/full-width characters 1em, otherwise 0.64em (sans 600), 0.60em (sans), 0.62em (mono), plus tracking. | `text-fit` — the fix names the box width needed | |
| **Label placement.** An arrow label's mask (`label_mask_width`, 16px tall at `label_at`) never overlaps any node, and keeps 6–16px from its own line. | `label-on-node`, `label-on-line` | `label-gap` |
| **Segment floor.** Every segment of a route is 16px or longer — an 8px corner radius and an 8px arrowhead each need room. | `short-segment` | |
| **Attach points.** Lines sharing one side of a box are 12px or more apart, and leave in the same order as where they go, so they don't cross at the box. | `attach-collision` (under 8px) | `attach-spacing`, `attach-order` |
| **Directness.** A route longer than 2.5× the direct distance + 200px, or with more than 3 bends, is a review signal. One crossing costs about as much as three bends. | | `detour`, `bends` |

Text width is an estimate, wide on purpose; `check.py`'s browser gate measures
the real rendered text afterwards. When the two disagree, the browser wins.

### Page layout

1. **Header** — eyebrow (brand mono), title (brand display face), optional subtitle (brand sans, `muted`).
2. **Diagram container** — default: **clean, borderless**, no background — the SVG sits directly on the page paper. Optional *framed* variant (for card-heavy layouts or hero placements): `paper-2` bg + 1px `rule` border + 8px radius + `1.5rem` padding + `overflow-x: auto`.
3. **Summary cards** — 2–3 col grid with *varied* widths (e.g., `1.1fr 1fr 0.9fr`).
4. **Prose alternative** — the required `<details class="diagram-alt">` block (accessibility.md A4). The templates carry the slot.
5. **Footer** — colophon in brand mono, `muted`, hairline top border.

## Summary Card Pattern

Don't use 3 identical generic cards. Vary the treatment:

```html
<div class="card">
  <p class="eyebrow">SECTION LABEL</p>
  <div class="card-header">
    <span class="card-dot coral"></span>
    <h3>Card Title</h3>
  </div>
  <ul><li>Item</li></ul>
</div>
```

Rules:

- `background: var(--paper-2)` (not `paper` — slight lift without shadow)
- `border: 1px solid var(--rule)`
- `border-radius: 6px`, `padding: 1.25rem`
- **No `box-shadow`**
- Card dots: 7px, `border-radius: 50%` — `ink` / `muted` / `accent` / `link` / `soft` variants. A dot is a colour-only cue, so the card's heading must name what the colour means (A1).
