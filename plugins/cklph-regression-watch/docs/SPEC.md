# Regression Watch — Agentic Regression Monitor (v1 build spec)

**Prepared for:** Peter Krzyzek (CTO, Chykalophia)
**Date:** June 8, 2026
**Status:** v1 engine **built and verified** (June 9, 2026) — availability, SEO integrity, tracking tag-firing, visual regression + the confirmation engine all working; self-test passes (no false alarm on dynamic content, 7/7 seeded regressions caught with evidence). Runnable source in `cklph-regression-watch/`. Journeys + scheduling pending the staging URL. Codename "Regression Watch" is a placeholder.
**Companion:** [Skills landscape report](computer:///Users/peterkrzyzek/Documents/Claude/Projects/Team%20Task%20%26%20Project%20Management/claude-skills-landscape-2026-06.md) (Part 6 = the gap this fills; Part 3 = the anti-slop rubric this is built on).

---

## TL;DR

Regression Watch watches a live client site on a schedule and tells us the moment something **regresses** versus a known-good baseline: a page 500s, a form breaks, the GA4 tag stops firing, a title tag vanishes, the hero shifts, structured data disappears. It surfaces **only what changed**, scores it by severity, and attaches the evidence (the failing request, the HTTP status, the screenshot diff). No wall of green. No alert fatigue.

It's the one gap from the landscape report that's both a real moat and a recurring-revenue product: nobody public ships a maintained regression suite for production marketing sites, and our structural advantage is that we run many client sites at once.

**Verified before writing this:** headless Chromium runs in our environment right now. I installed Playwright + Chromium (v148) and confirmed live navigation (HTTP 200), title/H1 extraction, network interception (the tag-firing signal), and full-page screenshots all work. The technical core is de-risked. This is buildable now.

📝 **The whole product in one line:** baseline a site, re-check it on a schedule, alert only on a *confirmed* regression with evidence attached.

---

## 1. The problem (and the trap)

🔴 **The problem.** Client sites silently break. A theme update kills the contact form. A tag-manager change stops conversion tracking. A migration drops canonical tags. A plugin shifts the hero and tanks CLS. We find out when the client emails us angry, or worse, when their leads have been dropping for three weeks. As an agency maintaining a portfolio of sites, the blast radius is multiplied and so is the opportunity.

🔴 **The trap that makes most monitors slop.** Flakiness. A naive monitor re-runs checks, hits a slow network or an A/B test or a cookie banner, and screams "REGRESSION." After three false alarms nobody trusts it. Alert fatigue kills the product. **The hard, valuable engineering here is not running checks. It's deciding, with confidence, that a change is real and worth a human's attention.** That confidence engine is the heart of v1 (Section 4).

📝 This is exactly the anti-slop thesis: a finding is only allowed to exist if it's backed by re-tested evidence. "Verification before completion," applied to monitoring.

---

## 2. Product shape

Regression Watch is a Claude Code plugin built to the Tier-1 pattern from the landscape report: progressive-disclosure skill + bundled scripts + reference files + a verifier agent + a scheduler.

```
cklph-regression-watch/                         (the plugin)
├─ skills/
│  └─ regression-monitor/
│     ├─ SKILL.md                 the workflow + when-to-use (≤5k tokens)
│     ├─ references/
│     │  ├─ check-catalog.md      every check, ID, severity, criteria
│     │  ├─ thresholds.md         tolerance bands (what counts as "changed" vs "regressed")
│     │  └─ baseline-format.md    the baseline artifact schema
│     ├─ scripts/                 deterministic, re-runnable executors
│     │  ├─ capture.mjs           snapshot a URL set → baseline JSON + screenshots
│     │  ├─ run_checks.mjs        re-snapshot + compare to baseline → findings JSON
│     │  ├─ journeys.mjs          Playwright user-journey assertions
│     │  ├─ seo_checks.mjs        title/meta/canonical/h1/JSON-LD/robots/sitemap
│     │  ├─ tracking_checks.mjs   GA4/GTM tag-firing via network capture
│     │  └─ visual_diff.mjs       screenshot diff vs baseline (pixelmatch)
│     └─ assets/
│        └─ report-template.md    the output contract
├─ agents/
│  └─ regression-verifier.md      confirms a flagged regression is real before it alerts
└─ .claude-plugin/marketplace.json
```

**How it runs (the loop):**

1. 👇 **Capture baseline** once per site (`capture.mjs`). Stores a versioned snapshot: per-URL HTTP status, headers, rendered HTML signals, the firing-tags set, and a full-page screenshot. Saved to the client's workspace folder, committed as the known-good state.
2. **Scheduled run** re-snapshots and diffs against the baseline (`run_checks.mjs`) → a findings list (pass / changed / regressed, each severity-weighted).
3. **Confirmation engine** re-tests every non-pass to kill flakes (Section 4). Only *confirmed* regressions survive.
4. **Verifier agent** reviews confirmed findings against the evidence, drops anything unsupported, and writes the report.
5. **Alert** fires only if something real regressed: a ClickUp Reminder to Peter (verified channel) + a saved report. Client-facing summaries are draft-first, never auto-sent.
6. **Baseline roll-forward** on approval: once a change is reviewed and accepted (e.g., an intentional redesign), promote the new snapshot to baseline so it doesn't re-alert.

---

## 3. What it monitors — the check catalog

Grouped by surface, severity-weighted, each with its data binding. This is the v1 catalog; it's designed to grow like thatrebeccarae's `CHECKS.md`.

### 🟦 Availability & integrity — *data-ready now (Playwright + web_fetch)*

| ID | Check | Severity | Regressed when |
|---|---|---|---|
| AV1 | HTTP status per monitored URL | Critical | Was 200, now 4xx/5xx |
| AV2 | Redirect chain integrity | High | New redirect, loop, or chain to wrong target |
| AV3 | Broken internal links | High | Link that was 200 now 4xx/5xx |
| AV4 | Page weight / render errors | Medium | Console errors appear, or DOM fails to render key region |
| AV5 | Mixed content / cert | High | HTTPS errors or insecure requests appear |

### 🟪 Journeys — *data-ready now (Playwright), with a safety rule*

| ID | Check | Severity | Regressed when |
|---|---|---|---|
| JN1 | Primary CTA reachable + clickable | Critical | CTA missing, or click doesn't reach expected state |
| JN2 | Contact / lead form submits | Critical | Form errors, or success state not reached (test data, stop-before-real-submit) |
| JN3 | Search / nav works | Medium | Key nav path broken |
| JN4 | Checkout reaches payment step | Critical | Cart→checkout flow breaks before the payment boundary (never completes a real purchase) |

🔴 **Safety rule:** journeys use synthetic test data and **stop before any irreversible action** (real payment, real lead submission to the client's CRM). Prefer staging where available. Never place an order or submit money. (Mirrors the global never-do list.)

### 🟧 SEO integrity — *data-ready now (Playwright/HTML) + Semrush MCP for depth*

| ID | Check | Severity | Regressed when |
|---|---|---|---|
| SE1 | Title + meta description present/stable | High | Title empty, duplicated site-wide, or changed unexpectedly |
| SE2 | Canonical tag present + correct | High | Canonical removed or points off-domain |
| SE3 | Single H1 / heading structure | Medium | H1 lost or multiplied |
| SE4 | Indexability (robots meta, x-robots, robots.txt) | Critical | New `noindex`/`Disallow` on pages that should be indexed |
| SE5 | Sitemap reachable + non-empty | Medium | Sitemap 404s or empties |
| SE6 | JSON-LD structured data present + valid type | High | Schema block disappears or breaks |
| SE7 | Semrush site-audit health delta | Medium | New crawl errors vs last run (`siteaudit_research`) |

### ⬜ Tracking integrity — *data-ready now (Playwright network capture) + GA4 MCP*

| ID | Check | Severity | Regressed when |
|---|---|---|---|
| TR1 | GA4 / gtag fires on key pages | Critical | No `google-analytics.com/g/collect` (or server-side equivalent) request on load |
| TR2 | GTM container loads | High | No `googletagmanager.com/gtm.js` request |
| TR3 | Key conversion event fires on journey | Critical | Expected event (e.g., `generate_lead`) not seen in network capture during JN2 |
| TR4 | Consent Mode v2 signals present (EU) | High | Consent params missing where required |
| TR5 | No duplicate analytics (GA4 + native) | Medium | Same conversion double-counted |
| TR6 | GA4 data continuity (volume sanity) | Medium | Event volume drops to ~0 vs trailing baseline — *needs a GA4 connector (v2); Shopify clients covered via ShopifyQL today* |

### Visual regression — *data-ready now (Playwright + pixelmatch)*

| ID | Check | Severity | Regressed when |
|---|---|---|---|
| VR1 | Above-the-fold visual diff vs baseline | High | Pixel-diff over tolerance after masking dynamic regions |
| VR2 | Key element presence (logo, nav, hero, footer) | High | A required element's bounding box vanishes |

📝 **Deferred to v2 (needs extra wiring, not data-ready in-sandbox):** Core Web Vitals via Lighthouse/PSI (LCP/CLS/INP scoring), full-site crawl depth, accessibility regressions, multi-locale.

---

## 4. The confirmation engine (the part that matters most)

This is what separates Regression Watch from a slop monitor. A finding earns the right to alert only by passing all of these.

1. 🔴 **Baseline + tolerance bands.** Every check compares to the stored baseline, not an absolute. Numeric checks (visual diff %, event counts) use tolerance bands from `thresholds.md`, not exact equality. "Changed within band" ≠ "regressed."
2. 🔴 **Dynamic-region masking.** Visual + DOM checks mask known-dynamic zones (carousels, timestamps, A/B slots, cookie banners) declared per-site, so they don't trip VR1.
3. 🔴 **Re-test to confirm (anti-flake).** Any non-pass is automatically re-run N times (default 3) with jitter. A finding is "confirmed" only if it fails consistently. One-off failures are logged as flakes, not alerted.
4. 🔴 **Quarantine.** A check that flaps (passes/fails inconsistently across runs) is auto-quarantined and surfaced as "needs a tolerance tweak," never as a regression.
5. 🔴 **Evidence required.** Every confirmed finding carries its proof: the HTTP status, the exact failing request URL, the assertion that failed, or the before/after screenshot crop. No evidence → no finding. (Verification-before-completion.)
6. 🔴 **Verifier agent sign-off.** `regression-verifier` (separate context, read-only) re-reads each confirmed finding against its evidence and the baseline, drops anything unsupported or stale, and only then authorizes the alert.

📝 Net effect: by construction, Regression Watch cannot emit an unverified alarm. That's the moat and the trust.

---

## 5. Data bindings — honest readiness

| Surface | Binding | Status |
|---|---|---|
| Availability, journeys, visual, SEO HTML signals, tag-firing | **Playwright headless Chromium** in our sandbox | ✅ Verified working today |
| Redirects, robots.txt, sitemap, raw HTTP | `web_fetch` / fetch in script | ✅ Available |
| SEO site-audit depth, crawl-error deltas | **Semrush MCP** (`siteaudit_research`, `url_research`, `organic_research`) | ✅ Connected |
| GA4 event-volume continuity (TR6) | GA4 Data API connector | ⛔ **Not currently connected.** TR6 deferred to v2 (or we connect a GA4 connector). For Shopify clients, ShopifyQL (`run-analytics-query`) covers traffic/conversion continuity today. Note: tag-*firing* (TR1–TR5) needs no GA4 API — it's Playwright network capture, verified. |
| Scheduling (v1) | `scheduled-tasks` (daily/weekly cron) | ✅ Available |
| Scheduling (agency fleet, v2) | **n8n MCP** | ✅ Connected (for multi-client orchestration later) |
| Alert to Peter | **ClickUp Reminder** (verified agent→Peter channel) | ✅ Per memory |
| Client-facing summary | Email **draft** (Gmail), draft-first | ✅ Available, approval-gated |
| Core Web Vitals scoring | Lighthouse / PSI | ⛔ v2 — needs wiring |

📝 The point of the landscape report stands here: the methodology exists publicly, but the *live-data binding* is what we have and they don't. Every check above cites real data the agent pulled.

---

## 6. How it maps to the anti-slop rubric

Built deliberately against Part 3 of the landscape report.

- **Progressive disclosure** — thin SKILL.md, detail in `references/`, logic in `scripts/`. One level deep.
- **Executable scripts for determinism** — diffing, masking, network parsing live in checked-in `.mjs`, not regenerated each run.
- **Data-grounding before opinion** — no finding without a captured artifact behind it.
- **Citation discipline** — every alert links its evidence (request URL, status, screenshot crop).
- **Verifier subagent** — `regression-verifier` gates every alert, separate context.
- **Verification-before-completion** — the confirmation engine *is* this principle.
- **Named guardrails + rationalization table** — Section 8.
- **Plan → validate → execute** — capture baseline (plan), confirm deltas (validate), alert (execute).
- **Calibrated freedom** — fragile steps (payment boundary, destructive actions) are hard-stopped; check authoring is flexible.
- **Eval-driven** — we build the eval harness first (Section 9).

---

## 7. Output contract

A scheduled run produces a `regression-report.md` per site and, only if a confirmed regression exists, an alert.

```
REGRESSION WATCH — <client> — <date> — <PASS | N REGRESSIONS>
Baseline: <id/date>   URLs checked: <n>   Confirmed: <n>   Flakes filtered: <n>

🔴 Regressions (confirmed, severity-ordered)
  [TR1 · Critical] GA4 tag stopped firing on /contact
    Evidence: 0 requests to g/collect on load (baseline: 1). Re-tested 3/3 fail.
    First seen: this run. Likely cause: GTM container change.

🟧 Changes (within tolerance / FYI)
  [VR1] Hero image swapped on /  (visual diff 6%, masked banner) — looks intentional

✅ Passing: 47 checks   ⏸ Quarantined: 1 (JN3 flapping)
```

**Alert routing:** confirmed regression → ClickUp Reminder to Peter with the one-line headline + link to the report. Client-facing note is drafted, never auto-sent.

📝 Design rule: a clean run is silent (or a once-weekly "all green" digest if you want it). Alerts mean something.

---

## 8. Guardrails (named never-do list)

1. ⛔ Never alert without a confirmed re-test **and** attached evidence. A single failed check is a flake until proven otherwise.
2. ⛔ Never complete an irreversible journey step — no real payments, no real lead submissions. Stop at the boundary; prefer staging.
3. ⛔ Never auto-send a client-facing message. Draft, then Peter approves. (Internal pings to Peter are fine.)
4. ⛔ Never treat an intentional change as a regression after it's been accepted — roll the baseline forward on approval.
5. ⛔ Respect `robots.txt`, rate-limit politely, identify the crawler. Don't hammer a client's production box.
6. ⛔ Never hardcode per-client secrets/URLs in the skill — read them from a per-client config.

**Rationalization table (for the skill body):**

| Excuse | Reality |
|---|---|
| "It failed once, that's probably real" | Re-test 3×. One failure is a flake. |
| "The screenshot looks different, alert" | Mask dynamic zones + check tolerance first. |
| "Tag missing, must be broken" | Confirm across retries; check if page legitimately changed. |
| "Client should know now" | Peter approves client-facing comms first. |

---

## 9. Eval plan (built first, per the rubric)

We prove Regression Watch works before trusting it — by injecting known regressions and confirming catch-rate + false-alarm-rate.

- **Seeded-regression suite:** a test site (or a copy) where we deliberately break things — remove the GA4 tag, add `noindex`, 500 a page, shift the hero, break a form. Regression Watch must catch each (true positives).
- **Flake-injection test:** introduce a slow/A-B/cookie-banner condition that *isn't* a regression. Regression Watch must filter it (no false positive). This is the make-or-break eval.
- **Baseline-rollforward test:** accept an intentional change; confirm it stops alerting.
- **Targets for v1 pilot:** ≥95% catch on seeded critical regressions, ≤1 false alarm per site per week. These are the "done" bar.

📝 Judges before polish: a Regression Watch that never false-alarms on the flake test but catches every seeded break is the spec of "working."

---

## 10. Scope — v1 vs later

🟩 **v1 (MVP, one pilot client):**
- Check surfaces: Availability, SEO integrity, Tracking tag-firing, Visual regression, 1–2 journeys.
- Single site, ~10–25 key URLs, scheduled daily via `scheduled-tasks`.
- Confirmation engine + verifier agent + evidence-linked report + ClickUp alert.
- Eval harness (seeded + flake tests) passing the v1 targets.

🟧 **v2:**
- Core Web Vitals via Lighthouse/PSI. Full-crawl link checking. Accessibility deltas.
- Multi-client fleet via n8n (one workflow, many sites, staggered).
- A live status artifact (the persistent HTML dashboard) Peter/clients can open.

⬜ **Vision:**
- Productized "agentic site monitoring" as a recurring growth-services line. Client-facing monthly "site health" report auto-drafted. Tie regressions to revenue impact via GA4.

---

## 11. Build milestones

| # | Milestone | Output | Status |
|---|---|---|---|
| 0 | Runtime spike (Playwright + Chromium in env) | Verified nav + network + screenshot | ✅ Done |
| 1 | Baseline capture (`capture.mjs`) + schema | Versioned snapshot | ✅ Built |
| 2 | Check scripts (availability, SEO, tracking, visual) | Findings JSON vs baseline | ✅ Built |
| 3 | Confirmation engine (re-test, masking, tolerance, quarantine) | Only-confirmed findings | ✅ Built |
| 4 | `regression-verifier` agent + report contract | Evidence-gated report | ✅ Built |
| 5 | Eval harness (seeded + flake) | Self-test passes (PASS + 7/7 caught) | ✅ Passing |
| 6 | Scheduler + ClickUp alert + journeys on staging | End-to-end on pilot | ⏳ Needs staging URL |
| 7 | Pilot run (2 weeks) | Tune thresholds, prove low false-alarm | Pending |

📝 Milestones 1–4 are the real build. 0 is done. If you greenlight, milestone 1 (baseline capture on a real client URL set) is the first thing I'd build.

---

## 12. Decisions (locked) + the one open input

**Locked (June 9, 2026):**
- Pilot on a **staging environment** (safest place for full journeys).
- **Full journeys on staging** (forms/checkout end to end with synthetic data).
- **Silent unless broken** (ClickUp Reminder to Peter only on a confirmed regression).

**The one blocker to a real pilot:** the **staging base URL**, the **key URLs** to watch, the **journey definitions** (form/checkout steps + selectors), and the **dynamic regions to mask** (CSS selectors). These go in `cklph-regression-watch/config.example.json` → `config.<client>.json`, then we capture the first real baseline.

**Open (minor):** keep "Regression Watch," or fit the SOP slug convention (`monitoring:regression-watch`)?

---

## Sources

- [Skills landscape report (Part 6 gap, Part 3 rubric)](computer:///Users/peterkrzyzek/Documents/Claude/Projects/Team%20Task%20%26%20Project%20Management/claude-skills-landscape-2026-06.md)
- Proven executor pattern: [lackeyjb/playwright-skill](https://github.com/lackeyjb/playwright-skill)
- Anti-slop principles: [Anthropic skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) · [obra/superpowers verification-before-completion](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md)
- Scored-catalog model: [thatrebeccarae Google Ads CHECKS.md](https://github.com/thatrebeccarae/claude-marketing/blob/main/skills/google-ads/CHECKS.md)
- Runtime verification: Playwright + Chromium v148 installed and exercised in the Regression Watch sandbox on June 8, 2026 (navigation 200, network interception, full-page screenshot all confirmed).
- Alert channel: [computer://task-hygiene ping channel memory](computer:///Users/peterkrzyzek/Library/Application%20Support/Claude/local-agent-mode-sessions/2be3fd38-5f98-4dfc-9d8c-6c42ae021cd0/cbcdc6af-ec29-450c-92a5-5598a0b95f2c/spaces/0852a31c-5836-4c1d-aa2f-acd3a29cd1a5/memory/task-hygiene-ping-channel.md)
