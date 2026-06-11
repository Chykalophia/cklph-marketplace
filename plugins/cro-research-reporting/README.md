# CRO, Research & Reporting Toolkit

A strategist's toolkit for Claude (works in Claude, Cowork, and Claude Code). It packages reusable competencies distilled from real conversion-optimization engagements and from a study of the best public skills, agents, and processes on GitHub: **audit a conversion funnel, run deep sourced research, write conversion copy, position an offer, and turn findings into polished, render-safe reports and redesign blueprints.**

## What's new in 0.3.0
- **A real "begin here" entry point:** a `getting-started` skill + a `/kickoff` command that orient you, capture a reusable **engagement brief** (`./cro-engagement.md`), and route to the right skill/command/agent.
- **Shared context across the suite:** every skill now reads the engagement brief first, so the tools stay consistent and stop re-asking (the coreyhaines31 shared-context pattern).

## What's new in 0.2.0
- **Two new skills:** `conversion-copywriting` and `outbound-and-positioning`.
- **Four specialized subagents:** `cro-auditor`, `deep-researcher`, `report-builder`, `cro-verifier` (an adversarial pre-ship checker).
- **Marketplace install:** ships `.claude-plugin/marketplace.json` so it can be added via `/plugin marketplace add`.
- **Deeper CRO references:** experimentation rigor (A/B sizing, peeking, sequential testing, ICE/PIE/PXL), checkout/mobile/accessibility (Baymard/GoodUI/NN-g), persuasion & mental models (Cialdini + pricing), and a Shopify Liquid build checklist (current Dawn/theme-tools practice).
- **Sharper research & reporting:** a research-rigor reference (reflection/gap loops, credibility scoring, stop conditions) and a citations-and-grounding reference (gapless citation spec, outline-first generation, grounding gate).
- **Tighter skill descriptions** (triggers without leaking the method), `license` + `metadata` on every skill, and `argument-hint` + scoped `allowed-tools` on every command.

## Components

### Skills (auto-trigger on matching requests)
- **getting-started** — the front door: orients you, captures a reusable engagement brief, and routes to the right skill/command/agent. Begin here (or run `/kickoff`).
- **ecommerce-cro-audit** — diagnose why a page/funnel underconverts; benchmarks by tier, a five-gate diagnostic, experimentation rigor, premium psychology, Shopify hooks, impact/effort prioritization. Extends to landing/lead-gen/SaaS.
- **deep-research-synthesis** — thorough, multi-source, data-grounded research with source-reliability tiering, adversarial verification, and reflection/stop discipline.
- **report-information-design** — structure findings (BLUF), build self-contained HTML with render-safe components, cite with a gapless spec, and QA before delivering.
- **conversion-copywriting** — PDP/landing/email/ad copy with proven formulas, the 4 U's headline test, and a clear non-hype voice.
- **outbound-and-positioning** — cold email + cadence, B2B qualification (SPIN/Challenger/MEDDIC/JTBD), and positioning (April Dunford + Value Proposition Canvas).

### Agents (delegated, auto-invoked where relevant)
- **cro-auditor** (read-only, Opus) — runs the audit and returns impact/effort-ranked findings.
- **deep-researcher** (Opus) — a self-contained worker for one parallel research stream.
- **report-builder** (Sonnet, writer) — assembles and QAs the report.
- **cro-verifier** (Opus, read-only) — verifies load-bearing claims, citation integrity, and that recommendations follow from evidence; reports "no findings" honestly.

### Commands (explicit `/` entry points)
- **/kickoff** `[what you want to do]` — begin here: set up the engagement brief and route.
- **/cro-audit** `<url|store|theme path> [--tier] [--funnel] [--audience]`
- **/deep-research** `<topic> [--depth] [--streams]`
- **/build-report** `<topic|files> [--format] [--audience]`

## How they work together
Begin with **`/kickoff`** to set up the engagement brief (`./cro-engagement.md`) that every skill then reads first. A typical engagement: `/cro-audit` grounds in first-party data, fans out `deep-researcher` for fresh evidence and `cro-auditor` for the page diagnostic, then `report-builder` assembles the deliverable and `cro-verifier` checks it before it ships. `conversion-copywriting` and `outbound-and-positioning` supply the on-page and outreach language. Each skill's "Related skills" section lists its neighbors.

## Setup
No configuration required. More powerful when connected (all optional):
- **Store analytics** (e.g., a Shopify MCP with ShopifyQL) — grounds audits in real funnel data.
- **Web search / fetch** — powers the research skills.
- **A codebase/theme export** (file access) — maps findings to real files and supports the Liquid build checklist.

## Install
- **Marketplace:** `/plugin marketplace add Chykalophia/cro-research-reporting` then install `cro-research-reporting`.
- **Direct:** save the `.plugin` file via the install button, or place the folder in your plugins directory.

## Testing & iteration
Iterate skills with the official skill-creator harness pattern: for each skill, keep a small set of should-trigger and should-not-trigger prompts (the near-miss negatives matter most, since the skills have overlapping surfaces), test across Haiku/Sonnet/Opus, and refine the `description` until triggering is reliable. Keep each `SKILL.md` under ~500 lines and references one level deep.

## Design notes & credits
- **Evidence over assertion:** every recommendation ties to data or a tiered source; vendor lift figures are labeled directional.
- **Render-safe by default:** report components encode hard-won fixes (no text inside data-width bars; no absolute-positioned label clouds; everything collapses on mobile; QA before shipping).
- **Brand-faithful:** reports match the subject's real brand tokens.
- Informed by public work (frameworks are public methods; MIT-licensed repos adapted with attribution): Anthropic Agent Skills (anthropics/skills), wshobson/agents and coreyhaines31/marketingskills (agent/skill patterns), gpt-researcher / Stanford STORM / LangChain open_deep_research (research rigor), Baymard Institute / Nielsen Norman Group / GoodUI / CXL-Speero (CRO knowledge), and Shopify Dawn / theme-tools (Shopify practice).

Version 0.3.0 · by Chykalophia.
