---
brand: _default
label: Neutral editorial
status: live
aliases: [neutral, unbranded, house-neutral]
source: adapted from upstream diagram-design default skin, re-tuned to the 12px floor and AA contrast
---

# Neutral editorial — fallback tokens

Loaded only when a diagram is explicitly unbranded (a public blog post, a
generic explainer, an internal sketch). **A named client never lands here** —
see [`SKILL.md` § 0](../../SKILL.md), which stops rather than falling back.

Kept deliberately quiet so nobody mistakes it for a brand.

## Core

| Role | Light | Dark |
|---|---|---|
| `paper` | `#f7f5f2` | `#1a1917` |
| `paper-2` | `#efece7` | `#26241f` |
| `ink` | `#1c1917` | `#f7f5f2` |
| `ink-2` | `#3f4a5a` | `#c8d2e0` |
| `muted` | `#4a4642` | `#a8a29b` |
| `soft` | `#6b6660` | `#c9c4bd` |
| `rule` | `rgba(28,25,23,0.14)` | `rgba(247,245,242,0.16)` |
| `rule-solid` | `#8d877f` | `#6f6a63` |
| `accent` | `#a8452a` | `#e08a6a` |
| `accent-tint` | `rgba(168,69,42,0.08)` | `rgba(224,138,106,0.14)` |
| `link` | `#2d5578` | `#8fb4d6` |

## Categorical scale

| Token | Light | Dark | Paired shape cue |
|---|---|---|---|
| `cat-1` | `#3f4a5a` | `#c8d2e0` | square corner (`rx=0`) |
| `cat-2` | `#7a5a2a` | `#d9b478` | rounded corner (`rx=6`) |
| `cat-3` | `#2d5578` | `#8fb4d6` | double hairline border |
| `cat-4` | `#8a3a24` | `#e08a6a` | dashed border `4,3` |
| `cat-5` | `#55524d` | `#c9c4bd` | notched top-left corner |

## Sequential scale

| Step | Light | Dark |
|---|---|---|
| `seq-1` | `#eef2f6` | `#22303f` |
| `seq-2` | `#cbdae8` | `#33506a` |
| `seq-3` | `#a3b8cd` | `#4f7396` |
| `seq-4` | `#6f8aa8` | `#7f9bb8` |
| `seq-5` | `#42607f` | `#b3c6d8` |
| `seq-6` | `#22384f` | `#e2eaf2` |

## Diverging scale

| Step | Light | Dark |
|---|---|---|
| `div-neg-2` | `#8a3a24` | `#e08a6a` |
| `div-neg-1` | `#c07a5e` | `#a8543a` |
| `div-mid` | `#efece7` | `#4a4642` |
| `div-pos-1` | `#7f97b3` | `#6f90b0` |
| `div-pos-2` | `#2b3f57` | `#c8d8e8` |

## Typography

| Role | Family | Size | Weight |
|---|---|---|---|
| `title` | Instrument Serif, Georgia, serif | 28px | 400 |
| `node-name` | Geist, system-ui, sans-serif | 16px | 600 |
| `sublabel` | Geist Mono, monospace | 12px | 400 |
| `eyebrow` | Geist Mono, monospace | 12px | 500, tracked 0.16em |
| `arrow-label` | Geist Mono, monospace | 12px | 400, tracked 0.06em |
| `callout` | Instrument Serif, Georgia, serif *italic* | 16px | 400 |

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
```

## Geometry

| Token | Value |
|---|---|
| `stroke-thin` | `0.8` |
| `stroke-default` | `1.2` |
| `stroke-strong` | `2` |
| `radius-sm` | `4` |
| `radius-md` | `8` |
| `radius-lg` | `12` |
| `grid` | `4` |
| `node-padding` | `16` |
| `line-height` | `1.5` |
