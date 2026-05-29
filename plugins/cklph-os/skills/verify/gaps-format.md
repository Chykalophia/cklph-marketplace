# Gaps format — structured verify output

When `verify` finds failures, don't dead-end. Emit a structured gap list the orchestrator routes back
into `build` as a gaps-only wave:

```yaml
gaps:
  - truth: "<the acceptance criterion / expected behavior>"
    status: fail              # fail | partial
    reason: "<root cause, not symptom — reproduce + diagnose before fixing>"
    severity: critical        # critical | high | medium
    fix_task: "<one-line task brief for build to re-execute>"
```

Then route: each `fix_task` becomes a `build` wave task; re-verify after. Always fix the **root cause**
(reproduce it first) and add a **regression test** so it can't recur.

Marker: end with `## VERIFIED` (all criteria pass) or `## GAPS FOUND` + the YAML.
