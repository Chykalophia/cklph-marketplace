---
theme: paper-blueprint
label: Paper Blueprint
mode: light
layout: columns
chrome: none
default: false
---

# Paper Blueprint

Drafting-table register: hairlines, mono labels, graphite and one ink-blue. Reads as documentation rather than marketing.

**Reach for it when:** Infrastructure, schemas, engineering handoffs.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `0` |
| `stroke` | `1` |
| `chrome` | `none` |
| `layout` | `columns` |
| `air` | `1.0` (whitespace multiplier) |
| `tracking` | `0.04em` |

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
| `ground` | `#f6f6f3` |
| `surface` | `#eef1f2` |
| `ink` | `#1c2124` |
| `soft` | `#55606b` |
| `accent` | `#1c5a80` |
| `cat-1` | `#1c5a80` |
| `cat-2` | `#6b4f2a` |
| `cat-3` | `#3f5a3a` |
| `rule` | `#b9c2c7` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
