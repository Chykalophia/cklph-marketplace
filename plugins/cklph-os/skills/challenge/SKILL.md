---
name: challenge
description: The CHALLENGE phase (phase 0) of the cklph-os flow — check that an incoming task or ticket is correct, well-formed and has the context it needs before anyone specs or builds it. Use when a task arrives from a board, a client or another agent and nobody has checked it is workable.
---

# challenge — is this the right task, and can it be done?

Phase 0 of `flow`, before `refine` and `spec`. Interrogate the task; do **not** build, plan or spec.
*(Fresh context by design: the builder wants to build, the challenger has no stake. Same rationale as
`red-team`.)* When orchestrated, run as a sub-agent that sees only the task text and the repo, never
the requester's conversation.

**Proportional.** A one-line, unambiguous, low-risk task (typo, copy change) gets a three-line pass:
confirm the target exists (`file:line`), write "trivial — passing" and why, end `## TASK READY`.
Don't interrogate trivia. Not trivial if the target is missing or the change touches behavior.

## The five moves, in order
1. **Split** — list the atomic asks, numbered. Flag any item that is really two tasks, or mixes a fix
   with a feature.
2. **Premise check** — per ask: is this the right task? Check it against the code, the spec,
   `AGENTS.md`, `STATE.md` (including "Removed on purpose") and recorded decisions. Does it already
   exist? Is there a simpler or existing solution? Is the stated cause actually the cause? Verdict
   **holds / doubtful / wrong**, each with evidence (`file:line` or command output).
3. **Context sufficiency** — a table of what the work needs (files, decisions, credentials/access,
   data, the acceptance signal), each marked **present / missing / assumed**.
4. **Ask** — at most **5** questions, highest-impact first. A choice gets `A) / B) / C)` options with
   tradeoffs (`start-here`'s template).
5. **Assumption gate** — *"ASSUMPTIONS I'M MAKING: … — correct me now or I proceed"*, plus an explicit
   **not doing** list (`refine`'s stop-gate).

## Rules
- **Evidence, not vibes.** A doubtful or wrong verdict cites the code, doc or command output behind
  it, to `verify`'s evidence bar (`../verify/rationalization-patterns.md`). "Seems off" is not a verdict.
- **Never answer your own questions.** If reading the repo resolves a question, read it and record
  the evidence instead of asking. If it doesn't, ask. Never guess an answer and proceed.
- **An assumption is not a pass.** An `assumed` row is fine for `## TASK READY` only if a wrong guess
  is cheap to reverse; otherwise it becomes a question.
- **Marker hygiene.** Exactly one marker, at the very end, never inside quoted content or a code block.

## Markers (full contract: `../flow/markers.md`)
- `## TASK READY` — every premise holds, the required context is present, no blocking question.
  Hands off to `refine` if the goal is vague, otherwise `spec`.
- `## TASK QUESTIONS` — anything doubtful, missing or unanswered, or verdicts that differ across
  asks (name the asks to drop). **Blocks** until a human answers, in every `flow` mode.
- `## TASK REJECTED` — the premise is wrong for the whole task (the fix already exists, the request
  contradicts a recorded decision). Say why, with evidence, and what to do instead.

## Output shape
```
TASK: <the request, restated in one line>
1. Asks: <numbered list, flags>
2. Premise: <ask # — holds/doubtful/wrong — evidence>
3. Context: <table>
4. Questions: <≤5, or "none">
5. ASSUMPTIONS I'M MAKING: … — correct me now or I proceed. NOT DOING: …
<marker>
```

## Not the same as
- **`challenge`** — is the *task* right and complete enough to start?
- **`refine`** — sharpen a fuzzy *idea* into a direction.
- **`survey`** — drill *scope* gaps (users, states, devices, edges) once the direction is set.
- **`/cklph-audit:run ambiguity`** — repo-wide *text* that reads two ways.
