---
theme: dark-glass
label: Dark Glass
mode: dark
layout: columns
chrome: line-grid
default: false
gallery: gallery/artdirected/27-*.html
---

# Dark Glass

Near-black ground, hairline borders at 8–16% white, one radial wash behind the focal node, mono labels at tight tracking, grain over everything.

**Reach for it when:** Product marketing, launch pages, dev-tool docs. Highest expensive-signal per pixel.

> **Watch out:** Everything rides on one accent. A second saturated colour collapses it into a generic dark theme.

## Component choices

This theme is a set of choices from [`../components/`](../components/). Those
are the parts; this is one assembly of them.

| Component | Choice |
|---|---|
| node style | `glass` |
| connector | `dashed` |
| elevation | `1` |
| radius | `12` |
| ground | `line-grid` |

## Type

| Role | Family |
|---|---|
| `font-display` | `'Inter', sans-serif` |
| `font-body` | `'Inter', sans-serif` |
| `font-mono` | `ui-monospace, monospace` |

## Fallback palette

Used **only when no brand is resolved**. With a client brand set, brand colour
wins and only the geometry and type above apply.

| Role | Value |
|---|---|
| `ground` | `#08090a` |
| `surface` | `#111315` |
| `ink` | `#f2f3f4` |
| `soft` | `#9aa1a8` |
| `accent` | `#7b8cf0` |
| `cat-1` | `#5fb0d8` |
| `cat-2` | `#7b8cf0` |
| `cat-3` | `#79b79a` |
| `rule` | `#24282c` |
