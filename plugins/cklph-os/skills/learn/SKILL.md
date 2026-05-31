---
name: learn
description: Capture lessons from mistakes into persistent memory. Use when corrected, when a build/test/console error revealed a wrong assumption, when fixing your own bug mid-task, or at task end if anything was non-obvious. Builds the self-improvement loop that prevents the same mistake twice.
---

# learn — capture the lesson before it's forgotten

A real mistake *captured* is one you won't repeat. Skip = guaranteed re-do, often the same week.

## Triggers (catch all five)
- **User correction** — "no", "actually", "wrong", "stop doing X", a reverted edit, or any rewrite
  that disagrees with what you just produced.
- **Self-detected fix** — you wrote something, then had to undo or rewrite it mid-task. The **second
  draft is the lesson**; the first draft is the symptom.
- **Console / build / test signal** — an error, warning, type error, or failed assertion that
  revealed a *wrong mental model* (not a typo — those don't generalize). Examples — wrong type
  inferred, wrong DB column required vs optional, wrong async boundary, wrong RLS predicate.
- **Code-review feedback** — human or AI (e.g. CodeRabbit / cklph-reviewer / red-team). PR comments
  in the form *"issue + recommended fix"* are pre-distilled lessons. Capture the **fix** as the rule
  and the **issue category** (not the specific code) as the *how-to-apply* trigger. Skip nits.
- **Task-end retrospective** — at end of task, ask: *"was anything non-obvious here that future-me
  should have known going in?"* If yes, capture.

## Capture format (writes to the auto-memory `feedback` type)
- **Rule** — one sentence, the durable rule.
- **Why** — the underlying reason (from the mistake, not the symptom). Often a past incident.
- **How to apply** — when / where this rule kicks in. Be concrete.
- **Scope** — project-specific (save with project scope) or cross-project (also surface for
  `GLOBAL.md` update). If unsure, project-specific is the safer default; promote later if it recurs.

## Persist the lesson (do this explicitly)
This skill does **not** save automatically — you must invoke the **Write** tool to create the memory
file, or the lesson dies with this session.

1. **Pick a slug** — kebab-case, topic-leading (e.g. `gate-blocks-merge-commits`,
   `react-strict-mode-side-effects`).
2. **Write the file** at `<memory-dir>/feedback_<slug>.md`. The memory dir comes from your harness
   instructions — typically `~/.claude/projects/<project-hash>/memory/`.
3. **Body** — the four fields from "Capture format" above (Rule / Why / How to apply / Scope).
4. **Index it** — append `- [<slug>](feedback_<slug>.md) — <one-line hook>` to
   `<memory-dir>/MEMORY.md` so future sessions can find it.

Frontmatter for the memory file:

```yaml
---
name: <slug>
description: <one-line summary — used for relevance on future tasks>
metadata:
  type: feedback
---
```

Skip steps 2-4 and the lesson is just thinking; it never reaches the next session.

## What NOT to capture
- **One-off typos** any human would have caught — those don't generalize.
- **Anything already in `AGENTS.md` / `CLAUDE.md`** — those are authoritative; don't duplicate.
- **Code-pattern fixes** — the commit message has the context; memory captures *judgment*, not
  patches.
- **Ephemeral current-task state** — that's what `STATE.md` is for, not `feedback`.

## Use the captured lessons
At session start (after `using-cklph`), scan **recent `feedback`-type memory entries relevant to
the current task** — by topic / keyword, not exhaustively. Apply them. If a lesson conflicts with
the current request, surface the conflict instead of silently picking one.

Pair with `cklph-reviewer`'s bias hunt (which catches *types* of mistakes that recur across topics —
confirmation, optimism, sunk-cost) and `cklph-implementer`'s "Deviations" report field (which
surfaces in-the-moment course corrections worth a memory note).
