// cklph-audit — the deterministic engine (v3: models, proves, hunts variants).
//
// Invoked by the /cklph-audit:run skill via the Workflow tool. Seven-phase pipeline
// (Discover → Recon → Map → Review → Verify → Variant → Synthesize; Map + Variant
// skip in quick mode and degrade gracefully):
//   1. DISCOVER  — parallel: scout infers units (escalates to audit-unit-mapper
//                  when low-confidence; explicit config wins) + rulebook
//                  extraction (rulesFrom docs → discrete rules).
//   2. RECON     — one audit-recon per lens, concurrent with Discover: cited
//                  denominators (re-runnable command + count), seeds (hints,
//                  not findings), safe-control candidates. Skipped in quick
//                  mode unless recon.quick — always logged, never silent.
//   3. MAP       — one audit-modeler (T2.1): trust boundaries, data-flows
//                  (source→sink), per-unit invariants, crown jewels. Feeds the
//                  reviewer boundary/invariant context. Skips in quick; a dead
//                  modeler degrades to an empty model (flagged, never silent).
//   4. REVIEW    — one audit-reviewer per (unit × lens); tool-first recall,
//                  re-verifies its seeds, answers a ruleCheck for EVERY rule
//                  handed, names root-cause + violated invariant, reports honest
//                  coverage. docs-drift is NOT crossed with units: exactly ONE job.
//   5. VERIFY    — audit-verifier refutes each finding from COMMENT-STRIPPED code
//                  (default-refuted). Evidence, not vote tally, arbits (T1.3):
//                  low/medium promote on majority, critical/high require a
//                  reachabilityTrace. Depth risk-routed per unit (T1.4). Pipelined.
//   6. RECONCILE — plain code: dedup + accepted-baseline suppression + rule-
//                  closure matrix (every rule accounted for, unchecked shown)
//                  + coverage totals + near-misses + noise-gated positive controls.
//   7. VARIANT   — for each confirmed critical/high, an audit-reviewer hunts
//                  SIBLINGS repo-wide (T1.1, Project Zero variant analysis);
//                  candidates re-verify through the SAME gate. Skips in quick.
//   8. SYNTHESIZE— audit-synthesizer writes AUDIT-<date>.md: severities, coverage
//                  summary + matrix + narrative, positive controls (INFO), waves.
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
    { title: 'Map' },
    { title: 'Review' },
    { title: 'Verify' },
    { title: 'Variant' },
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
          rootCause: { type: 'string' },             // T1.2: the underlying fault, not the symptom
          invariant: { type: 'string' },             // T1.2: the property this violates
          boundary: { type: 'string' },              // T2.1: the trust boundary crossed (filled when Map ran)
          reachabilityTrace: { type: 'string' },     // T1.3: attacker-input→sink / invariant-violation path (from verify)
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
    counterEvidence: { type: 'string' },            // guard file:line cited to REFUTE
    reachabilityTrace: { type: 'string' },          // T1.3: a CONFIRM of a critical/high MUST supply the concrete path
  },
}

