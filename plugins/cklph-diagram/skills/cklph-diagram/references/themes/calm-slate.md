---
theme: calm-slate
label: Calm Slate
mode: dark
layout: columns
chrome: none
default: false
---

# Calm Slate

Dark done for sensory comfort: never pure black, desaturated accents, low luminance step between surfaces. Dark that rests the eye instead of glowing at it.

**Reach for it when:** Dark-mode sites, long working sessions, evening reading.

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `8` |
| `stroke` | `1.2` |
| `chrome` | `none` |
| `layout` | `columns` |
| `air` | `1.1` (whitespace multiplier) |
| `tracking` | `0` |

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
| `ground` | `#16191d` |
| `surface` | `#1e2228` |
| `ink` | `#e8e6e1` |
| `soft` | `#a3a8b0` |
| `accent` | `#e8a33d` |
| `cat-1` | `#8fb8de` |
| `cat-2` | `#e8a33d` |
| `cat-3` | `#9fc6a0` |
| `rule` | `#333940` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
