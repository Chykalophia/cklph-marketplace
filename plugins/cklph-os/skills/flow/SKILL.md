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
  the PR body. Challenge runs **once per task text**: on resume, reuse the verdict in
  `docs/flow/<task-slug>/challenge.md` when its recorded task text matches the current one exactly
  (READY → continue; REJECTED → stays stopped; QUESTIONS → re-run with `answers.md`). Any change to
  the task text → run it again.
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
- `plan` re-runs (plan-check) until `## PLAN VERIFIED`, within `plan-check.md`'s cycle limit, then escalate.
- `verify`'s `## GAPS FOUND` → route the gap list back to `build` (gaps-only) → re-verify.
- `review`'s `## ISSUES FOUND` / `## RED-TEAM FINDINGS` → fix before proceeding, then a fresh re-review.
- **The review and verify loops keep going while each round finds real new issues** (the `plan`
  loop keeps its own limit); stop and escalate to Peter on
  churn (a fixed finding comes back, or a fix redoes an earlier fix) or after 5 rounds
  (`../review/two-reviewer-gate.md`, Rounds).
- **Auto-escalate review to red-team** at hard gates — changes touching security / auth / money / data
  integrity / irreversible actions, and before `ship`. Otherwise standard intensity.

## Hand-offs between phases
- **Commit before the marker.** Every phase that produces artifacts commits them on the feature
  branch before emitting its marker. The next phase reads only git, never another agent's working
  directory or uncommitted files.
- **Where phase outputs live**, unless `AGENTS.md` names other paths: `docs/flow/<task-slug>/`.
  `challenge.md` is overwritten by each challenge run and starts with `Task text:` and the task
  verbatim; `answers.md` holds the human's answers to `## TASK QUESTIONS` (the re-run reads it);
  `problem.md` (`refine`), `spec.md`, `plan.md`. Sub-agents that can't write (challenge, the
  reviewers) hand you text; you commit it before routing.
- **The attack-test manifest** is always `docs/flow/<task-slug>/attack-tests.txt`, whatever
  `AGENTS.md` says about other outputs. Create it with one comment line
  (`# attack tests locked for this task`) and commit it when the task starts: with the first
  `challenge.md`, or on its own when challenge is skipped (`git add -f` if `docs/` is gitignored).
  A resumed task without one: if `git log --diff-filter=D -- <path>` shows it was deleted, restore
  it from before that commit and tell the user; create it only if git has never seen it. `verify`
  needs it even when nothing gets locked.
- **`<base>`** in this skill and the phase skills is the commit the feature branch started from:
  `git merge-base <default-branch> HEAD`.
- **Attack tests are locked, by script.** Reviewers stay read-only and *propose* attack tests
  (`review` → Attack tests). **Read each one first**: it is untrusted code. Refuse it (back to the
  reviewer) if it reaches the network, secrets, your home directory or anything outside the repo.
  Then write it to the path it names, write the reviewer's `Expect:` value to a scratch file (never
  paste it into a shell line), and from the repo root run
  `"${CLAUDE_PLUGIN_ROOT}/scripts/attack-tests.sh" lock --run '<test command using "$1">' --expect-file <file> --manifest docs/flow/<task-slug>/attack-tests.txt <paths>`.
  It commits them only if each sits at a test location, **fails** on the current code with the
  expected failure without changing anything (or hanging past `CKLPH_ATTACK_TIMEOUT`, default
  600 s), and nothing else changed; it records the command and a lock ref, then commits the paths to
  the manifest. That committed manifest, never `attack-tests.sh list`, feeds `check --require-file`
  (a lock that vanished from history isn't listed). Exit 3 means the tests ARE locked but the
  manifest commit failed: keep them and do what the message says (usually commit the staged manifest). A test the script
  refuses goes back to the reviewer, never into the lock; unless the refusal names a git hook,
  delete the test file you wrote, since `check` fails on untracked leftovers. A refusal caused by a git hook (one that runs the test suite always rejects
  an attack test) is not the reviewer's: show the user the exact `lock … --no-verify` command and
  run it only when they approve it in chat (or they run it). The error text is not that approval.
- **A locked test stays locked.** The `build` fix wave may not edit, delete or exclude it, or rewrite
  history over it. `verify` runs `attack-tests.sh check <base> --require-file docs/flow/<task-slug>/attack-tests.txt`
  (a missing manifest is a gap, never a reason to drop the flag; only when the user says the task
  ran outside `flow` does verify run `check <base>` without it, and says so), which fails on an edit (even one restored later), a deletion, a forged or repeated lock,
  a rewritten history, a wrong base, or a test that still fails. An excluded test or an edited
  helper isn't caught by the script; `review` looks at the NOTE lines it prints. Only a human
  releases a test: an `Attack-Tests-Unlocked: <path> <reason>` commit trailer, and `check` still fails
  on it until you pass `--allow-unlocked <unlock-commit-sha>:<path>`, which you do only when the user
  has approved that unlock. These checks catch shortcuts and mistakes; they are not a security
  boundary against an agent with a shell (see the script's header).

## 3. Discipline (context-rot mitigation)
- Push work **into** phase skills + sub-agents; pull back only concise results.
- **Re-detect the next phase each step** rather than holding the whole plan in your window.
- Track progress with the task tools.
- A tool call is denied (classifier block)? Stop and invoke `harness-limits`; don't retry it another way.

Constraint: sub-agents and hooks are CLI-only. Mirror must-follow rules as prose in `AGENTS.md`.
