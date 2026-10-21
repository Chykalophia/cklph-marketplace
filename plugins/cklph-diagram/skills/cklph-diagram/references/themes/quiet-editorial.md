---
theme: quiet-editorial
label: Quiet Editorial
mode: light
layout: columns
chrome: none
default: false
---

# Quiet Editorial

Neo-minimalism: warmth without noise. Serif display, deep whitespace, one accent.

**Reach for it when:** Long-form posts, whitepapers, anything where the diagram is the hero.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `4` |
| `stroke` | `1.2` |
| `chrome` | `none` |
| `layout` | `columns` |
| `air` | `1.0` (whitespace multiplier) |
| `tracking` | `0.02em` |

## Type

| Role | Family |
|---|---|
| `font-display` | `'Iowan Old Style', Georgia, serif` |
| `font-body` | `'Inter', system-ui, sans-serif` |
| `font-mono` | `ui-monospace, monospace` |

## Fallback palette

Used **only when no brand is resolved**. When a client brand is set, the brand's
colours win and only the geometry and type above apply.

| Role | Value |
|---|---|
| `ground` | `#faf8f4` |
| `surface` | `#f3efe8` |
| `ink` | `#1a1714` |
| `soft` | `#5c554c` |
| `accent` | `#8f3b1f` |
| `cat-1` | `#2f4858` |
| `cat-2` | `#7a5230` |
| `cat-3` | `#4a5340` |
| `rule` | `#d6cec1` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
