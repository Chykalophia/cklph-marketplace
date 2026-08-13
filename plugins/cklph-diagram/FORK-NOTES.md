# Fork notes

**Base:** [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) @ `3c5c34b` (MIT)
**Fork:** `cklph-diagram` v3.0-cklph, by Peter Krzyzek / Chykalophia
**Status:** Phase 1 complete, verified by `./scripts/verify.sh`

This file records what changed from upstream and why, so a future merge from
upstream does not silently undo a decision.

---

## Files changed from upstream

| File | Change |
|---|---|
| `SKILL.md` | Renamed skill; §0 replaced with brand resolution; §5 repointed at the registry; typography rewritten to the 12px floor; brand / a11y / cognitive gates added to the §9 checklist |
| `references/style-guide.md` | **Deprecated to a shim.** Keeps the terminal-skin table (deep-linked by `primitive-terminal.md`) and a token migration table. No longer a source of truth. |
| `references/onboarding.md` | **Superseded.** Banner added; retained for reference. Its flow rewrites a single global skin, which would undo the fork. |
| `assets/template*.html` | Repointed at the brand-token vocabulary — see "The template vocabulary was broken" below |
| `commands/*.md` | Links repointed from `skills/diagram-design/` (which does not exist here) to `skills/cklph-diagram/`; `style-guide.md` replaced by the brand gate |
| `prompts/*.md` | De-hosted — they referenced a different agent product by name |

## Files added

| File | Purpose |
|---|---|
| `references/brands/` | The registry — `_default`, `_template`, `_example-stub`, `cklph` |
| `references/design-thesis.md` | Resolves vibrancy vs. sensory load. Everything inherits from it. |
| `references/accessibility.md` | A1–A8, each tagged `[lint]` or `[human]` |
| `references/cognitive-load.md` | C1–C9 |
| `references/prose-alternative.md` | The required text alternative |
| `references/brand-onboarding.md` | Adding a client brand, including the three failure modes seen in practice |
| `scripts/colorlib.py` | WCAG maths, role thresholds, ramp validation |
| `scripts/brand-tokens.py` | Brand resolution, audit, CSS emission — and the refusal path |
| `scripts/lint-a11y.py` | Fails the build on a11y violations |
| `scripts/build-examples.py` | Verification harness for the Phase 1 acceptance test |
| `scripts/verify.sh` | The whole gate, in one command |
| `.github/workflows/verify.yml` | CI, running that same script |

## Files removed

| File | Why |
|---|---|
| `scripts/lint-skin.py`, `scripts/lint-skin-baseline.txt` | Linted examples against the single global `style-guide.md` palette. In a multi-brand fork that is not merely dead — it is *inverted*: it would flag correctly brand-resolved colours as violations. Superseded by `lint-a11y.py`, which checks contrast and the 12px floor against the resolved brand. |

---

## Decisions worth not re-litigating

**Vibrancy = hue variety, not saturation.** Spec §0. Upstream's thesis (one
accent, density 4/10, deletion as the default move) is kept; what changed is
that hue variety is now permitted *within* a controlled warm mid-saturation
palette. Reference points are editorial print, not dashboard UI.

**JetBrains Mono is allowed here.** Upstream lists it as an anti-pattern
("blanket dev font"). CKLPH's actual brand mono *is* JetBrains Mono. The fork
keeps the rule's intent — mono is for technical content only — and drops the
typeface ban. Per-brand font stacks live in the brand file. The §9 checklist
originally still asked "No JetBrains Mono anywhere?", directly contradicting §5;
that line now checks the *rule* rather than the typeface.

**The 12px floor overrides upstream's type ramp.** Upstream runs 7–9px mono
labels. Those do not survive a projector, an export downscale, or a reader over
fifty. `lint-a11y.py` A5 enforces the floor. A diagram that only fits at 9px is
over budget and should be split, not shrunk.

**A brand accent that fails AA gets darkened, and the substitution is recorded.**
Brand accents routinely clear 3:1 as a fill and fail 4.5:1 as a 12px label, and
this skin uses `accent` for both. Hold the hue, darken until it passes, record
it in the brand file. Worked example in `references/brand-onboarding.md` §2.

**Stub brands must refuse, and CI asserts it.** `verify.sh` step 4 asserts a
non-zero exit for every stub rather than trusting the error message. If a stub
ever renders, a client deliverable is one command from shipping in house
colours.

**The registry keeps a synthetic stub on purpose.** With no stub in the
registry, `verify.sh` step 4 iterates an empty list and reports success — the
most important guardrail in the skill, passing vacuously. `_example-stub.md`
exists so that check always has something to assert.

