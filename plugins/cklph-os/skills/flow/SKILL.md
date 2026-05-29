---
name: flow
description: The cklph-os ORCHESTRATOR — runs the full refine→spec→plan→build→review→verify→ship loop end-to-end. Use for a complete build. Asks the user's mode (full-agentic / partial / interactive), auto-detects the next phase, and keeps the main context lean via sub-agent waves.
---

# flow — the full build loop

You **orchestrate**; the real work happens in the phase skills + sub-agents. Keep your own context lean.

## 1. Pick the mode (ask first, unless the user already said)
- **Full-agentic** — run all phases autonomously; check in only at **hard gates** (before `ship`, or on a blocker).
- **Partial** — agentic within each phase; **pause for approval at every phase boundary**.
- **Interactive** — collaborate/ideate at each step; the user approves decisions.

## 2. Run the loop
- Branch first (never `dev`/`main`); read `AGENTS.md`.
- **Detect where we are** (no spec? no plan? code already written?) and run the next phase. Default order:
  `refine` (only if the goal is vague) → `spec` → `plan` → `build` → `review` → `verify` → `ship`.
- Invoke each phase by its skill (`spec`, `plan`, `build`, …) in turn.
- Honor the mode: full-agentic flows through soft gates; partial/interactive pause or ideate at boundaries.

## Auto-route on markers + self-correct
Each phase/agent ends with a **marker** — parse it, don't guess from prose:
`## PLAN VERIFIED`/`## PLAN ISSUES` · `## REVIEW CLEAN`/`## ISSUES FOUND` · `## VERIFIED`/`## GAPS FOUND` · `## TASK COMPLETE`/`## TASK BLOCKED`.
Self-correcting loops:
- `plan` re-runs (plan-check) until `## PLAN VERIFIED` — max 3 cycles, then escalate.
- `verify`'s `## GAPS FOUND` → route the gap list back to `build` (gaps-only) → re-verify.
- `review`'s `## ISSUES FOUND` → fix before proceeding.

## 3. Discipline (context-rot mitigation)
- Push work **into** phase skills + sub-agents; pull back only concise results.
- **Re-detect the next phase each step** rather than holding the whole plan in your window.
- Track progress with the task tools.

Constraint: sub-agents and hooks are CLI-only. Mirror must-follow rules as prose in `AGENTS.md`.
