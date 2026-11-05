# Marker contract

Lazy depth for `flow`, and the one authoritative list for anything that routes on cklph-os output:
`flow` itself, or an external orchestrator (an agent kanban, a dashboard) running each phase as a step,
possibly on a different model per step.

## Parsing rules
The reference parser is `scripts/marker.sh` (`marker.sh [--emitter <name>] < output`); it reads this
table, so this file stays the only list. Exit 0 prints the verdict, 1 = no marker, 2 = conflicting or
malformed markers, 3 = no table. Pass `--emitter` (a name from the first column, e.g. `challenge`) so
a marker from the wrong phase fails the step instead of routing it.
- **Exact lines.** A marker line is `## <MARKER>` with nothing after it but whitespace. A row written
  `## <MARKER>: <…>` also accepts `## <MARKER>: <text>`; a row written `## <MARKER> (<n>)` also
  accepts `## <MARKER> (<digits>)`. No other suffix: `## REVIEW CLEAN.` and `## TASK READY: x` are
  not markers.
- **Outside code only.** Lines inside a fenced code block (``` or ~~~, closed by a fence of the same
  character at least as long) never count.
- **One verdict.** The payload a marker introduces (findings list, gaps YAML) may follow it, and the
  same marker may repeat. **Two different markers outside code → the step failed; re-run it** (fail
  closed, so a findings list quoting `## REVIEW CLEAN` can't pass a review). A **near-miss** (a line
  starting `## <MARKER>` that doesn't match its row, such as `## ISSUES FOUND:` or a bare
  `## TASK BLOCKED`) counts as a second, conflicting marker, and so does a formatting variant of a
  marker (`### ISSUES FOUND`, `**## ISSUES FOUND**`, `## Issues Found`). Counts start at 1. CRLF
  line endings are fine. HTML comments get no special treatment.
- **Only the table below** (rows under the `## Markers` heading) defines markers; other tables in
  this file don't.
- **Mentioning a marker** in prose: keep it inline in backticks, never at the start of a line, and
  don't title a section with a marker's words (`### Verified`, `### Root cause`): that reads as a
  formatting variant and fails the step.
- **Whole strings.** Five markers share the `TASK` prefix; matching on the prefix routes a build
  report as a challenge verdict.
- **Commit first.** A phase that produces artifacts commits them on the feature branch before it
  emits its marker (`flow` → Hand-offs), so an orchestrator reads the next step's input from git alone.
- **No marker from a marker-emitting step → failed**, never passed.
- **Three phases emit no marker:** `refine`, `spec` and `ship`. `refine` and `spec` are done when
  `flow` has committed `docs/flow/<task-slug>/problem.md` or `spec.md` (`flow` → Hand-offs); `ship`
  is done when the PR URL exists.

## Markers
| Phase / emitter | Marker | Meaning | Next step | Loop limit |
|---|---|---|---|---|
| `challenge` | `## TASK READY` | Premises hold, context present, no blocking question (the *how* may still be open) | `refine` if the goal is vague, else `spec` | — |
| `challenge` | `## TASK QUESTIONS` | Something doubtful, missing or unanswered | **Hard gate in every mode**: a human answers, then re-run `challenge` | Human-gated; no automatic retry |
| `challenge` | `## TASK REJECTED` | The task's premise is wrong | Stop the flow; report why and the alternative | — |
| `survey` (by hand, outside flow) | `## SURVEY COMPLETE` | Scope drilled, decisions made | `spec` | — |
| `survey` | `## SURVEY OPEN` | Decisions still needed | Human decides, then re-run `survey` | Human-gated |
| `plan` → `cklph-reviewer` Mode B | `## PLAN VERIFIED` | Plan passes plan-check | `build` | — |
| `plan` → `cklph-reviewer` Mode B | `## PLAN ISSUES` | BLOCKER/WARNING per task | Revise the plan, re-check | Per `../plan/plan-check.md` (its cycle limit and no-progress stop), then escalate |
| `build` → `cklph-implementer` | `## TASK COMPLETE` | One task done and committed (`build` always tells the implementer to commit) | Next wave, or `review` after the last | — |
| `build` → `cklph-implementer` | `## TASK BLOCKED: <reason>` | Task could not be done as briefed | Resolve or re-plan before the dependent wave; a disputed attack test goes to Peter instead | — |
| `review` → `cklph-reviewer` Mode A | `## REVIEW CLEAN` | No blocking findings | `verify` | — |
| `review` → `cklph-reviewer` Mode A | `## ISSUES FOUND` | Findings by severity | `build` fix wave, then fresh re-review | While rounds find real new issues; stop on churn or 5 rounds (`../review/two-reviewer-gate.md`, Rounds) |
| `review` → `red-team` | `## RED-TEAM CLEAR` | Every reliant claim proven | `verify` | — |
| `review` → `red-team` | `## RED-TEAM FINDINGS` | Findings with repros | `build` fix wave, then fresh re-review | While rounds find real new issues; stop on churn or 5 rounds (`../review/two-reviewer-gate.md`, Rounds) |
| `verify` | `## VERIFIED` | Every criterion met, with evidence | `ship` | — |
| `verify` | `## GAPS FOUND` | Structured gap list | `build` gaps-only wave, then re-verify | Same rule as review rounds |
| `debugging` | `## ROOT CAUSE: <one line>` | Cause found and reproduced | Fix via `build`, then `verify` | — |
| `debugging` | `## STILL UNKNOWN` | Cause not found | Report; human decides | — |
| `click-path-audit` | `## CLICK-PATH CLEAN` | No state-write defects | Continue the calling phase | — |
| `click-path-audit` | `## CLICK-PATH FINDINGS (<n>)` | n findings | Fix via `build`, then re-audit | — |

## Collision note
`## TASK READY` / `## TASK QUESTIONS` / `## TASK REJECTED` come **only** from `challenge`, about the
incoming task. `## TASK COMPLETE` / `## TASK BLOCKED` come **only** from `cklph-implementer`, about
one plan task. Keep all five strings distinct; a new marker must not share a full string with any row
above, and gets a row here in the same change that adds it.

`## TASK REJECTED` outranks `## TASK QUESTIONS`: when the premise is wrong, any alternative
`challenge` offers is a suggestion in the report, not an open question the flow must ask.
