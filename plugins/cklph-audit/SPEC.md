# cklph-audit — build spec (v1)

Design doc for implementers. v1 = `cklph-audit` plugin · 3 lenses (security, correctness, architecture) · scout/reviewer/verifier/synthesizer agents · workflow engine · config + baseline · `init`/`run`/`quick`/`baseline` commands.

---

## 1. Plugin layout

```
cklph-audit/
├── .claude-plugin/plugin.json        # name, version, marketplace metadata
├── README.md                          # user-facing (see README.md)
├── SPEC.md                            # this file
├── commands/
│   ├── init.md                        # /cklph-audit:init
│   ├── run.md                         # /cklph-audit:run <lenses> [path]
│   ├── quick.md                       # /cklph-audit:quick <lens> [path]
│   └── baseline.md                    # /cklph-audit:baseline
├── agents/
│   ├── audit-scout.md                 # FAST unit inference + surface-map (+ per-unit confidence)
│   ├── audit-unit-mapper.md           # DEEP unit mapping — escalated only when inference is low-confidence
│   ├── audit-reviewer.md              # deep per-(unit×lens) review
│   ├── audit-verifier.md              # adversarial refute (dedicated, default-to-refuted)
│   └── audit-synthesizer.md           # dedup / triage / report
├── skills/
│   ├── security-lens/SKILL.md         # CWE/ASVS checklist + knowledge
│   ├── correctness-lens/SKILL.md
│   ├── architecture-lens/SKILL.md
│   └── audit-report-format/SKILL.md   # the AUDIT-<date>.md contract
├── workflows/
│   └── audit.workflow.js              # the deterministic engine
├── tools/                             # deterministic detectors each lens orchestrates (recall)
│   ├── dry.sh                         # jscpd / PMD-CPD clone detection → candidate JSON
│   ├── await.sh                       # eslint no-floating-promises / tsc
│   ├── deadcode.sh                    # knip / ts-prune
│   ├── layering.sh                    # dependency-cruiser (layers + circular)
│   └── secrets.sh                     # gitleaks / detect-secrets
├── fixtures/                          # ground truth for lens validation (precision/recall)
│   └── <lens>/
│       ├── should-flag/               # planted issues the lens MUST catch (recall)
│       └── should-not-flag/           # clean look-alikes it MUST NOT flag (precision)
└── templates/
    ├── audit.config.example.yaml
    └── AUDIT-TEMPLATE.md
```

Conventions: reference plugin assets via `${CLAUDE_PLUGIN_ROOT}`; never hardcode paths. `audit-verifier` is a dedicated agent (see §3); remediation hands off to `cklph-implementer`.

Per-repo state lives in the **target repo** (git-able):
```
<repo>/
├── audit.config.yaml          # committed
├── .audit-baseline.json       # committed
└── audits/AUDIT-<date>.md     # committed reports
```

---

## 2. The workflow engine

`audit.workflow.js` — invoked by `/cklph-audit:run`. Uses the Workflow primitives (`agent`, `pipeline`, `parallel`, `phase`, `log`, `budget`, `agentType`, `schema`). `args` = `{ lenses: string[], path?, config, baseline, mode: "full"|"quick" }`.

