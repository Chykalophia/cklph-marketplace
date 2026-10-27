# Changelog

All notable changes to `cklph-figma-to-wp` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.1.1] — 2026-10-27

### Fixed
- `translate` / `start-here` told you to screenshot the inert draft, which `shot` (logged out) can't
  load. The verify step now uses a staging test URL the safe copy is published to (see
  `elementor-templates`, "Seeing the safe copy"), and asks the user when there is no staging site.
- `start-here` no longer describes "one kept-open connection" (cklph-wp defaults to per-command
  connections since 0.3.0).
- `tokenize` points at `./.cklph-wp.d/site-profile.md` for per-site notes (cklph-wp 0.3.1 layout).
- The README says how to put `cwp`, `el-tools.py` and `shot` on PATH, since the skills call them by
  bare name. README heading no longer carries a stale version number.

## [0.1.0] — 2026-06-09

### Added
- Initial release — the orchestrator over cklph-wp / cklph-elementor / cklph-figma / cklph-visual-qa.
- `start-here` — the pipeline overview + routing to the right plugin per step; the two core rules.
- `translate` — gated end-to-end build loop (scope → learn → safe copy → generate → verify → responsive
  → ship) with guardrails (live templates, functional-widget decisions, don't redefine the Kit).
- `tokenize` — reuse discipline: bind to Kit globals, mirror existing-page conventions, promote repeats.
