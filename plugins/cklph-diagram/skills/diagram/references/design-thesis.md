# Design thesis — what "vibrant" means here

This file exists because the brief asked for two things that pull against each
other: **vibrancy** and **AuDHD-friendliness**. Upstream's thesis sits on the
far side of that line — one accent, 1–2 focal elements, target density 4/10,
deletion as the default move. Adding saturation on top of that produces a
diagram that is loud *and* thin, which is the worst of both.

## The resolution

> **Vibrancy = hue variety inside a controlled, warm, mid-saturation palette,
> plus generous whitespace and confident typography.**
>
> Not saturation. Not gradients. Not density. Not more elements.

Reference points: editorial print. Monocle's infographics, Bloomberg
Businessweek's chart pages, Pentagram wayfinding. Visually alive; low sensory
load. Colour does work, and the work it does is *distinguishing categories*,
never *shouting*.

## What this permits, that upstream forbids

| Move | Upstream | Here |
|---|---|---|
| More than one hue in a diagram | banned | permitted via the categorical scale, capped at 5 |
| Second structural ink | absent | `ink-2` carries hue without competing for focus |
| Sequential / diverging ramps | absent | permitted, endpoints must be labelled |

## What stays banned

- Saturation above the brand's mid range. If it vibrates, it is wrong.
- Gradients, glows, shadows, neon-on-dark.
- Colour as the *only* carrier of meaning — see
  [`accessibility.md`](accessibility.md) rule A1.
- Density. The node ceiling is unchanged and it is real.
- `accent` on more than 2 elements. The categorical scale exists precisely so
  that people stop reaching for `accent` when they mean "these are different
  kinds of thing."

## The distinction that keeps this coherent

**Focus and category are different jobs and take different colours.**

- `accent` answers *"where do I look first?"* — 1–2 elements, ever.
- `cat-1..5` answer *"what kind of thing is this?"* — no focal weight at all.
- `seq-*` and `div-*` answer *"how much?"* — magnitude only.

Most ugly diagrams are one of these three doing another's job. When a palette
decision feels hard, name the job first; the answer usually falls out.
