---
description: Run a scoped, adversarially-verified whole-repo audit (full mode) and write AUDIT-<date>.md
argument-hint: <lenses> [path]
---

Use the **audit-run** skill to run a full whole-repo audit. Parse `$ARGUMENTS` as `<lenses> [path]`, where `<lenses>` is a comma-separated list (e.g. `security,correctness,architecture`) and `[path]` optionally scopes the run to a subtree (e.g. `lib/`). Load `audit.config.yaml` + `.audit-baseline.json` from the target repo, run `audit.workflow.js` in `mode: "full"`, suppress baselined findings, and write the triaged report to `audits/AUDIT-<date>.md`. $ARGUMENTS
