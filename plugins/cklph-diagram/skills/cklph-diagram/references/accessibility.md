# Accessibility — mechanical, not aspirational

Eight rules. Six of them are checked by `scripts/lint-a11y.py`, which fails the
build. The two that cannot be automated are marked **[human]** and belong on the
pre-output checklist in [`SKILL.md` § 9](../SKILL.md).

Run the linter before shipping anything:

```bash
python scripts/lint-a11y.py out/*.html --brand cklph
```

---

## A1 — Never encode by colour alone `[lint: partial]` `[human]`

Every colour distinction carries a redundant cue: **shape, pattern, border
weight, or a direct label.** The categorical scale in each brand file ships with
its shape pairing already assigned — `cat-1` is square-cornered, `cat-2` is
rounded, `cat-3` is double-hairline, and so on. Use the pairing; don't invent a
new one per diagram.

The linter checks the mechanical half: if a diagram uses more than one `cat-*`
token, it must also vary `rx`, `stroke-width`, or `stroke-dasharray` across
those elements. Whether the cue is *legible* is a human call.

Roughly 1 in 12 men has a colour-vision difference. A red/green status pair with
no second cue is invisible to them, and it is invisible in greyscale print, and
it is invisible on a bad projector. Same fix covers all three.

## A2 — AA contrast at the sizes actually used `[lint]`

Diagram text is small text. WCAG's 3:1 large-text allowance applies at 18pt
(24px) regular or 14pt (18.66px) bold — almost nothing in a diagram qualifies.
**Assume 4.5:1 unless the linter says otherwise.**

Checked pairs, per brand, in both light and dark:

- `ink` on `paper`, `ink` on `paper-2`
- `muted` on `paper`, `soft` on `paper`
- `accent` on `paper`, `accent` on `accent-tint`
- every `cat-*` on `paper`
- `link` on `paper`
- `rule-solid` on `paper` at 3:1 (non-text contrast, WCAG 1.4.11)

Hairlines and borders are non-text: they need 3:1, not 4.5:1. The linter applies
the right threshold per role rather than one blanket number.

## A3 — SVG semantics `[lint]`

Inherited from upstream and kept as-is, because it was already right:

1. `<svg>` carries `role="img"` and `aria-labelledby`.
2. `<title>` is the **first child** of `<svg>`, before `<defs>`.
3. IDs are prefixed per diagram *and* variant — `arch-cklph-title`, never bare
   `title`. Two inline diagrams with bare IDs will announce the wrong name.
4. `<title>` ≤ 60 chars, the subject's name.
5. `<desc>` states what the diagram *shows*, in content terms — "Order pipeline
   routing paid orders to fulfilment with a manual review branch", not "a box at
   the top with five boxes below it." Shape-by-shape narration is worse than
   nothing.
6. Decorative marks carry `aria-hidden="true"` instead.

## A4 — Text alternative `[lint]`

Every generated diagram ships with a prose description block alongside the
figure — not only inside `<desc>`. See
[`prose-alternative.md`](prose-alternative.md) for the required shape.

`<desc>` is one sentence for a screen reader arriving at the figure. The prose
block is the diagram's content in linear form, for someone who cannot see it,
cannot load it, or is reading a printout. It also happens to be the only part of
a diagram a search engine or an LLM can index — which is why it earns its place
on a client site.

## A5 — Minimum rendered font size `[lint]`

**Floor: 12px rendered.** Not 12px in the `viewBox` — 12px on the reader's
screen, after the SVG has been scaled to its container.

This matters because an SVG with `viewBox="0 0 1200 700"` displayed at 600px
wide halves every font size. Upstream's 7–8px mono eyebrows become 3.5px. The
linter computes:

```
rendered_px = font_size × (declared_render_width ÷ viewBox_width)
```

and fails anything under 12. Declare the render width with
`data-render-width="720"` on the `<svg>`; the linter assumes 720 if absent.

12 rather than 11 because the 4px grid (§7) has no 11. The floor rounds up.

## A6 — `prefers-reduced-motion` `[lint]`

Any `<animate>`, `@keyframes`, or CSS `transition` must sit inside:

```css
@media (prefers-reduced-motion: no-preference) { … }
```

Static diagrams pass trivially. This rule exists so that the first person to add
a hover state doesn't quietly break it for someone with a vestibular disorder.

## A7 — `prefers-contrast: more` `[lint]`

Every diagram ships a high-contrast variant block:

```css
@media (prefers-contrast: more) {
  :root {
    --ink: #000;
    --muted: #000;
    --rule: rgba(0,0,0,0.55);
    --paper: #fff;
  }
}
```

Tokens are CSS custom properties precisely so this override is three lines
rather than a re-render.

## A8 — Focus order and visible focus ring `[human]`

Only applies if a diagram becomes interactive (clickable nodes, tooltips,
toggles). If it does:

- Focusable elements follow the reading order defined in
  [`cognitive-load.md`](cognitive-load.md) rule C2.
- The focus ring is visible against both `paper` and `accent-tint` — 2px solid
  `ink` with a 2px `paper` offset works against both.
- **Nothing is conveyed by hover alone** — see rule C8. Hover has no keyboard
  or touch equivalent.

---

## Why a linter and not a checklist

A checklist survives until the first deadline. Contrast ratios and rendered font
sizes are arithmetic, and arithmetic should not be a judgement call made at
11pm before a client review. The six mechanical rules are in
`scripts/lint-a11y.py`; wire it into CI and stop thinking about them.
