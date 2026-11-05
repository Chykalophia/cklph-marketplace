# Node styles
Ten surface treatments. Pick **one** per diagram.

| Style | Treatment | Reach for it when |
|---|---|---|
| `flat` | tonal fill, no border | dense diagrams where borders would add noise |
| `outlined` | no fill, 1.8px tinted border | light grounds, print, fax-safe |
| `elevated` | white fill + shadow stack | the default for cards on a treated ground |
| `tonal` | accent at 12–16% opacity | grouping without a container |
| `ring` | hairline + inset second hairline | Tailwind/shadcn register; crisp on white |
| `hard-shadow` | solid offset rect, no blur | neubrutalist; survives any export |
| `status-strip` | 4px coloured strip on the top edge | when each node has a state |
| `bracket` | four corner brackets, no full border | HUD / instrument register |
| `glass` | translucent + barrier layer + specular hairline | dark grounds only |
| `pill` | fully rounded, no fill | labels and tags, never primary nodes |

## Rules

- **The strip and the bracket carry meaning; the rest are surface.** If you use
  `status-strip`, the strip colour must map to a real state and be legended.
- **`glass` requires a barrier layer** — a solid low-opacity fill beneath the
  text — or contrast is being measured against a background you do not control.
- **`hard-shadow` and `elevated` do not mix.** Pick a light model and hold it.
- Focal emphasis is a *border weight* change on the chosen style, not a switch
  to a different style.
