# Spec authoring rules — write specs Claude Code executes faithfully

Lazy depth for the `spec` phase. **A spec is the real code — a bad spec line becomes hundreds of bad
code lines.** Author for an AI agent to *execute*, not just to read.

## Rules
- **Decision logic as matrices, not prose.** Replace "only do X when conditions are right" with a table:

  | Condition | Action |
  | --- | --- |
  | … | … |

  Prose conditionals are hallucination-prone; tables aren't.
- **Mark section intent:** `## [EXECUTABLE]` (do this) · `## [VERIFICATION]` (the done-check) ·
  `## [REFERENCE]` / `## [INFORMATIONAL]` (read, don't act). Agents over-act on context without this.
- **State out-of-scope explicitly** per task ("Do NOT add admin logic — separate change"). Agents
  over-generalize without negation.
- **Pair every example with its anti-pattern.** When you point at code to follow, also name the tempting
  *wrong* approach + why it's wrong — agents learn from negative examples, not just positive ones.
- **Required Context (load first):** list the exact files + section ranges the implementer must read
  before starting, so it loads proactively instead of discovering mid-build. (Internal-codebase context;
  Context7 covers external library docs.)
- **Verification-first:** write the executable "done" command *before* the steps. If you can't write a
  command that distinguishes done from not-done, you don't yet know what done means.

## Acceptance criteria — the shape
Number them (`AC-001`…) so `plan`, `verify` and the PR checklist can cite them. Each one:
```
AC-003  Export downloads the filtered rows
- Given   signed-in user, a filter applied, at least one row visible
- When    they click "Export CSV"
- Then    a file downloads with columns [id, name, created_at] and only the filtered rows
- Must not  include rows from another account, or internal columns
- Verify  `npm test -- src/export.test.ts` (the repo's own test script, never a tool fetched on the fly). One manual
          download as supplemental evidence (`../verify/rationalization-patterns.md`: observed behavior decides only
          where no executable check exists)
```
- **Must not** is the part specs skip: the side effect that would make a passing "Then" a bug
  (data from another tenant, a duplicate charge, an email to real users). Write it whenever one exists.
- **Facts vs business rules.** The repo tells you how the system behaves today. It never tells you
  what the business requires: pricing, plan limits, retention, compliance, SLAs, who the user is.
  List those as *assumptions to confirm* until the user or a product doc states them. "Free tier
  gets 100 exports a month" inferred from a constant in the code is an assumption, not a fact.
- **Revised, not dropped.** When the build finds an AC can't be met (platform limit, an API that
  doesn't do it), don't quietly work around it. Mark it `[revised]` with the constraint and the new
  target, and re-confirm it with the user before continuing if it weakens safety or correctness.

## Spec quality gate (pass before planning)
- [ ] Every requirement has a measurable acceptance criterion **and** an executable verification.
- [ ] Every AC with a side effect that would make a passing Then a bug has a **Must not**.
- [ ] Business rules are marked as confirmed (by the user or an authoritative product doc) or listed as assumptions, never inferred from code.
- [ ] Decision logic is a matrix, not prose.
- [ ] Out-of-scope is explicit per task.
- [ ] Required-context files are listed.
- [ ] Boundaries (Always do / Ask first / Never) are set.
