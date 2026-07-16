// cklph-audit — the deterministic engine (v2: proves what it covered).
//
// Invoked by the /cklph-audit:run skill via the Workflow tool. Pipeline:
//   1. DISCOVER  — parallel: scout infers units (escalates to audit-unit-mapper
//                  when low-confidence; explicit config wins) + rulebook
//                  extraction (rulesFrom docs → discrete rules).
//   2. RECON     — one audit-recon per lens, concurrent with Discover: cited
//                  denominators (re-runnable command + count), seeds (hints,
//                  not findings), safe-control candidates. Skipped in quick
//                  mode unless recon.quick — always logged, never silent.
//   3. REVIEW    — one audit-reviewer per (unit × lens); tool-first recall,
//                  re-verifies its seeds, answers a ruleCheck for EVERY rule
//                  handed, reports honest coverage counts. docs-drift is NOT
//                  crossed with units: exactly ONE job over the rulesFrom docs.
//   4. VERIFY    — dedicated audit-verifier refutes each finding (default-
//                  refuted, majority must confirm). Pipelined with review.
//                  Refuting counter-evidence is harvested, not discarded.
//   5. RECONCILE — plain code: dedup + accepted-baseline suppression + rule-
//                  closure matrix (every rule accounted for, unchecked shown)
//                  + coverage totals + noise-gated positive controls.
//   6. SYNTHESIZE— audit-synthesizer writes AUDIT-<date>.md: severities,
//                  coverage summary + matrix, positive controls (INFO), waves.
//
// args = { lenses:string[], path?, mode:"full"|"quick", deepUnits?:bool,
//          config:object, baseline:{fingerprints:string[]} }
// Read-only: no agent writes application code. Only the report + baseline are
// written, by the command, after this returns.

export const meta = {
  name: 'cklph-audit',
  description: 'Scoped, verified, agentic whole-repo audit',
  phases: [
    { title: 'Discover' },
    { title: 'Recon' },
    { title: 'Review' },
    { title: 'Verify' },
    { title: 'Synthesize' },
  ],
}

const lenses = args?.lenses ?? ['security', 'correctness', 'architecture']
const config = args?.config ?? {}
const baseline = new Set((args?.baseline?.fingerprints) ?? [])
const mode = args?.mode ?? 'full'
const rulesFromList = config.rulesFrom ?? ['CLAUDE.md', 'AGENTS.md']

// ── schemas (single source of truth; agents are forced to match these) ───────
const PLAN_SCHEMA = {
  type: 'object',
  required: ['units', 'overallConfidence'],
  properties: {
    units: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'globs', 'confidence'],
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          globs: { type: 'array', items: { type: 'string' } },
          entryPoints: { type: 'array', items: { type: 'string' } },
          riskScore: { type: 'number' },        // 0..1, higher = audit-first
          confidence: { type: 'number' },        // 0..1
        },
      },
    },
    overallConfidence: { type: 'number' },
    needsDeepMap: { type: 'boolean' },
    riskNotes: { type: 'array', items: { type: 'string' } },
  },
}

const RULEBOOK_SCHEMA = {
  type: 'object',
  required: ['rules'],
  properties: {
    rules: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'source', 'text'],
        properties: {
          id: { type: 'string' },                // stable slug, e.g. "agents-md:rule-3"
          source: { type: 'string' },            // file:line
          text: { type: 'string' },              // verbatim or tight paraphrase
          lensHint: { type: 'string', enum: ['security', 'correctness', 'architecture', 'docs-drift', 'any'] },
        },
      },
    },
  },
}

