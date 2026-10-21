---
theme: radial-mind
label: Radial Mind
mode: light
layout: radial
chrome: none
default: false
---

# Radial Mind

Mind-map geometry: one centre, branches radiating out, thickness falling off with depth. The one theme that changes layout rather than only surface.

**Reach for it when:** Brainstorms, topic maps, scope breakdowns. Not for anything with a sequence — radial has no reading order, which is exactly what makes it wrong for process diagrams.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `16` |
| `stroke` | `1.5` |
| `chrome` | `none` |
| `layout` | `radial` |
| `air` | `1.2` (whitespace multiplier) |
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
| `ground` | `#fcfaf6` |
| `surface` | `#ffffff` |
| `ink` | `#201c18` |
| `soft` | `#5e564c` |
| `accent` | `#9d2f5f` |
| `cat-1` | `#2a6f8e` |
| `cat-2` | `#9d2f5f` |
| `cat-3` | `#5a7040` |
| `rule` | `#ded6c9` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
