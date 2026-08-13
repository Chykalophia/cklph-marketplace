# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[semantic](https://semver.org/).

The major version tracks the skill's `metadata.version` in
`skills/cklph-diagram/SKILL.md`, which inherits `3.x` from the upstream skill
this forked from.

## [3.0.0] — 2026-08-13

First public release. Forked from
[`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design)
@ `3c5c34b` (MIT).

### Added

- **Multi-brand token registry** (`references/brands/`), resolved per request,
  replacing upstream's single global `style-guide.md`. Ships `cklph` (house),
  `_default` (neutral editorial), `_template`, and `_example-stub`.
- **The refusal path.** A named client whose brand file is missing, still a
  stub, or still contains `TODO`s stops the run instead of falling back to house
  colours. `scripts/verify.sh` asserts the non-zero exit rather than trusting the
  error message.
- **Mechanical accessibility.** Rules A1–A8 in `references/accessibility.md`,
  enforced by `scripts/lint-a11y.py`, which fails the build. Includes a 12px
  floor measured against *rendered* px, a mandatory non-colour cue for every
  colour distinction, and a required prose alternative.
- **Cognitive-load rules** C1–C9 — predictable grammar, one reading order, a hard
  node ceiling, no crossing lines.
- **Categorical / sequential / diverging scales** per brand, each AA-verified,
  with monotonic-lightness and step-separation checks in `scripts/colorlib.py`.
- **CI** (`.github/workflows/verify.yml`) running the same `./scripts/verify.sh`
  a developer runs locally.
- `NOTICE` recording full provenance and bundled icon-set licences.

### Fixed

Found while preparing the fork for publication:

- **Templates spoke a different token vocabulary than the brand system.**
  `assets/template*.html` — the files `SKILL.md` §10 tells you to copy as step 1
  of every diagram — defined `--color-paper` / `--color-ink` / `--color-accent`,
  while `brand-tokens.py` emits `--paper` / `--ink` / `--accent`. Copying a
  template and resolving a brand produced a file where *none* of the brand's
  tokens resolved, and the diagram silently rendered in upstream's palette —
  precisely the failure the refusal path exists to prevent, sitting in the
  default path.
- **Fonts ignored the brand file.** `build-examples.py` selected typefaces with
  an `if slug == "cklph"` branch, so every other brand rendered in Geist and
  Instrument Serif regardless of its Typography table. `brand-tokens.py` now
  parses that table and emits `--font-display` / `--font-sans` / `--font-mono`,
  and a `live` brand naming no faces fails `--check`.
- **Every `commands/*.md` reference link was broken** — they pointed into
  `skills/diagram-design/`, which does not exist in this fork.
- **`SKILL.md` contradicted itself**: the §9 taste gate asked "No JetBrains Mono
  anywhere?" while §5 established it as the house mono. The check now tests the
  rule (mono is for technical content) rather than the typeface.
- **`scripts/verify.sh` was not executable**, so the CI step `run:
  ./scripts/verify.sh` could never have run.
- `install.sh` pruned `__pycache__` and then recreated it in its own
  verification step, shipping a stale bytecode cache with every install.
- `prompts/*.md` referenced a different agent product by name.

### Removed

- `scripts/lint-skin.py` and its baseline. It enforced the deprecated single-skin
  `style-guide.md` palette, which in a multi-brand fork is not merely dead but
  inverted — it would flag correctly brand-resolved colours as violations.
  Superseded by `lint-a11y.py`.
- Client brand files. Three real client brands existed in the pre-publication
  working copy; they and the notes assessing those clients' sites were removed
  before publication, and `.gitignore` now keeps the brands directory clear of
  everything except the four shipped files.

### Known limitations

- The inherited `assets/example-*.html` files predate these accessibility rules
  and all fail the lint — see [#1](https://github.com/Chykalophia/cklph-diagram-skill/issues/1).
  The three `template*.html` files a user actually copies are fixed.
- `lint-a11y.py` rule A2 misreads numeric HTML entities as untokenised colours —
  see [#3](https://github.com/Chykalophia/cklph-diagram-skill/issues/3).
- Upstream's connector rules (§6) are mandatory prose with no routing engine
  behind them; C4 ("no crossing lines") remains a human-checked rule.

[3.0.0]: https://github.com/Chykalophia/cklph-diagram-skill/releases/tag/v3.0.0