**`_default` renders to `*-default-*.html`.** `build-examples.py` uses
`slug.strip('_')` for filenames. Anything globbing output has to account for it
— this bit `verify.sh` on the first run.

**The brand file is the only source of truth, including for fonts.** Originally
`build-examples.py` picked font stacks with an `if slug == "cklph"` branch, so
every brand except the house one rendered in Geist and Instrument Serif no
matter what its own Typography table said. `brand-tokens.py` now parses that
table and emits `--font-display` / `--font-sans` / `--font-mono` alongside the
colours, and a `live` brand that names no faces fails `--check`.

**The template vocabulary was broken, and it defeated the whole fork.**
`assets/template*.html` — the files SKILL.md §10 tells you to copy as step 1 of
every diagram — defined `--color-paper: #f5f5f5`, `--color-ink: #2d3142`,
`--color-accent: #eb6c36` and upstream's fonts, while `brand-tokens.py` emits
`--paper`, `--ink`, `--accent`. Copying a template and resolving a brand
therefore produced a file where *none* of the brand's tokens resolved, and the
diagram silently rendered in upstream's palette: exactly the failure the refusal
path exists to prevent, sitting in the default path. The templates now speak the
canonical vocabulary and carry a marked block to paste `brand-tokens.py` output
into. `template-terminal.html` is deliberately untouched — SKILL.md §10 documents
it as not brand-tokenized.

---

## Brand registry status

| Brand | Status | Note |
|---|---|---|
| `cklph` | live | Extracted from chykalophia.com compiled CSS custom properties |
| `_default` | live | Neutral editorial skin for unbranded work |
| `_example-stub` | **stub** | Synthetic. Exists so the refusal path stays under test. |
| `_template` | — | Copy this to add a client |

**Client brands are not in this repo.** They are created locally and git-ignored
(see `.gitignore`). Three real client brands existed in the pre-publication
working copy — one live, two blocked on source material — and were removed
before this repo was made public, along with the notes assessing those clients'
sites. Publishing a client's palette, or a candid read on the state of their
website, is not ours to do.

---

## Not started

**Phase 2 — a11y hardening across the inherited example assets.** A1–A8 and
C1–C9 are written and enforced on new output, but the inherited `type-*.md`
references and the pre-baked `assets/example-*.html` files still carry upstream's
conventions (7–9px labels, `series-*` tokens, single-skin hexes).

Measured, not estimated — `lint-a11y.py assets/*.html --brand cklph`:

```
100 file(s), 100 failing

1430  A2  untokenised colour (single-skin hexes)
 288  A5  below the 12px rendered floor
 100  A7  no prefers-contrast: more variant
 100  A4  no prose alternative
   2  A6  animation with no reduced-motion guard
   1  A3  SVG semantics
```

Every inherited asset fails. A4 and A7 are the cheap bulk — they are per-file
boilerplate and could be scripted. A2 is mechanical once each example is
re-rendered from a brand. A5 is the one that needs judgement: dropping 8px to
12px changes layouts, and some of those diagrams are over budget at the larger
size, which means splitting them rather than rescaling.

Note A5 is measured as *rendered* px, not authored px — the linter accounts for
viewBox scaling, so an 8px label in a 1000-unit viewBox displayed at 720px is
reported at 5.8px. Authored size is not the thing readers experience.

The three `template*.html` files a user actually copies are fixed; the
`example-*.html` files are the remaining backlog. They are reference reading
rather than the copy path, which is why this is Phase 2 and not a release
blocker.

**Phase 3 — orthogonal connector routing.** Upstream's connector rules (§6) are
mandatory prose with no engine behind them. C4 ("no crossing lines") is
currently a `[human]` rule. This is the highest-value and highest-difficulty
remaining piece — it is what makes diagrams look designed rather than generated.

**Phase 4 — new chart types.** Waterfall, sankey, stacked/grouped bar, bullet,
dual-axis, small multiples. Then the Chykalophia-specific types: SEO/GEO/AEO
surface map, retainer scope boundary, site architecture / redirect map.

---

## Open questions, now answered

1. **Public or private repo?** *Public*, at
   `Chykalophia/cklph-diagram-skill`. The concern that decided it — client brand
   tokens living in the registry — was resolved by removing them and
   git-ignoring the path, rather than by keeping the whole repo private.
2. **Ships to the team, or stays local?** *Ships.* `verify.sh` and CI therefore
   matter, which is why the template vocabulary bug above was treated as a
   release blocker and the inherited examples are documented as a known backlog
   rather than quietly left to be discovered.
