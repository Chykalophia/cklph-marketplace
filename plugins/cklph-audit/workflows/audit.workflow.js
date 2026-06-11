// cklph-audit — the deterministic engine.
//
// Invoked by the /cklph-audit:run skill via the Workflow tool. Pipeline:
//   1. DISCOVER  — adaptive: scout infers units (with confidence); escalates to
//                  audit-unit-mapper when low-confidence; explicit config wins.
//   2. REVIEW    — one audit-reviewer per (unit × lens); runs the lens's
//                  deterministic tool for recall, then judges the candidates.
//   3. VERIFY    — dedicated audit-verifier refutes each finding (default-refuted,
//                  majority must confirm to survive). Pipelined with review.
//   4. RECONCILE — plain code: dedup + drop accepted-baseline fingerprints.
//   5. SYNTHESIZE— audit-synthesizer writes AUDIT-<date>.md + remediation waves.
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
    { title: 'Review' },
    { title: 'Verify' },
    { title: 'Synthesize' },
  ],
}

const lenses = args?.lenses ?? ['security', 'correctness', 'architecture']
const config = args?.config ?? {}
const baseline = new Set((args?.baseline?.fingerprints) ?? [])
const mode = args?.mode ?? 'full'

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

const FINDINGS_SCHEMA = {
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
        },
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
      properties: {
        critical: { type: 'number' }, high: { type: 'number' },
        medium: { type: 'number' }, low: { type: 'number' },
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

// ════════════════════════════════════════════════════════════════════════════
// 1. DISCOVER — adaptive unit scoping (infer → escalate → flag)
// ════════════════════════════════════════════════════════════════════════════
phase('Discover')
let units, unitSource
if (config.units?.list?.length) {
  units = config.units.list.map(u => ({ confidence: 1, ...u }))
  unitSource = 'config'
} else {
  const plan = await agent(
    `Decompose this repo into reviewable UNITS for an audit. ${args?.path ? `Scope to: ${args.path}. ` : ''}` +
    `Lenses to be run: ${lenses.join(', ')}. Infer units from top-level dirs, route trees, and ` +
    `service/repository layers. Give each unit a confidence (does this glob set cohere into one ` +
    `reviewable concern?) and a riskScore (auth/billing/data-mutation/external-IO = high). Set ` +
    `needsDeepMap=true if the repo doesn't decompose cleanly. Honor ignore globs: ${JSON.stringify(config.ignore ?? [])}.`,
    { agentType: 'audit-scout', label: 'discover:scout', schema: PLAN_SCHEMA },
  )
  units = plan.units
  unitSource = 'inferred'
  const escalate =
    args?.deepUnits || plan.needsDeepMap ||
    (plan.overallConfidence ?? 1) < (config.units?.deepMapThreshold ?? 0.7) ||
    units.some(u => (u.confidence ?? 1) < 0.5)
  if (escalate) {
    log(`unit inference low-confidence (overall ${plan.overallConfidence}) — escalating to audit-unit-mapper`)
    const mapped = await agent(
      `The fast inference below was low-confidence — produce a better-bounded unit map using the ` +
      `import/dependency graph, CODEOWNERS/ownership signals, and real module boundaries. ` +
      `Lenses: ${lenses.join(', ')}. ${args?.path ? `Scope: ${args.path}. ` : ''}` +
      `Draft plan: ${JSON.stringify(plan.units?.map(u => ({ key: u.key, globs: u.globs, confidence: u.confidence })) ?? [])}`,
      { agentType: 'audit-unit-mapper', label: 'discover:deep-map', schema: PLAN_SCHEMA },
    )
    units = mapped.units
    unitSource = 'deep-mapped'
  }
}
const lowConfidence = units.filter(u => (u.confidence ?? 1) < 0.6).map(u => u.key)
if (mode === 'quick') {
  const topN = config.quick?.topN ?? 5
  const dropped = rankByRisk(units).slice(topN).map(u => u.key)
  units = rankByRisk(units).slice(0, topN)
  if (dropped.length) log(`quick mode: auditing top ${topN} by risk; SKIPPED (not audited): ${dropped.join(', ')}`)
}
log(`${units.length} unit(s) [${unitSource}${lowConfidence.length ? `, ${lowConfidence.length} low-confidence flagged: ${lowConfidence.join(', ')}` : ''}] × ${lenses.length} lens(es)`)

// work-list = every (unit × lens) pair
const jobs = units.flatMap(u => lenses.map(lens => ({ unit: u, lens })))

// ════════════════════════════════════════════════════════════════════════════
// 2-3. REVIEW → VERIFY  (pipeline: each finding verifies as soon as its review lands)
// ════════════════════════════════════════════════════════════════════════════
const voters = config.verify?.voters ?? 3
const reviewed = await pipeline(
  jobs,
  // stage 1: review one unit through one lens (tool-augmented)
  job => agent(
    `Audit UNIT "${job.unit.key}" (globs: ${JSON.stringify(job.unit.globs)}) through the **${job.lens}** lens. ` +
    `Load the ${job.lens}-lens skill AND this repo's own rules (${JSON.stringify(config.rulesFrom ?? ['CLAUDE.md', 'AGENTS.md'])}); ` +
    `prefer the repo's rule on conflict. Run the lens's deterministic tool first for recall, then judge the ` +
    `candidates. Every finding needs a file:line anchor + the offending code quoted + a rule id. ` +
    `Provide normalizedSnippet (whitespace/identifier-normalized) for each finding.`,
    { agentType: 'audit-reviewer', label: `review:${job.unit.key}:${job.lens}`, phase: 'Review', schema: FINDINGS_SCHEMA },
  ),
  // stage 2: verify each finding (N default-refuted voters; majority must confirm)
  (review, job) => parallel((review?.findings ?? []).map(f => () =>
    parallel(Array.from({ length: voters }, (_v, i) => () =>
      agent(
        `Adversarially try to REFUTE this audit finding against the ACTUAL code. Default to refuted:true ` +
        `unless the code proves it real. Hunt for the guard/mitigation the reviewer missed (middleware, ` +
        `RLS, validation, an upstream caller, an existing test, a documented/accepted exception). ` +
        `Voter ${i + 1}/${voters}.\nFINDING: ${JSON.stringify({ title: f.title, file: f.file, line: f.line, rule: f.rule, snippet: f.snippet, rationale: f.rationale })}`,
        { agentType: 'audit-verifier', label: `verify:${f.id ?? f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA },
      )))
      .then(votes => {
        const v = votes.filter(Boolean)
        const confirmedVotes = v.filter(x => !x.refuted).length
        return { ...f, unit: job.unit.key, lens: job.lens, confirmed: confirmedVotes > v.length / 2 }
      }))),
)

// ════════════════════════════════════════════════════════════════════════════
// 4. RECONCILE — plain code (dedup + accepted-baseline suppression)
// ════════════════════════════════════════════════════════════════════════════
const confirmed = reviewed.flat().filter(Boolean).filter(f => f.confirmed)
const deduped = dedupeByFingerprint(confirmed)
const fresh = deduped.filter(f => !baseline.has(fingerprint(f)))
log(`${fresh.length} new confirmed finding(s) (${deduped.length - fresh.length} suppressed by baseline, ` +
    `${confirmed.length - deduped.length} duplicate(s) merged)`)

// ════════════════════════════════════════════════════════════════════════════
// 5. SYNTHESIZE — the report + remediation waves
// ════════════════════════════════════════════════════════════════════════════
phase('Synthesize')
if (!fresh.length) {
  log('No new confirmed findings. Clean run. 🎉')
  return { report: null, fresh: [], units: { source: unitSource, lowConfidence }, skipped: mode === 'quick' }
}
const report = await agent(
  `Write the audit report from these CONFIRMED, fresh findings. Load the audit-report-format skill for the ` +
  `AUDIT-<date>.md contract. Bucket by severity (critical/high/medium/low), each with file:line + why-it's-real ` +
  `(note that it survived adversarial verification) + a concrete fix. Then group fixes into ordered remediation ` +
  `WAVES consumable by /cklph-os:flow. Flag in an appendix: unit derivation = ${unitSource}` +
  `${lowConfidence.length ? `, low-confidence units: ${lowConfidence.join(', ')}` : ''}` +
  `${mode === 'quick' ? ', QUICK mode (only top-risk units audited — coverage is partial)' : ''}.\n\n` +
  `FINDINGS:\n${JSON.stringify(fresh, null, 2)}`,
  { agentType: 'audit-synthesizer', label: 'synthesize:report', schema: REPORT_SCHEMA },
)

return {
  report,
  fresh,
  units: { source: unitSource, lowConfidence },
  skipped: mode === 'quick',
}
