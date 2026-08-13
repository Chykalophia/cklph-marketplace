# Style guide — DEPRECATED, kept as a compatibility shim

> **This file is no longer the source of truth.** Colours, typography, and
> geometry now live per brand in [`brands/`](brands/), resolved per request —
> see [`../SKILL.md` §0](../SKILL.md) and
> [`brand-onboarding.md`](brand-onboarding.md).
>
> Upstream had exactly one style guide. That is the thing this fork exists to
> fix: one file cannot describe Chykalophia and a client at the same time, and
> the failure mode is a CKLPH-skinned diagram shipping inside a client
> deliverable.

This file survives for two reasons only: several type references still deep-link
to the terminal skin below, and older references use the `series-*` token names.

---

## Token migration

| Old token (upstream) | Now |
|---|---|
| `paper`, `paper-2`, `ink`, `muted`, `soft`, `rule`, `rule-solid`, `accent`, `accent-tint`, `link` | Same names, per brand, in `brands/<slug>.md` |
| `series-1` … `series-5` | `cat-1` … `cat-5` — and each now carries a mandatory non-colour cue |
| *(no equivalent)* | `seq-1` … `seq-6` for magnitude |
| *(no equivalent)* | `div-neg-2` … `div-pos-2` for a meaningful midpoint |
| Light/dark "inversion rule" | Both modes are written out explicitly in each brand file. Do not derive dark from light. |

Anywhere a type reference says "from style-guide.md", read it as "from the
resolved brand file".

### Constraints that moved, not vanished

Upstream's hand-checked constraints are now mechanical:

| Was | Now |
|---|---|
| "`ink` must hit WCAG AA on `paper`" | `brand-tokens.py --check`, every text role, both modes |
| "Paper is warm-neutral, not pure white" | [`cognitive-load.md`](cognitive-load.md) C5, enforced |
| "One accent" | Unchanged — `accent` is 1–2 focal elements, never a category system |
| "No rainbow palette" | Replaced by the scale discipline: categorical for kind, sequential for magnitude, diverging for a midpoint |

---

### Terminal skin (opt-in alternate)

A self-contained palette for the terminal-window primitive (see [primitive-terminal.md](primitive-terminal.md)) — a CLI-chrome register for dev-tool posts and technical social cards. It does not replace the default skin above and isn't affected by onboarding; it's a second, fixed skin you opt into per-diagram.

| Token | Hex | Purpose |
|---|---|---|
| `terminal-page` | `#0a0a0a` | Page background behind the window |
| `terminal-paper` | `#141414` | Window body, node fill |
| `terminal-bar` | `#1b1b1b` | Titlebar strip |
| `terminal-border` | `#2b2b2b` | Window border, hairlines |
| `terminal-ink` | `#f5f5f5` | Primary text, primary stroke (same white-smoke as default `ink`) |
| `terminal-muted` | `#9a9a9a` | Secondary text, sublabels, ring stroke |
| `terminal-soft` | `#5c5c5c` | Tertiary — inactive dots, spokes |
| `terminal-accent` | `#ff5a36` | The one accent — focal station, prompt sign, active dot |
| `terminal-accent-tint` | `rgba(255,90,54,0.12)` | Fill for accent-bordered boxes |

**1-accent rule still holds.** Everything that isn't `terminal-ink` or `terminal-muted`/`terminal-soft` should be `terminal-accent` — never introduce a second hue.
