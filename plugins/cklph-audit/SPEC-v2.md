# cklph-audit — v2 "comprehensiveness" upgrade spec

Delta spec on top of `SPEC.md` (v1). v1's engine — adversarial default-to-refuted verify, baseline
suppression, backtest gating, budget, no-silent-truncation — stays intact. v2 adds the completeness
accounting v1 lacks, ported from the ZenCoder audit methodology
(`~/.zenflow/worktrees/audit-the-code-base-for-best-pra-5747/.zenflow/tasks/audit-the-code-base-for-best-pra-5747/final_plan.md`):
a recon phase with cited seeds + denominators, a rule-closure coverage matrix, positive controls,
a docs-drift lens, and a richer finding schema.

**v1 = a repeatable engine. v2 = the same engine that can also PROVE what it covered.**

---

## 0. Design principles (unchanged from v1, restated because v2 leans on them)

- **Read-only.** No agent writes application code. The only writes are the report + baseline, by the command.
- **Recall from tools, precision from verifiers.** Never the other way round.
- **No silent truncation.** Anything not audited is named. v2 extends this from *units* to *rules and patterns*.
- **Honesty over volume.** A coverage row that says `NOT CHECKED` is a feature.

## 1. What v2 adds (the six mechanics)

### M1 — Recon phase (multi-domain scanning before review)

A new `audit-recon` agent, dispatched **once per lens** in the Discover phase, **in parallel with
the scout** (both need only config, not units). Each recon agent mechanically enumerates its lens's
concern surface across the whole scoped repo and returns:

- **`denominators[]`** — `{ pattern, description, command, count }`: the exact enumeration command run
  and its candidate count (e.g. `.single()` callsites → 325). These are the report's coverage-math
  denominators. Commands must be re-runnable (recorded verbatim in the report appendix).
- **`seeds[]`** — `{ file, line, snippet, note, suspectedRule }`: cited pre-qualified leads worth a
  reviewer's attention. Seeds are *hints, not findings* — reviewers MUST re-open every seed
  (trust-but-verify: citations drift).
- **`safeControls[]`** — `{ file, line, snippet, note, rule }`: verified-good reference patterns
  (e.g. "webhook X verifies signature + idempotency at file:line"). Candidate positive controls.

Recon is skipped in `quick` mode unless `config.recon.quick: true` (quick stays cheap); when skipped,
the report appendix states that denominators/seeds are absent for that reason.

### M2 — Rulebook extraction + rule-closure coverage matrix

One new agent call (also Discover phase, parallel with scout/recon): parse the repo's `rulesFrom`
files (`CLAUDE.md`, `AGENTS.md`, …) into a discrete **rulebook**:

```
RULEBOOK_SCHEMA: { rules: [{ id, source, text, lensHint }] }
```

- `id` — stable slug (`agents-md:rule-3`, `claude-md:no-console`), `source` — `file:line`,
  `lensHint` — which lens most plausibly owns it (`security` / `correctness` / `architecture` /
  `docs-drift` / `any`).

Reviewers receive the rulebook subset relevant to their lens and MUST return **`ruleChecks[]`**:
`{ ruleId, status: "violation" | "verified-safe" | "not-applicable", findingIds?, evidence? }` for
every rule they were handed. `verified-safe` and `not-applicable` require a one-line evidence
citation or reason.

**Reconciliation is plain code** (not an agent): per rule across all reviewers,
`violation > verified-safe > not-applicable > unchecked`. A `verified-safe` needs ≥1 verified-safe
check and 0 violations. Rules no reviewer touched are `unchecked` — and appear that way in the
matrix. The synthesizer renders a **Coverage matrix**: every rulebook rule → finding IDs, a cited
verified-safe row, a not-applicable reason, or an honest `NOT CHECKED`. **Closure: no rule may be
silently absent.**

### M3 — Denominator-based coverage accounting

The report gains a **Coverage summary** section: for each recon denominator, `examined X / N`
(+ the command). `X` comes from reviewer-reported coverage counts:

- Reviewer output gains `coverage: { seedsVerified, seedsGiven, toolCandidatesJudged }`.
- The engine aggregates reviewer coverage + recon denominators in plain code and hands the totals
  to the synthesizer.

