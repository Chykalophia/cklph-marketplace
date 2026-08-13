# CKLPH Diagram

A Chykalophia fork of [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design)
(MIT), turning a single-skin personal diagramming skill into a multi-brand
agency tool with mechanically enforced accessibility.

Twenty-seven diagram types, rendered as self-contained HTML with inline SVG.

---

## What this fork adds

| | Upstream | Here |
|---|---|---|
| **Brands** | One global `references/style-guide.md` | A registry: `references/brands/<slug>.md`, resolved per request |
| **Client safety** | First-run gate, once per project | A named client with no brand file **stops the run**. No fallback to house colours, ever. |
| **Colour** | One accent, one series palette | Categorical / sequential / diverging scales, each AA-verified, each with a mandatory non-colour cue |
| **Accessibility** | Contrast checked at onboarding; SVG title/desc linted | Eight rules (A1–A8), most enforced by `lint-a11y.py`, which fails the build |
| **Cognitive load** | Density budget | Nine rules (C1–C9) — predictable grammar, one reading order, node ceiling, no crossing lines |
| **Type sizes** | 7–9px mono labels | 12px floor, enforced |
| **CI** | — | `./scripts/verify.sh`, run identically in GitHub Actions |

The design tension behind all of it — "vibrant" versus "low sensory load" — is
resolved once in [`references/design-thesis.md`](skills/cklph-diagram/references/design-thesis.md).
Short version: vibrancy means **hue variety inside a controlled warm palette**,
not saturation, not gradients, not density.

---

## Install

```bash
git clone https://github.com/Chykalophia/cklph-diagram-skill.git
cd cklph-diagram-skill

./install.sh              # -> ~/.claude/skills/cklph-diagram
./install.sh --bundle     # -> cklph-diagram.skill, for claude.ai upload
./install.sh --dir <path> # -> somewhere else
./install.sh --uninstall
```

Requires Python 3 (standard library only — no pip install, no dependencies).

The installer refuses to install if any `live` brand fails its AA audit, and
verifies the installed copy can load its own registry before reporting success.
The skill folder is self-contained — `SKILL.md`, `references/` (including the
brand registry) and `scripts/` travel together, so the brand gate and the a11y
lint work with no repo present.

## Quick start

```bash
# what brands exist, and which are actually renderable
python3 scripts/brand-tokens.py --list

# audit a brand's tokens against WCAG AA, both modes
python3 scripts/brand-tokens.py cklph --check
python3 scripts/brand-tokens.py cklph --check --mode dark

# render the proof diagrams for a brand
python3 scripts/build-examples.py --brand cklph --out out/

# lint rendered output
python3 scripts/lint-a11y.py out/*-cklph-light.html --brand cklph

# everything above, for every live brand, plus the refusal path
./scripts/verify.sh
```

## The registry

```
skills/cklph-diagram/references/brands/
├── _default.md        neutral editorial skin — for unbranded work
├── _template.md       copy this to add a client
├── _example-stub.md   a synthetic blocked brand, so the refusal path stays tested
└── cklph.md           house brand — the default when no client is named
```

**Client brand files are not in this repo, and are git-ignored.** You create them
locally against your own clients' design systems; they never leave your machine.
The registry ships with the house brand, a neutral skin, a template, and one
deliberately-blocked fixture.

A brand file is `live` only once every text role clears 4.5:1 on its ground in
both modes, meaningful borders clear 3:1, every ramp is monotonic with separable
steps, and the Typography table names all three faces. Until then the loader
refuses it:

```
$ python3 scripts/build-examples.py --brand _example-stub --out out/
REFUSED — will not render '_example-stub':
  - brand '_example-stub' has status 'stub' — not onboarded.
    Run brand onboarding before rendering anything for Example Client (synthetic).
    Do NOT fall back to CKLPH tokens.
  - missing core roles in light: paper, paper-2, ink, ink-2, muted, soft, …
```

That refusal is the point of the fork. The failure it prevents is a
CKLPH-skinned diagram shipping inside a client deliverable, where nobody catches
it until the client does. `scripts/verify.sh` asserts the non-zero exit rather
than trusting the message, and `_example-stub.md` exists so that assertion is
never checking an empty list.

Adding a client: [`references/brand-onboarding.md`](skills/cklph-diagram/references/brand-onboarding.md).

## Layout

```
skills/cklph-diagram/
├── SKILL.md                    entry point — brand gate, type selection, taste gate
├── references/
│   ├── design-thesis.md        what "vibrant" means here
│   ├── accessibility.md        A1–A8, marked [lint] or [human]
│   ├── cognitive-load.md       C1–C9
│   ├── prose-alternative.md    the text alternative every diagram ships with
│   ├── brand-onboarding.md     adding a client brand
│   ├── brands/                 the registry
│   ├── type-*.md               27 diagram types
│   └── primitive-*.md          annotation, icons, sketchy, terminal
└── assets/                     examples and templates

scripts/
├── brand-tokens.py             resolve + audit a brand; the refusal path
├── colorlib.py                 WCAG maths, ramp validation
├── lint-a11y.py                fails the build on a11y violations
├── build-examples.py           verification harness, not the production path
├── build-icons.py              regenerates the icon catalog (maintainers only)
├── fix-mojibake.py             one-off encoding repair utility
└── verify.sh                   the whole gate
```

`build-examples.py` renders three proof diagrams to answer one question
mechanically: does the same diagram render correctly in two brands from the same
directory and pass the lint in both? Normal use of the skill is Claude authoring
SVG by hand against the references — the harness is not a diagram generator.

## Status

Phase 1 of the scoping spec is complete and verified. Phases 2–4 (a11y hardening
across all 27 inherited example assets, the orthogonal connector routing engine,
and new chart types) are not started — see [`FORK-NOTES.md`](FORK-NOTES.md), which
records what is measured rather than estimated.

## Credits

Built by [Peter Krzyzek](https://github.com/PiotrKrzyzek) at
[Chykalophia](https://chykalophia.com).

Forked from [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design)
@ `3c5c34b` by Cathryn Lavery, which is where the editorial design system, the 27
diagram types, the import extractors, and the taste gate come from. This fork adds
the multi-brand registry and its refusal path, mechanically enforced accessibility,
the cognitive-load rules, and CI. What changed and why is recorded in
[`FORK-NOTES.md`](FORK-NOTES.md).

Icon sources: Tabler Icons (MIT), Simple Icons (CC0), log-z/logos (MIT),
Devicon (MIT).

## Licence

MIT. See [`LICENSE`](LICENSE) — it carries both the upstream copyright and
Chykalophia's, because this is a derivative work and the upstream notice has to
travel with it. Upstream's original file is also preserved verbatim at
[`LICENSE.upstream`](LICENSE.upstream).
