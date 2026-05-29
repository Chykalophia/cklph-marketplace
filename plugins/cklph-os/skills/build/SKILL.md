---
name: build
description: The BUILD phase of the cklph-os flow — execute a plan's task-graph via sub-agent waves. Use when you have a plan and need to implement it. Dispatches fresh-context implementers wave by wave, one atomic commit per task, keeping the main context lean.
---

# build — execute the plan via sub-agent waves

**Input:** a wave task-graph from the `plan` phase, on a feature branch. *(Or a gap list from `verify` → run its `fix_task`s as a gaps-only wave.)*
**Output:** committed code; hands off to `review` then `verify`.

## Before executing
Confirm the stack (read `AGENTS.md` + `package.json`). A `next` dependency = **Next.js**, *not* pure
React — App Router, Server vs Client Components, route handlers apply. Monorepos: per-package stack.

## Execute, wave by wave
1. Dispatch one **`cklph-implementer`** sub-agent per task — **in parallel for independent tasks**
   (multiple Agent calls in one message). Give each a **structured brief** — `TASK / RELEVANT FILES /
   PATTERN TO FOLLOW (one existing example) + ANTI-PATTERN (what to avoid + why) / CONSTRAINT /
   OUT OF SCOPE (nearby work NOT to touch) / acceptance command (runnable pass/fail)` — and "make one
   atomic commit when done."
2. **Never** put dependent tasks in the same wave — the second won't see the first's commit.
3. Pull back only the implementers' concise reports. Keep your own context lean (~30–40%); track
   progress with the task tools, not by holding everything in your window.
4. If an implementer reports a blocker, resolve it (or re-plan that task) before the dependent wave.

## Between waves (compaction)
After each wave, record a one-block **compaction note** — *what shipped · deviations from brief · the
state + exact files a dependent task must load* — so the next wave (or a resumed session) continues
without re-deriving context. The implementer's report supplies most of this; capture it, don't lose it.

When a wave misbehaves (off-script, invented API, scope creep, same-file clobber), see `@failure-modes.md`.

Constraint: sub-agents are CLI-only.
