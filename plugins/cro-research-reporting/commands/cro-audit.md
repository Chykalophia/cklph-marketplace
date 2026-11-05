---
description: Audit a page/funnel's conversion and build an evidence-tagged hypothesis plan
argument-hint: "<url|store|theme path> [--tier luxury|premium|mass] [--funnel pdp|collection|cart|checkout] [--audience internal|client]"
allowed-tools: Read, Write, Grep, Glob, WebFetch, WebSearch, Bash, Task
---

Run a conversion audit of the target in `$ARGUMENTS` (a product page, collection, cart, checkout, landing page, or whole store). Parse any `--tier`, `--funnel`, and `--audience` flags. Apply the `ecommerce-cro-audit` skill and its references in `${CLAUDE_PLUGIN_ROOT}/skills/ecommerce-cro-audit/references/`.

For a full audit, orchestrate:
1. **Brief and measurement.** Read `./cro-engagement.md`. Check analytics quality before trusting any rate.
2. **Delegate in parallel** (one response, multiple `Task` calls):
   - `cro-auditor`: funnel baseline from first-party data, rendered desktop/mobile capture, binary checklist, hypothesis cards.
   - `voc-coder`: code whatever customer feedback exists (reviews, tickets, survey exports). Only themes that passed the agreement check count as evidence; label anything still awaiting human validation preliminary and leave it out of confidence scoring. If none is available, produce a `voc-research` plan (poll question, post-purchase survey, 5-user test script) instead.
   - `deep-researcher`: only when external evidence is needed (competitor teardowns, category research).
3. **Merge** the streams into hypothesis cards: attach VoC themes to the matching checklist failures and funnel leaks; recompute confidence from the number of independent sources; sort into Instrument / Just do it / Test / Investigate.
4. **Plan tests** for the top Test items with `experiment-design` (`power.py mde` on real traffic, pre-registration template). Route untestable items to the low-traffic options.
5. **Deliver** with the `report-builder` agent (or `report-information-design` skill). Run `cro-verifier` before anything goes to a client.

Write only new audit outputs (plans, captures, notes) in the working folder; never edit the client's site or theme files. Ask up front only what changes the output (scope, tier, audience, data access). Otherwise proceed and state assumptions. Separate the page problem from the traffic problem; this command targets conversion.
