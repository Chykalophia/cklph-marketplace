---
theme: canvas-cards
label: Canvas Cards
mode: light
layout: columns
chrome: dotgrid
default: false
---

# Canvas Cards

Infinite-canvas register — tldraw, Obsidian Canvas, Heptabase. Cards float on a dot grid, clean geometry, no heavy borders. Reads as thinking-in-progress that is still organised.

**Reach for it when:** Mind maps, knowledge maps, concept relationships, anything where spatial arrangement carries meaning.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `12` |
| `stroke` | `1` |
| `chrome` | `dotgrid` |
| `layout` | `columns` |
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
| `ground` | `#f8f9fa` |
| `surface` | `#ffffff` |
| `ink` | `#1a1d21` |
| `soft` | `#5b6169` |
| `accent` | `#6d28d9` |
| `cat-1` | `#0369a1` |
| `cat-2` | `#6d28d9` |
| `cat-3` | `#047857` |
| `rule` | `#d8dce1` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
