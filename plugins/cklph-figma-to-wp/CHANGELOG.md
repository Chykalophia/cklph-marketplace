# Changelog

All notable changes to `cklph-figma-to-wp` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.1.0] — 2026-06-09

### Added
- Initial release — the orchestrator over cklph-wp / cklph-elementor / cklph-figma / cklph-visual-qa.
- `start-here` — the pipeline overview + routing to the right plugin per step; the two core rules.
- `translate` — gated end-to-end build loop (scope → learn → safe copy → generate → verify → responsive
  → ship) with guardrails (live templates, functional-widget decisions, don't redefine the Kit).
- `tokenize` — reuse discipline: bind to Kit globals, mirror existing-page conventions, promote repeats.
