---
description: Audit a page/funnel's conversion and propose fixes
argument-hint: "<url|store|theme path> [--tier luxury|footwear|mass] [--funnel pdp|collection|cart|checkout] [--audience internal|client]"
allowed-tools: Read, Grep, Glob, WebFetch, WebSearch, Bash, Task
---

Run a conversion-rate audit of the target in `$ARGUMENTS` (a product page, collection, cart, checkout funnel, landing page, or whole store). Parse any `--tier`, `--funnel`, and `--audience` flags. Apply the `ecommerce-cro-audit` skill and its references in `${CLAUDE_PLUGIN_ROOT}/skills/ecommerce-cro-audit/references/`.

For a full audit, orchestrate:
1. **Ground in first-party data** (analytics/ShopifyQL MCP or theme export) — funnel, device, source, AOV, returns; interrogate traffic quality.
2. **Delegate in parallel** (one response, multiple `Task` calls): the `cro-auditor` agent for the page/funnel diagnostic, and the `deep-researcher` agent for fresh benchmarks/competitor evidence if needed.
3. **Diagnose:** five-gate model, locate the leak via step-conversion, benchmark against the correct tier.
4. **Prioritize** on impact × effort; add an experimentation plan (hypothesis, PXL/ICE, sample size, run length).
5. **Deliver:** hand to the `report-builder` agent (or `report-information-design` skill) for a sourced audit + annotated blueprint. For high-stakes output, run the `cro-verifier` agent before finalizing.

Ask up front only what changes the output (scope, tier, audience). Otherwise proceed and state assumptions. Separate the page problem from the traffic problem; this command targets conversion.
