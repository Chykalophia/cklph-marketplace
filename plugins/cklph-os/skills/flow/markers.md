# Marker contract

Lazy depth for `flow`, and the one authoritative list for anything that routes on cklph-os output:
`flow` itself, or an external orchestrator (an agent kanban, a dashboard) running each phase as a step,
possibly on a different model per step.

## Parsing rules
- A marker is a line that **starts** with `## ` followed by one of the strings below, as the **last**
  non-empty line of the output. A marker anywhere else (inside a quote, a code block, echoed content)
  is not a marker.
- Match the **whole marker string**, never a prefix. Five markers start with `## TASK`; matching on
  `## TASK` alone routes a build report as a challenge verdict.
- Three markers carry a suffix: `## TASK BLOCKED: <reason>`, `## CLICK-PATH FINDINGS (<n>)` and
  `## ROOT CAUSE: <one line>`. Match the part before the suffix.
- A phase that produces artifacts commits them on the feature branch **before** it emits its marker
  (`flow` → Hand-offs). An orchestrator can read the next step's input from git alone.
- No marker, or an unknown one → treat the step as failed, not as passed.

## Markers
| Phase / emitter | Marker | Meaning | Next step | Loop limit |
|---|---|---|---|---|
| `challenge` | `## TASK READY` | Premises hold, context present, no blocking question | `refine` if the goal is vague, else `spec` | — |
| `challenge` | `## TASK QUESTIONS` | Something doubtful, missing or unanswered | **Hard gate in every mode**: a human answers, then re-run `challenge` | Human-gated; no automatic retry |
| `challenge` | `## TASK REJECTED` | The task's premise is wrong | Stop the flow; report why and the alternative | — |
| `survey` (by hand, not a `flow` phase) | `## SURVEY COMPLETE` | Scope drilled, decisions made | `spec` | — |
| `survey` | `## SURVEY OPEN` | Decisions still needed | Human decides, then re-run `survey` | Human-gated |
| `plan` → `cklph-reviewer` Mode B | `## PLAN VERIFIED` | Plan passes plan-check | `build` | — |
| `plan` → `cklph-reviewer` Mode B | `## PLAN ISSUES` | BLOCKER/WARNING per task | Revise the plan, re-check | 3 cycles, then escalate |
| `build` → `cklph-implementer` | `## TASK COMPLETE` | One task done and committed | Next wave, or `review` after the last | — |
| `build` → `cklph-implementer` | `## TASK BLOCKED: <reason>` | Task could not be done as briefed | Resolve or re-plan before the dependent wave | — |
| `review` → `cklph-reviewer` Mode A | `## REVIEW CLEAN` | No blocking findings | `verify` | — |
| `review` → `cklph-reviewer` Mode A | `## ISSUES FOUND` | Findings by severity | `build` fix wave, then re-review | 2 fix rounds, then escalate to Peter |
| `review` → `red-team` | `## RED-TEAM CLEAR` | Every reliant claim proven | `verify` | — |
| `review` → `red-team` | `## RED-TEAM FINDINGS` | Findings with repros | `build` fix wave, then re-review | 2 fix rounds, then escalate to Peter |
| `verify` | `## VERIFIED` | Every criterion met, with evidence | `ship` | — |
| `verify` | `## GAPS FOUND` | Structured gap list | `build` gaps-only wave, then re-verify | None set |
| `debugging` | `## ROOT CAUSE: <one line>` | Cause found and reproduced | Fix via `build`, then `verify` | — |
| `debugging` | `## STILL UNKNOWN` | Cause not found | Report; human decides | — |
| `click-path-audit` | `## CLICK-PATH CLEAN` | No state-write defects | Continue the calling phase | — |
| `click-path-audit` | `## CLICK-PATH FINDINGS (<n>)` | n findings | Fix via `build`, then re-audit | — |

## Collision note
`## TASK READY` / `## TASK QUESTIONS` / `## TASK REJECTED` come **only** from `challenge`, about the
incoming task. `## TASK COMPLETE` / `## TASK BLOCKED` come **only** from `cklph-implementer`, about
one plan task. Keep all five strings distinct; a new marker must not share a full string with any row
above, and gets a row here in the same change that adds it.
