---
theme: sage-archive
label: Sage Archive
mode: light
layout: columns
chrome: none
default: false
---

# Sage Archive

Library register: muted greens, bone ground, restrained serif. Minimal that isn't beige.

**Reach for it when:** Research, knowledge bases, internal wikis.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `6` |
| `stroke` | `1.2` |
| `chrome` | `none` |
| `layout` | `columns` |
| `air` | `1.05` (whitespace multiplier) |
| `tracking` | `0.015em` |

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
| `ground` | `#f7f7f1` |
| `surface` | `#eceee4` |
| `ink` | `#1f241d` |
| `soft` | `#576052` |
| `accent` | `#7a4230` |
| `cat-1` | `#3c5348` |
| `cat-2` | `#7a4230` |
| `cat-3` | `#4a5570` |
| `rule` | `#ccd1c4` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
