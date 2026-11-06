---
theme: node-ui
label: Node UI
mode: light
layout: columns
chrome: dot-grid
default: false
gallery: gallery/artdirected/28-*.html
---

# Node UI

Cards with tinted headers, key/value bodies, port handles, status pills, bezier connectors on a dot grid. It looks like a running application.

**Reach for it when:** Pipelines, data flows, anything where implying a real system helps.

> **Watch out:** Borrowed product chrome sets an expectation. A minimap on a static PNG is a small lie.

## Component choices

This theme is a set of choices from [`../components/`](../components/). Those
are the parts; this is one assembly of them.

| Component | Choice |
|---|---|
| node style | `elevated` |
| connector | `bezier` |
| elevation | `2` |
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
| `ground` | `#faf8f5` |
| `surface` | `#ffffff` |
| `ink` | `#231f1a` |
| `soft` | `#736a5f` |
| `accent` | `#a8442a` |
| `cat-1` | `#2f5d6b` |
| `cat-2` | `#a8442a` |
| `cat-3` | `#3f6b46` |
| `rule` | `#e4ded4` |