```js
export const meta = {
  name: 'cklph-audit',
  description: 'Scoped, verified, agentic whole-repo audit',
  phases: [
    { title: 'Discover' }, { title: 'Review' }, { title: 'Verify' }, { title: 'Synthesize' },
  ],
}

const { lenses, config, baseline, mode } = args

// 1. DISCOVER — adaptive. Scout INFERS units fast (each with a confidence). If
//    the repo doesn't decompose cleanly (low overall confidence, a unit
//    self-flagged needsDeepMap, or `--deep-units`), ESCALATE to the specialized
//    audit-unit-mapper. Explicit `units.list` in config always wins. Either way
//    the derivation method + low-confidence units are FLAGGED in the report so
//    you can pin them in config next run.
phase('Discover')
const plan = await agent(scoutPrompt(config, lenses, args.path), {
  agentType: 'audit-scout', schema: PLAN_SCHEMA,   // {units:[{key,globs,lensHints,confidence}], overallConfidence, needsDeepMap}
})
let units = plan.units
let unitSource = 'inferred'
if (config.units?.list?.length) {
  units = config.units.list; unitSource = 'config'            // explicit config wins
} else if (
  args.deepUnits || plan.needsDeepMap ||
  plan.overallConfidence < (config.units?.deepMapThreshold ?? 0.7) ||
  units.some(u => (u.confidence ?? 1) < 0.5)
) {
  log(`unit inference low-confidence (${plan.overallConfidence}) — escalating to audit-unit-mapper`)
  const mapped = await agent(unitMapperPrompt(config, lenses, plan, args.path), {
    agentType: 'audit-unit-mapper', schema: PLAN_SCHEMA,
  })
  units = mapped.units; unitSource = 'deep-mapped'
}
const lowConfidence = units.filter(u => (u.confidence ?? 1) < 0.6).map(u => u.key)   // → report flag
if (mode === 'quick') units = rankByRisk(units).slice(0, config.quick.topN ?? 5)     // sampling — logged
log(`${units.length} units (${unitSource}${lowConfidence.length ? `, ${lowConfidence.length} low-confidence flagged` : ''}) × ${lenses.length} lenses`)

// work-list = every (unit × lens) pair
const jobs = units.flatMap(u => lenses.map(l => ({ unit: u, lens: l })))

// 2-3. REVIEW → VERIFY as a pipeline: each unit×lens verifies as soon as its review lands.
const reviewed = await pipeline(
  jobs,
  job => agent(reviewerPrompt(job, config), {
    agentType: 'audit-reviewer', label: `review:${job.unit.key}:${job.lens}`,
    phase: 'Review', schema: FINDINGS_SCHEMA,
  }),
  (review, job) => parallel((review?.findings ?? []).map(f => () =>
    // adversarial: N refuters, default-to-refuted; majority-refute ⇒ drop
    parallel(Array.from({ length: config.verify.voters ?? 3 }, (_, i) => () =>
      agent(verifierPrompt(f, i), {
        agentType: 'audit-verifier', label: `verify:${f.id}`,
        phase: 'Verify', schema: VERDICT_SCHEMA,
      })))
      .then(votes => ({ ...f, unit: job.unit.key, lens: job.lens,
        confirmed: votes.filter(Boolean).filter(v => !v.refuted).length
                   > (votes.filter(Boolean).length / 2) })))),
)

// 4. RECONCILE — plain code, not an agent. dedup + drop accepted baseline.
const confirmed = reviewed.flat().filter(Boolean).filter(f => f.confirmed)
const deduped   = dedupeByFingerprint(confirmed)                 // file + rule + normalized-snippet hash
const fresh     = deduped.filter(f => !baseline.has(fingerprint(f)))
log(`${fresh.length} new confirmed (${deduped.length - fresh.length} suppressed by baseline)`)

// 5. SYNTHESIZE — one agent writes the report + remediation waves.
phase('Synthesize')
const report = await agent(synthPrompt(fresh, config, { unitSource, lowConfidence }), { agentType: 'audit-synthesizer', schema: REPORT_SCHEMA })
return { report, fresh, units: { source: unitSource, lowConfidence }, skipped: mode === 'quick' ? droppedUnits : [] }
```

**Why this shape:** pipeline (not barrier) so a unit's findings start verifying while other units are still being reviewed — no wasted wall-clock. Dedup/baseline is plain code (genuinely needs all findings at once, but it's cheap — no agent). Verify uses **default-to-refuted** voting: a finding must be *actively confirmed* by a majority to survive.

---

## 3. Agents

### `audit-scout`  (tools: Read, Grep, Glob, Bash)
**Fast** unit inference + concern-surface mapping. Cheap first pass.
- Input: config, lenses, optional path filter.
- Output `PLAN_SCHEMA`: `{ units: [{ key, title, globs[], entryPoints[], lensHints: {security?, correctness?, architecture?}, confidence }], overallConfidence, needsDeepMap, riskNotes[] }`.
- Heuristics: infer from top-level dirs, route trees, service/repository layers. Give each unit a `confidence` (does this glob set cohere into one reviewable concern?). Set `needsDeepMap: true` when the repo doesn't decompose cleanly (flat layout, tangled deps, monolithic dirs). Flag high-risk units (auth, billing, data-mutation, external I/O) for `quick` ranking. Doesn't over-think hard cases — escalation to the unit-mapper handles those.

