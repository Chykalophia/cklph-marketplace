---
name: audit-run
description: Orchestrate a scoped, adversarially-verified whole-repo audit — load config + baseline, run the audit workflow over the requested lenses, and write the triaged AUDIT-<date>.md report. Invoked by /cklph-audit:run and /cklph-audit:quick.
---

# audit-run — drive the audit workflow and write the report

This skill is what `/cklph-audit:run <lenses> [path]` and `/cklph-audit:quick <lens> [path]` delegate to. You are the **conductor**: you load the target repo's state, parse the request, hand everything to the deterministic Workflow engine, then write its report to disk. You do **not** review code yourself — the workflow's sub-agents (scout + recon/rulebook → reviewer → verifier → synthesizer) do that.

## STRICT: read-only except the report

The only file you may write is the audit report under `<repo>/audits/`. No application code, no config, no baseline (that's `/cklph-audit:baseline`). v1 is plan-only: the run emits a remediation-wave plan; the human decides when to invoke `/cklph-os:flow`.

## Steps

### 1. Load the repo's audit state

Read two files from the **target repo root**:

- `audit.config.yaml` — units, lenses, severity floor, verify voters, recon (`recon.enabled` / `recon.quick`), `positiveControls.max`, budget, quick.topN, ignore globs, `rulesFrom`, `report.dir`.
- `.audit-baseline.json` — accepted/known findings to suppress (`{ version, findings: [{ fingerprint, ... }] }`).

**If either is missing**, stop and tell the user:

> No `audit.config.yaml` / `.audit-baseline.json` found. Run `/cklph-audit:init` first to scaffold them.

Do not invent config — `init` is a deliberate one-time scaffold.

### 2. Parse the request from the command args

From the slash-command invocation, derive:

- **`lenses`** — comma list (`security,correctness,architecture`). For `/cklph-audit:quick`, a single lens. If omitted, fall back to `config.lenses`.
- **`path`** — optional positional that scopes the audit to a subtree (e.g. `app/api/billing`). Passed through to the scout.
- **`mode`** — `"full"` for `:run`, `"quick"` for `:quick`. **Quick = top-risk sampling**: only the top-N units by `riskScore` are audited (`config.quick.topN`, default 5); the rest are SKIPPED and logged — coverage is partial and the report must say so. Never present a quick run as exhaustive. Quick also skips recon (denominators/seeds absent — the report appendix says so) unless the config sets `recon.quick: true`.
- **`deepUnits`** — pass `true` when `--deep-units` was given (forces escalation to `audit-unit-mapper`).

Reduce the baseline file to the shape the engine expects: `baseline = { fingerprints: [...findings.map(f => f.fingerprint)] }`.

### 3. Invoke the Workflow tool

Call the **Workflow tool** with:

- `scriptPath`: `${CLAUDE_PLUGIN_ROOT}/workflows/audit.workflow.js`
- `args`: `{ lenses, path, mode, deepUnits, config, baseline }`

The engine runs the five phases — Discover → Recon → Review → Verify → Synthesize — extracting the rulebook from `rulesFrom` and running one `audit-recon` per lens (recon runs unless `recon.enabled: false`; quick mode skips it unless `recon.quick: true`), fanning out one `audit-reviewer` per `(unit × lens)`, pipelining each finding into N default-to-refuted `audit-verifier` voters, reconciling (dedup + baseline suppression + rule closure + coverage totals + positive controls) in plain code, and finally having `audit-synthesizer` produce the report. Let the workflow own all orchestration, budget enforcement, and concurrency; do not re-implement any of it.

### 4. On return: write the report and summarize

The workflow returns `{ report, fresh, units: { source, lowConfidence }, skipped, coverage: { rulebookSize, checked, uncheckedRuleIds }, positiveControls }` where `report` is `{ markdown, waves, counts }` (or `report: null` on a clean run), `coverage` is the rule-closure tally, and `positiveControls` is the count of shipped "checked and clean" INFO entries.

- **Clean run** (`report` is null / no fresh findings): tell the user the run was clean — no new confirmed findings — plus the rule-closure line and positive-control count below (both are still returned on a clean run), and stop. Don't write an empty report.
- **Otherwise**: write `report.markdown` verbatim to `<repo>/<config.report.dir || "audits">/AUDIT-<YYYY-MM-DD>.md`. Create the directory if needed. Do not edit, re-summarize, or truncate the markdown — the synthesizer already wrote it to the `audit-report-format` contract.

Then print to the user:
- the severity counts (`critical / high / medium / low / info`) from `report.counts`,
- the **rule-closure line** from `coverage`: `rulebook <rulebookSize> rules: <checked> checked, <rulebookSize - checked> NOT CHECKED` — name the `uncheckedRuleIds` when there are few (say, ≤5),
- the **positive-control count** (`positiveControls`),
- how many were suppressed by baseline and how many units were low-confidence / skipped (from the workflow log + `units` / `skipped`),
- the **path** to the report file you just wrote.

Keep the summary tight — the report file is the deliverable; your message is a pointer to it.

## Notes

- Reports are committed in-repo (`audits/`) for git-trackable cross-run history. You write the file; you do not commit it.
- If the workflow reports a budget cutoff, surface that — the report's appendix will list what was skipped for budget. Never hide partial coverage.
