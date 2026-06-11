---
name: deep-research-synthesis
description: >
  This skill should be used for thorough, multi-source research that must be credible and well-sourced,
  and for turning that research into a synthesis. Trigger phrases: "deep research", "comprehensive
  research", "research report", "investigate X thoroughly", "find best practices with sources",
  "market/competitive research", "synthesize these findings", "fact-check this", "is this claim
  actually true?". Use it whenever a question needs rigorous, cited research rather than a quick answer.
license: MIT
metadata:
  author: Chykalophia
  version: "0.2.0"
---

# Deep Research & Synthesis

Produce research a skeptical expert would trust: every load-bearing claim sourced, reliability labeled, conflicts surfaced, and the synthesis honest about what's known vs. estimated.

## Principles
1. **Scope before searching.** Pin down the question, audience, deliverable, and depth. For research, start an initial recon search immediately rather than gating everything on a clarifying question.
2. **Ground in primary/first-party data first.** If the subject owns data (analytics, a repo, internal docs), pull it before web opinion.
3. **Fan out, don't trickle.** Decompose into independent streams; research in parallel (parallel subagents when available).
4. **Demand provenance.** Every statistic gets a source name, URL, and year.
5. **Tier reliability.** Primary/academic/first-party vs directional/vendor; use directional figures for direction only (`references/source-tiering.md`).
6. **Verify the load-bearing claims** against primary sources; drop or label what doesn't survive.
7. **Reflect and stop deliberately.** After each pass: what did I find, what's missing, is coverage enough? Stop when saturated (`references/research-rigor.md`).
8. **Surface conflicts; never fabricate.**

## Workflow
1. **Scope & clarify**, then write a one-paragraph research brief (constraints stated, unknowns marked open).
2. **Recon** the subject and any first-party data to sharpen the stream plan.
3. **Plan 3–5 independent streams** mapped to eventual report sections.
4. **Fan out** with precise, self-contained briefs (`references/subagent-briefs.md`); pull interactive/first-party data yourself.
5. **Collect with discipline** (URLs + years; concrete examples; note source type).
6. **Tier, score, and verify** (credibility scoring + primary-over-secondary in `references/research-rigor.md`); re-fetch primaries for load-bearing stats.
7. **Coverage check, then synthesize** — lead with the conclusion, weave inline citations, show conflicts, end with a tiered source list. Hand to `report-information-design` for a polished deliverable.

## Reference map
- `references/research-playbook.md` — recon→plan→fan-out→verify→synthesize loop in detail.
- `references/research-rigor.md` — query expansion, the reflection/gap loop, stop conditions, credibility scoring, self-contained briefs + verbatim-return contract (from gpt-researcher / STORM / open_deep_research).
- `references/source-tiering.md` — the reliability rubric, confidence phrasing, handling conflicts.
- `references/subagent-briefs.md` — the parallel-research brief template + worked examples.

## Engagement context
At the start of a task, check for the engagement brief (default `./cro-engagement.md`, created by the `getting-started` skill / `/kickoff`). If it exists, read it first and tailor scope, audience, and depth to it. If it's missing and the work is more than a one-off, offer to capture one via `getting-started`.

## Related skills
`report-information-design` (turn the synthesis into a report), `ecommerce-cro-audit` (a frequent consumer of this skill's evidence). Agents: `deep-researcher` runs a single stream; `cro-verifier` adversarially checks the result.

## Honesty guardrails
Label vendor/self-interested figures directional; distinguish "verified against primary" from "widely cited but untraced"; prefer recent sources for fast-moving topics; include a short source-reliability appendix so the reader can defend the work.
