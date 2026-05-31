---
name: ship
description: The SHIP phase of the cklph-os flow — open a PR (or merge) with a clear summary and test plan once verified. Use as the final phase. Never commits to dev/main directly.
---

# ship — land it

1. Confirm `verify` passed (don't ship unverified work).
2. Push the **feature branch** (never `dev`/`main`).
3. Open a PR with: a concise **summary (the why)**, a **test plan**, and the spec's
   **acceptance-criteria checklist**. Generate release notes if relevant.

Push and PR are externally visible — **confirm with the user before doing them** unless they've
authorized it for this task. Match the action to what was actually requested.

## CI feedback loop
If CI fails: paste the relevant error block, fix locally, reproduce the same check passing locally
(`npm test` / `tsc --noEmit` / etc.), then push. Don't push a guess and hope. If a check is slow or
flaky, prefer **cache → parallelize → path-filter → matrix-shard**, in that order.

## Commit-message types (reference)
`feat` · `fix` · `refactor` · `test` · `docs` · `chore` — keep the subject line ≤ ~70 chars; explain
the *why* in the body, not the *what*.
