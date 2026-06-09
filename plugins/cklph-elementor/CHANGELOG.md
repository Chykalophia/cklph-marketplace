# Changelog

All notable changes to `cklph-elementor` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

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
