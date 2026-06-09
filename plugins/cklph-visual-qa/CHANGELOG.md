# Changelog

All notable changes to `cklph-visual-qa` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.1.0] — 2026-06-09

### Added
- Initial release.
- `visual-verify` skill — the capture→crop→compare→iterate loop, the headless-Chrome 500px-clamp
  phantom-overflow trap (+ JS overflow probe), ImageMagick `-trim` edge measurement, cache-busting.
- `visual-reviewer` agent — adversarial "prove it matches" reviewer returning a ranked delta list.
- `scripts/shot` — Chrome screenshot, ImageMagick crop, and overflow-probe helper (browser autodetect,
  `CKLPH_CHROME` override).
