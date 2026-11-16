# figma-audit rules

The rules live in `scripts/figma-audit-rules.mjs`. This page says what each one catches, how it is
grouped in the report, and what it skips on purpose. Every skip below came from a false positive
on a real client file.

## How findings are grouped

- **By section:** the top-level frame on a screen (hero, footer, services-listing). The "Where" link
  opens that section, which is big enough to see in context. The layer path and "open layer" link
  give the exact layer.
- **By component:** text style, color, font and size problems inside an instance are reported once
  against the nearest main component (a Button inside a Card is a Button problem), with
  "N layers × M copies". One fix there covers every copy. The link opens the main component, or the
  first instance when the component comes from a library.
- **By name:** a copy-pasted frame is one row listing the screens it appears on.
- **File level:** variable collections, listed by name. Unused text styles are one row with a
  count, or listed by name with `--unused-styles full`.

Inside instances, the structure rules (hidden, default names, groups, half pixels, auto layout,
detached, wireframe) are skipped: the main component owns them. Hidden layers, including layers at
0% opacity, are reported once, and nothing under them is checked.

Anything an exceptions list names is left out of every rule it applies to; see
[exceptions.md](exceptions.md).

## 🔴 Must fix before dev starts

| Rule | Catches | Skips |
| --- | --- | --- |
| `placeholder-content` | Text whose content or layer name says placeholder, lorem ipsum, TBD, or `[... copy/text/image/todo ...]` | Frame names alone (the label inside is what gets reported); layer names inside components, where "Placeholder" is usually an input's hint text |
| `small-text` | Any text segment under `--min-font` (12px) | |
| `missing-font` | Text Figma reports as using a missing font | |
| `wireframe-leftover` | Instances whose component, component set or component page is named like a wireframe | Instances nested inside other instances |

## 🟠 Design system cleanup

| Rule | Catches | Skips |
| --- | --- | --- |
| `off-brand-font` | Families outside `--fonts` (any case). Without `--fonts`, families under 10% of text are flagged and the report says the set was inferred | |
| `no-text-style` | Text with any segment that has no text style | |
| `raw-color` | Visible solid fills and borders with no variable and no style | Image and gradient fills, invisible or 0% paints |
| `detached-instance` | Frames Figma reports as detached from a component, named by the component | |
| `no-auto-layout` | Frames with 2+ visible layers and no auto layout | Frames Figma says no auto layout fits; icon-sized frames (48px or less) |
| `repeated-frame` | The same frame (name, size and child names) on `--repeat-min` (3) or more screens, not a component. Reported by name, so a recheck still matches it after a small resize | Frames that only repeat because a repeated parent does; frames with default names |
| `unused-collection` | A variable collection with no bindings on the page, when another collection has some | Files where nothing is bound at all |
| `unused-text-style` | Local text styles no text on the page uses: one row with a count, or one per style with `--unused-styles full` | |

## 🟡 Housekeeping

| Rule | Catches | Skips |
| --- | --- | --- |
| `hidden-layer` | Hidden layers and layers at 0% opacity outside instances; the screenshot draws a dashed outline | Hidden layers inside instances (variant and property toggles) |
| `default-name` | Frames, groups, components, rectangles and sections named "Frame 123", "Group", "Rectangle 4"… | Vectors and other shapes; icon-sized layers |
| `group-layer` | Groups | Icon-sized groups |
| `fractional-size` | Half-pixel x, y, width or height that a designer set | Positions inside auto layout; FILL and HUG sizes (three FILL cards in 1216px are 405.33 each, correctly); text; icons |
| `stacked-duplicate` | Two instances of one component directly on a screen, e.g. a second header | |

## Adding or changing a rule

Add it to `RULES` and to `visit` (or `finish` for cross-node rules) in the rules file, give it a
fixture in `tests/figma-audit.test.mjs` that fails without it, and list it here. If a real file
shows a false positive, add the skip and a fixture that pins it.
