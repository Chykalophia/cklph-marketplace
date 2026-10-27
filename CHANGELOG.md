# Changelog

Marketplace-level changes only: plugins added or removed, catalog and repo layout. Each plugin keeps
its own version history in `plugins/<name>/CHANGELOG.md` (cklph-os included).
Format: [Keep a Changelog](https://keepachangelog.com).

## 2026-10-27

### Changed
- Repo cleanup: cklph-os's version history moved from this file to
  `plugins/cklph-os/CHANGELOG.md`, like every other plugin. This file now records marketplace
  events only.

## 2026-10-26

### Removed
- Two private plugins moved out of the public marketplace.

## 2026-06-09

### Added
- `cklph-regression-watch`: on-demand site regression monitor (baseline a site, surface only
  confirmed regressions with evidence).
