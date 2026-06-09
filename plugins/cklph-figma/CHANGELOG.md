# Changelog

All notable changes to `cklph-figma` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.1.0] — 2026-06-09

### Added
- Initial release.
- `figma-read` — URL parsing, tool order (metadata → screenshot → design_context → variable_defs),
  skipping `hidden="true"` alternates, asset download, multi-state component handling.
- `figma-tokens` — distilling colors/type/spacing into a map and binding to the target's existing
  design system (Elementor Kit globals, Tailwind/CSS vars) instead of hardcoding.
