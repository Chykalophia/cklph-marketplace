# Cross-model review

Lazy depth for `review`. Fresh context removes the author's conversation; it does not remove the
author's model. A reviewer on the same model as the builder tends to share its blind spots, so put
the review on a **different model** whenever one is available.

## The rule
- **Reviewer's model ≠ builder's model** whenever a second model is available. If only one is, say
  so in the review report; same-model review is still better than none.
- **Same prompt.** The reviewer gets the agent file as its instructions (`agents/cklph-reviewer.md`,
  or `agents/red-team.md` for high-stakes changes), plus the spec, the diff range and, for the
  two-reviewer gate, the rubric. Nothing from the builder's conversation.
- **Same marker contract.** The review ends with the agent's own marker (`../flow/markers.md`); the
  orchestrator routes on it the same way whichever model wrote it.
- **Read-only.** It edits nothing. It may *propose* attack tests in its report; the orchestrator
  writes and commits them (`flow` → Hand-offs). So a read-only sandbox is always enough.

## When
- **Two-reviewer gate** (`two-reviewer-gate.md`): the two reviewers run on two different models
  when one is available, neither on the builder's model if you can avoid it.
- **Red-team intensity**: prefer a different model, since a high-stakes miss costs the most.
- **Standard review**: use a different model when it is already set up. Don't block on it.

## How
Any agent that can read files, run a shell and print text can take the step. With Claude Code as
the builder and the Codex CLI as the reviewer:

1. Write the brief to a file in the scratchpad: the agent file's body, **the full text of every file
   it points to** (Mode B's `skills/plan/plan-check.md`, say), then the spec, then the review range
   (`git diff <base>...HEAD`, or tell the reviewer to run it), then the rubric if the gate applies. The
   reviewer runs in the target project and can't resolve plugin-relative paths, so inline what it needs.
   End the brief with the instruction to finish on the agent's marker.
2. Run it read-only from the repo root:
   `codex exec -s read-only -C "$(git rev-parse --show-toplevel)" -o <scratchpad>/review.md - < <scratchpad>/brief.md`
3. Parse the marker from `review.md` (`../flow/markers.md`, parsing rules) and triage the findings like
   any other review. Proposed attack tests go through `review`'s attack-test step.

An external orchestrator does the same thing by assigning the review step to a different agent and
handing it the same brief file. Paths in the agent files (`skills/…`) are relative to the cklph-os
plugin directory (`${CLAUDE_PLUGIN_ROOT}` under Claude Code).

## Limits
Two models can miss the same thing, and a different model is not a more careful one: it is a
different set of blind spots. Cross-model review adds to the evidence `verify` needs; it does not replace it.
