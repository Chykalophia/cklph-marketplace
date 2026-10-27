# Changelog

All notable changes to `cklph-elementor` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.1.2] — 2026-10-27

### Fixed
- `el-tools.py add-style` is idempotent: it removes every existing `elcss01` style widget from the
  whole tree before attaching, so re-runs and moving between `@root` / `@id:<id>` no longer duplicate
  the widget (and its element id). A target other than `@root` or `@id:<id>` is rejected with a clear
  message. The usage example passed `'@id'`, which always failed; it now uses `'@root'`.
- `elementor-styling`: removed the dead `cwp wp eval 'echo "";'` + raw `ssh host` command; control-name
  lookup now points at `version-docs` (cklph-wp) instead of restating it here and in `css-gotchas.md`.
- `elementor-templates`: the conditions-cache example uses `cwp eval`; added "Seeing the safe copy",
  since a draft can't be screenshotted logged out (publish scoped to one test object, staging only).
- Scripts are referenced as `${CLAUDE_PLUGIN_ROOT}/scripts/el-tools.py`; the README says how to put
  `el-tools.py` and cklph-wp's `cwp` on PATH. README heading no longer carries a stale version number.

## [0.1.1] — 2026-10-26

### Changed
- `elementor-data` example uses a neutral color value. No behavior change.

## [0.1.0] — 2026-06-09

### Added
- Initial release, distilled from a full Figma→Elementor single-product/header/footer build.
- `elementor-data` — the `_elementor_data` model, the read→understand→write loop, slash-safe writes,
  learning a site's conventions before generating.
- `elementor-styling` + `references/css-gotchas.md` — the reliable html-widget `<style>` channel
  (container `custom_css` doesn't emit), variable-driven flex gaps, inner-margin spacing, reading
  control names from widget source, the WooCommerce `.cart button` scoping trap.
- `elementor-templates` — finding the template that actually renders, display conditions + cache
  regenerate, safe-copy editing, template preview, reusing Kit globals via `__globals__`.
- `elementor-responsive` — column stacking, `min-width:0` flex fix, WooCommerce gallery/flexslider,
  nav-menu collapse (header `tablet` vs footer `none`), overlapping-header top padding.
- `scripts/el-tools.py` — `validate` / `tree` / `widgets` / `add-style`.
