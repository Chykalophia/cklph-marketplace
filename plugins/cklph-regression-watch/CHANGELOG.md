# Changelog

All notable changes to `cklph-regression-watch` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.1.0] — 2026-06-09

### Added — initial release
- **`monitor`** skill — baseline a live/staging site, re-check on demand or on a schedule, surface only confirmed regressions with evidence.
- Engine: availability (HTTP/redirects), SEO integrity (title/canonical/H1/indexability/JSON-LD), tracking tag-firing (GA4/GTM via network capture), visual regression (pixelmatch + dynamic-region masking).
- **Confirmation engine** — re-tests every non-pass; alerts only on consistent failures; quarantines flakes.
- **`regression-verifier`** agent — gates every alert against captured evidence before it fires.
- Self-test harness (`fixtures/` + `config.fixture-demo.json`): proves no false alarm on dynamic content and catches 7/7 seeded regressions.

### Notes
- Reuses off-the-shelf primitives (Playwright + pixelmatch); the value is the on-demand, agent-interpreted, own-your-data layer — not a 24/7 monitoring SaaS.
- Journeys (full, on staging) and scheduling are scaffolded; enabling them needs a target staging URL + journey config.