Where `X < N` the summary says so plainly (sampled), with the sampling rationale (risk-weighting).
Coverage becomes arithmetic, not vibes.

### M4 — Positive controls (INFO tier)

Today, verifier refutations are discarded. v2 harvests them: a refuted verdict whose
`counterEvidence` names a concrete guard becomes a **positive-control candidate**. Sources, in
plain code:

1. Refuted verdicts where `counterEvidence` cites a guard (`file:line`) — i.e. the evidence that
   killed a candidate finding.
2. Recon `safeControls[]` that a reviewer confirmed in-scope.
3. `ruleChecks` with status `verified-safe`.

**Noise gate:** a positive control ships ONLY if it is (a) attached to a rulebook rule, or (b) the
counter-evidence that refuted a critical/high candidate. Cap at `config.positiveControls.max`
(default 15, 0 disables). Rendered as a `## Positive controls (INFO)` report section — each with
citation + what it protects. This is the "checked and clean" knowledge that today evaporates
every run.

### M5 — Docs-drift lens

New lens `docs-drift`: audits the *rulebook itself* against reality (a prior audit plan caught
`src/` vs `app/src/` and "BullMQ" vs QStash this way).

- **Deterministic tool** `tools/docsdrift.sh`: extracts path-like tokens, `pnpm|npm|yarn` script
  names, and scoped package names (`@scope/pkg`; unscoped tech-name prose is the judgment
  layer's job) from the `rulesFrom` docs; verifies each against the tree /
  `package.json`; emits candidate-drift JSON (`{ doc, line, token, kind, exists }`). Recall layer.
- **Lens skill** `skills/docs-drift-lens/SKILL.md`: judgment layer — is the mismatch real drift, a
  glob/abbreviation, or intentional? Severity: LOW by default, MEDIUM+ only when the drift misleads
  a security control.
- **Workflow special case:** docs-drift is NOT crossed with units. When requested, the engine adds
  exactly one job `{ unit: { key: "docs", globs: rulesFrom }, lens: "docs-drift" }`. Findings flow
  through the normal verify → reconcile → report pipeline.
- Not in the default lens list; enabled via config/args like any lens.

### M6 — Finding-schema additions

`FINDINGS_SCHEMA` items gain (all optional in schema, mandated by the reviewer prompt):

- `confidence: "confirmed" | "likely" | "needs-owner-input"`
- `validationSteps: string` — the read-only checks used to confirm true-positive
- `remediationBucket: "quick-win" | "targeted-fix" | "systemic-refactor" | "owner-decision"`
- `context: { surface?: "server"|"client"|"shared", runtime?: "prod"|"test"|"generated", gated?: boolean }`
  — classify BEFORE severity; severity comes from real exploitability, not raw pattern match
  (e.g. signature-gated webhook without rate limit ⇒ LOW/INFO, not HIGH).

`owner-decision` is the honesty valve: intentional-but-not-locally-obvious goes to the owner, not
into a severity fight. The synthesizer orders waves quick-wins-first within a severity band and
lists owner-decision items in their own subsection (they are questions, not work).

---

## 2. Engine changes (`workflows/audit.workflow.js`)

Phases become: `Discover` → `Recon` (display group; runs concurrently with Discover's scout) →
`Review` → `Verify` → `Synthesize`. Concretely:

```
phase('Discover')
[plan, rulebook, ...recon] = await parallel([
  scout (unless config.units.list),
  rulebook-extractor (RULEBOOK_SCHEMA),
  ...(reconEnabled ? lenses.map(l => recon(l))   // phase: 'Recon'
                   : []),
])
… existing escalation to unit-mapper unchanged …
jobs = units × lenses  (+ ONE docs job if 'docs-drift' ∈ lenses — excluded from the cross product)
```

- Reviewer prompt gains: its lens's rulebook subset, its unit-scoped seeds (filter recon seeds by
  unit globs in plain code), and the mandate to return `ruleChecks` + `coverage`.
- `FINDINGS_SCHEMA` extended per M6 (+ `ruleChecks`, `coverage` at the top level of the review
  output — name it `REVIEW_SCHEMA` now that it's more than findings).
- Verify stage unchanged (default-refuted voting). After voting, plain code harvests
  positive-control candidates from refuted verdicts per M4.
- Reconcile: existing dedup + baseline, PLUS rule-closure reconciliation (M2) and coverage
  aggregation (M3). All plain code.
- Synthesize: prompt + `REPORT_SCHEMA` extended — synthesizer receives `{ fresh, rulebook,
  ruleClosure, coverageTotals, positiveControls, runMeta }`; `counts` gains `info`; returns matrix
  + coverage summary + positive controls inside `markdown`.
- Return value gains `coverage: { rulebookSize, checked, uncheckedRuleIds }` for the run summary
  printed by `audit-run`.
- Budget: recon/rulebook agents draw from the same `budget`; if budget kills recon, the appendix
  says denominators are partial — never silently.

Backward compat: a v1 `audit.config.yaml` (no `recon`/`positiveControls` keys) must run unchanged —
new keys default on (`recon.enabled: true`, `positiveControls.max: 15`), docs-drift only when
explicitly requested.

## 3. New/changed assets

| Asset | Change |
| --- | --- |
| `agents/audit-recon.md` | NEW — per-lens mechanical enumerator (Read/Grep/Glob/Bash, read-only) |
| `agents/audit-reviewer.md` | seeds re-verify mandate, ruleChecks, coverage counts, M6 fields, context-before-severity |
| `agents/audit-synthesizer.md` | matrix + coverage summary + positive controls + owner-decision handling |
| `agents/audit-scout.md`, `audit-unit-mapper.md`, `audit-verifier.md` | unchanged (verifier already cites counter-evidence) |
| `skills/docs-drift-lens/SKILL.md` | NEW — judgment layer over `docsdrift.sh` |
| `skills/{security,correctness,architecture}-lens/SKILL.md` | add "rulebook compliance" note: reviewer answers for every rule handed to it |
| `skills/audit-report-format/SKILL.md` | new sections: Coverage summary, Coverage matrix, Positive controls (INFO); finding fields (confidence, bucket, validationSteps, context); owner-decision subsection in waves |
| `skills/audit-run/SKILL.md` | pass recon/rulebook config; print coverage line in run summary |
| `skills/audit-init/SKILL.md` | scaffold new config keys |
| `tools/docsdrift.sh` | NEW — deterministic drift detector (no deps beyond POSIX + node if needed; degrade gracefully) |
| `templates/audit.config.example.yaml` | `recon`, `positiveControls`, docs-drift mention |
| `templates/AUDIT-TEMPLATE.md` | mirror the new report contract |
| `fixtures/docs-drift/{should-flag,should-not-flag}/` | NEW — drifted doc example + clean look-alike |
| `README.md`, `CHANGELOG.md`, `.claude-plugin/plugin.json` | document v2, bump version to 0.2.0 |

## 4. Acceptance criteria

1. `node --check workflows/audit.workflow.js` passes; no `Date.now()`/`Math.random()`/argless
   `new Date()` anywhere in the workflow (resume-safety).
2. Every schema an agent/skill references matches the engine's schema literally (names + enums).
3. Full-mode dry logic: recon agents = one per lens; rulebook extractor runs; both parallel with
   scout; quick mode skips recon and logs it.
4. `docs-drift` requested ⇒ exactly ONE docs job, not crossed with units; omitted ⇒ zero.
5. Rule closure: engine reconciliation guarantees a matrix row for every rulebook rule; `unchecked`
   rows render as `NOT CHECKED`.
6. Positive controls: harvested only per the M4 noise gate; capped; `positiveControls.max: 0`
   disables the section.
7. Finding fields flow end-to-end: reviewer mandate → schema → synthesizer → report contract →
   template.
8. A v1 config runs with all defaults (backward compat).
9. `tools/docsdrift.sh` runs standalone against a fixture dir and emits valid JSON; exits 0 with
   `[]` when no docs found (never crashes the reviewer).
10. README/CHANGELOG/plugin.json updated; every `${CLAUDE_PLUGIN_ROOT}` reference intact (no
    hardcoded paths).

## 5. Non-goals (v2)

- No remediation automation (still plan-only; `/cklph-os:flow` handoff unchanged).
- No multi-model review panels (that's zen-comprehensive-review's job).
- No re-scoring of v1 lenses; fixture thresholds unchanged.
- No per-run bespoke "plan approval" gate — cklph-audit stays config-driven; ZenCoder's human
  gates belong to /cklph-os:flow, not here.
