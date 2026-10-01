# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[semantic](https://semver.org/).

The major version tracks the skill's `metadata.version` in
`skills/cklph-diagram/SKILL.md`, which inherits `3.x` from the upstream skill
this forked from.

## [3.2.0] — 2026-10-01

Source-first diagrams and a real-browser gate. Ideas borrowed, adapted, from
[`tt-a1i/archify`](https://github.com/tt-a1i/archify) (MIT); record in
`FORK-NOTES.md` § Lessons from Archify.

### Added

- **Diagram source** (`references/diagram-source.md`). Every diagram is a JSON
  record of its content *and* placement, written before drawing and read back
  on every edit; the HTML is drawn from it and embeds a copy. Claude is the
  renderer; there is no renderer program. `diagram_source.py` validates it
  (strict fields, stable ids, sound geometry: no diagonals, no edge through a
  node, no stacked edges, no overlapping nodes), embeds it, matches it against
  the drawing, and diffs two versions by id — refusing when they share no id.
- **`check.py`**: one verdict per diagram. Gates source → embed → match → a11y
  → safety → browser, stopping at the first failure, at most eight findings,
  each with what was measured and a fix.
- **`browser_check.py`**: headless Chrome, stdlib only, at 1440px and 375px:
  rendered text size, text spilling out of boxes, overlapping text, labels on
  nodes, clipping, sideways page scroll. A missing Chrome is "skipped", never a
  pass.
- **`test-check.py`**: 19 planted-defect cases plus a clean baseline, each
  asserting the gate and code that catches it. In `verify.sh`.
- One folder per request (`diagrams/<type>-<slug>-<timestamp>/`), never
  overwritten; updates get a new folder seeded with the old source.
- Repair rules (fix the source first, gate order, two rounds then report) and
  truthful hand-over reporting (checks passed vs browser ran vs actually viewed).
- Logo provenance rules in `primitive-icons.md`.

### Fixed

- **Text shrank below 12px on phones.** The proof diagrams scaled to a 375px
  screen (labels at 6.7px) while `lint-a11y.py` passed them, because it assumes
  the declared render width. The SVG now holds its width in a scrolling
  container, and the browser gate measures the real size.
- `verify-geometry.py` ignored 16px label masks, so it checked nothing on
  this fork's own output.
- **Five logos had no licence.** Hop, Pentaho, Dagster, SAS and Stata were
  fetched straight from vendor sites and logo CDNs, marked "verify license
  before use", and never verified, while this public repo redistributed them.
  Stata is replaced by Devicon's MIT `stata-original-wordmark`; the other four
  have no licensed version in Simple Icons or Devicon and are removed (label
  those products in text). `build-icons.py` now refuses direct-fetch sources.

## [3.1.0] — 2026-10-01

Synced with upstream [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design)
@ `57148ac` (2.6.46), 123 commits past the fork point. Full record, including
what was skipped and why, in `FORK-NOTES.md` § Upstream sync.

### Added

- **14 visual types** (27 → 41): polar, waterfall, treemap (+ marimekko),
  heatmap, Sankey, fishbone, Wardley map, kanban, user journey, deployment,
  dependency graph, UML class, story map, database schema. Plus slopegraph,
  ridgeline, streamgraph and bump (line), dumbbell (bar), bubble and beeswarm
  (scatter) variants, and 73 example files.
- **Semantic patterns** (`semantic-patterns.md`): pick a behavioural pattern
  before the layout type. SKILL.md §3 now routes through it.
- **Accessible motion**: `animation.md` and `template-motion.html`, ported to
  the brand-token vocabulary.
- **Excalidraw import**: `excalidraw_extract.py`, `import-excalidraw.md`, and
  the `import-excalidraw` command and prompt.
- **`export_svg.py`** standalone SVG exporter and the `--registry` metadata
  sidecar (`export-registry.md`).
- **`self_check.py`**, which an installed skill runs on its own output.
- `print-a3-landscape` size preset; "confirm before drawing" step (§3), which
  here also states the resolved brand.
- `verify.sh` steps 4–5: self-check and SVG-export checks on every rendered
  brand file, template lint, label geometry, the motion contract, and 14
  per-type data-contract verifiers over the inherited examples.
- SKILL.md §13 (Accessibility) and §14 (Cognitive load), cited since 3.0.0
  but never written.
- **Project brand marker.** A `.cklph-diagram` file (`brand: <slug>`) at a
  client repo's root pins its brand; `brand-tokens.py --resolve --from <dir>`
  reports it. Precedence: brand named in the request → marker → house brand.
  Unlike upstream, a malformed marker or one naming a missing/stub brand is
  refused, never ignored — ignoring it would fall back to house colours. The
  search stops at the git root. `scripts/test-brand-marker.py` (23 cases, in
  `verify.sh`) covers hostile content and the search boundary.

### Fixed

- **SVG export shipped the wrong brand's fonts.** Upstream's exporter
  hardcoded its own Google Fonts import; it now uses the source page's link.
  `scripts/verify-export.py` asserts the outcome.
- **Template arrowheads and backgrounds ignored the brand.** The static
  templates' markers and background rect still carried upstream hexes.
- **Templates failed their own linter** (no prose-alternative slot, no
  `data-render-width`). `template.html`, `template-dark.html` and
  `template-motion.html` now lint clean and are gated.
- `self_check.py` rejected every brand-rendered file (URLs in provenance
  comments, the font `preconnect`).
- Templates scroll locally on narrow screens instead of scrolling the page,
  and print without clipping (from upstream).

### Changed

- SKILL.md detail moved to `primitives-core.md` and `layout-budget.md`, as
  upstream did; their snippets are rewritten in brand tokens at the 12px floor.

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
