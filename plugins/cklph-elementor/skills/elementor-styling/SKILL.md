---
name: elementor-styling
description: Style Elementor elements reliably from data — apply colors, typography, gaps, alignment, borders, and per-breakpoint CSS without fighting Elementor's quirks. Use when a styling change does not take effect, spacing or alignment is off, or you are matching a design pixel-for-pixel.
---

# elementor-styling — make CSS actually take effect

Elementor's settings + custom CSS have sharp edges that silently swallow changes. Know the channels
and the traps, or you'll set a value that never renders. Full detail: @references/css-gotchas.md.

## The reliable CSS channel: an html-widget `<style>`

Per-element **`custom_css` works for WIDGETS but NOT containers** (it just doesn't emit). The
channel that *always* works: drop one **html widget** carrying a scoped `<style>` (set the widget
itself `display:none`). Target elements by their stable id class `.elementor-element-<id>`.

```bash
el-tools.py add-style in.json out.json '@root' '.elementor-element-1ca2054b{--row-gap:12px!important}'
```

The `<style>` applies even though the widget is hidden. This is how you reach containers, pseudo-
elements, third-party widget internals, and per-breakpoint rules.

## Get the control name right — read the widget source

Guessing setting keys wastes time (they're often non-obvious: it's `button_bg_color`, not
`button_background_color`; `dropdown`, `alignment`, `layout`). Read the widget PHP and grep the
`add_control(` IDs:

```bash
cwp wp eval 'echo WP_PLUGIN_DIR;'    # -> /www/wp-content/plugins
cwp wp eval 'echo "";'  # then: ssh host "grep -nE \"add_control\(|'\''name'\'' =>\" /www/.../widgets/product-add-to-cart.php"
```

Global colors/typography reference via `settings.__globals__`, e.g.
`"__globals__": {"typography_typography": "globals/typography?id=0e3c4db"}` — never hardcode a hex
that the Kit already defines (see `elementor-templates`).

## Top traps (each cost real debugging)

- **Loose spacing between widgets is almost never the container gap** — it's the inner `<p>` /
  `.elementor-widget-container` **margins stacking on top of** the flex gap. Raising the gap makes it
  worse. Fix: zero the inner margins (`.elementor-element-X p{margin:0}`), then set the gap.
- **Flex gap is a CSS variable.** Containers render `gap: var(--row-gap) var(--column-gap)`. A plain
  `gap:Npx` may be overridden; set `--row-gap`/`--column-gap`. The native `gap` control value format
  is `{column,row,unit,isLinked}` (this site's version) — `{unit,size}` may be ignored.
- **Nested containers inherit the Kit's default container padding** (not shown in the element's
  settings), so deeper content indents progressively while sibling widgets sit at the edge → mismatched
  left edges. Fix with one rule over the subtree: `.elementor-element-<col> .e-con{padding-left:0!important;padding-right:0!important}`.
- **Rounded corners need `overflow:hidden`** — `border-radius` alone leaves a child's square
  background poking through the corner.
- **Theme/widget CSS beats your non-`!important` rule.** A WooCommerce add-to-cart widget styles
  `.cart button`, which also hits any button you inject inside the form. Scope tightly + `!important`.

## Verify visually, not by reading numbers
A setting that's "correct" in the data can still render wrong (cache, override, wrong channel). After
any styling change, **screenshot and compare** — see the `cklph-visual-qa` plugin. Don't trust the JSON; trust the pixels.
