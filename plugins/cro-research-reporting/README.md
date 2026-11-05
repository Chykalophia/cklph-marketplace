# CRO, Research & Reporting Toolkit

A strategist's toolkit for Claude (works in Claude, Cowork, and Claude Code). It packages reusable competencies distilled from real conversion-optimization engagements and from a study of the best public skills, agents, and processes on GitHub: **audit a conversion funnel, run deep sourced research, write conversion copy, position an offer, and turn findings into polished, render-safe reports and redesign blueprints.**

## What's new in 0.4.0
An evidence pass on the whole toolkit: every process now matches what published experiment data and studies of AI in UX/CRO work say actually works.
- **Audit rebuilt around evidence, not opinions.** Open-ended AI page reviews are mostly wrong (Baymard found 80% of GPT-4's UX suggestions were false positives), so the audit now renders pages on desktop and mobile (`capture_pages.py`), scores a **binary checklist**, and turns findings into **evidence-tagged hypotheses** sorted Instrument / Just do it / Test / Investigate. No promised % lifts.
- **New `voc-research` skill + `voc-coder` agent.** Review/ticket mining, polls, post-purchase surveys, user-test plans, and an AI coding protocol validated against a human sample (`agreement.py`, Cohen's kappa). Feeds a customer-language bank for copy.
- **New `experiment-design` skill + `/experiment` command.** Standard-library Python scripts for sample size/MDE (with CUPED and multiple variants), SRM checks, readouts with guardrails, Twyman and winner's-curse flags, and a per-client test log with per-lever win rates. Base rates (10–33% of tested ideas win) set expectations.
- **Mechanical citation checking.** `check_citations.py` checks every cited URL; given a `--claims` CSV it confirms load-bearing figures on their source page, and on HTML reports it validates footnotes; `cro-verifier` runs it on every deliverable.
- **Copywriting outputs test variants** built from customer language instead of a single "best" headline.
- **Reference clean-up.** Removed untraceable figures (the "~7.5% add-to-cart norm", "above-fold CTA +30%"), corrected the cost-per-wear citation, updated Baymard abandonment reasons, made buyer psychology generic (the original client-specific version is kept as an example).
- **Plumbing.** Explicit `tools:` on every agent, aligned versions, unit tests + CI, trigger evals and a seeded audit fixture in `evals/`.

## What's new in 0.3.0
- **A real "begin here" entry point:** a `getting-started` skill + a `/kickoff` command that orient you, capture a reusable **engagement brief** (`./cro-engagement.md`), and route to the right skill/command/agent.
- **Shared context across the suite:** every skill now reads the engagement brief first, so the tools stay consistent and stop re-asking (the coreyhaines31 shared-context pattern).

## What's new in 0.2.0
- **Two new skills:** `conversion-copywriting` and `outbound-and-positioning`.
- **Four specialized subagents:** `cro-auditor`, `deep-researcher`, `report-builder`, `cro-verifier` (an adversarial pre-ship checker).
- **Marketplace install:** distributed via the **cklph** marketplace (`claude plugin install cro-research-reporting@cklph`).
- **Deeper CRO references:** experimentation rigor (A/B sizing, peeking, sequential testing, ICE/PIE/PXL), checkout/mobile/accessibility (Baymard/GoodUI/NN-g), persuasion & mental models (Cialdini + pricing), and a Shopify Liquid build checklist (current Dawn/theme-tools practice).
- **Sharper research & reporting:** a research-rigor reference (reflection/gap loops, credibility scoring, stop conditions) and a citations-and-grounding reference (gapless citation spec, outline-first generation, grounding gate).
- **Tighter skill descriptions** (triggers without leaking the method), `license` + `metadata` on every skill, and `argument-hint` + scoped `allowed-tools` on every command.

## Components

### Skills (auto-trigger on matching requests)
- **getting-started** — the front door: orients you, captures a reusable engagement brief, and routes to the right skill/command/agent. Begin here (or run `/kickoff`).
- **ecommerce-cro-audit** — locate the funnel leak from first-party data, render pages and score a binary checklist, combine with customer evidence into evidence-tagged hypotheses. Shopify hooks included; extends to landing/lead-gen/SaaS.
- **voc-research** — reviews, tickets, polls, post-purchase surveys, user tests, validated AI coding, customer-language bank.
- **experiment-design** — pre-registration, sizing, low-traffic options, readouts and the test log, all computed by scripts.
- **deep-research-synthesis** — thorough, multi-source, data-grounded research with source-reliability tiering, adversarial verification, and reflection/stop discipline.
- **report-information-design** — structure findings (BLUF), build self-contained HTML with render-safe components, cite with a gapless spec, and QA before delivering.
- **conversion-copywriting** — PDP/landing/email/ad copy with proven formulas, the 4 U's headline test, and a clear non-hype voice.
- **outbound-and-positioning** — cold email + cadence, B2B qualification (SPIN/Challenger/MEDDIC/JTBD), and positioning (April Dunford + Value Proposition Canvas).

### Agents (delegated, auto-invoked where relevant)
- **cro-auditor** (Opus; reads and runs scripts, never edits the client's site) — funnel baseline, rendered checklist, hypothesis cards.
- **voc-coder** (Sonnet) — codes customer feedback against a validated codebook; returns themes, shares, quotes.
- **deep-researcher** (Opus) — a self-contained worker for one parallel research stream.
- **report-builder** (Sonnet, writer) — assembles and QAs the report.
- **cro-verifier** (Opus; runs the citation checker) — checks every URL and load-bearing figure, evidence discipline, and logic; reports "no findings" honestly.

### Commands (explicit `/` entry points)
- **/kickoff** `[what you want to do]` — begin here: set up the engagement brief and route.
- **/cro-audit** `<url|store|theme path> [--tier] [--funnel] [--audience]`
- **/experiment** `plan|size|readout|log [...]` — pre-register, size, read out, or log a test.
- **/deep-research** `<topic> [--depth] [--streams]`
- **/build-report** `<topic|files> [--format] [--audience]`

## How they work together
Begin with **`/kickoff`** to set up the engagement brief (`./cro-engagement.md`) that every skill then reads first. A typical engagement:
1. `/cro-audit` checks measurement, baselines the funnel, and runs `cro-auditor` (rendered checklist) and `voc-coder` (customer evidence) in parallel, then merges them into evidence-tagged hypotheses.
2. `/experiment plan` sizes the top hypotheses against real traffic, or routes them to low-traffic options.
3. `report-builder` assembles the deliverable and `cro-verifier` checks every citation before it ships.
4. `conversion-copywriting` writes test variants from the customer-language bank.
5. `/experiment readout` reads each test; `test_log.py` keeps the per-lever win rates that rank the next round.

### Where AI is used, and where it isn't
| AI does | Evidence | People do |
|---|---|---|
| Code reviews/surveys against a codebook | kappa ~0.76 vs human coders zero-shot | Validate a sample, decide what matters |
| Check rendered pages against fixed rules | Narrow classification is where AI UX tools are accurate | Triage anything open-ended |
| Draft copy variants from customer language | AI copy matches or beats human copy in live tests | Pick what to test |
| Run statistics via scripts | Deterministic | Make the ship call |
| Find and check sources | Needs link and figure checks; tools fabricate some citations | Judge conflicting evidence |
| Never: predict test winners, simulate customers | LLMs pick winners barely above chance; synthetic users are idealised | — |

## Setup
No configuration required. More powerful when connected (all optional):
- **Store analytics** (e.g., a Shopify MCP with ShopifyQL) — grounds audits in real funnel data.
- **Web search / fetch** — powers the research skills.
- **A codebase/theme export** (file access) — maps findings to real files and supports the Liquid build checklist.

## Install
- **Marketplace:** part of Peter's **cklph** marketplace — `/plugin marketplace add Chykalophia/cklph-marketplace` (or `claude plugin marketplace update cklph`), then `claude plugin install cro-research-reporting@cklph`.
- **Direct:** save the `.plugin` file via the install button, or place the folder in your plugins directory.

## Testing & iteration
- `python3 -m unittest discover -s tests -v` tests the statistics, logging, agreement and citation scripts (standard library only; CI runs it on each PR). `capture_pages.py` needs a browser, so check it by hand against `evals/audit-fixture/`.
- `evals/triggers.json` holds should-trigger and near-miss prompts per skill; run them across Haiku/Sonnet/Opus and refine descriptions until triggering is reliable.
- `evals/audit-fixture/` is a seeded, flawed PDP with an answer key; re-score it after changing the audit to track precision.
- `capture_pages.py` needs Playwright for Python (`python3 -m pip install playwright && python3 -m playwright install chromium`); the other scripts need nothing beyond Python 3.8+.

## Design notes & credits
- **Evidence over assertion:** every recommendation names its evidence sources and confidence; vendor lift figures stay directional and out of client promises.
- **Statistics in code, not in prose:** sizing, SRM, intervals and decisions come from the scripts.
- **Render-safe by default:** report components encode hard-won fixes (no text inside data-width bars; no absolute-positioned label clouds; everything collapses on mobile; QA before shipping).
- **Brand-faithful:** reports match the subject's real brand tokens.
- Informed by public work (frameworks are public methods; material adapted from MIT-licensed repos is credited, with the license text, in `NOTICE.md`): Anthropic Agent Skills (anthropics/skills), wshobson/agents and coreyhaines31/marketingskills (agent/skill patterns), gpt-researcher / Stanford STORM / LangChain open_deep_research (research rigor), Baymard Institute / Nielsen Norman Group / GoodUI / CXL-Speero (CRO knowledge), and Shopify Dawn / theme-tools (Shopify practice).

By Chykalophia. The current version is in `.claude-plugin/plugin.json`; history is in `CHANGELOG.md`.
