---
theme: dark-node-ui
label: Dark Node UI
mode: dark
layout: columns
chrome: dot-grid
default: false
gallery: gallery/artdirected/43-*.html
---

# Dark Node UI

Linear's restraint with React Flow's node grammar: near-black ground, hairline borders, one indigo accent, card headers and port handles.

**Reach for it when:** Developer-facing product diagrams, dark docs, architecture in a dark deck.

> **Watch out:** Dark plus hairline borders is fragile in print and on projectors. Keep a light variant.

## Component choices

This theme is a set of choices from [`../components/`](../components/). Those
are the parts; this is one assembly of them.

| Component | Choice |
|---|---|
| node style | `ring` |
| connector | `bezier` |
| elevation | `1` |
| radius | `10` |
| ground | `dot-grid` |

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
