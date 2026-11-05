# Citations, Grounding & Report Generation

Techniques from gpt-researcher, STORM, open_deep_research, and gpt-newspaper for trustworthy, well-structured reports.

## Citation spec (standardize on this — it's bug-resistant)
- Assign each **unique URL one citation number**; number **sequentially with no gaps** (1, 2, 3, 4 …).
- Every in-text citation resolves to a source entry and vice versa; **no duplicate sources**.
- End with a `### Sources` (or "Sources & Method") list, **one source per line** so markdown renders a clean list.
- Format per line: `[n] Name — short descriptor (year). URL` with a reliability tag where useful.
- HTML alternative: inline `<sup><a href="#s-id">n</a></sup>` with matching `<li id="s-id">` entries; keep ids and numbers in sync (the QA checklist can diff them).
(open_deep_research's "sequential, gapless, one-per-line" rule; gpt-researcher's hyperlinked-inline style is the alternative.)

## Outline-first, section-by-section generation
1. **Pre-write:** research + a deduped, ordered outline of sections.
2. **Write:** populate each section, **passing in the already-written headers and content** so sections don't overlap. (gpt-researcher anti-duplication; STORM two-stage.)
3. **Polish:** a final pass that adds the executive summary, removes duplicate content, and checks flow. (STORM.)

## Structure templates by question type (defaults, not cages)
- **Comparison:** A → B → head-to-head → recommendation.
- **List/landscape:** just the list with consistent per-item fields.
- **Overview/explainer:** concept-by-concept.
- **Audit (our default):** exec summary → data → diagnosis → teardown → evidence → recommendations/blueprint → action plan → sources.
- **Test readout:** decision → hypothesis → trust checks → primary → guardrails → reading the result → next step (`experiment-readout.md`).
"Section" is fluid — fit the question, but start from a template.

## Report-type & tone presets (optional parameters)
- **Type:** brief / research / audit / resource-list / outline.
- **Tone:** objective, analytical, comparative, persuasive (default: objective-analytical for internal; benefit-led for client-facing). (gpt-researcher's ReportType/Tone enums.)

## Grounding / self-verification gate (before finalizing)
- **Critique → revise loop:** run a critical pass (or the `cro-verifier` agent) that bounces the draft back until load-bearing claims are sourced and the logic holds. (gpt-newspaper critique loop.)
- **Claim discipline:** every extracted claim carries its **entities, numbers, and dates** with attribution — no vague "studies show." (dzhng learnings rule.)
- **Verbatim preservation:** when merging multiple researchers, confirm no sources were dropped in the merge. (open_deep_research failure mode.)

## Citation-integrity QA (add to qa-checklist runs)
- No duplicate sources; numbers sequential and gapless.
- Every in-text citation has a list entry; every list entry is cited at least once.
- Every URL resolves and every load-bearing figure appears on its source page: run `python3 ${CLAUDE_PLUGIN_ROOT}/skills/report-information-design/scripts/check_citations.py <report> --claims <claims.csv>`, with each load-bearing figure listed as `url,expect` in the claims CSV (LLM research tools fabricate citations, 18% for GPT-4 in Walters & Wilder 2023, and produce dead URLs; an automated liveness check cut non-resolving URLs to under 1% in Rao et al. 2026).
- For load-bearing claims surfaced by AI research, prefer ones that recur across independent runs or sources; a citation that only one model or one run produced is the most likely to be fabricated.
- Reliability tiers applied; conflicts surfaced, not hidden.

This file extends `report-structure.md` and `qa-checklist.md`.
