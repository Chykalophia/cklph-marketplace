---
theme: high-contrast-focus
label: High-Contrast Focus
mode: light
layout: columns
chrome: none
default: false
---

# High-Contrast Focus

Maximum legibility as the aesthetic. Near-monochrome, oversized type, heavy separation.

**Reach for it when:** Bad projectors, grey photocopies, tired readers, accessibility escalations. The one to switch to when someone says they can't read it.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `0` |
| `stroke` | `2.5` |
| `chrome` | `none` |
| `layout` | `columns` |
| `air` | `1.25` (whitespace multiplier) |
| `tracking` | `0.01em` |

## Type

| Role | Family |
|---|---|
| `font-display` | `'Atkinson Hyperlegible', Inter, sans-serif` |
| `font-body` | `'Atkinson Hyperlegible', Inter, sans-serif` |
| `font-mono` | `ui-monospace, monospace` |

## Fallback palette

Used **only when no brand is resolved**. When a client brand is set, the brand's
colours win and only the geometry and type above apply.

| Role | Value |
|---|---|
| `ground` | `#fffef9` |
| `surface` | `#fffef9` |
| `ink` | `#000000` |
| `soft` | `#2b2b2b` |
| `accent` | `#0000cc` |
| `cat-1` | `#000000` |
| `cat-2` | `#0000cc` |
| `cat-3` | `#7a0000` |
| `rule` | `#000000` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
