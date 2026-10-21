---
theme: muted-dopamine
label: Muted Dopamine
mode: light
layout: columns
chrome: none
default: true
---

# Muted Dopamine  **(default)**

Real hue variety and optimism, every colour darkened until it passes AA as text. The saturation revival made safe: colour that distinguishes categories instead of shouting.

**Reach for it when:** The house default. Client work, decks, anything that needs to look current without risking legibility.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `10` |
| `stroke` | `1.5` |
| `chrome` | `none` |
| `layout` | `columns` |
| `air` | `1.15` (whitespace multiplier) |
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
| `ground` | `#fbf7f2` |
| `surface` | `#ffffff` |
| `ink` | `#1d1a26` |
| `soft` | `#565064` |
| `accent` | `#b4245f` |
| `cat-1` | `#1f5f8b` |
| `cat-2` | `#b4245f` |
| `cat-3` | `#046a52` |
| `rule` | `#e0d8ce` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
