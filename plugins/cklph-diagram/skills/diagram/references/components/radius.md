# Radius scale
Pick one scale and never deviate.

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 4 | chips, small tags |
| `radius-md` | 8 | nodes |
| `radius-lg` | 12–16 | containers, zones |
| `radius-pill` | 999 | badges only, never a primary node |

## The rule that matters

**Nested radii must be concentric: child ≤ parent, and the curves stay
parallel.** A child corner larger than its parent is the single most common tell
in a default diagram — most people feel it without being able to name it.

Correct: `20 → 12 → 8`. Wrong: `4 → 18 → 2`.

Mixed `0 / 3 / 8 / 12` in one drawing is the signature of a diagram assembled
rather than designed.
