# Fork notes

**Base:** [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) @ `3c5c34b` (MIT), synced to `57148ac` (upstream 2.6.46) on 2026-10-01
**Fork:** `cklph-diagram` v3.3-cklph, by Peter Krzyzek / Chykalophia
**Status:** Phase 1 complete, upstream sync complete, verified by `./scripts/verify.sh`

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
| `assets/template-motion.html` | Ported to the brand-token vocabulary (it shipped with `--color-*` and upstream hexes) |
| `references/primitives-core.md`, `layout-budget.md` | Snippets in brand tokens at the 12px floor; fork note added |
| `references/animation.md` | `lint-skin.py` replaced by `lint-a11y.py` + `self_check.py` |
| `scripts/export_svg.py` | Font `@import` taken from the source page, not hardcoded |
| `scripts/self_check.py` | Ignores URLs inside CSS comments; allows the Google Fonts `preconnect` |
| `scripts/verify-*.py` (geometry, motion, 14 per-type) | Paths repointed to `skills/cklph-diagram/` |

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
| `scripts/verify-export.py` | Asserts an SVG export keeps the brand's tokens and fonts |
| `scripts/self_check.py` (root) | Forwarder to the packaged self-check, like the other root scripts |
| `.github/workflows/verify.yml` | CI, running that same script |

## Files removed

| File | Why |
|---|---|
| `scripts/lint-skin.py`, `scripts/lint-skin-baseline.txt` | Linted examples against the single global `style-guide.md` palette. In a multi-brand fork that is not merely dead — it is *inverted*: it would flag correctly brand-resolved colours as violations. Superseded by `lint-a11y.py`, which checks contrast and the 12px floor against the resolved brand. |

---

## Upstream sync — `3c5c34b` → `57148ac` (2026-10-01)

123 upstream commits (2.2 → 2.6.46). Merged file by file against the fork point,
not with `git merge`: the skill directory is renamed here, so a tree merge would
have treated every file as new.

**Taken as-is** (we had never edited them): every changed `type-*.md`,
`export.md`, `output-spec.md`, the drawio/mermaid extractors, the gallery
`index.html`, `template-terminal.html`, and the inherited examples that changed.

**Added:** 14 visual types (polar, waterfall, treemap + marimekko, heatmap,
sankey, fishbone, Wardley, kanban, journey, deployment, dependency, UML class,
story map, DB schema) plus line/bar/scatter variants (slopegraph, ridgeline,
streamgraph, bump, dumbbell, bubble, beeswarm) and 73 example files;
`semantic-patterns.md` (9 behavioural patterns); accessible motion
(`animation.md`, `template-motion.html`); Excalidraw import
(`excalidraw_extract.py`, `import-excalidraw.md`, command + prompt);
`export_svg.py` and `export-registry.md`; `self_check.py`;
`primitives-core.md` and `layout-budget.md` (SKILL.md detail moved out, as
upstream did); the `print-a3-landscape` preset; `verify-geometry.py`,
`verify-motion.py`, and 14 per-type verifiers.

