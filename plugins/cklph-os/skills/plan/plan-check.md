# Plan check — verification checklist

Run this against a drafted plan (the `cklph-reviewer` plan-check mode uses it). Loop:
draft → check → re-plan on findings → re-check. **Max 3 cycles**; if `issue_count >= previous`
(no progress), stop and escalate to the user.

For each task, confirm:
- [ ] Names **concrete files/functions** it will touch (not vague "update the service").
- [ ] Has a **verify command** that actually distinguishes pass from fail (no empty / `echo "done"` checks).
- [ ] Is a **vertical slice** that's independently verifiable (not a horizontal "all schemas" task).
- [ ] Dependencies are correct; **no two tasks in the same wave edit the same file**.
- [ ] Sized to land in one focused sub-agent context.
- [ ] Decision logic in the brief is **explicit (matrices / rules), not ambiguous prose**, and out-of-scope is stated.

Marker: end with `## PLAN VERIFIED` (clean) or `## PLAN ISSUES` + the list (BLOCKER / WARNING per task).
