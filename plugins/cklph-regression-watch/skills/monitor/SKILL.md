---
name: monitor
description: >
  Use to detect regressions on a live or staging website — when a deploy, theme update, plugin,
  or migration may have broken something. Triggers: "monitor this site", "did the deploy break
  anything", "regression check", "is the form/tracking/SEO still working", "watch [client] staging",
  "baseline this site". Captures a known-good baseline, re-checks on demand or on a schedule, and
  reports ONLY confirmed regressions with evidence. Built for many client sites at once.
---

# Regression Watch — regression monitor

Catch the moment a site regresses versus a known-good baseline. Availability, SEO integrity, tracking tag-firing, and visual changes today; user journeys next. Surface only what changed, scored by severity, with the evidence attached. A clean run is silent.

## Operating principles
1. **Compare to a baseline, never to absolutes.** A regression is "good in baseline, broken now." This is why it works on any site without hand-coding expectations.
2. **No finding without evidence.** Every alert carries its proof: the status code, the absent request, the before/after value, or the visual-diff image. (verification-before-completion.)
3. **Confirm before you alarm.** Re-test every non-pass; a finding counts only if it fails consistently. Flakes are quarantined, never alerted. This is the difference between a trusted monitor and alert-fatigue shelfware.
4. **Mask the dynamic, watch the structural.** Carousels, timestamps, A/B slots are masked per-site so they don't trip visual diff.
5. **Silent unless broken.** A passing run produces a report file but fires no alert.

## When to use
A deploy just shipped. A theme/plugin updated. A migration happened. Or on a schedule, to catch silent breakage before the client does. Point it at **staging** when you want to run full journeys safely.

## Workflow

👉 **Start here.**

1. **Config.** Copy `config.example.json` → `config.[client].json`. Set `baseUrl`, the `urls` to watch, visual `masks` (CSS selectors for dynamic regions), `retries`, and journeys (when enabled). One config per site.
2. **Capture baseline** once the site is in a known-good state:
   `node skills/monitor/scripts/capture.mjs --config config.[client].json --out baselines/[client]`
   Review the printed summary. If it's the state you want to defend, keep it.
3. **Run checks** (on demand or via a scheduled task):
   `node skills/monitor/scripts/run_checks.mjs --config config.[client].json --baseline baselines/[client]`
   The confirmation engine re-tests each non-pass `retries` times. Output is the report contract; exit code = number of confirmed regressions.
4. **Verify before alerting.** Hand confirmed findings to the `regression-verifier` agent. It re-reads each against its evidence and the baseline, drops anything unsupported or stale, and authorizes the alert.
5. **Alert (only if broken).** Send the headline + report link to Peter via a ClickUp Reminder. Client-facing summaries are drafted, never auto-sent.
6. **Roll the baseline forward** when a change is intentional and accepted: re-run `capture.mjs` to promote the new state so it stops re-alerting.

## How to run the self-test (the eval)
Prove the engine before trusting it. `config.fixture-demo.json` + `fixtures/` are a seeded-regression harness:
- Capture baseline of `fixtures/page.html` (good), run checks → PASS (the masked `#ticker` proves no false alarm on dynamic content).
- `cp fixtures/bad.html fixtures/page.html`, run checks → 7 confirmed regressions with evidence. Restore with `cp fixtures/good.html fixtures/page.html`.

## Reference map
- `@check-catalog.md` — every check, ID, severity, pass/changed/regressed criteria.
- `@thresholds.md` — retries, visual tolerance bands, masking guidance.

## Scripts (deterministic, re-runnable)
- `scripts/lib/probe.mjs` — capture one URL's signals (status, redirects, SEO, analytics firing, screenshot, mask boxes).
- `scripts/lib/evaluate.mjs` — diff current vs baseline → findings; visual diff via pixelmatch with masking.
- `scripts/capture.mjs` — write a versioned baseline.
- `scripts/run_checks.mjs` — re-check + confirmation engine + report; exit code = confirmed regressions.

## Guardrails
- Never alert without a confirmed re-test AND attached evidence. One failure is a flake until proven.
- Journeys use synthetic data and stop before any irreversible action (no real payments or lead submissions). Prefer staging.
- Never auto-send client-facing messages. Draft, then Peter approves. Internal pings to Peter are fine.
- Respect robots.txt, rate-limit politely, identify the crawler. Don't hammer production.
- Read per-site URLs/secrets from config, never hardcode them in the skill.

## Related
`cro-research-reporting` (conversion side of the same sites), `report-information-design` (client-facing write-up). Scheduling via the `scheduled-tasks` tool (v1) or n8n (multi-client fleet, v2).
