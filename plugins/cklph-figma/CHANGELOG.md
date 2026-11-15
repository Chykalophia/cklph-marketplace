# Changelog

All notable changes to `cklph-figma` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.4.0] - 2026-11-13

### Added
- `figma-audit`: a read-only hand-off audit of one Figma page, published as a ClickUp fix list.
  Each row links the section, gives the exact layer path, and shows a crop of the screen with the
  problem boxed in red. Problems inside components are reported once against the main component.
  A recheck adds a new doc page marking each earlier row fixed, open, improved, removed or new.
  Built from a client's feedback on a hand-made audit: links landed on tiny or deleted layers,
  "which part?" had no answer for counted findings, and there were no screenshots.
- `scripts/figma-audit.mjs` and `figma-audit-rules.mjs`: emit the `use_figma` scan, join its
  hash-checked parts (use_figma refuses returns over 48,000 bytes), check every link exists,
  render the report, plan and annotate screenshots with ImageMagick, upload them with ClickUp
  connector tickets, and diff a recheck. Zero dependencies. Tests run the emitted scan against a
  mock Figma file. Rule skips (auto-layout fill widths, icon internals, nested repeats) come from
  false positives on a real file.
- A recheck rescans with `script --like old.json` and refuses two scans made with different
  settings, so a changed threshold or a shift in the inferred brand fonts never reads as fixed.
  `report` requires the link check unless `--unchecked-links` marks a private draft.

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
