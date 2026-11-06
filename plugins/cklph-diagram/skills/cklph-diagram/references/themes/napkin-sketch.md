---
theme: napkin-sketch
label: Napkin Sketch
mode: light
layout: columns
chrome: sketch
default: false
---

# Napkin Sketch

Hand-drawn wobble, Excalidraw-style. The wobble is a communication choice, not decoration: it signals 'this is a sketch, not the final answer', which keeps a conversation open. Polished diagrams pretend to be more decided than they are.

**Reach for it when:** Early-stage thinking, discovery workshops, anything you want critiqued rather than approved. Never for a final client deliverable.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `6` |
| `stroke` | `2` |
| `chrome` | `sketch` |
| `layout` | `columns` |
| `air` | `1.15` (whitespace multiplier) |
| `tracking` | `0` |

## Type

| Role | Family |
|---|---|
| `font-display` | `'Comic Neue', 'Segoe Print', cursive` |
| `font-body` | `'Inter', system-ui, sans-serif` |
| `font-mono` | `ui-monospace, monospace` |

## Fallback palette

Used **only when no brand is resolved**. When a client brand is set, the brand's
colours win and only the geometry and type above apply.

| Role | Value |
|---|---|
| `ground` | `#fdfcf7` |
| `surface` | `#ffffff` |
| `ink` | `#1e1e1e` |
| `soft` | `#5a5a5a` |
| `accent` | `#c2410c` |
| `cat-1` | `#1d4ed8` |
| `cat-2` | `#c2410c` |
| `cat-3` | `#15803d` |
| `rule` | `#b8b5ad` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
