# Build failure modes — when a wave goes sideways

Named orchestration failures and their fix. Pull in when an implementer wave misbehaves.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Implementer goes off-script / does the wrong thing | brief too thin or ambiguous | re-dispatch with a tighter brief — concrete files, one PATTERN example, explicit OUT OF SCOPE |
| Invents an API / pattern that doesn't exist | coded a framework API from memory | require Context7 verification; cite an existing in-repo example to follow |
| Scope creep / drive-by refactors | no negation in the brief | add an explicit OUT OF SCOPE line; reject the extra diff |
| Second task can't see the first's work | dependent tasks placed in the same wave | never co-schedule dependents — split into ordered waves |
| Two tasks edit the same file and clobber | same-file tasks in one parallel wave | serialize across waves (plan-check should have caught this) |
| Reviewer rubber-stamps | review prompt too soft | dispatch fresh-context `cklph-reviewer`; demand per-finding severity + `file:line`; escalate to `red-team` for high-stakes |
| Wave drifts / loses context across sessions | no handoff written | require a compaction note per wave (what shipped · deviations · state + files the next wave loads) |

A recurring failure means the **brief or plan** is wrong — fix that, not just the symptom. Re-run
plan-check if the task-graph itself was the problem.
