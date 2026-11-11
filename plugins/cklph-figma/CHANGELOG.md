# Changelog

All notable changes to `cklph-figma` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.3.0] - 2026-11-11

### Added
- `design-md`: write a client's DESIGN.md (Google's design.md format) in the client repo from the
  real token source, one file per theme or mode, lint it with `@google/design.md@0.4.0` pinned
  through npx, run the contrast check, diff against the live CSS, and re-run on token changes.
- `scripts/contrast.mjs`, the plugin's first script: a zero-dependency WCAG contrast check that
  reads a JSON pair list or a DESIGN.md's components. It composites alpha over the canvas, uses
  3:1 for large text and UI edges, and reads hex, rgb(), rgba() and oklch(). Exit 0 pass, 2 fail,
  1 bad input. Tests in `tests/contrast.test.mjs`, run in CI.

## [0.2.0] — 2026-11-05

### Added
- `figma-write-check`, ported from the claude.ai skill of the same name: confirms the edit-capable
  connector is loaded, the signed-in seat, file access, and a create-and-remove write probe before the
  first edit, then verifies every write landed. Adapted on the way in: Claude Code setup steps (the
  Figma plugin, not a Connectors page), `figma-use` loaded before the probes, a Dev seat can edit its
  own drafts, connection errors are no longer read as "no access", and writes that leave no canvas
  node (variables, styles, deletions) get their own read-back. Both probes pass the parsed `fileKey`
  (they could hit the connector's last file), FigJam and Slides URLs parse, and the write probe
  removes its frame even if the lookup throws.

## [0.1.1] — 2026-10-26

### Changed
- `figma-tokens` example uses neutral brand token names and colors. No behavior change.

## [0.1.0] — 2026-06-09

### Added
- Initial release.
- `figma-read` — URL parsing, tool order (metadata → screenshot → design_context → variable_defs),
  skipping `hidden="true"` alternates, asset download, multi-state component handling.
- `figma-tokens` — distilling colors/type/spacing into a map and binding to the target's existing
  design system (Elementor Kit globals, Tailwind/CSS vars) instead of hardcoding.
