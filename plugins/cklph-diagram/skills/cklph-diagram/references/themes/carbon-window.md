---
theme: carbon-window
label: Carbon Window
mode: dark
layout: columns
chrome: window
default: false
---

# Carbon Window

The macOS window chrome plus padded ground that Carbon popularised and every screenshot tool now replicates. A padding ring makes the diagram read as an embedded artifact rather than a hole punched in the page.

**Reach for it when:** Social cards, dev-blog headers, anything posted to a feed. Pair with a light host page; skip it if your page already wraps images in a card, since two layers of depth compete.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `10` |
| `stroke` | `1.2` |
| `chrome` | `window` |
| `layout` | `columns` |
| `air` | `1.2` (whitespace multiplier) |
| `tracking` | `0` |

## Type

| Role | Family |
|---|---|
| `font-display` | `ui-monospace, monospace` |
| `font-body` | `'Inter', system-ui, sans-serif` |
| `font-mono` | `ui-monospace, monospace` |

## Fallback palette

Used **only when no brand is resolved**. When a client brand is set, the brand's
colours win and only the geometry and type above apply.

| Role | Value |
|---|---|
| `ground` | `#2b2f3a` |
| `surface` | `#1b1e26` |
| `ink` | `#e6e6e6` |
| `soft` | `#a6adba` |
| `accent` | `#f08a4b` |
| `cat-1` | `#7fb3d5` |
| `cat-2` | `#f08a4b` |
| `cat-3` | `#a3c9a8` |
| `rule` | `#3c414d` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
