---
theme: constellation
label: Constellation
mode: dark
layout: columns
chrome: off-black
default: false
gallery: gallery/artdirected/29-*.html
---

# Constellation

Dark field, nodes sized by centrality, edges at 10% opacity so density becomes shading, colour by cluster rather than category.

**Reach for it when:** Knowledge graphs, dependency maps, org networks — anything too dense for boxes.

> **Watch out:** A picture of shape, not of detail. Never ask a reader to trace a path through it — pair with a table.

## Component choices

This theme is a set of choices from [`../components/`](../components/). Those
are the parts; this is one assembly of them.

| Component | Choice |
|---|---|
| node style | `flat` |
| connector | `hairline` |
| elevation | `0` |
| radius | `999` |
| ground | `off-black` |

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
| `ground` | `#0b0e13` |
| `surface` | `#141a22` |
| `ink` | `#e8eef6` |
| `soft` | `#8f9bab` |
| `accent` | `#6f9bd8` |
| `cat-1` | `#6f9bd8` |
| `cat-2` | `#c98a5e` |
| `cat-3` | `#79b79a` |
| `rule` | `#232b36` |
