# Regression Watch — agentic regression monitor

Baseline a site, re-check it on a schedule, and alert **only on a confirmed regression with evidence attached**. Built for an agency watching many client sites. Availability, SEO integrity, tracking tag-firing, and visual regression work today; user journeys are scaffolded for the staging pilot.

Status: **v1 engine, verified working.** See `docs/SPEC.md` for the full spec.

## Install
```bash
cd cklph-regression-watch
npm install          # installs Playwright + pixelmatch + pngjs
npx playwright install chromium
```

## Try the self-test (no live site needed)
A seeded-regression harness lives in `fixtures/`. It proves both halves of the engine:
```bash
# 1) baseline the good page, then re-check it (PASS — dynamic #ticker is masked, no false alarm)
node skills/monitor/scripts/capture.mjs   --config config.fixture-demo.json --out baselines/demo
node skills/monitor/scripts/run_checks.mjs --config config.fixture-demo.json --baseline baselines/demo

# 2) simulate a bad deploy, then re-check (7 confirmed regressions, each re-tested 3/3, with evidence)
cp fixtures/bad.html fixtures/page.html
node skills/monitor/scripts/run_checks.mjs --config config.fixture-demo.json --baseline baselines/demo

# restore
cp fixtures/good.html fixtures/page.html
```

## Point it at a real site
```bash
cp config.example.json config.[client].json   # set baseUrl, urls, masks, journeys
node skills/monitor/scripts/capture.mjs   --config config.[client].json --out baselines/[client]
node skills/monitor/scripts/run_checks.mjs --config config.[client].json --baseline baselines/[client]
```
`run_checks.mjs` exits with the number of confirmed regressions (0 = all good), so a scheduler can branch on it.

## What's in here
```
skills/monitor/
  SKILL.md                  the workflow + when-to-use
  check-catalog.md          every check, ID, severity, criteria
  thresholds.md             retries, visual tolerance, masking
  scripts/                  capture.mjs, run_checks.mjs, lib/{probe,evaluate}.mjs
agents/regression-verifier.md   gates every alert against the evidence
fixtures/                   the self-test (good.html / bad.html / page.html)
config.example.json         per-client template
config.fixture-demo.json    config for the self-test
docs/SPEC.md                full build spec
```

## How it stays trustworthy
- **Confirmation engine:** every non-pass is re-tested `retries` times; only consistent failures alert. Flakes are quarantined.
- **Masking:** dynamic regions (timestamps, carousels, banners) are blacked out before visual diff.
- **Evidence required:** every finding carries the status / absent request / before-after value / diff image.
- **Silent unless broken:** a passing run writes a report but fires no alert.

## Next (needs input / wiring)
- Staging URL + journey definitions to enable JN1–JN4 (full journeys on staging).
- Scheduling via the `scheduled-tasks` tool (daily) → alert to a ClickUp Reminder.
- v1.1: broken-link crawl (AV3), sitemap (SE5), Semrush site-audit delta (SE7), key-element presence (VR2).
- v2: Core Web Vitals via Lighthouse, GA4 volume sanity (needs a GA4 connector), n8n multi-client fleet.
