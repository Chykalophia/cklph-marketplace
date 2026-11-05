---
brand: _template
label: TEMPLATE — copy me
status: stub
aliases: []
source: unfilled
---

# <Client name> — brand tokens

Copy this file to `<client-slug>.md`, fill every `TODO`, flip `status:` to
`live`, then run:

```bash
python scripts/brand-tokens.py <client-slug> --check
```

The loader refuses to render any brand whose `status` is `stub` or that still
contains a `TODO`. That refusal is the guardrail — it is what stops a
CKLPH-skinned diagram from shipping inside a client deliverable.

## Core

| Role | Light | Dark |
|---|---|---|
| `paper` | TODO | TODO |
| `paper-2` | TODO | TODO |
| `ink` | TODO | TODO |
| `ink-2` | TODO | TODO |
| `muted` | TODO | TODO |
| `soft` | TODO | TODO |
| `rule` | TODO | TODO |
| `rule-solid` | TODO | TODO |
| `accent` | TODO | TODO |
| `accent-tint` | TODO | TODO |
| `link` | TODO | TODO |

## Categorical scale

| Token | Light | Dark | Paired shape cue |
|---|---|---|---|
| `cat-1` | TODO | TODO | square corner (`rx=0`) |
| `cat-2` | TODO | TODO | rounded corner (`rx=6`) |
| `cat-3` | TODO | TODO | double hairline border |
| `cat-4` | TODO | TODO | dashed border `4,3` |
| `cat-5` | TODO | TODO | notched top-left corner |

## Sequential scale

| Step | Light | Dark |
|---|---|---|
| `seq-1` | TODO | TODO |
| `seq-2` | TODO | TODO |
| `seq-3` | TODO | TODO |
| `seq-4` | TODO | TODO |
| `seq-5` | TODO | TODO |
| `seq-6` | TODO | TODO |

## Diverging scale

| Step | Light | Dark |
|---|---|---|
| `div-neg-2` | TODO | TODO |
| `div-neg-1` | TODO | TODO |
| `div-mid` | TODO | TODO |
| `div-pos-1` | TODO | TODO |
| `div-pos-2` | TODO | TODO |

## Typography

| Role | Family | Size | Weight |
|---|---|---|---|
| `title` | TODO | 28px | 400 |
| `node-name` | TODO | 16px | 600 |
| `sublabel` | TODO | 12px | 400 |
| `eyebrow` | TODO | 12px | 500, tracked 0.16em |
| `arrow-label` | TODO | 12px | 400, tracked 0.06em |
| `callout` | TODO *italic* | 16px | 400 |

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
