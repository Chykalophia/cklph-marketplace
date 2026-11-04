# Marker contract

Lazy depth for `flow`, and the one authoritative list for anything that routes on cklph-os output:
`flow` itself, or an external orchestrator (an agent kanban, a dashboard) running each phase as a step,
possibly on a different model per step.

## Parsing rules
- **One regex.** A marker line matches `^## <MARKER>(: .+| \([0-9]+\))?[ \t]*$`, where `<MARKER>` is one
  of the strings in the table, spelled exactly. Only `TASK BLOCKED` and `ROOT CAUSE` take the `: <text>`
  suffix; only `CLICK-PATH FINDINGS` takes ` (<n>)`. Anything else on the line (`## REVIEW CLEAN.`)
  is not a marker.
- **Last one wins, outside code.** Lines inside fenced code blocks never count. If the output has
  several marker lines, the last one is the verdict. The payload a marker introduces (the findings
  list, the gaps YAML) may follow it; nothing after the payload may be another marker.
- **Whole strings.** Five markers share the `TASK` prefix; matching on the prefix routes a build
  report as a challenge verdict.
- **Commit first.** A phase that produces artifacts commits them on the feature branch before it
  emits its marker (`flow` → Hand-offs), so an orchestrator reads the next step's input from git alone.
- **No marker from a marker-emitting step → failed**, never passed.
- **Three phases emit no marker:** `refine` (ends in a problem statement), `spec` (a committed spec)
  and `ship` (a PR URL). They are done when that artifact exists; route on it, not on a marker.

## Markers
| Phase / emitter | Marker | Meaning | Next step | Loop limit |
|---|---|---|---|---|
| `challenge` | `## TASK READY` | Premises hold, context present, no blocking question | `refine` if the goal is vague, else `spec` | — |
| `challenge` | `## TASK QUESTIONS` | Something doubtful, missing or unanswered | **Hard gate in every mode**: a human answers, then re-run `challenge` | Human-gated; no automatic retry |
| `challenge` | `## TASK REJECTED` | The task's premise is wrong | Stop the flow; report why and the alternative | — |
| `survey` (by hand, not a `flow` phase) | `## SURVEY COMPLETE` | Scope drilled, decisions made | `spec` | — |
| `survey` | `## SURVEY OPEN` | Decisions still needed | Human decides, then re-run `survey` | Human-gated |
| `plan` → `cklph-reviewer` Mode B | `## PLAN VERIFIED` | Plan passes plan-check | `build` | — |
| `plan` → `cklph-reviewer` Mode B | `## PLAN ISSUES` | BLOCKER/WARNING per task | Revise the plan, re-check | 3 cycles, or stop early when a re-check finds no fewer issues; then escalate |
| `build` → `cklph-implementer` | `## TASK COMPLETE` | One task done (committed when the brief says so; `build` always does) | Next wave, or `review` after the last | — |
| `build` → `cklph-implementer` | `## TASK BLOCKED: <reason>` | Task could not be done as briefed | Resolve or re-plan before the dependent wave | — |
| `review` → `cklph-reviewer` Mode A | `## REVIEW CLEAN` | No blocking findings | `verify` | — |
| `review` → `cklph-reviewer` Mode A | `## ISSUES FOUND` | Findings by severity | `build` fix wave, then re-review | 2 fix rounds, then escalate to Peter |
| `review` → `red-team` | `## RED-TEAM CLEAR` | Every reliant claim proven | `verify` | — |
| `review` → `red-team` | `## RED-TEAM FINDINGS` | Findings with repros | `build` fix wave, then re-review | 2 fix rounds, then escalate to Peter |
| `verify` | `## VERIFIED` | Every criterion met, with evidence | `ship` | — |
| `verify` | `## GAPS FOUND` | Structured gap list | `build` gaps-only wave, then re-verify | 2 gaps rounds, then escalate to Peter |
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
