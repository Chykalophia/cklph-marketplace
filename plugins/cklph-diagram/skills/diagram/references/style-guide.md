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

This file survives because type references deep-link into it — for the terminal
skin, the node-treatment table, and the non-Latin label rules below — and older
references use the `series-*` token names. None of it is brand-specific.

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

---

## Node type → treatment

Moved to [`../SKILL.md` §5 — Node type → treatment](../SKILL.md). Type references
that link here mean that table. Its roles resolve against the brand file, so
"white" there is `paper-2`, not a literal `#ffffff`.

---

## Non-Latin labels

Upstream wrote these rules for its Geist / Instrument Serif skin. They hold for
any brand; what changes per brand is *which* faces need extending. Check the
brand file's Typography table against the script you are setting before you draw.

**Extend the family on the element; never swap the skin.** A label in a script
the brand faces do not cover gets its own `font-family` stack that starts with the
brand face (so Latin characters inside it still match) and then adds a covering
face:

```svg
<text font-family="var(--font-sans), 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif">결제 서비스</text>
```

Add the Noto face to the page's Google Fonts `<link>` so the same file renders
identically on every machine; Google's `css2` endpoint slices CJK by
unicode-range, so a handful of labels downloads only the slices it touches.
`self_check.py` and `export_svg.py` both read that one link — no `@import`.

**Width budget — measure per character, never per script.** Every Unicode wide or
full-width character (Hangul, Han, full-width punctuation `（）「」，。：`) costs
1em; every other character costs its face's Latin advance (about 0.60em sans,
0.62em mono); nonspacing marks cost nothing. `주문 v2.1` is two wide and five
narrow characters — a formula that tallies "Hangul, Latin letters, spaces"
silently drops `2`, `.`, `1`. Add padding, then round the box up to a multiple of 4.

**The 12px floor binds harder here.** Hangul goes muddy, and Han packs more strokes
into the em box. If a name does not fit at 12px, cut the name; never shrink the type.

### Korean labels

Covering stack: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic'`; titles
`var(--font-display), 'Noto Serif KR', serif`, or a mixed Latin/Korean title draws
its two halves from different serifs.

- **Sublabels stay Latin.** Ports, protocols, field types, URLs — keep the brand
  mono and don't translate them. Hangul has no mono face to fall back to.
- **Mono slots switch register.** Arrow labels, eyebrows, and legend keys are
  uppercase, tracked mono. A Korean label in one of those slots becomes 12px brand
  sans at weight 500, no tracking, no uppercase transform; its mask rect stays
  16px tall with the width from the budget above. Latin labels in the same diagram
  keep the mono treatment.

### Traditional Chinese labels

Covering stack: `'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei'`; titles
`var(--font-display), 'Noto Serif TC', serif`. Same three rules as Korean. A
sublabel that is prose rather than a value may be Chinese, but then it switches
register too. Simplified Chinese takes the same rules with `'Noto Sans SC',
'PingFang SC', 'Microsoft YaHei'`.

### Cyrillic labels

Check the brand faces first, on each family's Google Fonts page (the "Language
support" list): many Latin families ship Cyrillic and many do not. Where they do
there is **no register switch** — names, sublabels, and mono slots keep the Latin treatment. Display
serifs frequently do not; extend the title with `'Noto Serif'`, and put it
**ahead of** any CJK serif in the same stack, since Google also slices Cyrillic
into those faces and the first face reached wins.

Proportional sans faces run wide on `Ж Ш Щ Ю Ы`, past the 0.60em average: measure a
Cyrillic sans name in the browser rather than trusting the budget. **Preserve
printed labels** — a string the reader matches against a physical thing (a cabinet,
a port map) is never transliterated or re-cased; drop the uppercase transform for
that label instead.

