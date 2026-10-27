# Changelog

All notable changes to `cklph-regression-watch` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.1.2] — 2026-10-27

### Fixed
- **Visual check:** any page-height change was reported as a confirmed "Visual diff 100%" High
  regression. Screenshots are now compared over the area they share, and a size change is its own
  `VR1-size` FYI finding. Mask boxes from the baseline capture are applied as well as the current
  ones, so a dynamic block that moved no longer alerts.
- **Baseline paths:** screenshot paths were stored relative to the cwd at capture time, so running
  from another directory, or after moving the baseline, skipped the visual check silently. They are
  now stored relative to the baseline dir and resolved against `--baseline` (older baselines still
  resolve). A missing baseline screenshot, or a URL that is not in the baseline, is now reported.
- **Exit code:** `run_checks.mjs` exited with the regression count, so a crash read as "1
  regression" and 256 regressions read as success. It now exits `0` clean, `1` regressions found,
  `2` engine error.
- **Docs:** SKILL.md promised robots.txt handling, rate limiting and an identified crawler, and the
  docs named a `scheduled-tasks` tool and a Medium opt-in switch; none exist. The docs now say what
  the engine does. Removed `docs/SPEC.md`, which described an older layout; the README points at
  SKILL.md, `check-catalog.md` and `thresholds.md`.
- **Self-test:** no longer overwrites the tracked `fixtures/page.html`. `npm run self-test` works on
  copies in a temp dir; `npm test` adds browser-free unit tests for each fix above.
- README: added the marketplace install line and where to run `npm install`.
- `package.json` version synced with `plugin.json`.

## [0.1.1] — 2026-10-26

### Changed
- Removed local-machine links from `docs/SPEC.md`; the example config uses
  `qa@example.com` instead of an internal address. No behavior change.

## [0.1.0] — 2026-06-09

### Added — initial release
- **`monitor`** skill — baseline a live/staging site, re-check on demand or on a schedule, surface only confirmed regressions with evidence.
- Engine: availability (HTTP/redirects), SEO integrity (title/canonical/H1/indexability/JSON-LD), tracking tag-firing (GA4/GTM via network capture), visual regression (pixelmatch + dynamic-region masking).
- **Confirmation engine** — re-tests every non-pass; alerts only on consistent failures; quarantines flakes.
- **`regression-verifier`** agent — gates every alert against captured evidence before it fires.
- Self-test harness (`fixtures/` + `config.fixture-demo.json`): proves no false alarm on dynamic content and catches 7/7 seeded regressions.

### Notes
- Reuses off-the-shelf primitives (Playwright + pixelmatch); the value is the on-demand, agent-interpreted, own-your-data layer — not a 24/7 monitoring SaaS.
- Journeys (full, on staging) and scheduling are scaffolded; enabling them needs a target staging URL + journey config.
