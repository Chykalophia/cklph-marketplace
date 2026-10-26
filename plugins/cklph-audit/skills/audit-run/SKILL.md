---
name: audit-run
description: Orchestrate a scoped, adversarially-verified whole-repo audit — load config + baseline, run the audit workflow over the requested lenses, and write the triaged AUDIT-<date>.md report. Invoked by /cklph-audit:run and /cklph-audit:quick.
---

# audit-run — drive the audit workflow and write the report

This skill is what `/cklph-audit:run <lenses> [path]` and `/cklph-audit:quick <lens> [path]` delegate to. You are the **conductor**: you load the target repo's state, parse the request, hand everything to the deterministic Workflow engine, then write its report to disk. You do **not** review code yourself — the workflow's sub-agents (scout + recon/rulebook → modeler → reviewer → verifier → synthesizer) do that.

## STRICT: read-only except the report

The only file you may write is the audit report under `<repo>/audits/`. No application code, no config, no baseline (that's `/cklph-audit:baseline`). v1 is plan-only: the run emits a remediation-wave plan; the human decides when to invoke `/cklph-os:flow`.

## Steps

### 1. Load the repo's audit state

Read two files from the **target repo root**:

- `audit.config.yaml` — units, lenses, severity floor, verify voters, recon (`recon.enabled` / `recon.quick`), `positiveControls.max`, `models` (per-stage model/effort routing — omitted stages inherit the session model), budget, quick.topN, ignore globs, `rulesFrom`, `report.dir`.
- `.audit-baseline.json` — accepted/known findings to suppress (`{ version, findings: [{ fingerprint, ... }] }`).

**If either is missing**, stop and tell the user:

> No `audit.config.yaml` / `.audit-baseline.json` found. Run `/cklph-audit:init` first to scaffold them.

Do not invent config — `init` is a deliberate one-time scaffold.

### 2. Parse the request from the command args

From the slash-command invocation, derive:

- **`lenses`** — comma list (`security,correctness,architecture`). For `/cklph-audit:quick`, a single lens. If omitted, fall back to `config.lenses`. `docs-drift`, `agent-config`, and `compliance` are single-job lenses (not crossed with units); `agent-config` reviews the AI-tooling globs (`config.agentConfig.globs` overrides the default) and is static-only.
- **`path`** — optional positional that scopes the audit to a subtree (e.g. `app/api/billing`). Passed through to the scout.
- **`mode`** — `"full"` for `:run`, `"quick"` for `:quick`. **Quick = top-risk sampling**: only the top-N units by `riskScore` are audited (`config.quick.topN`, default 5); the rest are SKIPPED and logged — coverage is partial and the report must say so. Never present a quick run as exhaustive. Quick also skips recon (denominators/seeds absent — the report appendix says so) unless the config sets `recon.quick: true`, and skips the **Map** and **Variant** phases entirely (no threat model, no sibling hunt — the appendix flags both).
- **`deepUnits`** — pass `true` when `--deep-units` was given (forces escalation to `audit-unit-mapper`).

Reduce the baseline file to the shape the engine expects: `baseline = { fingerprints: [...findings.map(f => f.fingerprint)] }`.

### 3. Invoke the Workflow tool

Call the **Workflow tool** with:

- `scriptPath`: `${CLAUDE_PLUGIN_ROOT}/workflows/audit.workflow.js`
- `args`: `{ lenses, path, mode, deepUnits, config, baseline }`

The engine runs the seven phases — Discover → Recon → Map → Review → Verify → Variant → Synthesize — extracting the rulebook from `rulesFrom` and running one `audit-recon` per lens (recon runs unless `recon.enabled: false`; quick mode skips it unless `recon.quick: true`); dispatching one `audit-modeler` for the **Map** phase (trust boundaries, data-flows, per-unit invariants, crown jewels — skips in quick or when `map.enabled: false`, degrading to an empty model that the appendix flags); fanning out one `audit-reviewer` per `(unit × lens)` with risk-routed verifier depth (`riskRouting` — high-risk units get more voters, low-risk fewer, floored at 1); pipelining each finding into N default-to-refuted `audit-verifier` voters where **evidence, not vote tally, arbits** (low/medium promote on majority; critical/high require a reachability trace); reconciling (dedup + baseline suppression + rule closure + coverage totals + near-misses + positive controls) in plain code; hunting SIBLINGS of each confirmed critical/high in the **Variant** phase (re-verified through the same gate — skips in quick or when `variant.enabled: false`); and finally having `audit-synthesizer` produce the report. Let the workflow own all orchestration and concurrency; do not re-implement any of it.

### 4. On return: write the report and summarize

The workflow returns `{ report, fresh, heldUntraced, deferred, units: { source, lowConfidence }, skipped, coverage: { rulebookSize, checked, uncheckedRuleIds }, positiveControls, map: { ran, trustBoundaries, invariants }, variants }` where `report` is `{ markdown, waves, counts }` (or `report: null` on a clean run), `heldUntraced` is the count of majority-held critical/high findings surfaced for owner review (no independent reachability trace was produced — they are NOT in `fresh` and NOT in `counts`, but they are the opposite of clean), `deferred` is the count of reviewer candidates the **verifier budget could not afford to verify** (`verify.maxVerifierAgents` was hit — they are UNVERIFIED leads, surfaced not dropped), `coverage` is the rule-closure tally, `positiveControls` is the count of shipped "checked and clean" INFO entries, `map` reports whether the Map phase ran plus its trust-boundary and invariant **counts**, and `variants` is the count of sibling findings the Variant phase confirmed.

- **Clean run** — gate on **`report == null`** only, NOT on `fresh.length`. The engine returns a non-null `report` whenever there is anything to write, including a **held-untraced-only run** (zero confirmed findings but ≥1 majority-held finding awaiting a trace). If `report` is null, tell the user the run was clean — no new confirmed findings and nothing held for review — plus the rule-closure line, positive-control count, and Map/Variant lines below, and stop. Don't write an empty report.
- **Otherwise** (`report` is non-null — includes the held-untraced-only case): write `report.markdown` verbatim to `<repo>/<config.report.dir || "audits">/AUDIT-<YYYY-MM-DD>.md`. Create the directory if needed. Do not edit, re-summarize, or truncate the markdown — the synthesizer already wrote it to the `audit-report-format` contract. **Never skip the write just because `fresh` is empty** — a held-untraced finding must reach disk.

Then print to the user:
- the severity counts (`critical / high / medium / low / info`) from `report.counts`,
- the **rule-closure line** from `coverage`: `rulebook <rulebookSize> rules: <checked> checked, <rulebookSize - checked> NOT CHECKED` — name the `uncheckedRuleIds` when there are few (say, ≤5),
- the **positive-control count** (`positiveControls`),
- the **Map line** from `map`: if `ran`, `threat model: <trustBoundaries> trust boundar(ies), <invariants> invariant(s)`; if not, say the Map phase was skipped (quick mode / `map.enabled: false`) — never present it as run,
- the **Variant line** (`variants`): `<variants> sibling finding(s) confirmed by variant analysis`, or that the Variant phase was skipped,
- the **held-untraced line** when `heldUntraced > 0`: `<heldUntraced> majority-held finding(s) awaiting an independent reachability trace — see the Held-untraced section (needs owner review)`; never let these hide behind an all-zero `counts`,
- the **deferred line** when `deferred > 0`: `<deferred> finding(s) DEFERRED unverified — verifier budget (verify.maxVerifierAgents) exhausted; coverage is partial. Re-run with a higher maxVerifierAgents or a narrower scope`; this means the run did NOT fully verify — say so plainly,
- how many were suppressed by baseline and how many units were low-confidence / skipped (from the workflow log + `units` / `skipped`),
- the **path** to the report file you just wrote.

Keep the summary tight — the report file is the deliverable; your message is a pointer to it.

## Notes

- Reports are committed in-repo (`audits/`) for git-trackable cross-run history. You write the file; you do not commit it.
- `config.budget.total` is currently **advisory** — the engine does not read or enforce it (a known gap); the Workflow **runtime** enforces its own token ceiling. If a run is truncated (e.g. that runtime ceiling is hit), surface whatever partial coverage the workflow reports — never hide it.
