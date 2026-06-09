# cklph-elementor

Read and write Elementor pages and templates **programmatically** — from outside the editor. Builds on
`cklph-wp` for transport; pairs with `cklph-visual-qa` for verification.

## What this is

The Elementor data + styling layer, distilled from matching real Figma designs pixel-for-pixel. It
encodes the `_elementor_data` model and the styling/responsive quirks that silently swallow changes —
container vs widget `custom_css`, variable-driven flex gaps, inner-margin spacing, nested-container
padding, flexslider, nav-menu collapse, the Kit globals.

## What's inside (v0.1.0)

| Skill | Trigger |
|---|---|
| `elementor-data` | Editing/generating `_elementor_data`; a written layout didn't render. |
| `elementor-styling` | A style change didn't take effect; matching a design pixel-for-pixel. References `css-gotchas.md`. |
| `elementor-templates` | Editing a header/footer/single template; template change not appearing; brand colors/type (the Kit). |
| `elementor-responsive` | Broken/cramped at tablet/mobile; overflow; header/footer not adapting. |

**Script:** `scripts/el-tools.py` — `validate`, `tree`, `widgets`, `add-style` (inject the reliable
html-widget `<style>` channel). Pairs with `cwp meta-read`/`meta-write` for transport.

## The core loop

```
cwp meta-read <id> _elementor_data raw.txt
el-tools.py tree raw.txt            # learn the site's conventions
# generate/patch -> new.json
el-tools.py validate new.json
cwp meta-write <id> _elementor_data new.json
cwp wp elementor flush-css          # regenerate CSS
# then VERIFY VISUALLY (cklph-visual-qa) — trust pixels, not the JSON
```

## Composes with

- **cklph-wp** (required transport), **cklph-figma** (source design), **cklph-visual-qa** (verify),
  **cklph-figma-to-wp** (the orchestrator that ties it together).