### `audit-unit-mapper`  (tools: Read, Grep, Glob, Bash) — escalated only
Specialized **deep** unit mapping. Runs ONLY when the scout's inference is low-confidence, the scout set `needsDeepMap`, or `--deep-units` was passed. This is the "spin up a specialized agent to build the unit info when it really needs it" path.
- Input: config, lenses, the scout's draft plan, path filter.
- Output `PLAN_SCHEMA` (same shape, higher-confidence units).
- Goes deeper than inference: import/dependency graph, `CODEOWNERS`/ownership signals, call patterns, and real module boundaries — to carve units that actually bound a single concern.
- The report **flags** that the mapper ran and which units were low-confidence, so you can pin those in `units.list` next run (the flagging half of the decision).

### `audit-reviewer`  (tools: Read, Grep, Glob, Bash)
Deep-reads ONE unit through ONE lens. Loads the matching lens skill + the repo's own rules.
- Input: `{ unit, lens }`, config.
- **Runs the lens's deterministic tool first** (§4) — e.g. for the `architecture` lens's DRY check it runs `tools/dry.sh` to enumerate candidate clones — then reasons over the candidates instead of hunting by reading. Tool = exhaustive recall; the agent = judgment + explanation. (Bash is read-only here: it runs linters/detectors, never edits code.)
- Output `FINDINGS_SCHEMA`: `{ findings: [{ id, title, severity, file, line, snippet, rule, rationale, suggestedFix, source: "tool"|"reasoning" }] }`.
- Mandate: cite `file:line`; quote the offending code; map to the lens's rule id (CWE/ASVS/own-rule). No speculation without a code anchor.

