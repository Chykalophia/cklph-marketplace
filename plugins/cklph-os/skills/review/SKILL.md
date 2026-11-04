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
- **two-reviewer gate** — two fresh reviewers, the same written rubric, **both** must pass, fix rounds
  continue while they find real new issues (churn or 5 rounds → escalate to Peter). **Only** for client-facing deliverables, security-sensitive
  diffs, and anything published publicly (this marketplace included). Procedure: `@two-reviewer-gate.md`.

**Did this session write the change?** Then run the test suite and the build *before* dispatching
the reviewer and hand it the output: a self-review shares the author's blind spots, a failing test
does not. Each bug the review finds gets a regression test that fails on the old code. On a
Next.js + Supabase repo, `cklph-nextjs:testing` (`ai-regression.md`) lists the patterns AI changes
get wrong and how to test each.

**Shared client state in the diff?** If it touches a store action, a TanStack Query mutation or
query key, a context provider, or an effect that syncs state, also run `click-path-audit` on the
touchpoints that reach it.

**Run the reviewer on a different model than the builder** whenever one is available — same prompt,
same markers, fresh context: `@cross-model.md`.

The reviewer runs in a **fresh context**, **reads the tests first**, and reviews on **three axes —
standards, spec, and omissions (what wasn't asked, including text and contracts that read two
ways) — reported separately**, by severity with `file:line` + fixes. Red-team adds burden-of-proof
(every reliant claim proven or broken) and a failure-injection attack checklist.
A whole-repo sweep for text and contracts that read two ways is `/cklph-audit:run ambiguity`.

Triage the findings:
- **Critical / High** — fix before proceeding (inline, or dispatch a follow-up `cklph-implementer`).
- **Medium / Low / Nit** — fix now if cheap, else note for follow-up. For readability Nits (works, but
  reads harder than it should), apply `simplify`.

**Change-sizing lens.** Target ~100 LOC for an easy review; ~300 acceptable for one logical change;
~1000+ must be split (stack the PRs / by-file-group / horizontal / vertical) — flag oversize work as a
finding, not "review anyway."

**Attack tests.** The reviewer stays read-only. For a **Critical or High** finding it may *propose* an
attack test, in exactly this form: a line `` **Attack test:** `<new/test/path>` `` (a new file at a
test location; letters, digits, `. _ / -`, no dot-directories), a line `` Expect: `<ERE>` `` matching
the failure it should print, then one fenced block with the whole file. You read it, then lock it
with `scripts/attack-tests.sh lock` (`flow` → Hand-offs), which refuses any test that doesn't fail on
the current code with that failure. A refused test goes back to the reviewer as "your attack test
didn't reproduce the finding". A locked test is never edited by the fix wave; a disputed one goes
to Peter. The script commits with `--no-verify` (a git hook such as lint-staged could rewrite the
test between its run and the commit), and the Claude Code `pre-commit-gate` hook only inspects
commands typed into the Bash tool, so neither runs on the lock commit; it holds only the test files.

The `pre-commit-gate` hook is the automatic backstop at commit time — not a substitute for this gate.
Proceed on `## REVIEW CLEAN` / `## RED-TEAM CLEAR`; loop (fix → re-review) on `## ISSUES FOUND` /
`## RED-TEAM FINDINGS` with a **fresh** reviewer each round, for as long as rounds find real new
issues; stop and escalate to Peter on churn or after 5 rounds (`@two-reviewer-gate.md`, Rounds). Hands off to `verify`.
