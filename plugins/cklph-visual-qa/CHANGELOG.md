# Changelog

All notable changes to `cklph-visual-qa` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.4.0] - 2026-11-26

### Changed
- `design-lint` pins `impeccable` 4.10.0 (was 4.8.2). Checked on the chykalophia.com homepage at
  1440: same JSON shape plus an `advisory` field; 46 findings.
- `lint-filter.mjs` puts impeccable's advisory findings (4.10 marks `straggler` advisory) in the
  taste group instead of blocking, matching impeccable's own exit code.
- An exit 0 is reported as "scanned, nothing to check", never "clean". Access findings in the taste
  group (contrast, text too small) are checked like quality findings.

### Added
- The DESIGN.md drift rules (`design-system-color`, `-font`, `-radius`, `-font-size`) as a Kit drift
  check for WordPress and Elementor sites, with plugin CSS excused through the exceptions file.
- `--scope`, `--sarif` for GitHub code scanning (it bypasses the exceptions file, like `--github`),
  inline `impeccable-disable` and `--report-unused-ignores`.
- How impeccable's native binary arrives (`npm_config_ignore_scripts` doesn't stop it,
  `IMPECCABLE_BIN` skips it), and not to run `impeccable login` or `loop`, which offer to write into
  each agent's rule file.

## [0.3.0] - 2026-11-21

### Added
- `scripts/hallmark-lint`: runs Hallmark's page checker (`sloplint --url`, render tier) on a live
  page at eight widths, 320, 375, 414, 768, 1024, 1280, 1440 and 1920. Hallmark is pinned to commit `04977e1`, and only its scripts
  folder is fetched. `puppeteer-core` is installed beside it with install scripts off. In a root
  container it adds Chrome's `--no-sandbox`, which Hallmark can't pass itself.
- `scripts/lint-filter.mjs` and a per-site `.cklph/design-exceptions.json`: deliberate brand choices
  are listed once with a reason, and both detectors report them as excused. The rest is sorted into
  "check and fix or dismiss" and "taste". Tests in `tests/`, run in CI.
- `copy-lint` skill and `scripts/copy-lint.mjs`: finds the wording giveaways of AI-written copy on
  live pages or Markdown/MDX files, with no AI model. FAIL: two or more "X, not Y" headings, stock AI
  words, signposts, dashes in prose. WARN: blocks repeated across pages, repeated CTAs, intensifiers,
  stiff uncontracted English, exclamation marks. Uses the same exceptions file (`"tool": "copy"`).
- `visual-reviewer` page-shape review, which needs no design: hero fits 1280x800, no sideways scroll,
  capped width at 1920, section count, words per screen, how the page ends, heading spacing.

### Changed
- `design-lint` runs impeccable at four widths (1440, 1920, 768, 390) and Hallmark as a second
  detector, through the exceptions filter.
- `visual-verify` and `visual-reviewer` check 1920 and 768 as well as 1440 and 500. In the trial on
  chykalophia.com, impeccable missed a 37px sideways scroll at 1440, 390 and 768. Hallmark caught it
  at 768.

Adapted from: Hallmark (github.com/Nutlope/hallmark, MIT, commit 04977e1). The page-shape checks are
reworded from its page gates; its scripts are run, not copied. See `NOTICE.md`.

## [0.2.0] - 2026-11-11

### Added
- `design-lint` skill: runs the `impeccable` detector (Apache-2.0, pinned to 4.8.2 through npx, no
  AI model) on a live page at desktop and mobile widths, and says how to triage it. Readability and
  layout findings get checked and fixed; "looks generated" findings are taste and never fail a build.
  It also covers using it as a CI gate and keeping per-project exceptions in `.impeccable/config.json`.
  Tried on chykalophia.com and ooohm.team first: half the findings checked were real (14px text on a
  16px line height, 89-character lines), and the false positives seen are listed in the skill. Only
  the detector is used, not impeccable's skills, which repeat `cklph-os:frontend-ui`.

## [0.1.1] — 2026-10-27

### Fixed
- `shot crop` and `shot probe` no longer require Chrome; only a capture looks for the browser.
- `shot probe` took `<url> [width]` and ignored both. It now takes no arguments (it only prints the
  script to inject) and says so on stderr if old-style arguments are passed.
- `visual-reviewer` was told to fetch a Figma URL but has no Figma tools. It now expects an exported
  design image and asks for one if given only a URL.
- Docs say `shot` is logged out (it can't capture drafts or `?preview=true`), call it as
  `"${CLAUDE_PLUGIN_ROOT}/scripts/shot"`, and the README says how to put it on PATH. README heading no
  longer carries a stale version number.
- `shot probe` also flags elements past the LEFT viewport edge (`r.left < -3`), not just the right,
  and prints each offender's left/right; `overflow=0` now means neither edge.
- `visual-verify` and `visual-reviewer` examples call `"${CLAUDE_PLUGIN_ROOT}/scripts/shot"` (quoted,
  so an install path with spaces works) instead of bare `shot`.

## [0.1.0] — 2026-06-09

### Added
- Initial release.
- `visual-verify` skill — the capture→crop→compare→iterate loop, the headless-Chrome 500px-clamp
  phantom-overflow trap (+ JS overflow probe), ImageMagick `-trim` edge measurement, cache-busting.
- `visual-reviewer` agent — adversarial "prove it matches" reviewer returning a ranked delta list.
- `scripts/shot` — Chrome screenshot, ImageMagick crop, and overflow-probe helper (browser autodetect,
  `CKLPH_CHROME` override).
