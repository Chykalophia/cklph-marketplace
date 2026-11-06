---
theme: swiss-signal
label: Swiss Signal
mode: light
layout: columns
chrome: none
default: false
---

# Swiss Signal

International Style discipline: strict grid, one red, flush-left everything. Predictable to the point of boring, which is the property that lowers cognitive load.

**Reach for it when:** Technical reference, documentation, print.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `0` |
| `stroke` | `2` |
| `chrome` | `none` |
| `layout` | `columns` |
| `air` | `0.95` (whitespace multiplier) |
| `tracking` | `-0.015em` |

## Type

| Role | Family |
|---|---|
| `font-display` | `'Helvetica Neue', Inter, sans-serif` |
| `font-body` | `'Helvetica Neue', Inter, sans-serif` |
| `font-mono` | `ui-monospace, monospace` |

## Fallback palette

Used **only when no brand is resolved**. When a client brand is set, the brand's
colours win and only the geometry and type above apply.

| Role | Value |
|---|---|
| `ground` | `#f7f7f5` |
| `surface` | `#f7f7f5` |
| `ink` | `#111111` |
| `soft` | `#4d4d4d` |
| `accent` | `#c1121f` |
| `cat-1` | `#111111` |
| `cat-2` | `#c1121f` |
| `cat-3` | `#3f5a8a` |
| `rule` | `#111111` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
