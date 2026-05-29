---
name: review
description: The REVIEW phase of the cklph-os flow — adversarial review of changes via the cklph-reviewer sub-agent. Use after a build wave and before verify/ship. Triage findings; fix Critical/High before proceeding.
---

# review — adversarial gate

Dispatch the **`cklph-reviewer`** sub-agent (Mode A) on the changes (a wave's diff, or the whole
branch). It **reads the tests first**, reviews on **two axes — standards AND spec, reported separately**,
and reports by severity with `file:line` + fixes.

Triage the findings:
- **Critical / High** — fix before proceeding (inline, or dispatch a follow-up `cklph-implementer`).
- **Medium / Low / Nit** — fix now if cheap, else note for follow-up.

The `pre-commit-gate` hook is the automatic backstop at commit time — not a substitute for this gate.
Proceed on `## REVIEW CLEAN`; loop (fix → re-review) on `## ISSUES FOUND`. Hands off to `verify`.
