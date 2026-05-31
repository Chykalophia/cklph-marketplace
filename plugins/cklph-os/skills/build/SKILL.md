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

Then **survey installed skills that fit the stack/task** (your context lists them; `claude plugin list`
for plugins) and name the relevant ones in each implementer's brief — e.g. a Next.js or domain skill —
so the implementer uses the specialist instead of reinventing it. cklph-os is the spine; skills are depth.

For any framework / library / API code, instruct each implementer to **announce the stack in its report**
("STACK DETECTED: Next.js 16, Supabase v2"), verify against current docs (Context7 > official changelog >
MDN), and **cite sources** (URL + anchor) inline for non-obvious decisions. Unverifiable but used
assumptions get flagged explicitly: `UNVERIFIED: relies on <X> — confirm before merging.`

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