// T2.1 threat model — one audit-modeler produces this once (Map phase).
const MAP_SCHEMA = {
  type: 'object',
  properties: {
    trustBoundaries: {                              // where a security control gates a connection
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          where: { type: 'string' },                // a path/glob the boundary lives at
          note: { type: 'string' },
        },
      },
    },
    dataFlows: {                                    // routes → sinks
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          sink: { type: 'string' },
          crossesBoundary: { type: 'boolean' },
        },
      },
    },
    invariants: {                                   // per-unit properties that must hold
      type: 'array',
      items: {
        type: 'object',
        properties: {
          unit: { type: 'string' },                 // a unit key
          text: { type: 'string' },
        },
      },
    },
    crownJewels: { type: 'array', items: { type: 'string' } },   // highest-value assets/flows
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
function stripComments(s) {
  // T1.3: re-derive from code alone — strip /* … */ blocks and // line comments so the
  // verifier can't be led by a reassuring comment/label. A bare '#' is CODE, not a comment
  // (JS/TS private field #x, CSS #id) — so it is NOT stripped. The // guard leaves a URL
  // scheme (http://) alone: only strip // when it is not preceded by ':'.
  if (!s) return s
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, '')       // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1')     // line comments — not when preceded by ':' (a URL)
}
// A5: the verify fan-out, factored out so the main pipeline AND the Variant phase share it.
// N default-refuted voters try to REFUTE each finding; evidence (not tally) promotes (T1.3):
//   low/medium keep the majority rule; critical/high require a reachabilityTrace.
// Voters are independent parallel calls — no within-prompt position bias to randomize.
function verifyFindings(findings, unitKey, lens, unitVoters, extraOpts = {}) {
  return parallel((findings ?? []).map(f => () =>
    parallel(Array.from({ length: unitVoters }, (_v, i) => () =>
      agent(
        `Adversarially try to REFUTE this audit finding against the ACTUAL code. Re-derive from the code ` +
        `ALONE — the snippet below is comment-stripped; ignore comments/labels. Default to refuted:true ` +
        `unless the code proves it real. Hunt for the guard/mitigation the reviewer missed (middleware, ` +
        `RLS, validation, an upstream caller, an existing test, a documented/accepted exception). To ` +
        `REFUTE, cite the guard file:line in counterEvidence. To CONFIRM a critical/high you MUST supply a ` +
        `reachabilityTrace (attacker-controlled input → sink, or the invariant-violation path) — ` +
        `"plausible" without a trace = refuted. Voter ${i + 1}/${unitVoters}.\n` +
        `FINDING: ${JSON.stringify({ title: f.title, file: f.file, line: f.line, rule: f.rule, severity: f.severity, snippet: stripComments(f.snippet), rationale: f.rationale })}`,
        { agentType: 'audit-verifier', label: `verify:${f.id ?? f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA, ...tier('verifier'), ...extraOpts },
      )))
      .then(votes => {
        const v = votes.filter(Boolean)
        if (v.length === 0) log(`verify:${f.id ?? f.file}: all voters died — finding dropped unverified`)
        else if (v.length < unitVoters) log(`verify:${f.id ?? f.file} — ${v.length}/${unitVoters} voters returned`)  // E7: some voters died
        // T1.3/A1: the trace that promotes a critical/high must come from a VOTER that held it real —
        // NEVER the reviewer's own validationSteps (the accuser vouching for itself). A high-sev finding
        // that is neither confirmed nor CLEANLY refuted is SURFACED (heldUntraced), never silently dropped.
        // Quorum: a majority of REQUESTED voters must have returned, so voter attrition can't promote on one
        // survivor. unanimous additionally requires EVERY requested voter to return and hold.
        const quorumMet = v.length >= Math.ceil(unitVoters / 2)
        const holds = v.filter(x => !x.refuted).length
        const pass = quorumMet && (config.verify?.passThreshold === 'unanimous'
          ? (v.length === unitVoters && holds === v.length)
          : (holds > v.length / 2))
        const refutedGuards = v.filter(x => x.refuted && x.counterEvidence).map(x => ({ counterEvidence: x.counterEvidence, reason: x.reason }))
        const cleanlyRefuted = !pass && refutedGuards.length > 0    // majority refuted AND a guard was cited → a real near-miss
        const voterTrace = v.find(x => !x.refuted && x.reachabilityTrace && x.reachabilityTrace.trim())
        const isHighSev = ['critical', 'high'].includes(f.severity)
        const confirmed = pass && (!isHighSev || !!voterTrace)
        // every high-sev that isn't confirmed and wasn't cleanly refuted is surfaced — no high-sev silent drop
        const heldUntraced = isHighSev && !confirmed && !cleanlyRefuted
        if (voterTrace) f.reachabilityTrace = voterTrace.reachabilityTrace
        return { ...f, unit: unitKey, lens, confirmed, heldUntraced, majorityHeld: pass, refutedGuards }
      })))
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
// E5: autoInfer (default true) gates unit inference. Explicit units.list always wins.
const wantScout = (config.units?.autoInfer ?? true) && !config.units?.list?.length
if (!wantScout && !config.units?.list?.length) log('units.autoInfer is false and no units.list supplied — no units will be inferred; supply units.list to audit any unit-lens')
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
// 3. MAP — threat model: trust boundaries, data-flows, invariants, crown jewels (T2.1)
// ════════════════════════════════════════════════════════════════════════════
const mapEnabled = (config.map?.enabled ?? true) && mode !== 'quick'
let model = { trustBoundaries: [], dataFlows: [], invariants: [], crownJewels: [] }
let mapRan = false
if (!mapEnabled) {
  log(mode === 'quick'
    ? 'quick mode: Map phase SKIPPED — no threat model (boundaries/invariants absent; flagged in appendix)'
    : 'map disabled by config — no threat model (boundaries/invariants absent; flagged in appendix)')
} else {
  phase('Map')
  const mapOut = await agent(
    `Build a lightweight THREAT MODEL of this repo for the audit that follows. From the UNITS, recon ` +
    `denominators/seeds, and the rulebook docs below, identify: trustBoundaries (where a security control ` +
    `gates a connection — { id, where (a path/glob), note }); dataFlows (external/attacker-reachable ` +
    `source → sink — { source, sink, crossesBoundary }); invariants (per-unit properties that MUST hold — ` +
    `{ unit (prefer a key from UNITS), text }); and crownJewels (the highest-value assets/flows — strings). ` +
    `Read-only.\n` +
    `UNITS: ${JSON.stringify(units.map(u => ({ key: u.key, globs: u.globs, riskScore: u.riskScore })))}\n` +
    `RECON: ${JSON.stringify(Object.fromEntries(Object.entries(reconByLens).map(([l, r]) => [l, { denominators: r.denominators ?? [], seeds: (r.seeds ?? []).slice(0, 20) }])))}\n` +
    `RULES_FROM: ${JSON.stringify(rulesFromList)}`,
    { agentType: 'audit-modeler', label: 'map:model', phase: 'Map', schema: MAP_SCHEMA, ...tier('modeler') },
  )
  if (!mapOut) {
    log('audit-modeler died — empty threat model; map coverage absent (flagged in appendix)')
  } else {
    model = {
      trustBoundaries: mapOut.trustBoundaries ?? [],
      dataFlows: mapOut.dataFlows ?? [],
      invariants: mapOut.invariants ?? [],
      crownJewels: mapOut.crownJewels ?? [],
    }
    mapRan = true
    log(`map: ${model.trustBoundaries.length} trust boundar(ies), ${model.dataFlows.length} data-flow(s), ` +
        `${model.invariants.length} invariant(s), ${model.crownJewels.length} crown jewel(s)`)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 4-5. REVIEW → VERIFY  (pipeline: each finding verifies as soon as its review lands)
// ════════════════════════════════════════════════════════════════════════════
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
    // T2.1: when the Map ran, hand this unit its invariants + the boundaries whose `where`
    // glob-matches it. Security findings SHOULD cite the boundary; each invariant is checked.
    const unitInvariants = mapRan ? model.invariants.filter(i => i.unit === job.unit.key) : []
    const unitBoundaries = mapRan
      ? model.trustBoundaries.filter(b => b?.where && globMatch(b.where.replace(/^\.\//, ''), job.unit.globs))
      : []
    return agent(
      `Audit UNIT "${job.unit.key}" (globs: ${JSON.stringify(job.unit.globs)}) through the **${job.lens}** lens. ` +
      `Load the ${job.lens}-lens skill; the repo's own rules (RULEBOOK below) win on conflict. Run the lens's ` +
      `deterministic tool first for recall, then judge the candidates. Every finding needs a file:line anchor + ` +
      `the offending code quoted + a rule id + normalizedSnippet (whitespace/identifier-normalized). Classify ` +
      `context (surface/runtime/gated) BEFORE severity — severity comes from real exploitability, not raw ` +
      `pattern match. Per finding also set confidence (confirmed|likely|needs-owner-input), validationSteps ` +
      `(the read-only checks you ran), and remediationBucket (quick-win|targeted-fix|systemic-refactor|` +
      `owner-decision; owner-decision = intentional-but-not-locally-obvious — a question, not a defect). Trace ` +
      `symptom → rootCause (the underlying fault, not the symptom), name the invariant it violates, and REJECT ` +
      `a suggestedFix that only patches the symptom.\n` +
      (rules.length
        ? `RULEBOOK — return a ruleCheck for EVERY rule (violation|verified-safe|not-applicable; ` +
          `verified-safe/not-applicable need a one-line evidence citation/reason):\n${JSON.stringify(rules)}\n`
        : '') +
      (unitInvariants.length
        ? `INVARIANTS this unit must hold — check EACH; a violation is a finding (set its invariant):\n${JSON.stringify(unitInvariants)}\n`
        : '') +
      (unitBoundaries.length
        ? `TRUST BOUNDARIES gating this unit — a security finding SHOULD cite the boundary crossed (set finding.boundary):\n${JSON.stringify(unitBoundaries)}\n`
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
  // stage 2: verify each finding through the shared gate. T1.4: voter count + effort scale
  // with the unit's riskScore (docs-drift's unit has no riskScore → 0.5 → base voters).
  (review, job) => {
    const rr = config.riskRouting ?? {}
    const base = config.verify?.voters ?? 3
    const score = job.unit.riskScore ?? 0.5
    let unitVoters = base
    if ((rr.enabled ?? true)) {
      if (score >= (rr.highThreshold ?? 0.7)) unitVoters = base + (rr.highVotersDelta ?? 2)
      else if (score <= (rr.lowThreshold ?? 0.4)) unitVoters = Math.max(1, base + (rr.lowVotersDelta ?? -1))
    }
    // keep the voter count ODD so "majority" is well-defined — an even count would silently
    // demand unanimity (2 of 2), the opposite of the routing intent, and drop real findings.
    if (unitVoters % 2 === 0) unitVoters = Math.max(1, unitVoters - 1)
    const effortBump = ((rr.enabled ?? true) && score >= (rr.highThreshold ?? 0.7) && !config.models?.verifier?.effort)
      ? { effort: 'high' } : {}
    log(`risk-routing ${job.unit.key}:${job.lens} — riskScore ${score} → ${unitVoters} voter(s)${effortBump.effort ? ', effort high' : ''}`)
    return verifyFindings(review?.findings ?? [], job.unit.key, job.lens, unitVoters, effortBump)
      .then(verified => ({
        unit: job.unit.key, lens: job.lens,
        findings: verified.filter(Boolean),
        ruleChecks: review?.ruleChecks ?? [],
        safeControlChecks: review?.safeControlChecks ?? [],
        coverage: review?.coverage ?? null,
      }))
  },
)

// ════════════════════════════════════════════════════════════════════════════
// 6. RECONCILE — plain code (dedup + baseline + rule closure + coverage + positive controls)
// ════════════════════════════════════════════════════════════════════════════
const results = reviewed.filter(Boolean)
const allVerified = results.flatMap(r => r.findings)
const confirmed = allVerified.filter(f => f.confirmed)
const deduped = dedupeByFingerprint(confirmed)
let fresh = deduped.filter(f => !baseline.has(fingerprint(f)))
log(`${fresh.length} new confirmed finding(s) (${deduped.length - fresh.length} suppressed by baseline, ` +
    `${confirmed.length - deduped.length} duplicate(s) merged)`)

// severityFloor (E4) is applied AFTER the Variant merge (below) so reviewer- and variant-found
// findings are floored consistently, and so highs still seed the Variant hunt under a 'critical' floor.
const sevRank = { critical: 4, high: 3, medium: 2, low: 1 }

// near-misses, positive controls, coverage totals, and held-untraced are harvested AFTER the
// Variant phase (E3) so refuted/near-miss/PC evidence from variant candidates is not lost.

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

// ════════════════════════════════════════════════════════════════════════════
// 7. VARIANT — sibling hunt on confirmed critical/high (T1.1, Project Zero variant analysis)
// ════════════════════════════════════════════════════════════════════════════
const variantEnabled = (config.variant?.enabled ?? true) && mode !== 'quick'
let variantsConfirmed = 0
let variantRan = false                                        // E3: true only if the phase processed ≥1 seed
if (!variantEnabled) {
  log(mode === 'quick'
    ? 'quick mode: Variant phase SKIPPED — no sibling hunt (flagged in appendix)'
    : 'variant disabled by config — no sibling hunt (flagged in appendix)')
} else {
  const maxSeeds = config.variant?.maxSeeds ?? 8
  const maxPerSeed = config.variant?.maxPerSeed ?? 20
  // E3: sort by severity (critical before high) BEFORE slicing, so a critical is never cut for a high.
  const seeds = fresh.filter(f => ['critical', 'high'].includes(f.severity))
    .sort((a, b) => (sevRank[b.severity] ?? 0) - (sevRank[a.severity] ?? 0))
    .slice(0, maxSeeds)
  if (!seeds.length) {
    log('Variant phase: no confirmed critical/high findings to seed from — sibling hunt skipped')
  } else {
    variantRan = true
    phase('Variant')
    log(`Variant phase: hunting siblings of ${seeds.length} confirmed critical/high finding(s)`)
    const variantOut = await parallel(seeds.map(seed => () => agent(
      `Here is a CONFIRMED bug pattern. Find its SIBLINGS across the repo — the same mistake elsewhere ` +
      `(Project Zero variant analysis). Run ` + '`${CLAUDE_PLUGIN_ROOT}/tools/variant-sweep.sh`' + ` for recall, ` +
      `then judge each candidate against the ACTUAL code. Cap at ${maxPerSeed} siblings. Return candidate ` +
      `findings (same REVIEW_SCHEMA — file:line anchor + quoted code + rule id + normalizedSnippet + rootCause ` +
      `+ invariant).\n` +
      `CONFIRMED PATTERN: ${JSON.stringify({ title: seed.title, file: seed.file, line: seed.line, rule: seed.rule, severity: seed.severity, snippet: seed.snippet, rootCause: seed.rootCause, invariant: seed.invariant })}`,
      { agentType: 'audit-reviewer', label: `variant:${seed.file}`, phase: 'Variant', schema: REVIEW_SCHEMA, ...tier('reviewer') },
    )))
    const candidates = variantOut
      .flatMap(out => (out?.findings ?? []).slice(0, maxPerSeed))
    // re-verify through the SAME gate (base voters — the sibling's home unit isn't known here),
    // then dedup + baseline-suppress + drop anything already in `fresh`.
    const verifiedVariants = await verifyFindings(candidates, 'variant', 'variant', config.verify?.voters ?? 3)
    const confirmedVariants = dedupeByFingerprint(verifiedVariants.filter(Boolean).filter(f => f.confirmed))
      .filter(f => !baseline.has(fingerprint(f)))
      .filter(f => !fresh.some(x => fingerprint(x) === fingerprint(f)))
    variantsConfirmed = confirmedVariants.length
    // E3: merge EVERY verified variant into allVerified (so its refuted near-miss/PC/heldUntraced
    // evidence survives the harvest below), the confirmed ones into fresh; then re-dedupe fresh.
    allVerified.push(...verifiedVariants.filter(Boolean))
    fresh.push(...confirmedVariants)
    fresh = dedupeByFingerprint(fresh)
    log(`${variantsConfirmed} variant(s) confirmed from ${seeds.length} seed(s)`)
  }
}

// E4: severityFloor — applied ONCE, after the Variant merge, so variant siblings can't bypass it.
const floorRank = sevRank[config.severityFloor] ?? 1
const preFloor = fresh.length
fresh = fresh.filter(f => (sevRank[f.severity] ?? 1) >= floorRank)
if (preFloor - fresh.length) log(`severityFloor '${config.severityFloor ?? 'low'}': ${preFloor - fresh.length} finding(s) below floor dropped`)

// ── harvest AFTER the Variant merge (E3) — nearMisses / heldUntraced / positive controls / coverage ──
// heldUntraced (E2): majority-held critical/high with NO independent voter trace — surfaced, never dropped.
const freshFps = new Set(fresh.map(fingerprint))
const heldUntraced = dedupeByFingerprint(allVerified.filter(f => f.heldUntraced))
  .filter(f => !baseline.has(fingerprint(f)))
  .filter(f => !freshFps.has(fingerprint(f)))   // a fingerprint confirmed by one panel is NOT also "awaiting a trace"
if (heldUntraced.length) log(`${heldUntraced.length} finding(s) awaiting an independent reachability trace / clean refutation — surfaced for owner review`)

// near-misses (T2.2): majority-REFUTED critical/high whose counter-evidence tells the coverage story —
// "probed X, held because Y". A majority-HELD-but-untraced finding is heldUntraced, NOT a near-miss.
const nearMisses = dedupeByFingerprint(allVerified
  .filter(f => !f.confirmed && f.majorityHeld === false && ['critical', 'high'].includes(f.severity) && f.refutedGuards?.length))
  .map(f => ({ file: f.file, severity: f.severity, title: f.title, guard: f.refutedGuards[0].counterEvidence }))

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
// 8. SYNTHESIZE — the report + remediation waves
// ════════════════════════════════════════════════════════════════════════════
phase('Synthesize')
// E2: only a truly clean run short-circuits — a majority-held-but-untraced finding is NOT clean,
// it still needs an owner-review report so it is never silently gone.
if (!fresh.length && !heldUntraced.length) {
  log('No new confirmed findings. Clean run. 🎉')
  return {
    report: null, fresh: [],
    units: { source: unitSource, lowConfidence },
    skipped: mode === 'quick',
    coverage: coverageSummary,
    positiveControls: positiveControls.length,
    heldUntraced: 0,
    map: { ran: mapRan, trustBoundaries: model.trustBoundaries.length, invariants: model.invariants.length },
    variants: variantsConfirmed,
  }
}
const runMeta = {
  unitSource, lowConfidence, mode,
  reconRan: reconEnabled,
  reconMissing: reconEnabled ? lenses.filter(l => !reconByLens[l]) : lenses,
  rulebookMissing: !rulebookOut,                 // extraction died — matrix empty for THAT reason
  rulebookSize: rulebook.length,
  mapRan,                                        // Map phase produced a threat model (else empty/flagged)
  variantRan,                                    // E3: true ONLY if the phase actually processed ≥1 seed
  heldUntracedCount: heldUntraced.length,        // E2: majority-held findings awaiting an independent trace
  crownJewels: model.crownJewels,
}
// E2: majority-held-but-untraced findings, surfaced for owner review (never silently dropped)
const publicHeldUntraced = heldUntraced.map(f => ({ file: f.file, severity: f.severity, title: f.title, rule: f.rule }))
// engine-internal fields stay out of the synthesizer's context (confirmed is always true here;
// refutedGuards were already harvested into positive controls above)
const publicFresh = fresh.map(({ refutedGuards, confirmed, ...rest }) => rest)
const report = await agent(
  `Write the audit report from these CONFIRMED, fresh findings. Load the audit-report-format skill for the ` +
  `AUDIT-<date>.md contract. Bucket by severity (critical/high/medium/low), each with file:line + why-it's-real ` +
  `(it survived adversarial verification) + a concrete fix + its confidence/bucket/context/validation fields. ` +
  `Each finding also carries (when present) rootCause, invariant, boundary, and reachabilityTrace — render them. ` +
  `Render a Coverage summary (per denominator: examined X of N + the verbatim command; where X < N say ` +
  `"sampled" and give the risk-weighting rationale), a Coverage matrix (EVERY rulebook rule → finding IDs | ` +
  `verified-safe + citation | not-applicable + reason | NOT CHECKED — no rule silently absent), a Coverage ` +
  `narrative (positive assurance from NEAR_MISSES + CROWN_JEWELS + COVERAGE_TOTALS: per area, what was probed, ` +
  `why clean areas held, and near-misses chased to ground), and a Positive controls (INFO) section (each: ` +
  `citation + what it protects + why it shipped). counts.info = positive-control count. When HELD_UNTRACED is ` +
  `non-empty, render a distinct "Majority-held, awaiting an independent reachability trace (needs owner review)" ` +
  `subsection listing each (file, severity, title, rule) — these held the majority vote but no VOTER supplied an ` +
  `independent trace; surface them for owner review, do NOT drop them and do NOT treat them as confirmed. Group fixes into ` +
  `ordered remediation WAVES consumable by /cklph-os:flow — quick-wins first within a severity band; ` +
  `owner-decision items go in their own "Owner decisions" subsection (questions, not work). Flag in an ` +
  `appendix: unit derivation, low-confidence units, quick-mode sampling, whether the Map + Variant phases ran ` +
  `(and why not, if skipped), and recon gaps (RUN_META — state plainly which denominators/seeds/phases are ` +
  `absent/partial and why).\n\n` +
  `FINDINGS:\n${JSON.stringify(publicFresh, null, 2)}\n\n` +
  `RULE_CLOSURE:\n${JSON.stringify(ruleClosure, null, 2)}\n\n` +
  `COVERAGE_TOTALS:\n${JSON.stringify(coverageTotals, null, 2)}\n\n` +
  `NEAR_MISSES:\n${JSON.stringify(nearMisses, null, 2)}\n\n` +
  `HELD_UNTRACED:\n${JSON.stringify(publicHeldUntraced, null, 2)}\n\n` +
  `CROWN_JEWELS:\n${JSON.stringify(model.crownJewels, null, 2)}\n\n` +
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
  heldUntraced: heldUntraced.length,
  map: { ran: mapRan, trustBoundaries: model.trustBoundaries.length, invariants: model.invariants.length },
  variants: variantsConfirmed,
}