const RECON_SCHEMA = {
  type: 'object',
  properties: {
    domain: { type: 'string' },
    denominators: {                              // coverage-math denominators (M3)
      type: 'array',
      items: {
        type: 'object',
        required: ['pattern', 'command', 'count'],
        properties: {
          pattern: { type: 'string' },
          description: { type: 'string' },
          command: { type: 'string' },           // re-runnable verbatim
          count: { type: 'number' },
        },
      },
    },
    seeds: {                                     // hints, NOT findings — reviewers re-verify
      type: 'array',
      items: {
        type: 'object',
        required: ['file'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          snippet: { type: 'string' },
          note: { type: 'string' },
          suspectedRule: { type: 'string' },
        },
      },
    },
    safeControls: {                              // positive-control candidates (M4)
      type: 'array',
      items: {
        type: 'object',
        required: ['file'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          snippet: { type: 'string' },
          note: { type: 'string' },
          rule: { type: 'string' },
        },
      },
    },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'severity', 'file', 'rule'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: 'number' },
          snippet: { type: 'string' },
          rule: { type: 'string' },                 // CWE/ASVS/own-rule id
          rationale: { type: 'string' },
          suggestedFix: { type: 'string' },
          source: { type: 'string', enum: ['tool', 'reasoning'] },
          normalizedSnippet: { type: 'string' },     // whitespace/identifier-normalized, for fingerprinting
          confidence: { type: 'string', enum: ['confirmed', 'likely', 'needs-owner-input'] },
          validationSteps: { type: 'string' },       // read-only checks used to confirm true-positive
          remediationBucket: { type: 'string', enum: ['quick-win', 'targeted-fix', 'systemic-refactor', 'owner-decision'] },
          context: {                                 // classify BEFORE severity
            type: 'object',
            properties: {
              surface: { type: 'string', enum: ['server', 'client', 'shared'] },
              runtime: { type: 'string', enum: ['prod', 'test', 'generated'] },
              gated: { type: 'boolean' },
            },
          },
        },
      },
    },
    ruleChecks: {                                // one per rulebook rule handed (M2)
      type: 'array',
      items: {
        type: 'object',
        required: ['ruleId', 'status'],
        properties: {
          ruleId: { type: 'string' },
          status: { type: 'string', enum: ['violation', 'verified-safe', 'not-applicable'] },
          findingIds: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'string' },
        },
      },
    },
    safeControlChecks: {                         // verdict per SAFE-CONTROL candidate handed (M4)
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'confirmed'],
        properties: {
          file: { type: 'string' },
          confirmed: { type: 'boolean' },
          evidence: { type: 'string' },
        },
      },
    },
    coverage: {                                  // honest counts → coverage math (M3)
      type: 'object',
      properties: {
        seedsVerified: { type: 'number' },
        seedsGiven: { type: 'number' },
        toolCandidatesJudged: { type: 'number' },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
    counterEvidence: { type: 'string' },
  },
}

const REPORT_SCHEMA = {
  type: 'object',
  required: ['markdown', 'counts'],
  properties: {
    markdown: { type: 'string' },
    waves: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          findingIds: { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string' },
        },
      },
    },
    counts: {
      type: 'object',
      required: ['critical', 'high', 'medium', 'low', 'info'],
      properties: {
        critical: { type: 'number' }, high: { type: 'number' },
        medium: { type: 'number' }, low: { type: 'number' },
        info: { type: 'number' },                // positive controls
      },
    },
  },
}

// ── helpers (plain code — deterministic, no agents) ──────────────────────────
function fingerprint(f) {
  // Stable across line moves + trivial edits: rule + file + normalized snippet.
  // Line numbers are deliberately excluded so a finding survives code shifting.
  const norm = (f.normalizedSnippet || f.snippet || '').replace(/\s+/g, ' ').trim().toLowerCase()
  return `${f.rule}::${f.file}::${norm}`.slice(0, 400)
}
function dedupeByFingerprint(findings) {
  const seen = new Map()
  for (const f of findings) {
    const fp = fingerprint(f)
    // keep the highest-severity instance of a duplicate
    const rank = { critical: 4, high: 3, medium: 2, low: 1 }
    if (!seen.has(fp) || (rank[f.severity] ?? 0) > (rank[seen.get(fp).severity] ?? 0)) {
      seen.set(fp, f)
    }
  }
  return [...seen.values()]
}
function rankByRisk(units) {
  return [...units].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
}
function globMatch(path, globs) {
  // honest subset: '**/' = any depth (incl. none), '**' = anything, '*' = one segment, else literal.
  return (globs ?? []).some(g => {
    const re = '^' + g
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // escape regex chars ('*' and '/' survive)
      .replace(/\*\*\/|\*\*|\*/g, m =>        // single pass, longest-first
        m === '**/' ? '(?:.*/)?' : m === '**' ? '.*' : '[^/]*') + '$'
    return new RegExp(re).test(path)
  })
}
function tier(stage) {
  // per-stage model/effort routing from config.models.<stage> = { model?, effort? }.
  // Omitted stage (or block) = inherit the session model — the v1 behavior.
  // Policy lives in config, not here: mechanical stages ↓, judgment inherits, verify ↑.
  const t = config.models?.[stage] ?? {}
  const o = {}
  if (t.model) o.model = t.model
  if (t.effort) o.effort = t.effort
  return o
}

