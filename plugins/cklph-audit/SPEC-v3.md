# cklph-audit — v3 "master-practice" upgrade spec

Delta spec on top of `SPEC.md` (v1) + `SPEC-v2.md` (v2). Implements the roadmap in
`docs/MASTER-PRACTICE-ROADMAP.md`: the §1 voting correction, Tier 1 (T1.1–T1.4), Tier 2 (T2.1–T2.3),
and the review-stack §4 wins. v1/v2 engine (recon, rulebook closure, coverage matrix, positive
controls, adversarial verify, baseline, backtest, model routing) stays intact — v3 hardens the verify
arbiter and adds the master-practitioner mechanics on top. **Tier 3 is explicitly out of scope.**

Target version: **0.3.0**. Backward compatible: a v1/v2 config runs unchanged (all new config keys
default on-but-safe; new phases skip in quick mode; the omission lens is opt-in).

Everything an agent restates from the engine (schema field names, enums, phase names) must match the
engine **literally** — the engine (`workflows/audit.workflow.js`) is the single source of truth.

---

## A. Engine changes (`workflows/audit.workflow.js`) — the contract

Phases become: `Discover` → `Recon` → **`Map`** → `Review` → `Verify` → **`Variant`** → `Synthesize`.
(`Map` and `Variant` are new; both skip in quick mode and degrade gracefully.)

### A1 — §1 correction + T1.3 debiasing (Verify stage)

The promotion arbiter moves from *vote tally* to *evidence*. Research: majority voting is
conservative-biased and consensus ≠ truth (80+ agents once endorsed a non-existent vuln).

1. `VERDICT_SCHEMA` gains `reachabilityTrace` (string, optional) — a voter that CONFIRMS supplies the
   concrete path (attacker-controlled input → sink, or the invariant-violation path).
