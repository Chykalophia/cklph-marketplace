---
name: getting-started
description: >
  This is the front door to the CRO, research & reporting toolkit. Use it FIRST when someone is
  getting started, is unsure which skill to use, or makes a broad/vague request. Trigger phrases:
  "where do I start", "what can this do", "how do I use this", "get started", "set up", "onboard
  me", "help me with my store/page/campaign", "what should I focus on", "I don't know where to
  begin". It orients the user, captures a reusable engagement brief, and routes to the right skill,
  command, or agent.
license: MIT
metadata:
  author: Chykalophia
  version: "0.3.0"
---

# Getting Started (begin here)

The front door. Orient the user, capture a reusable engagement brief, then route to the right tool. Run this whenever someone is starting, is unsure which skill applies, or asks something broad.

## What this toolkit does (say this plainly)
A strategist's kit to: **audit** a conversion funnel, run **deep sourced research**, write **conversion copy**, sharpen **positioning/outbound**, and turn it into **polished reports + redesign blueprints** — with a **verifier** that checks the work before it ships.

## Step 1 — Engagement brief (persistent context)
Before doing real work, establish the shared context every other skill reads first.
1. Look for an existing brief at **`./cro-engagement.md`** (the default; or ask the user for the path). If present, read it, summarize it back in 2–3 lines, and ask if anything changed.
2. If absent and the task is more than a one-off, offer to capture one. Ask only what's needed (skip anything already obvious from the request), using `references/engagement-brief-template.md`:
   - Client / brand and what they sell; **price tier** (mass / premium / luxury).
   - **ICP** (who buys, what they value).
   - **Surface in scope** (PDP / collection / cart / checkout / landing / lead-gen / SaaS signup / whole funnel).
   - **Primary goal & metric** (e.g., add-to-cart rate, RPV, lead conversion).
   - **Brand voice & tokens** (tone, banned words, colors/fonts/logo if known).
   - **Connected data/tools** (analytics/Shopify MCP, web search, theme/codebase access).
   - Known constraints (timeline, what's off-limits, who the audience for deliverables is).
3. Write/update `./cro-engagement.md` from the template. Keep it short and current; confirm before overwriting.

Why: the skills are most powerful when they share one context (so they stop re-asking and stay consistent). This is the coherence layer for the whole suite.

## Step 2 — Route to the right tool
Match the user's intent to a component using `references/routing-map.md`. Quick version:
- "Why isn't this converting / audit this page or funnel" → **/cro-audit** or the `ecommerce-cro-audit` skill (it can delegate to the `cro-auditor` agent).
- "Research X thoroughly / with sources" → **/deep-research** or `deep-research-synthesis` (fans out `deep-researcher` agents).
- "Turn this into a report / write it up" → **/build-report** or `report-information-design` (or the `report-builder` agent).
- "Write/rewrite copy, headline, CTA, email, ad" → `conversion-copywriting`.
- "Cold outreach, follow-up cadence, positioning, value prop, qualify a deal" → `outbound-and-positioning`.
- "Check this before it ships" → the `cro-verifier` agent.

## Step 3 — Show the recommended end-to-end flow
For a full engagement, the canonical path is:
**Brief (this skill) → /cro-audit (grounds in data, fans out research + page diagnostic) → /build-report (assemble) → cro-verifier (pre-ship check) → conversion-copywriting / outbound-and-positioning for the language.**
Offer to kick off the first step.

## Reference map
- `references/engagement-brief-template.md` — the brief template, field definitions, where it lives, and update cadence.
- `references/routing-map.md` — full intent → skill/command/agent map and the end-to-end playbook.

## Guardrails
Don't interrogate the user — ask only the brief questions that matter for the task at hand, and infer the rest. Don't overwrite an existing brief without confirming. If the user clearly already knows what they want, skip the orientation and route straight there.