**3-way merged by hand:** `SKILL.md` (upstream's new §3/§6–§12 structure with
every fork rule kept; §13/§14 added — they were cited but never existed), the
three static templates (upstream's local scroller and print rule), the export
command/prompt, `style-guide.md` (shim gained the node-treatment anchor and
brand-agnostic non-Latin label rules), and the import references.

**Adapted, because upstream would have reintroduced the single-skin bug:**

- `export_svg.py` hardcoded upstream's Google Fonts `@import`, so a client
  diagram exported to SVG left its HTML wrapper in the house typefaces. It now
  imports the source page's own font link. `scripts/verify-export.py` asserts
  the outcome (every `var()` defined, the source's own fonts) and was shown to
  fail on both injected regressions.
- `template-motion.html` used `--color-*` names and upstream hexes — the same
  vocabulary break FORK-NOTES records below for the original templates. Ported
  to the brand-token block.
- `primitives-core.md` / `layout-budget.md` snippets rewritten in tokens at the
  12px floor, matching `build-examples.py` output.
- `self_check.py` rejected every brand-rendered file: it read URLs inside CSS
  comments (where `brand-tokens.py` records provenance) and rejected the Google
  Fonts `preconnect`. Comments are now stripped first and that one preconnect
  is allowed; a non-font preconnect and real remote CSS still fail.

**Fixed in our own files while there:** the three static templates still
hardcoded upstream hexes on their arrow markers and background rect, so every
copied diagram drew its arrowheads in upstream colours; they had no prose
alternative slot, so every one failed A4; and none declared
`data-render-width`, so A5 was measured against the wrong width. All three now
lint clean and `verify.sh` keeps them that way.

**Skipped, deliberately:**

| Upstream | Why not |
|---|---|
| `profiles.md`, `/profile` command | Named client profiles are upstream's answer to the problem the brand registry already solves. Two resolution systems would disagree. Their *project marker* was borrowed instead — see below. |
| `doctor.md`, `/doctor` | Diagnoses upstream's plugin install and style-guide state, neither of which exists here. |
| `onboarding.md` changes | Superseded by `brand-onboarding.md`. |
| Plugin manifests (Claude / Codex / Factory / Copilot), release and auto-bump CI, maintainer policy, screenshot pipeline, README thumbs, ADRs | Packaging and repository process for upstream's distribution; this repo installs with `install.sh`. |
| `verify-docs-sync.py`, `verify-skin-polarity.py`, `verify-semantic-motion.py`, `verify-sequence-oauth.py` | Each asserts upstream's palette, its docs layout, or shells out to the removed `lint-skin.py`. |
| Upstream's `test-*.py` adversarial suites | Not carried at the original fork either. Worth revisiting for the verifiers we now run. |

**Known limit of the carried per-type verifiers.** They pass on the inherited
examples, which are still in upstream's skin, and several (dumbbell, waterfall,
bump) hardcode upstream's accent hexes. They will need to read the brand file
before they can gate brand-rendered charts — part of Phase 2.

---

## Project marker (`.cklph-diagram`), borrowed from upstream's ADR 0006

A file at a client repo's root, `brand: <slug>`, pins that repo's brand.
`brand-tokens.py --resolve --from <dir>` reports it. Three deliberate departures
from upstream's `.diagram-design` marker:

- **A bad marker refuses; upstream ignores it.** Upstream falls through to its
  default skin. Here the default is the house brand, so "ignore and continue"
  is precisely a client repo rendering in CKLPH colours. Malformed (exit 2),
  unknown brand (exit 2), and stub brand (exit 1) all stop the run.
- **The search is bounded by the git root,** and outside a repo checks the start
  directory only, so a marker in `~` cannot brand every project under it.
- **One key, `brand:`** — there are no profiles to name. Slug or alias, matched
  against `[a-z0-9_][a-z0-9_-]{0,63}` before it touches a path, `_template`
  excluded.

Precedence is request → marker → house; a request that overrides a marker is
stated in the confirm-before-drawing line so a stale marker gets noticed.

---

## Lessons from Archify (2026-10-01)

[`tt-a1i/archify`](https://github.com/tt-a1i/archify) (MIT) has the model
write typed JSON, renders it with a program, and runs one `finalize` command of
gates ending in real Chrome. We are not an interactive viewer and do not want a
renderer, so we took the parts that transfer:

- **Source as the authoring format, Claude as the renderer.** Archify keeps its
  JSON beside the HTML and links them by hash. Here the HTML is the only
  deliverable, so the source is both a sidecar and embedded, and `check.py`
  proves they are identical and that the drawing matches.
- **One command, gates in order, stop at the first failure**, compact
  findings with fixes, bounded repair, truthful reporting — Archify's
  `finalize` contract.
- **Measure in a real browser.** Archify's own browser gate checks overflow and
  a 6px reading size; ours checks a 12px floor at 375px plus text-in-box,
  text overlap and labels on nodes, which Archify only estimates statically.
- **Diff by id; refuse when no ids are shared** (Archify's `compare`).
- **Folder per request, never overwrite.**
- **Logo provenance rules** (`brand-marks.md`).

Not taken: the renderer and viewer runtime, JSON Schema + generated validators
(a stdlib validator is enough until the shape settles), hash-linked delivery
receipts and atomic-publish plumbing, the 6px floor and shrink-to-fit text,
mono-only type. Archify's layout rules followed in 3.3: the placement recipe, text-width
estimation, label placement, attach-point order and spacing, and route floors,
all checked on the source before drawing (`layout-budget.md`). Adapted, not
copied: our segment floor is 16px (corner radius plus arrowhead) where Archify's
is 8, padding is 8px each side, and their per-type coordinate lattices are not
taken — the recipe plus the checks cover the same failure without fixing every
type to one grid.

**Known limits.** `match` compares nodes (first rect, texts), edges (endpoints,
label text), title, desc, canvas and brand; it does not yet compare every
corner of a route, chart geometry against `data`, or groups. The inherited
`assets/example-*.html` have no source and fail `check.py` at the first gate —
the Phase 2 backlog now includes writing their sources.

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

Measured, not estimated — `lint-a11y.py assets/example-*.html --brand cklph`,
after the upstream sync (it was 100 files at the original fork):

```
167 file(s), 167 failing

2220  A2  untokenised colour (single-skin hexes)
 601  A5  below the 12px rendered floor
 167  A7  no prefers-contrast: more variant
 167  A4  no prose alternative
```

Every inherited example fails. The sync cleared the old A6 and A3 failures. A4 and A7 are the cheap bulk — they are per-file
boilerplate and could be scripted. A2 is mechanical once each example is
re-rendered from a brand. A5 is the one that needs judgement: dropping 8px to
12px changes layouts, and some of those diagrams are over budget at the larger
size, which means splitting them rather than rescaling.

Note A5 is measured as *rendered* px, not authored px — the linter accounts for
viewBox scaling, so an 8px label in a 1000-unit viewBox displayed at 720px is
reported at 5.8px. Authored size is not the thing readers experience.

`template.html`, `template-dark.html` and `template-motion.html` lint clean and
are gated in `verify.sh`. `template-full.html`'s baked-in sample diagram (upstream
hexes, 9px labels) is still in the backlog — SKILL.md §10 says to replace its SVG
body wholesale. The `example-*.html` files are the rest of it. They are reference reading
rather than the copy path, which is why this is Phase 2 and not a release
blocker.

**Phase 3 — orthogonal connector routing.** Upstream's connector rules (§6) are
mandatory prose with no engine behind them. C4 ("no crossing lines") is
currently a `[human]` rule. This is the highest-value and highest-difficulty
remaining piece — it is what makes diagrams look designed rather than generated.

**Phase 4 — new chart types.** Upstream has since shipped waterfall and sankey
(taken in the 2026-10-01 sync). Still open: stacked/grouped bar, bullet,
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
