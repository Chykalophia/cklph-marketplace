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
- **Required Context (load first):** list the exact files + section ranges the implementer must read
  before starting, so it loads proactively instead of discovering mid-build. (Internal-codebase context;
  Context7 covers external library docs.)
- **Verification-first:** write the executable "done" command *before* the steps. If you can't write a
  command that distinguishes done from not-done, you don't yet know what done means.

## Spec quality gate (pass before planning)
- [ ] Every requirement has a measurable acceptance criterion **and** an executable verification.
- [ ] Decision logic is a matrix, not prose.
- [ ] Out-of-scope is explicit per task.
- [ ] Required-context files are listed.
- [ ] Boundaries (Always do / Ask first / Never) are set.
