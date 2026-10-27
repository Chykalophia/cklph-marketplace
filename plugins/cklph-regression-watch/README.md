# Regression Watch — agentic regression monitor

Baseline a site, re-check it on a schedule, and alert **only on a confirmed regression with evidence attached**. Built for an agency watching many client sites. Availability, SEO integrity, tracking tag-firing, and visual regression work today; user journeys are scaffolded for the staging pilot.

Status: **v1 engine, verified working.** The spec is `skills/monitor/SKILL.md` (workflow), `check-catalog.md` (every check) and `thresholds.md` (retries, tolerance, masking).

## Install
```
/plugin install cklph-regression-watch --marketplace Chykalophia/cklph-marketplace
```
Then install the engine's dependencies. Run these from the plugin's own directory: `plugins/cklph-regression-watch/` in a clone of this repo, or the
installed copy under `~/.claude/plugins/` (`claude plugin list` shows it).
```bash
npm install          # installs Playwright + pixelmatch + pngjs
npx playwright install chromium
```

## Try the self-test (no live site needed)
A seeded-regression harness lives in `fixtures/`. It proves both halves of the engine, working on copies in a
temp dir so the tracked fixtures are never modified:
```bash
npm run self-test   # good page -> exit 0, PASS (dynamic #ticker is masked, no false alarm)
                    # bad page  -> exit 1, 7 confirmed regressions, each re-tested 3/3, with evidence
npm test            # unit tests for the visual check and the exit-code contract (no browser needed)
```

## Point it at a real site
```bash
cp config.example.json config.[client].json   # set baseUrl, urls, masks, journeys
node skills/monitor/scripts/capture.mjs   --config config.[client].json --out baselines/[client]
node skills/monitor/scripts/run_checks.mjs --config config.[client].json --baseline baselines/[client]
```
`run_checks.mjs` exits `0` when nothing is confirmed, `1` when there are confirmed regressions (the count is in the report), and `2` on an engine error (bad config, browser launch failure), so a scheduler can branch on it.

## What's in here
```
skills/monitor/
  SKILL.md                  the workflow + when-to-use
  check-catalog.md          every check, ID, severity, criteria
  thresholds.md             retries, visual tolerance, masking
  scripts/                  capture.mjs, run_checks.mjs, self_test.mjs, lib/{probe,evaluate}.mjs
agents/regression-verifier.md   gates every alert against the evidence
fixtures/                   the self-test pages (good.html / bad.html; page.html = good)
tests/                      unit tests (node --test)
config.example.json         per-client template
config.fixture-demo.json    config for the self-test
```

## How it stays trustworthy
- **Confirmation engine:** every non-pass is re-tested `retries` times; only consistent failures alert. Flakes are quarantined.
- **Masking:** dynamic regions (timestamps, carousels, banners) are blacked out before visual diff, at both their baseline and current positions.
- **Height changes are not diffs:** full-page screenshots are compared over their overlapping area; a page-size change is reported separately as FYI.
- **Evidence required:** every finding carries the status / absent request / before-after value / diff image.
- **Silent unless broken:** a passing run writes a report but fires no alert.
- **What it does not do:** it does not read robots.txt, throttle requests, or set a custom user agent. Each URL is loaded `retries` times by a default headless Chromium. Point it at sites you look after, and keep the URL list modest on production.

## Next (needs input / wiring)
- Staging URL + journey definitions to enable JN1–JN4 (full journeys on staging).
- Scheduling and alerting are not built in. Run `run_checks.mjs` from cron, CI or n8n and branch on the exit code; send the alert through your own channel.
- Optional politeness controls (robots.txt, a delay between URLs, an identifying user agent).
- v1.1: broken-link crawl (AV3), sitemap (SE5), Semrush site-audit delta (SE7), key-element presence (VR2).
- v2: Core Web Vitals via Lighthouse, GA4 volume sanity (needs a GA4 connector), n8n multi-client fleet.
