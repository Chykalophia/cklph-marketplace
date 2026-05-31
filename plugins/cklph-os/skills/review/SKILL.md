---
name: review
description: The REVIEW phase of the cklph-os flow — adversarial review of changes via the cklph-reviewer sub-agent (or the red-team agent for high-stakes changes). Use after a build wave and before verify/ship. Triage findings; fix Critical/High before proceeding.
---

# review — adversarial gate

Pick the **intensity** for the change under review:
- **standard** (default) — dispatch the **`cklph-reviewer`** sub-agent (Mode A).
- **red-team** — dispatch the **`red-team`** agent instead. Use for high-stakes changes: security /
  auth / money / data integrity / irreversible actions, or before a public release. `flow`
  auto-escalates to this at hard gates.

The reviewer runs in a **fresh context**, **reads the tests first**, and reviews on **three axes —
standards, spec, and omissions (what wasn't asked) — reported separately**, by severity with
`file:line` + fixes. Red-team adds burden-of-proof (every reliant claim proven or broken) and a
failure-injection attack checklist.

Triage the findings:
- **Critical / High** — fix before proceeding (inline, or dispatch a follow-up `cklph-implementer`).
- **Medium / Low / Nit** — fix now if cheap, else note for follow-up.

**Change-sizing lens.** Target ~100 LOC for an easy review; ~300 acceptable for one logical change;
~1000+ must be split (stack the PRs / by-file-group / horizontal / vertical) — flag oversize work as a
finding, not "review anyway."

The `pre-commit-gate` hook is the automatic backstop at commit time — not a substitute for this gate.
Proceed on `## REVIEW CLEAN` / `## RED-TEAM CLEAR`; loop (fix → re-review) on `## ISSUES FOUND` /
`## RED-TEAM FINDINGS`. Hands off to `verify`.
