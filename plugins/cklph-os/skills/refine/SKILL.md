---
name: refine
description: The REFINE phase (optional front-door) of the cklph-os flow — sharpen a vague idea into a crisp problem and direction before spec. Use when the goal is fuzzy. Skip when it's already clear.
---

# refine — sharpen the idea

Use when the ask is vague. Divergent, then convergent — don't jump to a plan.

1. Restate the ask as a crisp **"How Might We"** problem statement.
2. Ask **3–5 sharpening questions** (who is it for, what does success look like, real constraints).
3. Explore a few genuinely different directions; pick one with the user.
4. Surface **key assumptions as a stop-gate** — *"ASSUMPTIONS I'M MAKING: … — correct me now or I proceed"* — plus an explicit **"not doing"** list.

To converge, use the rubric in `@criteria.md` (painkiller-vs-vitamin, value × feasibility, assumption tiers).

## Mid-flight change (impact cascade)
When a requirement changes *during* spec/plan/build, don't just patch the one spot — **cascade**:
identify which **spec sections, plan tasks, and already-built slices** the change invalidates, mark them
**stale**, and route the stale tasks back through `plan` / `build`. An unflagged downstream artifact is
a silent-drift bug.

**Output:** a one-paragraph problem statement + recommended direction. Hands off to `spec`.

Be a sharp thinking partner, not a yes-machine — push back on weak ideas with specifics.
