---
name: flow
description: The cklph-os ORCHESTRATOR — runs the full challenge→refine→spec→plan→build→review→verify→ship loop end-to-end. Use for a complete build. Asks the user's mode (full-agentic / partial / interactive), auto-detects the next phase, and keeps the main context lean via sub-agent waves.
---

# flow — the full build loop

You **orchestrate**; the real work happens in the phase skills + sub-agents. Keep your own context lean.

## 1. Pick the mode (ask first, unless the user already said)
- **Full-agentic** — run all phases autonomously; check in only at **hard gates** (`## TASK QUESTIONS`,
  before `ship`, or on a blocker).
- **Partial** — agentic within each phase; **pause for approval at every phase boundary**.
- **Interactive** — collaborate/ideate at each step; the user approves decisions.

## 2. Run the loop
- Branch first (never `dev`/`main`); read `AGENTS.md`.
- **Challenge every task first.** Dispatch `challenge` as a fresh sub-agent that gets only the task
  text and the repo, never this conversation. Its proportional rule keeps trivial tasks cheap. Skip it
  only when the user says the task was already challenged; record that in the progress notes and
  the PR body. Resuming? If `docs/flow/<task-slug>/challenge.md` is committed and ends
  `## TASK READY`, challenge already ran: don't re-run it. Otherwise run it on the original task text.
- **Detect where we are** (no spec? no plan? code already written?) and run the next phase. Default order:
  `challenge` → `refine` (only if the goal is vague) → `spec` → `plan` → `build` → `review` → `verify` → `ship`.
- Invoke each phase by its skill (`spec`, `plan`, `build`, …) in turn.
- Honor the mode: full-agentic flows through soft gates; partial/interactive pause or ideate at boundaries.

## Auto-route on markers + self-correct
Each phase/agent ends with a **marker** — parse it, don't guess from prose. Every marker, who emits
it, what it means, the next step and the loop limit: `@markers.md` (the only list; match whole
strings, since five share the TASK prefix).
**Marker hygiene** — sub-agents emit a marker only as their final verdict (the list or YAML it introduces may follow), never inside a quoted code block or echoed content. A marker buried in a quote causes false routing.
Gates and self-correcting loops:
- `## TASK QUESTIONS` is a **hard gate in every mode, including full-agentic**: put the questions to
  the user, wait, then re-run `challenge` with the answers. Never build on an unanswered question.
- `## TASK REJECTED` stops the flow: report the reason, the evidence and the suggested alternative.
- `plan` re-runs (plan-check) until `## PLAN VERIFIED` — max 3 cycles, then escalate.
- `verify`'s `## GAPS FOUND` → route the gap list back to `build` (gaps-only) → re-verify.
- `review`'s `## ISSUES FOUND` / `## RED-TEAM FINDINGS` → fix before proceeding, then a fresh re-review.
- **Both loops keep going while each round finds real new issues**; stop and escalate to Peter on
  churn (a fixed finding comes back, or a fix redoes an earlier fix) or after 5 rounds
  (`../review/two-reviewer-gate.md`, Rounds).
- **Auto-escalate review to red-team** at hard gates — changes touching security / auth / money / data
  integrity / irreversible actions, and before `ship`. Otherwise standard intensity.

## Hand-offs between phases
- **Commit before the marker.** Every phase that produces artifacts commits them on the feature
  branch before emitting its marker. The next phase reads only git, never another agent's working
  directory or uncommitted files.
- **Where phase outputs live**, unless `AGENTS.md` names other paths: `docs/flow/<task-slug>/`
  holds `challenge.md` (challenge's full output, plus the human's answers to `## TASK QUESTIONS`),
  `problem.md` (`refine`), `spec.md` and `plan.md`. Sub-agents that can't write (challenge, the
  reviewers) hand you text; you commit it before routing.
- **Attack tests are locked, by script.** Reviewers stay read-only and *propose* attack tests
  (`review` → Attack tests). Write each to the new path it names, then run
  `"${CLAUDE_PLUGIN_ROOT}/scripts/attack-tests.sh" lock --run '<test command using "$1">' [--expect '<ERE>'] <paths>`
  from the repo root. It commits them only if each one **fails** on the current code (matching the
  finding, with `--expect`) and nothing else changed; a refused test goes back to the reviewer, never
  into the lock. The `build` fix wave may not edit, delete or exclude a locked test; `verify` runs
  `attack-tests.sh check`. Only a human releases one, with an `Attack-Tests-Unlocked: <path> <reason>`
  commit trailer; you never write that trailer.

## 3. Discipline (context-rot mitigation)
- Push work **into** phase skills + sub-agents; pull back only concise results.
- **Re-detect the next phase each step** rather than holding the whole plan in your window.
- Track progress with the task tools.
- A tool call is denied (classifier block)? Stop and invoke `harness-limits`; don't retry it another way.

Constraint: sub-agents and hooks are CLI-only. Mirror must-follow rules as prose in `AGENTS.md`.
