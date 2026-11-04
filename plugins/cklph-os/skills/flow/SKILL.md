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
- **Challenge every new task first.** Dispatch `challenge` as a fresh sub-agent that gets only the
  task text and the repo, never this conversation. Its proportional rule keeps trivial tasks cheap.
  Skip it when the user says the task was already challenged (record that in the progress notes and
  the PR body), or when resuming: a spec, plan or code for this task already on the branch means it
  was challenged when it started.
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
- `verify`'s `## GAPS FOUND` → route the gap list back to `build` (gaps-only) → re-verify; max 2
  gaps rounds, then escalate to Peter.
- `review`'s `## ISSUES FOUND` / `## RED-TEAM FINDINGS` → fix before proceeding; **max 2 review→build
  fix rounds per gate**, then escalate to Peter.
- **Auto-escalate review to red-team** at hard gates — changes touching security / auth / money / data
  integrity / irreversible actions, and before `ship`. Otherwise standard intensity.

## Hand-offs between phases
- **Commit before the marker.** Every phase that produces artifacts (spec, plan, code, attack tests,
  proof) commits them on the feature branch before emitting its marker. The next phase reads only
  git, never another agent's working directory or uncommitted files.
- **Attack tests are locked.** Reviewers stay read-only: they *propose* attack tests in their report.
  You (the orchestrator) write each one to the new file path it names, check `git status --porcelain`
  shows nothing else, and commit them with an `Attack-Tests: <paths>` trailer. The following `build`
  fix wave may not edit, delete or exclude them; `verify` checks each such commit. A disputed attack
  test goes to Peter; nobody else unlocks it.

## 3. Discipline (context-rot mitigation)
- Push work **into** phase skills + sub-agents; pull back only concise results.
- **Re-detect the next phase each step** rather than holding the whole plan in your window.
- Track progress with the task tools.
- A tool call is denied (classifier block)? Stop and invoke `harness-limits`; don't retry it another way.

Constraint: sub-agents and hooks are CLI-only. Mirror must-follow rules as prose in `AGENTS.md`.
