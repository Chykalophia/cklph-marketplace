---
name: ecommerce-cro-audit
description: >
  Conversion (CRO) audit for ecommerce and Shopify PDPs, collections, carts and checkouts, and for
  landing, lead-gen and SaaS signup pages. Use when a page or funnel underconverts (low add-to-cart,
  cart abandonment, "why isn't this converting"), even if nobody says CRO, before recommending
  fixes.
license: MIT
metadata:
  author: Chykalophia
---

# Ecommerce & Conversion CRO Audit

Find where a funnel leaks and why, and turn that into **evidence-tagged hypotheses**, not a list of opinions. The audit's output is a prioritised research-and-test plan with a few safe "just do it" fixes.

## Why the method looks like this (evidence)
- **AI page reviews alone are unreliable.** In Baymard's test, 80% of GPT-4's UX suggestions were false positives; current AI UX tools score 50–75% (https://baymard.com/blog/gpt-ux-audit, https://baymard.com/blog/ai-heuristic-evaluations). AI does well when it only classifies against fixed rules, so the page review here is a binary checklist on rendered screenshots.
- **Most changes don't move revenue.** 10–33% of tested ideas win at mature companies and median lifts are near zero (`${CLAUDE_PLUGIN_ROOT}/skills/experiment-design/references/base-rates.md`). Impact claims must be humble and evidence-weighted.
- **Research-backed ideas are the industry standard.** CXL/Speero ResearchXL and PXL both require analytics, customer and usability evidence behind a test idea. (Neither has published win-rate validation; treat them as sound process.)

**Trigger phrases:** "CRO audit", "conversion audit", "why isn't my product page converting", "improve conversion rate", "optimize this PDP / funnel / landing page", "low add-to-cart rate", "reduce cart abandonment", "Shopify conversion", "make this page convert".

## Operating principles
1. **Separate observation from recommendation.** A checklist failure or something you noticed is an observation. It becomes a recommendation only with corroborating evidence.
2. **Compare the store with itself first.** Its own step rates by device, source and template over time beat any industry benchmark. Benchmarks are context, never the diagnosis.
3. **Locate the leak before prescribing.** Which step, which segment, then which mechanism.
4. **Behavioural levers beat cosmetics.** Across 6,700 ecommerce tests, social proof, genuine scarcity/urgency and abandonment recovery outperformed colour, button and CTA-text changes, which averaged about zero (Qubit 2017).
5. **Say how sure you are.** Every hypothesis carries its evidence sources and a confidence level.

## Workflow
1. **Brief and instrumentation.** Read `./cro-engagement.md`. Check analytics hygiene (bots, "direct" share, device mix, a device converting ~0) per `references/diagnostics-and-benchmarks.md`. If the testing tool is new, recommend an A/A test. Broken measurement is finding #1 when present.
2. **Baseline the funnel** (first-party data; ShopifyQL queries in `references/shopify-specifics.md`): sessions → add-to-cart → reached checkout → completed, split by device, source, new vs returning, top templates; compare 90-day vs prior period and vs last year. Name the leaking step and segment.
3. **Customer evidence, in parallel.** Run `voc-research` (reviews, tickets, polls, post-purchase survey, user-test plan); delegate bulk coding to the `voc-coder` agent.
4. **Inspect the pages as shoppers see them.** Run `python3 ${CLAUDE_PLUGIN_ROOT}/skills/ecommerce-cro-audit/scripts/capture_pages.py <urls> --out audit-captures` (desktop + mobile, above-fold + full page). Score `references/heuristic-checklist.md` from the screenshots and `facts.json`. If capture is unavailable, ask for screenshots; do not score from fetched HTML.
5. **Synthesise hypotheses** using the card below. Combine checklist failures, funnel data and VoC themes; one hypothesis can cite several. Sort each into a bucket:
   - **Instrument** — measurement is broken or missing.
   - **Just do it** — a ★ checklist failure or a bug, cheap and reversible, plus at least one other evidence source. Ship, annotate the date, monitor.
   - **Test** — 2+ evidence sources and enough traffic (`python3 ${CLAUDE_PLUGIN_ROOT}/skills/experiment-design/scripts/power.py mde`).
   - **Investigate** — single-source or heuristic-only; needs research before testing.
6. **Prioritise** within Test by evidence strength (number and type of sources), reach (traffic on the page), lever prior from the client's test log (`python3 ${CLAUDE_PLUGIN_ROOT}/skills/experiment-design/scripts/test_log.py prior`), and effort. Prefer PXL-style yes/no criteria over 1–10 gut scores.
7. **Plan tests** with `experiment-design` (pre-registration template, sizing, low-traffic path).
8. **Deliver** with `report-information-design`; run `cro-verifier` before it ships.

## Hypothesis card (the unit of output)
```
H<n> · <one-line hypothesis>
Leak: <funnel step + segment + number, e.g. mobile PDP→ATC 2.1% vs desktop 5.4%, 90d>
Evidence: <each source with its finding> — analytics | VoC (theme, share, n) | checklist ID | user test | benchmark
Lever: Cost | Trust | Usability | Comprehension | Motivation
Confidence: High (3+ independent sources) | Medium (2) | Low (1 / heuristic only)
Bucket: Instrument | Just do it | Test | Investigate
Expected effect: likely / possible / speculative (no % promises; see base rates)
Next step: <ship + monitor | test plan id | research needed>
Effort: S | M | L
```

## Reference map
- `references/heuristic-checklist.md` — the binary PDP / checkout / landing checks, with ★ items backed by large-sample research.
- `references/diagnostics-and-benchmarks.md` — traffic-quality checks, step-conversion, benchmark context (with caveats), the five-gate lens.
- `references/conversion-playbook.md` — the main levers and what "good" looks like, with sources.
- `references/checkout-mobile-accessibility.md` — Baymard checkout data, mobile, accessibility, search, retention flows.
- `references/buyer-psychology.md` — premium/considered-purchase psychology (generic); `examples/premium-footwear-engagement.md` shows one applied case.
- `references/persuasion-and-mental-models.md` — Cialdini, mental models, pricing psychology.
- `references/shopify-specifics.md` and `references/liquid-product-template-checklist.md` — Shopify data pulls, theme anatomy, build checklist.
- `references/beyond-ecommerce.md` — landing, lead-gen, SaaS signup.
- `references/experimentation.md` — pointer to the `experiment-design` skill.
- `scripts/capture_pages.py` — rendered desktop/mobile screenshots + page facts.

## Engagement context
At the start of a task, read `./cro-engagement.md`. Use its tier, ICP, surface, goal metric, traffic per template, research assets and test-log path. If it's missing and the work is more than a one-off, offer to capture one via `getting-started`.

## Related skills
`voc-research` (customer evidence), `experiment-design` (sizing, readout, test log), `deep-research-synthesis` (external evidence), `report-information-design` (deliverable), `conversion-copywriting` (variants). Agents: `cro-auditor` runs steps 2, 4 and 5; `voc-coder` codes feedback; `cro-verifier` checks the output.

## Guardrails
- Never present a heuristic-only observation as a recommendation or promise a % lift.
- Never use synthetic users or "simulated shoppers" as evidence.
- Don't recommend fake urgency or fabricated social proof.
- Report what is working too; don't invent issues to fill the list.
- Keep the traffic problem (acquisition quality) separate from the page problem.
