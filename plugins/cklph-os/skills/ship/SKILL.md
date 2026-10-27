---
name: ship
description: The SHIP phase of the cklph-os flow — open a PR (or merge) with a clear summary and test plan once verified. Use as the final phase. Never commits to dev/main directly.
---

# ship — land it

1. Confirm `verify` ended `## VERIFIED`, with its evidence check passed. **A `## GAPS FOUND`, or a
   "done" with no evidence from this session behind it (what counts:
   `../verify/rationalization-patterns.md`, "Evidence that counts"), blocks the ship**: go back to `build`, not forward.
2. **Two-reviewer gate** for client-facing deliverables, security-sensitive diffs, and anything
   published publicly (including this marketplace): both reviewers pass before the push
   (`../review/two-reviewer-gate.md`). After 2 failed fix rounds, stop and escalate to Peter.
   **A fix round changes the diff, so it re-runs `verify`**: capture fresh `## VERIFIED` evidence
   before the push, never reuse the pre-gate run.
3. Push the **feature branch** (never `dev`/`main`).
4. Open a PR with: a concise **summary (the why)**, a **test plan**, and the spec's
   **acceptance-criteria checklist**. Generate release notes if relevant. Write the PR body and
   release notes with `writing`.

Push and PR are externally visible — **confirm with the user before doing them** unless they've
authorized it for this task. Match the action to what was actually requested.

## CI feedback loop
If CI fails: paste the relevant error block, fix locally, reproduce the same check passing locally
(`npm test` / `tsc --noEmit` / etc.), then push. Don't push a guess and hope. If a check is slow or
flaky, prefer **cache → parallelize → path-filter → matrix-shard**, in that order.

## Commit-message types (reference)
`feat` · `fix` · `refactor` · `test` · `docs` · `chore` — keep the subject line ≤ ~70 chars; explain
the *why* in the body, not the *what*.
