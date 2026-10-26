---
description: Cheap recon — run ONE lens against only the top-risk units (quick mode), logging dropped units
argument-hint: <lens> [path]
---

Use the **audit-run** skill in quick mode. Parse `$ARGUMENTS` as `<lens> [path]` (a single lens — `docs-drift` and `agent-config` also available — optional subtree). Run `audit.workflow.js` with `mode: "quick"` so only the top-N risk-ranked units are reviewed (per `quick.topN` in config); log every unit dropped by sampling in the report's Appendix. `docs-drift` and `agent-config` are single whole-scope jobs, not units, so `topN` sampling never drops them. This is cheap recon, not a complete pass — use `:run` for full coverage. $ARGUMENTS
