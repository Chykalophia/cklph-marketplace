---
description: Run deep, sourced research and synthesize it
argument-hint: "<topic or question> [--depth quick|standard|deep] [--streams N]"
allowed-tools: Read, Grep, Glob, WebFetch, WebSearch, Task
---

Conduct deep, credible, well-sourced research on the topic in `$ARGUMENTS`, then synthesize it. Parse `--depth` and `--streams`. Apply the `deep-research-synthesis` skill and its references in `${CLAUDE_PLUGIN_ROOT}/skills/deep-research-synthesis/references/`.

Steps:
1. **Scope** (question, audience, deliverable, depth); write a one-paragraph research brief. Begin an initial recon search immediately if scope is mostly clear.
2. **Ground in primary/first-party data** before web opinion.
3. **Plan independent streams** (default 3–5; honor `--streams`), each mapped to a section of the output.
4. **Fan out** — launch one `deep-researcher` agent per stream in parallel (multiple `Task` calls in one response) with self-contained briefs; cap concurrency around 5. Pull interactive/first-party data yourself.
5. **Collect** with provenance (source + URL + year); reflect after each pass (what's found / missing / enough?) and stop at saturation.
6. **Tier, score, and verify** the load-bearing claims against primary sources; surface conflicts.
7. **Coverage check, then synthesize** — conclusion first, inline citations, tiered source list. Hand to the `report-builder` agent / `report-information-design` skill if a polished report is wanted; run `cro-verifier` for a pre-ship check.

Never fabricate statistics, URLs, or quotes. Label vendor/self-interested figures directional.
