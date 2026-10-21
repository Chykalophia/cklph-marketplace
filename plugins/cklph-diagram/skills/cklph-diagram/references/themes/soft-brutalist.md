---
theme: soft-brutalist
label: Soft Brutalist
mode: light
layout: columns
chrome: none
default: false
---

# Soft Brutalist

Minimalism that grew a spine. Thick flat borders, no shadows, confident type. Structure visible from across the room.

**Reach for it when:** Conference slides, posters, anything projected.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `2` |
| `stroke` | `3` |
| `chrome` | `none` |
| `layout` | `columns` |
| `air` | `1.05` (whitespace multiplier) |
| `tracking` | `-0.02em` |

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
| `ground` | `#fbf9f2` |
| `surface` | `#ffffff` |
| `ink` | `#141414` |
| `soft` | `#4a4a4a` |
| `accent` | `#7c3aed` |
| `cat-1` | `#141414` |
| `cat-2` | `#7c3aed` |
| `cat-3` | `#116149` |
| `rule` | `#141414` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