// ════════════════════════════════════════════════════════════════════════════
// 1. DISCOVER + RECON — units, rulebook, and per-lens recon, all in parallel
// ════════════════════════════════════════════════════════════════════════════
phase('Discover')
const reconEnabled = (config.recon?.enabled ?? true) && (mode !== 'quick' || config.recon?.quick === true)
if (!reconEnabled) {
  log(config.recon?.enabled === false
    ? 'recon disabled by config — denominators/seeds absent (flagged in report appendix)'
    : 'quick mode: recon SKIPPED (set recon.quick: true to enable) — denominators/seeds absent')
}
const wantScout = !config.units?.list?.length
const discovered = await parallel([
  ...(wantScout ? [() => agent(
    `Decompose this repo into reviewable UNITS for an audit. ${args?.path ? `Scope to: ${args.path}. ` : ''}` +
    `Lenses to be run: ${lenses.join(', ')}. Infer units from top-level dirs, route trees, and ` +
    `service/repository layers. Give each unit a confidence (does this glob set cohere into one ` +
    `reviewable concern?) and a riskScore (auth/billing/data-mutation/external-IO = high). Set ` +
    `needsDeepMap=true if the repo doesn't decompose cleanly. Honor ignore globs: ${JSON.stringify(config.ignore ?? [])}.`,
    { agentType: 'audit-scout', label: 'discover:scout', schema: PLAN_SCHEMA, ...tier('scout') },
  )] : []),
  () => agent(
    `Extract this repo's RULEBOOK: parse ${JSON.stringify(rulesFromList)} into discrete rules ` +
    `(skip files that don't exist). Each rule: stable slug id (e.g. "agents-md:rule-3"), source ` +
    `file:line, text (verbatim or tight paraphrase), lensHint ` +
    `(security|correctness|architecture|docs-drift|any). Split compound rules; skip prose that ` +
    `isn't a rule. Read-only.`,
    { agentType: 'audit-recon', label: 'discover:rulebook', schema: RULEBOOK_SCHEMA, ...tier('rulebook') },
  ),
  ...(reconEnabled ? lenses.map(lens => () => agent(
    `RECON the **${lens}** lens's concern surface across the whole scoped repo.` +
    `${args?.path ? ` Scope to: ${args.path}.` : ''} Mechanically enumerate — return: denominators ` +
    `(pattern + re-runnable command VERBATIM + honest count), seeds (cited file:line leads worth a ` +
    `reviewer's attention — hints, NOT findings), and safeControls (verified-good reference ` +
    `patterns: file:line + what they protect). Honor ignore globs: ${JSON.stringify(config.ignore ?? [])}. Read-only.` +
    (lens === 'docs-drift'
      ? ` The rulebook docs to recon are: ${JSON.stringify(rulesFromList)} — enumerate THEIR references (paths, scripts, packages), not the whole repo.`
      : ''),
    { agentType: 'audit-recon', label: `recon:${lens}`, phase: 'Recon', schema: RECON_SCHEMA, ...tier('recon') },
  )) : []),
])
// unpack (parallel never rejects — failed thunks resolve null)
let di = 0
const plan = wantScout ? discovered[di++] : null
const rulebookOut = discovered[di++]
const reconOuts = discovered.slice(di)

