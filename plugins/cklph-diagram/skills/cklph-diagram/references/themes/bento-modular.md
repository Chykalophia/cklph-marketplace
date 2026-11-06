---
theme: bento-modular
label: Bento Modular
mode: light
layout: columns
chrome: none
default: false
---

# Bento Modular

Modular blocks with real separation. Each cell is one idea and the grid does the grouping, so borders don't have to.

**Reach for it when:** Product surfaces, dashboards, feature overviews.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `14` |
| `stroke` | `0` |
| `chrome` | `none` |
| `layout` | `columns` |
| `air` | `1.1` (whitespace multiplier) |
| `tracking` | `-0.01em` |

## Type

| Role | Family |
|---|---|
| `font-display` | `'Inter', system-ui, sans-serif` |
| `font-body` | `'Inter', system-ui, sans-serif` |
| `font-mono` | `ui-monospace, monospace` |

## Fallback palette

Used **only when no brand is resolved**. When a client brand is set, the brand's
colours win and only the geometry and type above apply.

| Role | Value |
|---|---|
| `ground` | `#f4f5f7` |
| `surface` | `#ffffff` |
| `ink` | `#16181d` |
| `soft` | `#575c66` |
| `accent` | `#1d4ed8` |
| `cat-1` | `#1d4ed8` |
| `cat-2` | `#0f766e` |
| `cat-3` | `#9a3412` |
| `rule` | `#dcdfe5` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
