# cklph-visual-qa

Verify a rendered web page **visually** against a design — not by reading the data, by looking at the
pixels. Framework-agnostic (any URL); pairs with `cklph-figma` for the design reference.

## What this is

The screenshot-compare discipline distilled from matching designs pixel-for-pixel: capture with
headless Chrome, crop with ImageMagick, compare side by side, iterate. Plus the traps that make people
chase phantoms (Chrome's 500px window clamp, CDN cache, CSS-load races).

## What's inside (v0.1.0)

| Item | Trigger / role |
|---|---|
| `visual-verify` (skill) | After any UI/styling change; matching a design pixel-for-pixel; proving "it should look like X". |
| `visual-reviewer` (agent) | Adversarial pass — assumes the page does NOT match until pixels prove it; returns a ranked delta list. |
| `scripts/shot` | `shot <url> <out> [WxH] [scale]`, `shot crop <in> <out> WxH+X+Y [pct]`, `shot probe <url> [w]`. |

Requires Google Chrome/Chromium and ImageMagick (`magick`). Override the browser with `CKLPH_CHROME`.

## The trap to remember

Headless Chrome clamps its window to ~500px minimum — a "375px" shot renders at 500px and shows only
the left 375px (looks like overflow, isn't). Verify mobile at **500px** and use `shot probe` (real
`clientWidth` + offending elements) before chasing it.

## Composes with

- **cklph-figma** (design reference), **cklph-elementor** / any builder (the thing under test),
  **cklph-figma-to-wp** (the orchestrator's verify step).
