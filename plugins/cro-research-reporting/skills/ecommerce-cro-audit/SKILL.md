---
name: ecommerce-cro-audit
description: >
  This skill should be used when auditing or improving conversion on an ecommerce/DTC product page
  (PDP), collection, cart, or checkout funnel, and extends to any conversion surface (landing page,
  lead-gen form, SaaS signup). Trigger phrases: "CRO audit", "conversion audit", "why isn't my
  product page converting", "improve conversion rate", "optimize this PDP / funnel / landing page",
  "low add-to-cart rate", "reduce cart abandonment", "Shopify conversion", "make this page convert".
  Use it whenever conversion of a page or funnel is in question, even if the user does not say "CRO".
license: MIT
metadata:
  author: Chykalophia
  version: "0.2.0"
---

# Ecommerce & Conversion CRO Audit

Diagnose why a page or funnel underconverts, then prescribe prioritized, evidence-backed fixes. Built for product pages first; the same method applies to collection/cart/checkout and to non-ecommerce surfaces.

## Operating principles
1. **Ground in first-party data before opinion.** Pull the real funnel before theorizing. "This hurts conversion" is far stronger paired with "and your add-to-cart rate is 0.8% vs a ~7.5% norm."
2. **Benchmark against the right tier.** A $400 luxury item is not a $30 commodity. See `references/diagnostics-and-benchmarks.md`.
3. **Diagnose before prescribing.** Locate the leak (which step) and the mechanism (which gate) before listing fixes.
4. **Conversion is multiplicative.** Several mediocre gates compound to a near-zero rate; repair the whole chain.
5. **Prioritize by impact × effort**, and don't call a fix "proven" until a sound test confirms it (`references/experimentation.md`).
6. **Show, don't tell.** Pair recommendations with a visual blueprint; hand output to `report-information-design`.

## The workflow
1. **Baseline (first-party data).** Sessions → add-to-cart rate → reached-checkout → completed; device; source; AOV; returns. Interrogate traffic quality first; the add-to-cart rate is usually the most defensible signal. Shopify queries in `references/shopify-specifics.md`.
2. **Benchmark** against the correct tier.
3. **Walk the funnel** (home → collection → PDP → cart → checkout, PDP-weighted). On a real theme, map findings to actual files/blocks.
4. **Five-gate diagnostic:** Comprehend → Desire → Trust → De-risk → Act (extended to the cart/checkout gate). Score each; locate the leak via step-conversion.
5. **Check the levers** (`references/conversion-playbook.md` + `references/checkout-mobile-accessibility.md`): reviews, imagery, fit, variant/configurator UX, buy-box + sticky ATC, value/story, trust + BNPL, OOS capture, checkout UX, mobile, accessibility, search/personalization, speed.
6. **Prioritize** on an impact × effort matrix; design the experiment (hypothesis, PXL/ICE prioritization, sample size, run length).
7. **Produce the deliverable** — sourced audit + annotated blueprint; use `deep-research-synthesis` for fresh evidence and `report-information-design` for output.

## Reference map
- `references/conversion-playbook.md` — the core levers with sourced lift figures.
- `references/diagnostics-and-benchmarks.md` — benchmark tiers, traffic-quality caveats, funnel math, the five-gate model, impact/effort.
- `references/checkout-mobile-accessibility.md` — checkout/cart UX (Baymard), the mobile gap, accessibility-as-CRO, search/personalization, email/retention.
- `references/experimentation.md` — sizing/peeking/sequential testing, ICE/PIE/PXL/RICE, hypothesis template.
- `references/buyer-psychology.md` — premium/luxury & affluent psychology, sustainability sequencing, storytelling, naming, gifting.
- `references/persuasion-and-mental-models.md` — Cialdini's 7 + conversion mental models + pricing psychology + a challenge→models table.
- `references/shopify-specifics.md` — Shopify theme/PDP hooks, ShopifyQL queries, the conversion app ecosystem.
- `references/liquid-product-template-checklist.md` — building a clean, conversion-optimized Shopify product template (current Dawn/theme-tools practice).
- `references/beyond-ecommerce.md` — landing pages, lead-gen, SaaS signup.

## Engagement context
At the start of a task, check for the engagement brief (default `./cro-engagement.md`, created by the `getting-started` skill / `/kickoff`). If it exists, read it first and tailor to the client, product, price tier, ICP, in-scope surface, goal/metric, and brand voice it records. If it's missing and the work is more than a one-off, offer to capture one via `getting-started`.

## Related skills
`deep-research-synthesis` (fresh, tiered evidence), `report-information-design` (the report + blueprint), `conversion-copywriting` (on-page copy as a lever), `outbound-and-positioning` (the positioning the page expresses). Agents: `cro-auditor` runs this skill, `cro-verifier` checks the output.

## Guardrails
Don't quote vendor "X% lift" figures as guarantees (label directional). Don't recommend fake urgency. Don't let sustainability/mission lead for a style-first audience. Separate the page problem from the traffic problem — this skill targets conversion, not acquisition.
