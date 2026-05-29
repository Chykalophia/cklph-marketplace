---
name: plan
description: The PLAN phase of the cklph-os flow — decompose a spec into a wave task-graph for sub-agent execution. Use after spec. Produces small, independently-verifiable tasks grouped into dependency-ordered waves.
---

# plan — build the wave task-graph

Decompose the spec into **small, independently-verifiable tasks** — each a **vertical slice** that works end-to-end, ordered **bottom-up** (foundations first). For each task note:
- what it changes,
- its acceptance check,
- its dependencies.

Group tasks into **waves**: tasks with no unmet dependency share a wave (they'll run in parallel);
dependent tasks go in later waves. Detect the stack (`AGENTS.md` + `package.json`) so each task fits
the framework (Next.js ≠ pure React).

- **Risk-first** within the dependency order — schedule the riskiest / most-uncertain tasks early (fail
  fast); insert a **checkpoint** after the foundation wave (review before fanning out).
- **Contract-first** — when parallel slices in a wave share an API/type surface, add a **Slice 0: define
  the contract** task (see `api-design`) that lands first, so the rest build against a fixed interface.

**Verify the plan** before building — run `cklph-reviewer` in plan-check mode (checklist: `@plan-check.md`);
re-plan on findings, **max 3 cycles**, stop if not converging.

**Output:** a verified task-graph (ordered waves + a self-contained brief per task). Get the user's nod if
scope is non-trivial. End with `## PLAN VERIFIED`. Hands off to `build`.
