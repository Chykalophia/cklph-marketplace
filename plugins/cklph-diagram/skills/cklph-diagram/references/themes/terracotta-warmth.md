---
theme: terracotta-warmth
label: Terracotta Warmth
mode: light
layout: columns
chrome: none
default: false
---

# Terracotta Warmth

Neo-naturalism: clay, sage, bone. Earthy palettes read as grounded and calm. Warm without being beige.

**Reach for it when:** Wellness, non-profit, sustainability, human-centred work.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `12` |
| `stroke` | `1.2` |
| `chrome` | `none` |
| `layout` | `columns` |
| `air` | `1.1` (whitespace multiplier) |
| `tracking` | `0.01em` |

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
| `ground` | `#faf5ee` |
| `surface` | `#f2e9dd` |
| `ink` | `#2a201a` |
| `soft` | `#6b5c4e` |
| `accent` | `#a34a24` |
| `cat-1` | `#4a5d3a` |
| `cat-2` | `#a34a24` |
| `cat-3` | `#4e6472` |
| `rule` | `#ddd0be` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