### `audit-verifier`  (tools: Read, Grep, Glob) — dedicated
Purpose-built adversary that tries to **refute** a single finding against the actual code. (Dedicated definition rather than a `red-team` wrapper, so its default-to-refuted stance and finding-schema awareness are tuned specifically for audit precision — it borrows red-team's posture but ships standalone.)
- Input: one finding (a FINDINGS_SCHEMA item).
- Output `VERDICT_SCHEMA`: `{ refuted: boolean, confidence, reason, counterEvidence? }`.
- Mandate: **default `refuted: true`** unless the code proves the finding real. Hunt for the guard/mitigation the reviewer missed (middleware, RLS, validation, an upstream caller, an existing test/known-accepted exception). This pass is the plugin's core bet — it is what keeps precision high.

### `audit-synthesizer`  (tools: Read)
Turns confirmed-fresh findings into the report.
- Input: fresh findings, config.
- Output `REPORT_SCHEMA`: `{ markdown, waves: [{ title, findingIds[], rationale }], counts: {critical,high,medium,low} }`.
- Loads `audit-report-format` skill for the `AUDIT-<date>.md` contract; groups fixes into ordered remediation waves consumable by `/cklph-os:flow`.

---

## 4. Lens packs (tool-augmented skills)

A lens is **not** a pure prompt. Pure-LLM detection of things like DRY has poor **recall** (the model doesn't exhaustively enumerate), poor **precision** (it flags coincidental *similarity*, not duplicated *knowledge*), and is **blind across files**. So each lens is a three-layer pipeline: a deterministic **tool** for recall → the reviewer **LLM** for judgment + explanation → the **verifier** for precision. Note the split: the verifier only fixes precision; **recall comes from the tool** (or extra passes), never from the verifier.

Each `<lens>/SKILL.md` declares its **tool** (in `tools/`, run by the reviewer), the **checklist** to judge against, and how to **compose with the repo's own rules**. The reviewer loads exactly one lens per job.

| Concern | Deterministic tool (recall) | LLM's job (judgment) |
| --- | --- | --- |
| DRY / clones | `jscpd` / PMD-CPD / similarity hash → candidate clones | duplicated *knowledge* worth extracting, or coincidental? |
| missing-await / floating promises | ESLint `no-floating-promises`, `tsc` | near-zero — the linter is exact |
| dead code | `knip` / `ts-prune` | confirm it isn't dynamically referenced |
| layering / circular deps | `dependency-cruiser` | is this coupling actually wrong here? |
| secrets | `gitleaks` / `detect-secrets` | real secret vs test fixture |
| N+1 / query patterns | repo Semgrep rules (`supabase-query-analyzer`) | confirm it's a hot path |
| architecture *intent*, business-logic correctness | *(no good tool)* | pure LLM + verifier — fuzzier; findings ship labeled "candidate for human review" |

> **Honesty:** lenses with strong tooling (DRY, await, dead-code, secrets, layering) are high-confidence. Pure-judgment concerns (right abstraction, business intent) are inherently fuzzier and are reported as candidates, not facts. Every lens is gated by the fixture precision/recall test (§10) before it's trusted.

The checklists below are the **judgment** layer the reviewer applies on top of its tool's candidates:

### security-lens
- **Authz/authn:** every mutation gated; correct identity source (e.g. `getUser()` not `getSession()`); admin paths behind an admin check; no privilege self-escalation (column grants / RLS WITH CHECK).
- **Injection & I/O:** SQL/NoSQL/command/template injection; SSRF on outbound fetch; path traversal; unsafe deserialization; XSS in rendered content.
- **Secrets & data:** hardcoded secrets; secrets in logs/exports; PII handling; encryption at rest for credentials.
- **Money & state:** payment/webhook signature verification; idempotency on charge paths; tier/entitlement integrity; no live side-effects from untrusted input.
- **Surface controls:** rate-limit + CSRF on state-changing routes; fail-closed defaults.
- Sources: CWE Top 25, OWASP ASVS, repo `CLAUDE.md` security rules + custom Semgrep rules.

### correctness-lens
- Silent failures: unchecked errors, swallowed `catch`, missing error IDs, zero-row writes treated as success.
- State machines: every `in_progress` has a `failed` path; catch blocks restore invariants.
- Concurrency: TOCTOU, read-then-write races, non-atomic guards (prefer predicate-in-UPDATE).
- Data handling: null/undefined, off-by-one, inclusive-range bugs, pagination `count: exact`, partial-select typing.
- Fail direction: defaults fail **closed** for security, **open** only where it can't break correctness — and it's intentional.

### architecture-lens
- DRY: 3+ duplications → extract; contradictory sources of truth (e.g. hardcoded tables vs DB).
- Layering: UI→service→repo boundaries respected; no direct DB in the wrong layer; data-fetch through the sanctioned data layer.
- Rot: dead code, unused exports, god-objects, files over the size limit, circular deps.
- Sources: repo's architecture skills + size/limit rules.

> Lens composition: the reviewer is told to **prefer the repo's own rule** when it conflicts with the generic lens, and to treat documented/accepted exceptions (see baseline + repo learnings) as non-findings.

---

## 5. Config — `audit.config.yaml`

```yaml
version: 1
units:
  autoInfer: true               # scout infers units (set false to require `list`)
  deepMapThreshold: 0.7         # overall confidence below this → escalate to audit-unit-mapper
  list:                         # optional explicit units; ALWAYS win over inference when present
    - key: auth
      title: Authentication & authorization
      globs: ["lib/auth/**", "app/api/auth/**", "lib/middleware/**"]
    - key: billing
      globs: ["app/api/billing/**", "app/api/payments/**", "lib/stripe/**"]
lenses: [security, correctness, architecture]
severityFloor: low              # drop findings below this
verify:
  voters: 3                     # refuters per finding
  passThreshold: majority       # majority | unanimous
budget:
  total: 800000                 # token ceiling for the run (null = unbounded)
quick:
  topN: 5                       # units sampled in :quick mode
ignore: ["**/__tests__/**", "**/*.generated.ts", "types/database.ts"]
report:
  dir: audits
rulesFrom: ["CLAUDE.md", "AGENTS.md", ".coderabbit.yaml"]   # repo rules to honor
```

## 6. Baseline — `.audit-baseline.json`

```json
{
  "version": 1,
  "acceptedAt": "<date>",
  "findings": [
    { "fingerprint": "a1b2c3…", "rule": "ASVS-4.2.2", "file": "lib/hooks/use-dashboard-data.ts",
      "title": "Direct Supabase reads bypass lib/data", "reason": "Deferred to H-8 (tracked)", "by": "peter" }
  ]
}
```

- **Fingerprint** = stable hash of `{ rule, file, normalizedSnippet }` (normalize whitespace + identifiers so trivial edits don't change it; line numbers are NOT in the hash so the fingerprint survives code moving up/down).
- `:run` suppresses any fresh finding whose fingerprint is in the baseline, and notes the suppressed count in the report.
- `:baseline` writes every currently-open confirmed finding into the file with a `reason` prompt (so accepting debt is a deliberate, annotated act — like the CASA "deferred to H-8" notes).

## 7. Report — `AUDIT-<date>.md`

Front-matter (date, repo SHA, lenses, units, counts, suppressed-by-baseline, skipped-by-budget/sampling) → severity sections (each finding: title, `file:line`, snippet, why-real + verifier note, fix) → **Remediation waves** (ordered groups for `/cklph-os:flow`) → Appendix (units covered, what was skipped and why — *no silent truncation*).

## 8. Commands

- **`/cklph-audit:init`** — detect subsystems, scaffold `audit.config.yaml` + empty `.audit-baseline.json`. One-time.
- **`/cklph-audit:run <lenses> [path]`** — load config + baseline, run `audit.workflow.js` (full mode), write the report. `<lenses>` = comma list; `[path]` scopes to a subtree.
- **`/cklph-audit:quick <lens> [path]`** — full pipeline but `mode:quick` (top-N risk units only); logs dropped units. Cheap recon.
- **`/cklph-audit:baseline`** — interactive: accept currently-open findings into the baseline with reasons.
- **`/cklph-audit:backtest <lens> <ref>`** — run a lens against the fixtures and/or a known historical commit and report precision/recall vs ground truth. The validation gate (§10).

## 9. Cost controls

- `budget.total` passed into the workflow; reviewers/verifiers stop spawning when `budget.remaining()` is low — partial report is still emitted, with a "skipped for budget" appendix.
- `:quick` top-N sampling (explicit, logged).
- Dedup + baseline make re-runs cheap (verify only fresh findings).
- Concurrency capped by the runtime; pipeline keeps wall-clock at slowest-chain, not sum.

## 10. Lens validation & v1 acceptance

No lens ships on vibes — each is measured against ground truth two ways before it's trusted.

**1. Golden fixtures (per-lens precision/recall gate).** `fixtures/<lens>/should-flag/` holds planted issues the lens MUST catch (**recall**); `should-not-flag/` holds clean look-alikes it MUST NOT flag (**precision**) — e.g. for DRY, two genuinely-similar-but-not-duplicate functions. The `backtest` harness runs the lens over the fixtures and computes recall + precision. A lens is **gated**: not enabled until it clears a threshold (suggested **recall ≥ 0.8, precision ≥ 0.7 after verify**). Fixtures live with the plugin and grow every time a real false-positive/negative is found — so the gate ratchets up over time. *This is how you "ensure DRY is being matched": you measure it against labeled cases, not trust.*

**2. Backtest against a known commit (`/cklph-audit:backtest <lens> <ref>`).** Real ground truth from git history:
- `security` → pre-CASA-remediation MailPrism must re-surface the CASA headline findings (users-table self-escalation, QStash dev bypass, cron fail-open, GDPR ciphertext export).
- `architecture` → run on the commit *before* a known de-dup refactor; it should flag what the refactor removed.
- `correctness` → run on the commit a known bugfix later patched; it should flag the bug.

**v1 acceptance:**
- **Functional:** `init` → `run security,correctness,architecture` on MailPrism produces a triaged `AUDIT-<date>.md` with file:line + waves; `baseline` suppresses on the next run.
- **Quality gate:** every shipped lens clears its fixture precision/recall threshold, AND the `security` backtest re-surfaces the CASA findings at **< ~20% false-positive after verify**. A lens that can't clear the gate gets its tool/prompt/verifier fixed before it's enabled — it doesn't ship degraded.
- **Cost:** a full 3-lens run on MailPrism stays under a configured budget; `:quick` is a fraction of it.

## 11. Decisions (resolved 2026-06-10)

1. **Unit scoping — adaptive hybrid.** Scout infers fast (per-unit confidence); escalates to a dedicated `audit-unit-mapper` when overall confidence is low, a unit sets `needsDeepMap`, or `--deep-units` is passed; an explicit `units.list` in config always wins. Derivation method + low-confidence units are **flagged in the report** so they can be pinned next run. (§2, §3, §5)
2. **Verifier — dedicated `audit-verifier`.** Purpose-built, default-to-refuted, finding-schema-aware; not a `red-team` wrapper. (§3)
3. **Reports — committed in-repo** under `audits/` alongside `.audit-baseline.json`, for git-trackable cross-run history. (§1, §7)
4. **Remediation — plan-only, strictly read-only in v1.** No agent modifies application code: the run emits an ordered remediation-wave plan and you decide when to invoke `/cklph-os:flow`. Agents hold Read/Grep/Glob (scout + unit-mapper also read-only Bash); the only writes are the report + baseline, performed by the command. Auto-launch-on-Criticals is deferred to v2. (§3, §8)
