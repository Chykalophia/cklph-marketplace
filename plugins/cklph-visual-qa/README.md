# cklph-visual-qa

Verify a rendered web page **visually** against a design — not by reading the data, by looking at the
pixels. Framework-agnostic (any URL); pairs with `cklph-figma` for the design reference.

## What this is

The screenshot-compare discipline distilled from matching designs pixel-for-pixel: capture with
headless Chrome, crop with ImageMagick, compare side by side, iterate. Plus the traps that make people
chase phantoms (Chrome's 500px window clamp, CDN cache, CSS-load races).

## What's inside

| Item | Trigger / role |
|---|---|
| `visual-verify` (skill) | After any UI/styling change; matching a design pixel-for-pixel; proving "it should look like X". |
| `design-lint` (skill) | Before a release or hand-off, or as a CI gate on a preview URL: runs the `impeccable` detector and Hallmark's page checker (both pinned, no AI model) at four widths, applies the site's design exceptions and triages what is left. Needs Node, git and Chrome. |
| `visual-reviewer` (agent) | Adversarial pass — assumes the page does NOT match until pixels prove it; returns a ranked delta list. Also runs a page-shape review with no design: hero fit, sideways scroll, capped width, section count, words per screen, how the page ends. |
| `scripts/hallmark-lint` | `hallmark-lint <url> [--json] [--exceptions <file>] [--out <dir>]`: Hallmark's `sloplint` render tier at a pinned commit, filtered through the site's exceptions. Fetches Hallmark's scripts and `puppeteer-core` into `~/.cache/cklph-visual-qa` the first time. |
| `scripts/lint-filter.mjs` | Applies `.cklph/design-exceptions.json` to impeccable or Hallmark JSON and sorts the rest into "check", "taste" and "excused". |
| `scripts/shot` | `shot <url> <out> [WxH] [scale]`, `shot crop <in> <out> WxH+X+Y [pct]`, `shot probe` (prints the overflow-probe script; flags elements past either viewport edge). |

Capturing needs Google Chrome/Chromium (override with `CKLPH_CHROME`); `crop` needs ImageMagick
(`magick`); `probe` needs neither.

`shot` is not logged in to anything, so it can only capture pages a logged-out visitor can load: no
drafts, no `?preview=true`. Point it at a published (staging) URL.

### Running `shot` (PATH)

The skill and agent call `"${CLAUDE_PLUGIN_ROOT}/scripts/shot"`. Other plugins (`cklph-figma-to-wp`) and
your own shell call bare `shot`, which needs this plugin's `scripts/` on PATH, once:

```bash
export PATH="<cklph-visual-qa plugin dir>/scripts:$PATH"
```

## The trap to remember

Headless Chrome clamps its window to ~500px minimum — a "375px" shot renders at 500px and shows only
the left 375px (looks like overflow, isn't). Verify mobile at **500px** and inject the `shot probe`
script (real `clientWidth` + offending elements) before chasing it. Details: `visual-verify`.

## Design exceptions

A site's deliberate brand choices (an eyebrow label, an italic serif headline) look like "AI slop" to
both detectors. List them once in `.cklph/design-exceptions.json` at the site's repo root, each with a
reason, and both detectors report them as excused instead of as findings. Format: `design-lint`.

## Composes with

- **cklph-figma** (design reference), **cklph-elementor** / any builder (the thing under test),
  **cklph-figma-to-wp** (the orchestrator's verify step).