const rulebook = rulebookOut?.rules ?? []
if (!rulebookOut) log('rulebook extraction died — 0 rules; coverage matrix will be empty (flagged in appendix)')
else log(`rulebook: ${rulebook.length} rule(s) from ${rulesFromList.join(', ')}`)
const reconByLens = {}
if (reconEnabled) {
  lenses.forEach((lens, i) => {
    if (reconOuts[i]) reconByLens[lens] = reconOuts[i]
    else log(`recon:${lens} died — denominators/seeds absent for this lens (flagged in appendix)`)
  })
}

let units, unitSource
if (!wantScout) {
  units = config.units.list.map(u => ({ confidence: 1, ...u }))
  unitSource = 'config'
} else {
  units = plan?.units ?? []
  unitSource = 'inferred'
  const escalate = !plan ||
    args?.deepUnits || plan.needsDeepMap ||
    (plan.overallConfidence ?? 1) < (config.units?.deepMapThreshold ?? 0.7) ||
    units.some(u => (u.confidence ?? 1) < 0.5)
  if (escalate) {
    log(plan
      ? `unit inference low-confidence (overall ${plan.overallConfidence}) — escalating to audit-unit-mapper`
      : 'scout died — escalating to audit-unit-mapper')
    const mapped = await agent(
      `The fast inference below was low-confidence — produce a better-bounded unit map using the ` +
      `import/dependency graph, CODEOWNERS/ownership signals, and real module boundaries. ` +
      `Lenses: ${lenses.join(', ')}. ${args?.path ? `Scope: ${args.path}. ` : ''}` +
      `Draft plan: ${JSON.stringify(plan?.units?.map(u => ({ key: u.key, globs: u.globs, confidence: u.confidence })) ?? [])}`,
      { agentType: 'audit-unit-mapper', label: 'discover:deep-map', schema: PLAN_SCHEMA, ...tier('unitMapper') },
    )
    if (!mapped) log('unit-mapper died — keeping scout units' + (plan ? '' : ' (none)'))
    units = mapped?.units ?? plan?.units ?? []
    if (mapped) unitSource = 'deep-mapped'
  }
}
const lowConfidence = units.filter(u => (u.confidence ?? 1) < 0.6).map(u => u.key)
if (mode === 'quick') {
  const topN = config.quick?.topN ?? 5
  const dropped = rankByRisk(units).slice(topN).map(u => u.key)
  units = rankByRisk(units).slice(0, topN)
  if (dropped.length) log(`quick mode: auditing top ${topN} by risk; SKIPPED (not audited): ${dropped.join(', ')}`)
}

// work-list = every (unit × lens) pair. docs-drift is NOT crossed with units —
// when requested it is exactly ONE job over the rulesFrom docs themselves (M5).
const unitLenses = lenses.filter(l => l !== 'docs-drift')
if (units.length === 0 && unitLenses.length > 0) {
  log(`WARNING: no units — ${unitLenses.join(', ')} lens(es) have nothing to review; ` +
      `run degrades to ${lenses.includes('docs-drift') ? 'the docs-drift job only' : 'an empty report'}`)
}
const jobs = units.flatMap(u => unitLenses.map(lens => ({ unit: u, lens })))
if (lenses.includes('docs-drift')) {
  jobs.push({ unit: { key: 'docs', title: 'Repo rulebook docs', globs: rulesFromList, confidence: 1 }, lens: 'docs-drift' })
}
log(`${units.length} unit(s) [${unitSource}${lowConfidence.length ? `, ${lowConfidence.length} low-confidence flagged: ${lowConfidence.join(', ')}` : ''}] × ${unitLenses.length} lens(es)${lenses.includes('docs-drift') ? ' + 1 docs-drift job' : ''}`)

