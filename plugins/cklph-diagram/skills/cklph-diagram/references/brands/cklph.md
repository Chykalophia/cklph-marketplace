---
brand: cklph
label: Chykalophia
status: live
aliases: [chykalophia, chykalophia.com, cklph, internal, default]
source: extracted from chykalophia.com compiled CSS custom properties, 2026-08-12
---

# Chykalophia — brand tokens

The house skin. Loaded whenever no client is named. Derived from the live
`--color-*` custom properties on chykalophia.com, so these are the real brand
values rather than a guess at them.

Per [`design-thesis.md`](../design-thesis.md), vibrancy here means **hue
variety inside a controlled warm palette** — navy, teal, crimson, gold, cream —
at mid saturation, with generous whitespace. Not more saturation, not gradients,
not more elements.

## Core

| Role | Light | Dark | Provenance |
|---|---|---|---|
| `paper` | `#fafaf7` | `#111010` | `--color-background` / `--color-neutral-950` |
| `paper-2` | `#f1f8fa` | `#12243f` | `--color-primary-50` / `--color-primary-800` |
| `ink` | `#111010` | `#fafaf7` | `--color-neutral-950` |
| `ink-2` | `#1f3658` | `#dff0f3` | `--color-primary-500` |
| `muted` | `#444446` | `#a3a4a8` | `--color-neutral-700` / `-400` |
| `soft` | `#717276` | `#d2d3d5` | `--color-neutral-500` / `-300` |
| `rule` | `rgba(17,16,16,0.14)` | `rgba(250,250,247,0.16)` | derived from `ink` |
| `rule-solid` | `#82838a` | `#6b6c70` | `--color-neutral-300` |
| `accent` | `#ab132a` | `#dd7e80` | `--color-coral-500` / `-300` |
| `accent-tint` | `rgba(171,19,42,0.08)` | `rgba(221,126,128,0.14)` | derived |
| `link` | `#1e465a` | `#7fa9b8` | `--color-primary-400` / `-300` |

`accent` is the focal signal: 1–2 elements per diagram, never a category system.
`ink-2` is the second structural ink — it carries hue variety without competing
with `accent` for focus.

## Categorical scale

For encoding **kind**, never magnitude. Every category must also carry a
non-colour cue (shape, border weight, pattern, or direct label) —
see [`accessibility.md`](../accessibility.md) rule A1.

| Token | Light | Dark | Paired shape cue |
|---|---|---|---|
| `cat-1` | `#1f3658` | `#bcdce2` | square corner (`rx=0`) |
| `cat-2` | `#92511a` | `#f5b35a` | rounded corner (`rx=6`) |
| `cat-3` | `#1e465a` | `#7fa9b8` | double hairline border |
| `cat-4` | `#850e21` | `#dd7e80` | dashed border `4,3` |
| `cat-5` | `#5a5b5e` | `#d2d3d5` | notched top-left corner |

Five is the ceiling. A sixth category means the diagram is doing two jobs —
split it.

## Sequential scale

For encoding **magnitude**. Monotonic in lightness, so it survives greyscale
printing and most colour-vision differences.

| Step | Light | Dark |
|---|---|---|
| `seq-1` | `#e2f1f4` | `#12243f` |
| `seq-2` | `#bcdce2` | `#1e465a` |
| `seq-3` | `#8fbcc9` | `#2f6a80` |
| `seq-4` | `#4f8296` | `#7fa9b8` |
| `seq-5` | `#1e465a` | `#bcdce2` |
| `seq-6` | `#09182f` | `#eaf6f8` |

Label the endpoints. A sequential ramp with no scale is decoration.

## Diverging scale

For values with a meaningful midpoint (variance to plan, sentiment, delta).

| Step | Light | Dark |
|---|---|---|
| `div-neg-2` | `#850e21` | `#dd7e80` |
| `div-neg-1` | `#c4636e` | `#a5424d` |
| `div-mid` | `#f2ead2` | `#444446` |
| `div-pos-1` | `#6f9aab` | `#5a8a9e` |
| `div-pos-2` | `#1f3658` | `#bcdce2` |

## Typography

| Role | Family | Size | Weight |
|---|---|---|---|
| `title` | The Silver Editorial, Georgia, serif | 28px | 400 |
| `node-name` | Public Sans, system-ui, sans-serif | 16px | 600 |
| `sublabel` | JetBrains Mono, monospace | 12px | 400 |
| `eyebrow` | JetBrains Mono, monospace | 12px | 500, tracked 0.16em |
| `arrow-label` | JetBrains Mono, monospace | 12px | 400, tracked 0.06em |
| `callout` | The Silver Editorial, Georgia, serif *italic* | 16px | 400 |

Sizes are the **12px floor** ramp described in
[`accessibility.md`](../accessibility.md) rule A5 — upstream's 7–9px mono labels
do not survive a projector or a 60-year-old donor's eyes.

> Upstream lists JetBrains Mono as an anti-pattern ("blanket dev font"). CKLPH's
> actual brand mono *is* JetBrains Mono, so the fork keeps it and narrows the
> rule to what it was really about: **mono is for technical content only** —
> ports, URLs, field types, arrow labels. Human-readable names go in Public Sans.

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
```

The Silver Editorial is a licensed face and is not on Google Fonts. Fall back to
Georgia for anything leaving the CKLPH machine.

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
