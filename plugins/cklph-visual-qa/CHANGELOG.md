# Changelog

All notable changes to `cklph-visual-qa` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.1.1] — 2026-10-27

### Fixed
- `shot crop` and `shot probe` no longer require Chrome; only a capture looks for the browser.
- `shot probe` took `<url> [width]` and ignored both. It now takes no arguments (it only prints the
  script to inject) and says so on stderr if old-style arguments are passed.
- `visual-reviewer` was told to fetch a Figma URL but has no Figma tools. It now expects an exported
  design image and asks for one if given only a URL.
- Docs say `shot` is logged out (it can't capture drafts or `?preview=true`), call it as
  `${CLAUDE_PLUGIN_ROOT}/scripts/shot`, and the README says how to put it on PATH. README heading no
  longer carries a stale version number.

## [0.1.0] — 2026-06-09

### Added
- Initial release.
- `visual-verify` skill — the capture→crop→compare→iterate loop, the headless-Chrome 500px-clamp
  phantom-overflow trap (+ JS overflow probe), ImageMagick `-trim` edge measurement, cache-busting.
- `visual-reviewer` agent — adversarial "prove it matches" reviewer returning a ranked delta list.
- `scripts/shot` — Chrome screenshot, ImageMagick crop, and overflow-probe helper (browser autodetect,
  `CKLPH_CHROME` override).