// ════════════════════════════════════════════════════════════════════════════
// 2-3. REVIEW → VERIFY  (pipeline: each finding verifies as soon as its review lands)
// ════════════════════════════════════════════════════════════════════════════
const voters = config.verify?.voters ?? 3
const reviewed = await pipeline(
  jobs,
  // stage 1: review one unit through one lens (tool-augmented, seed- and rule-aware)
  job => {
    // EVERY lens — docs-drift included — gets only its subset (spec M2): lensHint match,
    // 'any', or unhinted. Untouched code rules fold honestly to unchecked → NOT CHECKED.
    const rules = rulebook.filter(r => r.lensHint === job.lens || r.lensHint === 'any' || !r.lensHint)
    const recon = reconByLens[job.lens]
    // normalize recon paths (./foo → foo) so glob matching doesn't drop seeds on a prefix
    const inUnit = s => { const nf = s?.file?.replace(/^\.\//, ''); return nf && globMatch(nf, job.unit.globs) }
    const seeds = (recon?.seeds ?? []).filter(inUnit)
    const safeControls = (recon?.safeControls ?? []).filter(inUnit)
    return agent(
      `Audit UNIT "${job.unit.key}" (globs: ${JSON.stringify(job.unit.globs)}) through the **${job.lens}** lens. ` +
      `Load the ${job.lens}-lens skill; the repo's own rules (RULEBOOK below) win on conflict. Run the lens's ` +
      `deterministic tool first for recall, then judge the candidates. Every finding needs a file:line anchor + ` +
      `the offending code quoted + a rule id + normalizedSnippet (whitespace/identifier-normalized). Classify ` +
      `context (surface/runtime/gated) BEFORE severity — severity comes from real exploitability, not raw ` +
      `pattern match. Per finding also set confidence (confirmed|likely|needs-owner-input), validationSteps ` +
      `(the read-only checks you ran), and remediationBucket (quick-win|targeted-fix|systemic-refactor|` +
      `owner-decision; owner-decision = intentional-but-not-locally-obvious — a question, not a defect).\n` +
      (rules.length
        ? `RULEBOOK — return a ruleCheck for EVERY rule (violation|verified-safe|not-applicable; ` +
          `verified-safe/not-applicable need a one-line evidence citation/reason):\n${JSON.stringify(rules)}\n`
        : '') +
      (seeds.length
        ? `SEEDS — hints, NOT findings: re-open and verify EVERY one before use (citations drift):\n${JSON.stringify(seeds)}\n`
        : '') +
      (safeControls.length
        ? `SAFE-CONTROL candidates — return a safeControlCheck ({ file, confirmed, evidence }) for ` +
          `EVERY one: confirmed: true ONLY after reading the guard at its file:line; evidence = ` +
          `that citation:\n${JSON.stringify(safeControls)}\n`
        : '') +
      `Report coverage HONESTLY: { seedsVerified, seedsGiven (${seeds.length} given), toolCandidatesJudged }.`,
      { agentType: 'audit-reviewer', label: `review:${job.unit.key}:${job.lens}`, phase: 'Review', schema: REVIEW_SCHEMA, ...tier('reviewer') },
    )
  },
  // stage 2: verify each finding (N default-refuted voters; majority must confirm)
  (review, job) => parallel((review?.findings ?? []).map(f => () =>
    parallel(Array.from({ length: voters }, (_v, i) => () =>
      agent(
        `Adversarially try to REFUTE this audit finding against the ACTUAL code. Default to refuted:true ` +
        `unless the code proves it real. Hunt for the guard/mitigation the reviewer missed (middleware, ` +
        `RLS, validation, an upstream caller, an existing test, a documented/accepted exception). Cite ` +
        `counterEvidence (file:line) when you refute. Voter ${i + 1}/${voters}.\nFINDING: ${JSON.stringify({ title: f.title, file: f.file, line: f.line, rule: f.rule, snippet: f.snippet, rationale: f.rationale })}`,
        { agentType: 'audit-verifier', label: `verify:${f.id ?? f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA, ...tier('verifier') },
      )))
      .then(votes => {
        const v = votes.filter(Boolean)
        if (v.length === 0) log(`verify:${f.id ?? f.file}: all voters died — finding dropped unverified`)
        const confirmedVotes = v.filter(x => !x.refuted).length
        return {
          ...f, unit: job.unit.key, lens: job.lens,
          confirmed: confirmedVotes > v.length / 2,
          // the guards that killed a candidate feed positive-control harvesting (M4)
          refutedGuards: v.filter(x => x.refuted && x.counterEvidence)
            .map(x => ({ counterEvidence: x.counterEvidence, reason: x.reason })),
        }
      })))
    .then(verified => ({
      unit: job.unit.key, lens: job.lens,
      findings: verified.filter(Boolean),
      ruleChecks: review?.ruleChecks ?? [],
      safeControlChecks: review?.safeControlChecks ?? [],
      coverage: review?.coverage ?? null,
    })),
)

// ════════════════════════════════════════════════════════════════════════════
// 4. RECONCILE — plain code (dedup + baseline + rule closure + coverage + positive controls)
// ════════════════════════════════════════════════════════════════════════════
const results = reviewed.filter(Boolean)
const allVerified = results.flatMap(r => r.findings)
const confirmed = allVerified.filter(f => f.confirmed)
const deduped = dedupeByFingerprint(confirmed)
const fresh = deduped.filter(f => !baseline.has(fingerprint(f)))
log(`${fresh.length} new confirmed finding(s) (${deduped.length - fresh.length} suppressed by baseline, ` +
    `${confirmed.length - deduped.length} duplicate(s) merged)`)

// rule closure (M2): every rulebook rule gets exactly one status — nothing silently absent.
// Fold order per rule: violation > verified-safe > not-applicable > unchecked.
const checksByRule = new Map()
for (const c of results.flatMap(r => r.ruleChecks)) {
  if (!c?.ruleId) continue
  if (!checksByRule.has(c.ruleId)) checksByRule.set(c.ruleId, [])
  checksByRule.get(c.ruleId).push(c)
}
const ruleClosure = rulebook.map(rule => {
  const checks = checksByRule.get(rule.id) ?? []
  const violations = checks.filter(c => c.status === 'violation')
  if (violations.length) return { ...rule, status: 'violation', findingIds: [...new Set(violations.flatMap(c => c.findingIds ?? []))] }
  const safe = checks.find(c => c.status === 'verified-safe')
  if (safe) return { ...rule, status: 'verified-safe', evidence: safe.evidence }
  const na = checks.find(c => c.status === 'not-applicable')
  if (na) return { ...rule, status: 'not-applicable', evidence: na.evidence }
  return { ...rule, status: 'unchecked' }                    // renders as NOT CHECKED
})
const uncheckedRuleIds = ruleClosure.filter(r => r.status === 'unchecked').map(r => r.id)
const coverageSummary = { rulebookSize: rulebook.length, checked: rulebook.length - uncheckedRuleIds.length, uncheckedRuleIds }
if (rulebook.length) log(`rule closure: ${coverageSummary.checked}/${rulebook.length} checked${uncheckedRuleIds.length ? `; NOT CHECKED: ${uncheckedRuleIds.join(', ')}` : ''}`)

// positive controls (M4): harvest killed-candidate guards + verified-safe rules + recon safeControls,
// noise-gate (rulebook-attached OR killed a critical/high candidate), de-dupe by file+rule, cap.
const ruleIds = new Set(rulebook.map(r => r.id))
const pcCandidates = []
for (const f of allVerified) {
  if (f.confirmed || !['critical', 'high'].includes(f.severity)) continue
  for (const g of f.refutedGuards ?? []) {
    pcCandidates.push({ label: 'killed-candidate', file: f.file, line: f.line, rule: f.rule, evidence: g.counterEvidence, note: `guard that refuted ${f.severity} candidate: ${f.title}` })
  }
}
for (const r of ruleClosure) {
  if (r.status === 'verified-safe') pcCandidates.push({ label: 'rule-verified', file: r.source, rule: r.id, evidence: r.evidence, note: r.text })
}
// a recon safeControl ships ONLY with a reviewer verdict behind it (spec M4: "confirmed in-scope")
const confirmedSafe = new Map()
for (const c of results.flatMap(r => r.safeControlChecks).filter(c => c?.file && c.confirmed)) {
  if (!confirmedSafe.has(c.file)) confirmedSafe.set(c.file, c.evidence)   // keep first evidence
}
for (const lens of Object.keys(reconByLens)) {
  for (const s of reconByLens[lens].safeControls ?? []) {
    if (s?.file && confirmedSafe.has(s.file)) {
      pcCandidates.push({ label: 'recon', file: s.file, line: s.line, rule: s.rule, evidence: confirmedSafe.get(s.file) || s.snippet, note: s.note })
    }
  }
}
const pcMax = config.positiveControls?.max ?? 15             // 0 disables
const positiveControls = []
if (pcMax > 0) {
  const seenPC = new Set()
  for (const pc of pcCandidates) {
    if (pc.label !== 'killed-candidate' && !ruleIds.has(pc.rule)) continue   // noise gate
    const k = `${pc.file ?? ''}::${pc.rule ?? ''}`
    if (seenPC.has(k)) continue
    seenPC.add(k)
    positiveControls.push(pc)
    if (positiveControls.length >= pcMax) break
  }
}

// coverage totals (M3): recon denominators verbatim + summed reviewer coverage, per lens
const coverageTotals = {}
for (const lens of lenses) {
  const sum = { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 }
  for (const r of results) {
    if (r.lens !== lens) continue
    sum.seedsVerified += r.coverage?.seedsVerified ?? 0
    sum.seedsGiven += r.coverage?.seedsGiven ?? 0
    sum.toolCandidatesJudged += r.coverage?.toolCandidatesJudged ?? 0
  }
  coverageTotals[lens] = { denominators: reconByLens[lens]?.denominators ?? [], reviewed: sum }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. SYNTHESIZE — the report + remediation waves
// ════════════════════════════════════════════════════════════════════════════
phase('Synthesize')
if (!fresh.length) {
  log('No new confirmed findings. Clean run. 🎉')
  return {
    report: null, fresh: [],
    units: { source: unitSource, lowConfidence },
    skipped: mode === 'quick',
    coverage: coverageSummary,
    positiveControls: positiveControls.length,
  }
}
const runMeta = {
  unitSource, lowConfidence, mode,
  reconRan: reconEnabled,
  reconMissing: reconEnabled ? lenses.filter(l => !reconByLens[l]) : lenses,
  rulebookMissing: !rulebookOut,                 // extraction died — matrix empty for THAT reason
  rulebookSize: rulebook.length,
}
// engine-internal fields stay out of the synthesizer's context (confirmed is always true here;
// refutedGuards were already harvested into positive controls above)
const publicFresh = fresh.map(({ refutedGuards, confirmed, ...rest }) => rest)
const report = await agent(
  `Write the audit report from these CONFIRMED, fresh findings. Load the audit-report-format skill for the ` +
  `AUDIT-<date>.md contract. Bucket by severity (critical/high/medium/low), each with file:line + why-it's-real ` +
  `(it survived adversarial verification) + a concrete fix + its confidence/bucket/context/validation fields. ` +
  `Render a Coverage summary (per denominator: examined X of N + the verbatim command; where X < N say ` +
  `"sampled" and give the risk-weighting rationale), a Coverage matrix (EVERY rulebook rule → finding IDs | ` +
  `verified-safe + citation | not-applicable + reason | NOT CHECKED — no rule silently absent), and a ` +
  `Positive controls (INFO) section (each: citation + what it protects + why it shipped). counts.info = ` +
  `positive-control count. Group fixes into ordered remediation WAVES consumable by /cklph-os:flow — ` +
  `quick-wins first within a severity band; owner-decision items go in their own "Owner decisions" ` +
  `subsection (questions, not work). Flag in an appendix: unit derivation, low-confidence units, quick-mode ` +
  `sampling, and recon gaps (RUN_META — state plainly which denominators/seeds are absent/partial and why).\n\n` +
  `FINDINGS:\n${JSON.stringify(publicFresh, null, 2)}\n\n` +
  `RULE_CLOSURE:\n${JSON.stringify(ruleClosure, null, 2)}\n\n` +
  `COVERAGE_TOTALS:\n${JSON.stringify(coverageTotals, null, 2)}\n\n` +
  `POSITIVE_CONTROLS:\n${JSON.stringify(positiveControls, null, 2)}\n\n` +
  `RUN_META:\n${JSON.stringify(runMeta, null, 2)}`,
  { agentType: 'audit-synthesizer', label: 'synthesize:report', schema: REPORT_SCHEMA, ...tier('synthesizer') },
)

return {
  report,
  fresh,
  units: { source: unitSource, lowConfidence },
  skipped: mode === 'quick',
  coverage: coverageSummary,
  positiveControls: positiveControls.length,
}
