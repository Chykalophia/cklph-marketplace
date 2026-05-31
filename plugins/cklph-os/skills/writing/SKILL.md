---
name: writing
description: Co-author structured documents (proposals, specs, PRDs, decision docs, release notes, PR narratives). Use when the user wants to write or refine a document and a guided three-stage workflow (context → section-by-section → reader test) beats freeform drafting.
---

# writing — co-author a document

A guided three-stage workflow for documents that survive contact with readers. Offer this when the
user starts a substantial writing task; if they decline, drop it and work freeform.

## Stage 1 — Context gathering
Close the gap between what the user knows and what you know.
- **Meta:** doc type · audience · desired impact · template/format · constraints.
- **Info dump:** invite the user to dump everything — background, prior decisions, why alternatives
  were rejected, organizational/timeline context, related threads/docs. They don't have to organize it.
- **Clarify:** after the dump, ask 5–10 numbered, gap-targeted questions; offer shorthand answers.
- **Exit:** when your questions show edge-case awareness, not basics-asking.

## Stage 2 — Refinement & structure (section by section)
- Confirm or propose 3–5 sections appropriate to the doc type. Start with the section that has the
  most unknowns (usually the core decision/proposal); summaries last.
- Scaffold the whole doc with placeholder text first, then fill section by section.
- Per section: **5–10 clarifying Qs → brainstorm 5–20 candidate points → user curates (keep / cut /
  combine) → gap-check → draft → surgical edits until satisfied.**
- After 3 iterations with no substantive change, ask *"can anything be removed without losing what
  matters?"* — every sentence carries weight, or it goes.
- Near completion, re-read whole-doc for flow, redundancy, contradictions, slop.

## Stage 3 — Reader test (catch blind spots)
- Predict 5–10 questions a real reader would ask.
- **With sub-agents:** invoke a fresh-context Claude given **only** the doc + one question; capture
  what it got right/wrong. Also ask about ambiguity, false assumptions, contradictions.
- **Without sub-agents** (e.g. claude.ai web): hand the user instructions to do the test themselves
  in a fresh chat.
- Loop back to Stage 2 for any sections that failed. Exit when the reader Claude consistently answers
  correctly and surfaces no new gaps.

## Final pass
Remind the user they own the doc — they should do a final read, double-check facts/links/technical
detail, and confirm it achieves the intended impact.

## Tone
Direct and procedural — don't sell the workflow, just execute it. Offer agency to skip stages or move
faster. Address context gaps as they appear; don't let them accumulate.
