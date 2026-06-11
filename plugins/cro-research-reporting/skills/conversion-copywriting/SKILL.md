---
name: conversion-copywriting
description: >
  This skill should be used when writing or rewriting customer-facing copy: product pages, landing
  pages, hero/headline sections, CTAs and button microcopy, email bodies, and ad copy. Trigger
  phrases include "write copy for", "rewrite this", "make this punchier/clearer", "headline for",
  "CTA for", "hero section", "product description", "ad copy", or "this copy is weak". Use it
  whenever copy quality affects conversion, even if the user does not name a framework.
license: MIT
metadata:
  author: Chykalophia
  version: "0.2.0"
---

# Conversion Copywriting

Write copy that earns the next scroll, the next click, the sale. Clarity over cleverness; desire first, proof second; every word earns its place.

## Principles
1. **Clarity is the conversion lever.** A reader who has to decode a sentence leaves. Simple words, short sentences, one idea per line.
2. **Lead with desire/benefit, justify with proof.** Open on the outcome the reader wants; bring features, specs, and credentials in as the rational backup.
3. **Specific beats vague.** Numbers, names, concrete detail. "Recovered $340K in 90 days" beats "drives results."
4. **One job per asset.** A page, an email, an ad each has a single primary action. Cut anything that competes with it.
5. **Voice: confident, warm, non-hype.** No corporate-speak, no exclamation-point inflation. (Chykalophia voice rules, including no em dashes, in `references/voice-and-headlines.md`.)

## Pick the framework to the format (`references/copy-frameworks.md`)
- PDP / product page: **PAS** or **FAB** for the body, **4 U's** headline, proof + risk-reversal blocks.
- Landing page (one offer): **BAB** or **4 Ps**, or **AIDA** for the full-page arc.
- Email: **PAS** hook, one job per email, **4 Ps** for offer emails.
- Ads: **PAS** or **AIDA**, ruthless brevity.
- Homepage / brand: **StoryBrand SB7** (customer is the hero, brand is the guide).
- Long-form sales / consulting narrative: **PASTOR**.

## Default headline test: the 4 U's
Every headline is checked against **Useful, Urgent, Unique, Ultra-specific**. Hit at least three; "useful + ultra-specific" is non-negotiable. Details and templated families in `references/voice-and-headlines.md`.

## Workflow
1. Identify the reader's awareness stage, the one job, and the single most compelling outcome.
2. Choose the framework for the format; draft to it.
3. Write the headline; run the 4 U's test; write 1 alternative for A/B.
4. Apply the voice rules (cut hedging, buzzwords, em dashes, exclamation points; make verbs strong and nouns specific).
5. Add proof (social proof, specifics) and risk-reversal near the CTA; end with one clear action.

## Reference map
- `references/copy-frameworks.md` — AIDA, PAS, BAB, FAB, 4 Ps, PASTOR, StoryBrand SB7, each with a worked example and a "use when" table.
- `references/voice-and-headlines.md` — the 4 U's, headline families + CTA formula, microcopy, and the Chykalophia voice/banned-phrase rules.

## Engagement context
At the start of a task, check for the engagement brief (default `./cro-engagement.md`, created by the `getting-started` skill / `/kickoff`). If it exists, read it first and write to the client, ICP, price tier, and especially the brand voice/banned-words it records. If it's missing and the work is more than a one-off, offer to capture one via `getting-started`.

## Related skills
Pair with `ecommerce-cro-audit` (where copy is a lever and persuasion models live), `report-information-design` (for on-page structure), and `outbound-and-positioning` (for cold email + the positioning that copy expresses).

## Guardrails
Don't invent proof, testimonials, or stats. Don't manufacture false urgency. Keep claims substantiated; if you don't have the number, ask for it rather than fabricating.