2. Add a plain-code helper `stripComments(s)` — removes `//…`, `/* … */`, and leading `#…` lines from
   a snippet. Before dispatching a verifier, pass the comment-stripped snippet ("re-derive from code
   alone — ignore comments/labels").
3. Verifier prompt: to refute, cite the guard `file:line` in `counterEvidence`; to confirm a
   `critical`/`high`, you MUST supply a `reachabilityTrace`. "Plausible" without a trace = refuted.
4. Promotion logic (replaces `confirmed = notRefutedMajority`):
   ```
   const notRefuted = v.filter(x => !x.refuted).length > v.length / 2
   const hasTrace = v.some(x => x.reachabilityTrace && x.reachabilityTrace.trim())
                    || !!(f.validationSteps && f.validationSteps.trim())
   const confirmed = notRefuted && (['low','medium'].includes(f.severity) || hasTrace)
   ```
   i.e. low/medium keep the majority rule; **critical/high require a trace** (evidence as arbiter).
   Carry the winning `reachabilityTrace` onto the finding (`f.reachabilityTrace`) for the report.
5. Keep `refutedGuards` harvesting unchanged. Voters are already independent parallel calls (no
   within-prompt position bias to randomize) — note this in a comment.

### A2 — T1.2 root-cause + invariant (Review schema)

`REVIEW_SCHEMA` findings items gain (optional in schema, mandated by the reviewer prompt):
- `rootCause` (string) — the underlying fault, not the symptom.
- `invariant` (string) — the property the code should guarantee that this violates.
- `boundary` (string, optional) — the trust boundary crossed (filled when the Map phase ran; see A4).

Reviewer prompt: trace symptom → root cause, name the violated invariant, and reject a `suggestedFix`
that only patches the symptom. These flow through verify → reconcile → synthesizer → report unchanged
(they ride on the finding object).

### A3 — T1.4 risk-routed depth (Review/Verify fan-out)

Voter count and effort scale with the unit's `riskScore`. New config block `riskRouting`
(defaults below). In the verify fan-out, compute per-job:
```
const rr = config.riskRouting ?? {}
const base = config.verify?.voters ?? 3
const score = job.unit.riskScore ?? 0.5
let unitVoters = base
if ((rr.enabled ?? true)) {
  if (score >= (rr.highThreshold ?? 0.7)) unitVoters = base + (rr.highVotersDelta ?? 2)
  else if (score <= (rr.lowThreshold ?? 0.4)) unitVoters = Math.max(1, base + (rr.lowVotersDelta ?? -1))
}
```
Use `unitVoters` (not the global `voters`) for that job's verifier fan-out. Optionally bump verifier
effort for high-risk units by merging `{ effort: 'high' }` into the verifier opts when
`score >= highThreshold` and no explicit `config.models.verifier.effort` is set. Log the routing
decision per unit. docs-drift job: treat as medium (base voters).

### A4 — T2.1 Map phase (new `audit-modeler` agent + `Map` phase)

After Discover/Recon, before Review, add `phase('Map')`. Gate: `mapEnabled = (config.map?.enabled ??
true) && mode !== 'quick'` (skip in quick; log the skip). When enabled, dispatch ONE `audit-modeler`
agent (agentType `audit-modeler`, schema `MAP_SCHEMA`, label `map:model`) with the units + recon
denominators/seeds + rulesFrom, producing:
```
MAP_SCHEMA = { type:'object', properties: {
  trustBoundaries: [{ id, where, note }],          // where security controls gate a connection
  dataFlows:       [{ source, sink, crossesBoundary }],   // routes → sinks
  invariants:      [{ unit, text }],               // per-unit properties that must hold
  crownJewels:     [string]                        // highest-value assets/flows
}}
```
Null-safe: if the modeler dies or map is disabled, `model = { trustBoundaries:[], dataFlows:[],
invariants:[], crownJewels:[] }` and `mapRan=false` (flagged in report appendix — never silent).

Reviewer prompt gains (when `mapRan`): the unit's invariants (`model.invariants.filter(i => i.unit
=== job.unit.key)`) and the trust boundaries whose `where` glob-matches the unit — mandate: security
findings SHOULD cite the `boundary` crossed, and check each supplied invariant (a violation is a
finding). Pass `crownJewels` to the synthesizer for the coverage narrative.

### A5 — T1.1 Variant analysis (new `Variant` phase)

After the first reconcile (fresh confirmed findings computed), add `phase('Variant')`. Gate:
`variantEnabled = (config.variant?.enabled ?? true) && mode !== 'quick'`. For each confirmed
`critical`/`high` finding (cap total seeds at `config.variant?.maxSeeds ?? 8`), dispatch one
variant-hunter agent (agentType `audit-reviewer`, schema `REVIEW_SCHEMA`, phase `Variant`, label
`variant:<file>`): "Here is a CONFIRMED bug pattern. Find its SIBLINGS across the repo — the same
mistake elsewhere (Project Zero variant analysis). Run `${CLAUDE_PLUGIN_ROOT}/tools/variant-sweep.sh`
for recall, then judge. Return candidate findings (same REVIEW_SCHEMA)." Cap siblings per seed at
`config.variant?.maxPerSeed ?? 20`.

Variant candidates re-enter the SAME verify fan-out (reuse the verify logic — factor it into a
`verifyFindings(findings, unitKey, lens, unitVoters)` helper so both the main pipeline and the variant
phase call it), then merge into `fresh` (dedup again by fingerprint; baseline-suppress again). Log
`N variants confirmed from M seeds`. If `variantEnabled` is false, skip and note in appendix.

### A6 — T2.2 coverage narrative inputs (Reconcile → Synthesize)

Collect `nearMisses` = refuted `critical`/`high` candidates with counter-evidence: from `allVerified`,
the ones that are NOT confirmed but have `refutedGuards.length` — map to `{ file, severity, title,
guard: refutedGuards[0].counterEvidence }`. Pass `nearMisses` + `model.crownJewels` + `coverageTotals`
to the synthesizer so it can write a positive-assurance narrative ("probed X, held because Y, chased
near-miss Z to ground").

### A7 — schema + return additions

- `REVIEW_SCHEMA` findings: `rootCause`, `invariant`, `boundary`, `reachabilityTrace` (all optional).
- `VERDICT_SCHEMA`: `reachabilityTrace`.
- `REPORT_SCHEMA`: unchanged shape (`markdown`, `waves`, `counts`).
- `runMeta` gains: `mapRan` (bool), `variantRan` (bool), `crownJewels` (array).
- Engine return gains: `map: { ran, trustBoundaries, invariants }` (counts only for summary) and
  `variants: <count confirmed>`.
- New config defaults consumed: `map.enabled` (true), `variant.enabled/maxSeeds/maxPerSeed`,
  `riskRouting.*`. All optional; safe defaults inline.

### A8 — constraints

`node --check` must pass. No `Date.now()` / `Math.random()` / argless `new Date()`. Keep the terse
comment style + `════` dividers. Update the header comment to describe the seven-phase v3 pipeline.
Factor the verify fan-out into a reusable helper (A5). Every new phase logs its skip reason when
gated off — no silent truncation.

---

## B. Non-engine assets

### B1 — agent docs
- **NEW `agents/audit-modeler.md`** — the Map-phase modeler (tools: Read, Grep, Glob, Bash; read-only).
  Produces trust boundaries, data-flows (routes→sinks), per-unit invariants, crown jewels. Output
  discipline = `MAP_SCHEMA` verbatim. Voice matches `audit-scout`.
- **`agents/audit-reviewer.md`** — add: root-cause + invariant mandate (trace symptom→root, name the
  invariant, reject symptom-only fixes); boundary citation when a model is supplied; invariant checking;
  variant-hunt mode (the same agent is reused for the Variant phase — describe both modes); omission
  lens in the tool map (`omission → omissions.sh`). Update Output discipline for the new fields.
- **`agents/audit-verifier.md`** — add: re-derive from comment-stripped code; supply a
  `reachabilityTrace` to confirm a critical/high (a confirmation without a trace is not a confirmation);
  cite the guard `file:line` to refute. Update Output discipline for `reachabilityTrace`.
- **`agents/audit-synthesizer.md`** — add: render root-cause + invariant + boundary + reachability per
  finding; write the **Coverage narrative** (positive assurance) from `nearMisses` + crown jewels +
  coverage totals; note map/variant coverage in the appendix.

### B2 — report contract
- **`skills/audit-report-format/SKILL.md`** — finding block gains `- **Root cause:**`,
  `- **Invariant:**`, `- **Boundary:**` (when present), `- **Reachability:**`. New `## Coverage
  narrative` section (positive assurance — per area: what was probed, why clean areas held, near-misses
  chased to ground) placed after the Coverage matrix, before severity sections. Front-matter/appendix:
  note whether the Map + Variant phases ran (and why not, if skipped). Extend no-silent-truncation to
  the new phases.
- **`templates/AUDIT-TEMPLATE.md`** — mirror all of the above.

### B3 — omission lens (T2.3)
- **NEW `skills/omission-lens/SKILL.md`** — judgment layer: per external input / IO / branch, assert
  {validation? error-path? logging? rollback? test?} and report the MISSING ones (negative-space).
  Tool = `omissions.sh`. Rule ids `omission:<kind>`. Severity by real impact. Voice matches sibling
  lenses; include the rulebook-compliance note.
- **NEW `tools/omissions.sh`** — deterministic recall: flag external-input/IO/branch sites lacking a
  nearby validation/error-handling/logging token. Usage `omissions.sh <root> [glob...]`; JSON array
  `[{file,line,kind,signal}]`; exit 0 always (no matches → `[]`). POSIX + optional node, like sibling
  tools. Make executable.
- **NEW `fixtures/omission/should-flag/` + `should-not-flag/`** — a planted missing-error-path example
  + a clean look-alike. Follow `fixtures/README.md`.

### B4 — variant tool (T1.1)
- **NEW `tools/variant-sweep.sh`** — deterministic sibling-recall: given a snippet/pattern + root,
  extract significant tokens and grep the repo for co-occurring sibling sites. Usage
  `variant-sweep.sh <root> <pattern-or-file>`; JSON array `[{file,line,excerpt}]`; exit 0 always.
  POSIX-safe. Make executable.

### B5 — run/init/config surface
- **`skills/audit-run/SKILL.md`** — document the seven-phase pipeline, the new return fields
  (`map`, `variants`), and the new run-summary lines (map ran? boundaries found; variants confirmed).
  Note quick mode skips Map + Variant.
- **`skills/audit-init/SKILL.md`** — scaffold the new config keys.
- **`templates/audit.config.example.yaml`** — add `map: { enabled: true }`,
  `variant: { enabled: true, maxSeeds: 8, maxPerSeed: 20 }`,
  `riskRouting: { enabled: true, highThreshold: 0.7, lowThreshold: 0.4, highVotersDelta: 2, lowVotersDelta: -1 }`,
  and mention `omission` as an available lens on the lenses line.
- **`commands/run.md`** — mention `omission` as an available lens (keep brevity).

### B6 — review-stack §4 (`plugins/cklph-os/agents/`)
- **`cklph-reviewer.md`** — add Conventional-Comments-style output discipline: every finding carries
  `{severity, blocking?, confidence}`; a blocking-decision rule (block only on
  correctness/contract/security/data-loss/irreversible; else non-blocking or a question); a **nit
  budget** (style findings must not outnumber correctness findings — fold/drop excess). Add
  **intent-first**: the reviewer's first output line reconstructs "what this change is for"; if intent
  is absent, surface that before findings. Keep Mode A/B + bias hunt intact; edit surgically.
- **`red-team.md`** — add a **pre-mortem** step ("it's six months later, this shipped an incident —
  what was it?" then back-derive the code path) and formalize the **inversion / dual-pass**
  (prove-correct vs prove-broken; only findings surviving prove-broken ship high-confidence). Keep the
  attack checklist + markers intact; edit surgically.

### B7 — docs + versioning
- **`CHANGELOG.md`** — `0.3.0 — 2026-07-18`: the §1 correction + T1.1–T1.4 + T2.1–T2.3, backward-compat
  note, Tier-3-deferred note.
- **`README.md`** — document the seven-phase pipeline + the new mechanics (evidence-arbiter verify,
  variant analysis, root-cause/invariant findings, risk-routed depth, map phase, coverage narrative,
  omission lens). Anti-hype voice.
- **`.claude-plugin/plugin.json`** — version 0.3.0; extend description.
- **root `.claude-plugin/marketplace.json`** — match the cklph-audit description.
- **`docs/MASTER-PRACTICE-ROADMAP.md`** — mark T1.*/T2.*/§1/§4 as shipped in 0.3.0; leave Tier 3 as
  the live backlog.
- **cklph-os** version bump + CHANGELOG entry for the review-stack §4 change (if cklph-os has a
  CHANGELOG/plugin.json — check and bump minimally).

## C. Acceptance criteria

1. `node --check workflows/audit.workflow.js` passes; no resume-unsafe constructs.
2. Every schema/enum/phase name an agent or skill restates matches the engine literally.
3. Verify promotion: a critical/high finding with no `reachabilityTrace` (and no reviewer
   `validationSteps`) does NOT promote; low/medium still promote on majority. (Logic-trace it.)
4. Map phase: runs once in full mode, skips in quick (logged); modeler death degrades to empty model,
   `mapRan=false`, flagged in appendix.
5. Variant phase: seeds only from confirmed critical/high, capped; siblings re-verify through the same
   gate; skipped in quick, flagged.
6. Risk routing: high-risk units get more voters, low-risk fewer (≥1); logged per unit.
7. `omissions.sh` + `variant-sweep.sh` run standalone against fixtures/args → valid JSON, exit 0,
   including the no-match/missing-path cases.
8. A v1/v2 config runs unchanged (all new keys defaulted).
9. Review-stack: cklph-reviewer emits {severity,blocking,confidence} + intent-first + nit budget;
   red-team has pre-mortem + dual-pass. Markers/áxes intact.
10. Versions bumped; JSON manifests parse; `${CLAUDE_PLUGIN_ROOT}` only (no absolute paths).
