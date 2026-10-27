// cklph-audit — the deterministic engine (v4: comprehensive security suite).
//
// Invoked by the /cklph-audit:run skill via the Workflow tool. Eleven-phase pipeline
// (Discover → Recon → Map → Review → Verify → DAST → Reconcile → Variant → Patch →
//  Synthesize → SelfReview; Map + Variant + DAST + Patch + SelfReview are opt-in
//  or skip in quick mode and degrade gracefully):
//   1. DISCOVER  — parallel: scout infers units (escalates to audit-unit-mapper
//                  when low-confidence; explicit config wins) + rulebook
//                  extraction (rulesFrom docs → discrete rules). Vulnerability-feed
//                  freshness is NOT checked by the engine: the user runs
//                  /cklph-audit:refresh-feeds (feed-status.sh); RUN_META says so.
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
//                  coverage. docs-drift, agent-config + compliance are NOT crossed
//                  with units: exactly ONE job each (compliance runs post-reconcile).
//   5. VERIFY    — audit-verifier refutes each finding from COMMENT-STRIPPED code
//                  (default-refuted). Evidence, not vote tally, arbits (T1.3):
//                  low/medium promote on majority, critical/high require a
//                  reachabilityTrace. Depth risk-routed per unit (T1.4). Pipelined.
//   6. DAST      — opt-in (dast.enabled): audit-dast-runner boots the app, runs
//                  ZAP/Nuclei/ffuf, collects runtime findings → re-enter verify.
//                  Then audit-exploit-verifier generates PoC exploits for confirmed
//                  critical/high, runs them in an isolated sandbox (CodeMender core).
//                  Skips by default (breaks read-only); off in quick.
//   7. RECONCILE — plain code: dedup + accepted-baseline suppression + rule-
//                  closure matrix (every rule accounted for, unchecked shown)
//                  + coverage totals + near-misses + noise-gated positive controls.
//   8. VARIANT   — for each confirmed critical/high, an audit-reviewer hunts
//                  SIBLINGS repo-wide (T1.1, Project Zero variant analysis);
//                  candidates re-verify through the SAME gate. Skips in quick.
//   9. PATCH     — opt-in (patch.enabled, auto-on when DAST is on): audit-patcher
//                  generates patches addressing root cause, applies in sandbox
//                  worktree, runs tests, re-runs exploit (must fail), LLM-as-judge.
//                  Skips by default; off in quick.
//  10. SYNTHESIZE— audit-synthesizer writes AUDIT-<date>.md: severities, coverage
//                  summary + matrix + compliance matrix + narrative, DAST/exploit/
//                  patch evidence, positive controls (INFO), waves. Compliance lens
//                  runs here as a single post-reconcile mapping job.
//  11. SELFREVIEW— adversarial self-review of the written report: ONE audit-reviewer
//                  pass re-reads it for gaps, missed areas, under-explored crown
//                  jewels. The engine appends a "## Self-review" section (gaps, or
//                  why it did not run) and sets phases.self_review in the front-
//                  matter. Gaps are NOT re-scanned (no re-scan exists yet), so
//                  they are reported as open coverage gaps. Default true in full;
//                  off in quick.
//
// args = { lenses:string[], path?, mode:"full"|"quick", deepUnits?:bool,
//          config:object, baseline:{fingerprints:string[]} }
// Read-only by default: no agent writes application code. DAST/Exploit/Patch are
// opt-in and sandboxed. Only the report + baseline are written, by the command,
// after this returns.

export const meta = {
  name: 'cklph-audit',
  description: 'Comprehensive, adversarially-verified, agentic whole-repo security suite',
  phases: [
    { title: 'Discover' },
    { title: 'Recon' },
    { title: 'Map' },
    { title: 'Review' },
    { title: 'Verify' },
    { title: 'DAST' },
    { title: 'Variant' },
    { title: 'Patch' },
    { title: 'Synthesize' },
    { title: 'SelfReview' },
  ],
}

const lenses = args?.lenses ?? ['security', 'correctness', 'architecture']
const config = args?.config ?? {}
const baseline = new Set((args?.baseline?.fingerprints) ?? [])
const mode = args?.mode ?? 'full'
const rulesFromList = config.rulesFrom ?? ['CLAUDE.md', 'AGENTS.md']
// agent-config lens: the repo's AI-tooling layer (MCP configs, Claude/agent settings, hooks,
// instruction docs, skills, agent definitions). One job over these globs, never crossed with units.
// Hook globs are anchored to agent tooling (.claude/hooks, plugin hooks) — a bare '**/hooks/**'
// would sweep app code such as src/hooks/useAuth.ts into this lens.
const agentConfigGlobsBase = config.agentConfig?.globs ?? [
  '**/.mcp.json', '**/mcp.json', '**/.claude/**', '**/.cursor/**', '**/.vscode/mcp.json',
  '**/hooks/hooks.json', '**/.claude/hooks/**', '**/plugins/*/hooks/**', '**/.claude-plugin/*.json',
  '**/CLAUDE.md', '**/AGENTS.md', '**/skills/**/SKILL.md', '**/agents/*.md',
]
// honor args.path the way recon/unit inference do: scope the AI-tooling globs under it.
// Normalize first: strip leading './' and trailing '/'; '.', './' and '' mean the whole repo.
const scopePath = (() => {
  const p = String(args?.path ?? '').trim().replace(/^(\.\/)+/, '').replace(/\/+$/, '')
  return p === '.' ? '' : p
})()
// Scoped to a plugin dir itself (…/plugins/<name>): '**/plugins/*/hooks/**' needs a plugins/
// segment UNDER the scope, so the plugin's own hooks/ would drop out. Add it back — only for a
// plugin-shaped scope, so scoping to e.g. 'src' never sweeps src/hooks/useAuth.ts in.
const agentConfigGlobs = scopePath
  ? [
      ...agentConfigGlobsBase.map(g => `${scopePath}/${g}`),
      ...(!config.agentConfig?.globs && /(^|\/)plugins\/[^/]+$/.test(scopePath) ? [`${scopePath}/hooks/**`] : []),
    ]
  : agentConfigGlobsBase
const inScope = f => !scopePath || f === scopePath || f.startsWith(scopePath + '/')

// vulnIntel: auto-detect MCP tools (cve-mcp, vuln-intel-ext) when available.
// 'auto' (default) or true = the SCA reviewer uses them if present and falls back to local tools
// if not (the engine cannot see the MCP tool list, so true does not make them mandatory).
// false = skip MCP entirely. YAML `enabled: false` parses to the boolean false, so normalize to a
// string first — comparing the raw value against 'false' never matched the boolean.
const vulnIntelMode = String(config.vulnIntel?.enabled ?? 'auto').toLowerCase()
const vulnIntelEnabled = vulnIntelMode !== 'false'

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
          lensHint: { type: 'string', enum: ['security', 'correctness', 'architecture', 'docs-drift', 'sca', 'iac', 'container', 'k8s', 'supply-chain', 'compliance', 'concurrency', 'state-machine', 'economic', 'omission', 'agent-config', 'any'] },
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

// ── v4 schemas: DAST, exploit, patch, compliance, self-review, feed freshness ─
const DAST_SCHEMA = {                              // audit-dast-runner output
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'severity', 'rule'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },               // the route/endpoint if no file
          line: { type: 'number' },
          snippet: { type: 'string' },            // request/response evidence
          rule: { type: 'string' },
          rationale: { type: 'string' },
          suggestedFix: { type: 'string' },
          source: { type: 'string', enum: ['dast', 'reasoning'] },
          url: { type: 'string' },
          method: { type: 'string' },
          param: { type: 'string' },
          evidence: { type: 'string' },           // raw request/response
          confidence: { type: 'string', enum: ['confirmed', 'likely', 'needs-owner-input'] },
          context: {
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
  },
}

const EXPLOIT_SCHEMA = {                           // audit-exploit-verifier output
  type: 'object',
  properties: {
    exploits: {
      type: 'array',
      items: {
        type: 'object',
        required: ['findingId', 'confirmed'],
        properties: {
          findingId: { type: 'string' },
          exploitScript: { type: 'string' },      // the PoC script for the report
          exploitResult: { type: 'string' },      // stdout from the sandbox run
          confirmed: { type: 'boolean' },          // did the PoC succeed?
          confidence: { type: 'string', enum: ['confirmed-exploitable', 'likely', 'refuted'] },
        },
      },
    },
  },
}

const PATCH_SCHEMA = {                             // audit-patcher output
  type: 'object',
  properties: {
    patches: {
      type: 'array',
      items: {
        type: 'object',
        required: ['findingId', 'status'],
        properties: {
          findingId: { type: 'string' },
          status: { type: 'string', enum: ['patched', 'patch-unverified', 'patch-failed'] },
          patch: { type: 'string' },              // unified diff
          patchFiles: { type: 'array', items: { type: 'string' } },
          testsPassed: { type: 'boolean' },
          exploitClosed: { type: 'boolean' },     // re-run exploit failed? null if no exploit
          judgeVerdict: {
            type: 'object',
            properties: {
              addressesRootCause: { type: 'boolean' },
              introducesNewIssues: { type: 'boolean' },
              complete: { type: 'boolean' },
              idiomatic: { type: 'boolean' },
              notes: { type: 'string' },
            },
          },
          iterations: { type: 'number' },
        },
      },
    },
  },
}

const COMPLIANCE_SCHEMA = {                        // compliance-lens output (single post-reconcile job)
  type: 'object',
  properties: {
    complianceMatrix: {
      type: 'array',
      items: {
        type: 'object',
        required: ['framework', 'control', 'status'],
        properties: {
          framework: { type: 'string', enum: ['soc2', 'casa', 'hipaa'] },
          control: { type: 'string' },             // e.g. "soc2:CC6.1"
          status: { type: 'string', enum: ['met', 'violation', 'not-applicable', 'not-checked'] },
          findingIds: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

const SELF_REVIEW_SCHEMA = {                       // adversarial self-review output
  type: 'object',
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['area', 'whatWasMissed'],
        properties: {
          area: { type: 'string' },               // e.g. "auth unit × security lens"
          whatWasMissed: { type: 'string' },       // what the self-reviewer found missing
        },
      },
    },
    overallAssessment: { type: 'string' },         // the self-reviewer's verdict
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
const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 }

// A5b: verifier fan-out cap. Verify is the DOMINANT, findings-UNBOUNDED term — on a large repo
// Σfindings×voters (+ variant candidates×voters) is the part most likely to blow the Workflow runtime's
// 1000-agent lifetime cap. This bounds the verify term; it does NOT bound total agents (review fan-out
// is units×lenses, bounded by unit count; recon/map/synth are small). Overflow findings are DEFERRED
// (unverified) and SURFACED in the report, never silently dropped. Main pipeline + Variant share the
// counter. Default 400 leaves ~600 for everything else — tune down if a huge unit set still nears 1000.
const maxVerifierAgents = config.verify?.maxVerifierAgents ?? 400
let verifierSpawns = 0

// A5: the verify fan-out, factored out so the main pipeline AND the Variant phase share it.
// N default-refuted voters try to REFUTE each finding; evidence (not tally) promotes (T1.3):
//   low/medium keep the majority rule; critical/high require a reachabilityTrace.
// Voters are independent parallel calls — no within-prompt position bias to randomize.
function verifyFindings(findings, unitKey, lens, unitVoters, extraOpts = {}) {
  // Verify critical/high first WITHIN this call so they claim the budget before low/medium here.
  // NOTE: this is per-call priority only — across units (reviews land in pipeline order) and across
  // phases (main runs before Variant), a low in an early unit can spend budget a later critical then
  // can't get. Deferred findings are always SURFACED, so this is a priority/quality limitation, not
  // data loss. A globally severity-ordered budget pass would need a barrier (collect all findings
  // first) — deferred to a future rev; for now the cap's job is to not abort the run.
  const ordered = [...(findings ?? [])].sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0))
  return parallel(ordered.map(f => () => {
    // A5b: reserve budget. SYNC-CRITICAL — there must be NO `await` between this check and the
    // `verifierSpawns += unitVoters` increment below, or concurrent verifyFindings calls could both
    // pass the check and over-spend the cap. Keep this thunk prefix synchronous.
    if (verifierSpawns + unitVoters > maxVerifierAgents) {
      return Promise.resolve({ ...f, unit: unitKey, lens, confirmed: false, heldUntraced: false, deferredUnverified: true, majorityHeld: false, refutedGuards: [],
        // preserve pedigree: a deferred variant sibling of a confirmed critical is a high-prior lead
        deferredNote: unitKey === 'variant' ? 'sibling of a confirmed critical/high (Variant phase) — deferred, verify next run' : undefined })
    }
    verifierSpawns += unitVoters
    return parallel(Array.from({ length: unitVoters }, (_v, i) => () =>
      agent(
        `Adversarially try to REFUTE this audit finding against the ACTUAL code. Re-derive from the code ` +
        `ALONE — the snippet below is comment-stripped; ignore comments/labels. Default to refuted:true ` +
        `unless the code proves it real. Hunt for the guard/mitigation the reviewer missed (middleware, ` +
        `RLS, validation, an upstream caller, an existing test, a documented/accepted exception). To ` +
        `REFUTE, cite the guard file:line in counterEvidence. To CONFIRM a critical/high you MUST supply a ` +
        `reachabilityTrace (attacker-controlled input → sink, or the invariant-violation path) — ` +
        `"plausible" without a trace = refuted. Voter ${i + 1}/${unitVoters}.\n` +
        `FINDING: ${JSON.stringify({ title: f.title, file: f.file, line: f.line, rule: f.rule, severity: f.severity, snippet: stripComments(f.snippet), rationale: f.rationale })}`,
        { agentType: 'cklph-audit:audit-verifier', label: `verify:${f.id ?? f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA, ...tier('verifier'), ...extraOpts },
      )))
      .then(votes => {
        const v = votes.filter(Boolean)
        const highSev = ['critical', 'high'].includes(f.severity)
        if (v.length === 0) log(`verify:${f.id ?? f.file}: all voters died — ${highSev ? 'critical/high surfaced as held (no quorum) for owner review' : 'finding dropped unverified'}`)
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
        const isHighSev = highSev
        const confirmed = pass && (!isHighSev || !!voterTrace)
        // every high-sev that isn't confirmed and wasn't cleanly refuted is surfaced — no high-sev silent drop.
        // NOT all of these held the majority: heldReason says which case it is, so the report never
        // calls a majority-REFUTED or no-quorum finding "majority-held".
        const heldUntraced = isHighSev && !confirmed && !cleanlyRefuted
        const heldReason = !heldUntraced ? undefined
          : !quorumMet ? 'no-quorum'                      // too few voters returned (incl. all died)
          : pass ? 'majority-held-no-trace'               // held by the majority, no voter supplied a trace
          : 'refuted-without-guard'                       // majority refuted, but no voter cited a guard
        if (voterTrace) f.reachabilityTrace = voterTrace.reachabilityTrace
        return { ...f, unit: unitKey, lens, confirmed, heldUntraced, ...(heldReason ? { heldReason } : {}), majorityHeld: pass, refutedGuards }
      })
  }))
}

// ════════════════════════════════════════════════════════════════════════════
// 1. DISCOVER + RECON — units, rulebook, and per-lens recon, all in parallel
// ════════════════════════════════════════════════════════════════════════════
phase('Discover')
if (vulnIntelEnabled && lenses.includes('sca')) {
  log(`vulnIntel: ${vulnIntelMode} — SCA lens will attempt MCP enrichment (cve-mcp/vuln-intel-ext) if available`)
}
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
    { agentType: 'cklph-audit:audit-scout', label: 'discover:scout', schema: PLAN_SCHEMA, ...tier('scout') },
  )] : []),
  () => agent(
    `Extract this repo's RULEBOOK: parse ${JSON.stringify(rulesFromList)} into discrete rules ` +
    `(skip files that don't exist). Each rule: stable slug id (e.g. "agents-md:rule-3"), source ` +
    `file:line, text (verbatim or tight paraphrase), lensHint ` +
    `(security|correctness|architecture|docs-drift|agent-config|any). Split compound rules; skip prose that ` +
    `isn't a rule. Read-only.`,
    { agentType: 'cklph-audit:audit-recon', label: 'discover:rulebook', schema: RULEBOOK_SCHEMA, ...tier('rulebook') },
  ),
  ...(reconEnabled ? lenses.filter(l => l !== 'compliance').map(lens => () => agent(
    `RECON the **${lens}** lens's concern surface across the whole scoped repo.` +
    `${args?.path ? ` Scope to: ${args.path}.` : ''} Mechanically enumerate — return: denominators ` +
    `(pattern + re-runnable command VERBATIM + honest count), seeds (cited file:line leads worth a ` +
    `reviewer's attention — hints, NOT findings), and safeControls (verified-good reference ` +
    `patterns: file:line + what they protect). Honor ignore globs: ${JSON.stringify(config.ignore ?? [])}. Read-only.` +
    (lens === 'docs-drift'
      ? ` The rulebook docs to recon are: ${JSON.stringify(rulesFromList)} — enumerate THEIR references (paths, scripts, packages), not the whole repo.`
      : lens === 'agent-config'
        ? ` Recon the AI-tooling layer only: ${JSON.stringify(agentConfigGlobs)} plus LLM/agent runtime call sites. STATIC ONLY — read config as text, never execute a discovered MCP server, hook, or package runner, never resolve a package over the network.`
        : ''),
    { agentType: 'cklph-audit:audit-recon', label: `recon:${lens}`, phase: 'Recon', schema: RECON_SCHEMA, ...tier('recon') },
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
  const reconLenses = lenses.filter(l => l !== 'compliance')   // compliance skips recon (post-reconcile mapping)
  reconLenses.forEach((lens, i) => {
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
      { agentType: 'cklph-audit:audit-unit-mapper', label: 'discover:deep-map', schema: PLAN_SCHEMA, ...tier('unitMapper') },
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

// work-list = every (unit × lens) pair. docs-drift, agent-config + compliance are NOT crossed
// with units — docs-drift is exactly ONE job over the rulesFrom docs (M5); agent-config is exactly
// ONE job over the AI-tooling globs; compliance is a post-reconcile mapping job that runs AFTER all
// other findings are confirmed (it maps them to SOC 2/CASA/HIPAA).
const SPECIAL_LENS = new Set(['docs-drift', 'agent-config', 'compliance'])
const unitLenses = lenses.filter(l => !SPECIAL_LENS.has(l))
if (units.length === 0 && unitLenses.length > 0) {
  log(`WARNING: no units — ${unitLenses.join(', ')} lens(es) have nothing to review; ` +
      `run degrades to ${lenses.filter(l => SPECIAL_LENS.has(l)).join(', ') || 'an empty report'}`)
}
const jobs = units.flatMap(u => unitLenses.map(lens => ({ unit: u, lens })))
if (lenses.includes('docs-drift')) {
  jobs.push({ unit: { key: 'docs', title: 'Repo rulebook docs', globs: rulesFromList, confidence: 1 }, lens: 'docs-drift' })
}
if (lenses.includes('agent-config')) {
  jobs.push({ unit: { key: 'agent-config', title: 'AI tooling layer (MCP, settings, hooks, instructions)', globs: agentConfigGlobs, confidence: 1 }, lens: 'agent-config' })
}
const hasCompliance = lenses.includes('compliance')
log(`${units.length} unit(s) [${unitSource}${lowConfidence.length ? `, ${lowConfidence.length} low-confidence flagged: ${lowConfidence.join(', ')}` : ''}] × ${unitLenses.length} lens(es)` +
    `${lenses.includes('docs-drift') ? ' + 1 docs-drift job' : ''}${lenses.includes('agent-config') ? ' + 1 agent-config job' : ''}${hasCompliance ? ' + 1 compliance mapping job (post-reconcile)' : ''}`)

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
    { agentType: 'cklph-audit:audit-modeler', label: 'map:model', phase: 'Map', schema: MAP_SCHEMA, ...tier('modeler') },
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
    // agent-config recon is already scoped to the AI-tooling layer, and it deliberately cites
    // files OUTSIDE the config globs (LLM/agent runtime call sites in app code, scripts a hook
    // runs). Filtering by the config globs would drop exactly those — keep them, but still
    // honor args.path so out-of-scope files never reach the reviewer.
    const keep = job.lens === 'agent-config'
      ? s => { const nf = s?.file?.replace(/^\.\//, ''); return !!nf && inScope(nf) }
      : inUnit
    const seeds = (recon?.seeds ?? []).filter(keep)
    const safeControls = (recon?.safeControls ?? []).filter(keep)
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
      (job.lens === 'sca' && vulnIntelEnabled
        ? `VULN_INTEL_MCP: cve-mcp and/or vuln-intel-ext MCP tools MAY be available. ` +
          `If they are, use them to enrich findings: call diff_since for delta CVEs since last scan, ` +
          `cve_enrich for EPSS/KEV/exploit-availability, cve_prioritize for risk ranking. ` +
          `If the MCP tools are not available, proceed with local tools only. ` +
          `See the sca-lens skill MCP section for details.\n`
        : '') +
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
      { agentType: 'cklph-audit:audit-reviewer', label: `review:${job.unit.key}:${job.lens}`, phase: 'Review', schema: REVIEW_SCHEMA, ...tier('reviewer') },
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
// 5b. DAST — opt-in dynamic testing + exploit verification (CodeMender core)
// ════════════════════════════════════════════════════════════════════════════
const dastEnabled = (config.dast?.enabled ?? false) && mode !== 'quick'
let dastRan = false
let dastFindings = []
let exploitResults = []
if (!dastEnabled) {
  if (config.dast?.enabled === true && mode === 'quick') {
    log('quick mode: DAST phase SKIPPED — no dynamic testing (flagged in appendix)')
  } else if (!config.dast?.enabled) {
    // default — don't log, it's off by design
  }
} else {
  phase('DAST')
  // 5b.1: boot the app + run ZAP/Nuclei/ffuf → collect runtime findings
  const dastOut = await agent(
    `DYNAMIC TESTING: boot the app and attack it from the outside. Run ` +
    '`${CLAUDE_PLUGIN_ROOT}/tools/dast.sh`' + ` to boot Docker Compose (or use the provided target URL), ` +
    `then run ZAP/Nuclei/ffuf. Beyond the tools, craft LLM-driven attacks based on the threat model: ` +
    `IDOR, auth bypass, mass assignment, rate limit, business logic abuse. Collect findings in the same ` +
    `FINDINGS_SCHEMA (source: "dast"). Prioritize high-value endpoints from the threat model. ` +
    `NEVER attack external/production services.\n` +
    `UNITS: ${JSON.stringify(units.map(u => ({ key: u.key, globs: u.globs })))}\n` +
    `MAP: ${JSON.stringify({ crownJewels: model.crownJewels, dataFlows: model.dataFlows, trustBoundaries: model.trustBoundaries })}\n` +
    `CONFIRMED_STATIC_FINDINGS: ${JSON.stringify(reviewed.filter(Boolean).flatMap(r => r.findings.filter(f => f.confirmed).map(f => ({ id: f.id, title: f.title, severity: f.severity, file: f.file, rule: f.rule }))))}\n` +
    `CONFIG: ${JSON.stringify(config.dast ?? {})}`,
    { agentType: 'cklph-audit:audit-dast-runner', label: 'dast:run', phase: 'DAST', schema: DAST_SCHEMA, ...tier('reviewer') },
  )
  if (!dastOut) {
    log('audit-dast-runner died — no dynamic findings (flagged in appendix)')
  } else {
    dastRan = true
    dastFindings = dastOut.findings ?? []
    log(`DAST: ${dastFindings.length} runtime finding(s) from dynamic testing`)
    // 5b.2: verify DAST findings through the same adversarial gate
    if (dastFindings.length) {
      const verifiedDast = await verifyFindings(dastFindings, 'dast', 'dast', config.verify?.voters ?? 3)
      const confirmedDast = verifiedDast.filter(Boolean).filter(f => f.confirmed)
      // merge confirmed DAST findings into the main results for Reconcile
      reviewed.push({ unit: 'dast', lens: 'dast', findings: verifiedDast.filter(Boolean), ruleChecks: [], safeControlChecks: [], coverage: null })
      log(`DAST verify: ${confirmedDast.length} confirmed runtime finding(s)`)
    }
    // 5b.3: exploit verification — generate + run PoC for confirmed critical/high with traces
    if (config.dast?.exploitVerify !== false) {
      const staticConfirmed = reviewed.filter(Boolean)
        .flatMap(r => r.findings.filter(f => f.confirmed && ['critical', 'high'].includes(f.severity) && f.reachabilityTrace))
      if (staticConfirmed.length) {
        log(`exploit verification: generating PoC for ${staticConfirmed.length} confirmed critical/high finding(s)`)
        const exploitOut = await agent(
          `EXPLOIT VERIFICATION: for each confirmed critical/high finding with a reachability trace, generate a PoC ` +
          `exploit script, run it in an isolated sandbox, and confirm exploitability. Use ` +
          '`${CLAUDE_PLUGIN_ROOT}/tools/exploit-runner.sh`' + ` to run each PoC. A finding is only ` +
          `"confirmed-exploitable" if the PoC succeeds. NEVER run exploits against external/production services.\n` +
          `CONFIRMED_FINDINGS: ${JSON.stringify(staticConfirmed.map(f => ({ id: f.id, title: f.title, severity: f.severity, file: f.file, reachabilityTrace: f.reachabilityTrace })))}\n` +
          `CONFIG: ${JSON.stringify(config.dast ?? {})}`,
          { agentType: 'cklph-audit:audit-exploit-verifier', label: 'dast:exploit', phase: 'DAST', schema: EXPLOIT_SCHEMA, ...tier('verifier') },
        )
        if (exploitOut) {
          exploitResults = exploitOut.exploits ?? []
          log(`exploit verification: ${exploitResults.filter(e => e.confirmed).length} confirmed-exploitable, ` +
              `${exploitResults.filter(e => !e.confirmed).length} likely (static only)`)
        } else {
          log('audit-exploit-verifier died — no exploit results (flagged in appendix)')
        }
      } else {
        log('exploit verification: no confirmed critical/high findings with reachability traces to exploit')
      }
    }
  }
}

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

// rule closure is computed AFTER the Variant merge + heldUntraced (§7.5 below) so a 'violation'
// can only cite findings that actually SURVIVED verification — ruleChecks come from the reviewer
// (pre-verify), so a violation it claimed may have been refuted or held downstream. Aggregating the
// checks is cheap and order-independent, so do it here; fold it into statuses later.
const checksByRule = new Map()
for (const c of results.flatMap(r => r.ruleChecks)) {
  if (!c?.ruleId) continue
  if (!checksByRule.has(c.ruleId)) checksByRule.set(c.ruleId, [])
  checksByRule.get(c.ruleId).push(c)
}

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
      { agentType: 'cklph-audit:audit-reviewer', label: `variant:${seed.file}`, phase: 'Variant', schema: REVIEW_SCHEMA, ...tier('reviewer') },
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
// heldUntraced (E2): critical/high neither confirmed nor cleanly refuted — majority-held with NO
// independent voter trace, majority-refuted with no guard cited, or no quorum (heldReason says
// which) — surfaced, never dropped.
const freshFps = new Set(fresh.map(fingerprint))
const heldUntraced = dedupeByFingerprint(allVerified.filter(f => f.heldUntraced))
  .filter(f => !baseline.has(fingerprint(f)))
  .filter(f => !freshFps.has(fingerprint(f)))   // a fingerprint confirmed by one panel is NOT also "awaiting a trace"
if (heldUntraced.length) log(`${heldUntraced.length} finding(s) awaiting an independent reachability trace / clean refutation — surfaced for owner review`)

// deferred (A5b): findings the verifier budget could not afford to verify — surfaced UNVERIFIED,
// never silently dropped. They are candidates only (may include false positives verify would kill);
// the report labels them so and recommends a follow-up run with a higher verify.maxVerifierAgents.
const heldFps = new Set(heldUntraced.map(fingerprint))
const deferred = dedupeByFingerprint(allVerified.filter(f => f.deferredUnverified))
  .filter(f => !baseline.has(fingerprint(f)))
  .filter(f => !freshFps.has(fingerprint(f)) && !heldFps.has(fingerprint(f)))   // a fp resolved by any panel isn't "deferred"
if (deferred.length) log(`${deferred.length} finding(s) DEFERRED unverified — verifier budget (${maxVerifierAgents}) exhausted after ${verifierSpawns} spawns; surfaced for a follow-up run`)

// §7.5 rule closure (M2) — every rulebook rule gets exactly one status, reconciled against what
// SURVIVED verification. A reviewer 'violation' whose cited findings were all refuted/held does not
// masquerade as a confirmed violation citing a finding that isn't in the report.
// Fold order: violation(confirmed) > violation(held-backed) > verified-safe > not-applicable > unchecked.
const freshIdSet = new Set(fresh.map(f => f.id).filter(Boolean))
const heldIdSet = new Set(heldUntraced.map(f => f.id).filter(Boolean))
const deferredIdSet = new Set(deferred.map(f => f.id).filter(Boolean))   // A5b: cited but never verified (budget)
const ruleClosure = rulebook.map(rule => {
  const checks = checksByRule.get(rule.id) ?? []
  const violations = checks.filter(c => c.status === 'violation')
  if (violations.length) {
    const cited = [...new Set(violations.flatMap(c => c.findingIds ?? []))]
    const confirmedIds = cited.filter(id => freshIdSet.has(id))   // findings that survived → in a severity section
    const heldCited = cited.filter(id => heldIdSet.has(id))       // findings surfaced as held-untraced
    const deferredCited = cited.filter(id => deferredIdSet.has(id))   // findings the budget never verified
    if (confirmedIds.length) return { ...rule, status: 'violation', findingIds: confirmedIds, ...(heldCited.length ? { heldIds: heldCited } : {}) }
    if (heldCited.length) return { ...rule, status: 'violation', findingIds: heldCited, heldBacked: true }  // only held evidence → row points at Held-untraced
    // A5b: cited evidence was DEFERRED (never verified — budget). NOT refuted; say so honestly and point at Deferred.
    if (deferredCited.length) return { ...rule, status: 'unchecked', deferredBacked: true, findingIds: deferredCited, note: 'cited finding(s) DEFERRED unverified — verifier budget exhausted, never checked; inconclusive, re-run with a higher verify.maxVerifierAgents' }
    // every finding the reviewer cited for this violation was REFUTED → the violation claim didn't survive
    const safeR = checks.find(c => c.status === 'verified-safe')
    if (safeR) return { ...rule, status: 'verified-safe', evidence: safeR.evidence }
    const naR = checks.find(c => c.status === 'not-applicable')
    if (naR) return { ...rule, status: 'not-applicable', evidence: naR.evidence }
    return { ...rule, status: 'unchecked', note: 'reviewer flagged a violation but every cited finding was refuted on verification — inconclusive' }
  }
  const safe = checks.find(c => c.status === 'verified-safe')
  if (safe) return { ...rule, status: 'verified-safe', evidence: safe.evidence }
  const na = checks.find(c => c.status === 'not-applicable')
  if (na) return { ...rule, status: 'not-applicable', evidence: na.evidence }
  return { ...rule, status: 'unchecked' }                    // renders as NOT CHECKED
})
const uncheckedRuleIds = ruleClosure.filter(r => r.status === 'unchecked').map(r => r.id)
const coverageSummary = { rulebookSize: rulebook.length, checked: rulebook.length - uncheckedRuleIds.length, uncheckedRuleIds }
if (rulebook.length) log(`rule closure: ${coverageSummary.checked}/${rulebook.length} checked${uncheckedRuleIds.length ? `; NOT CHECKED: ${uncheckedRuleIds.join(', ')}` : ''}`)

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
// 8b. COMPLIANCE MAPPING — SOC 2 + CASA cross-mapping (single post-reconcile job)
// ════════════════════════════════════════════════════════════════════════════
let complianceMatrix = []
if (hasCompliance) {
  const frameworks = config.compliance?.frameworks ?? ['soc2', 'casa']
  const complianceOut = await agent(
    `COMPLIANCE MAPPING: map the confirmed findings from all other lenses to formal security frameworks. ` +
    `Load the compliance-lens skill and the rulebooks from ` +
    '`${CLAUDE_PLUGIN_ROOT}/skills/compliance-lens/rulebooks/<framework>.yaml`' + `. For each control in each framework ` +
    `(${frameworks.join(', ')}): map to findings (violation → link finding ID), cite evidence (met → ` +
    `the guard/pattern), explain non-applicability, or honestly mark not-checked. Return a compliance ` +
    `matrix with one entry per control per framework. No control silently absent.\n` +
    `CONFIRMED_FINDINGS: ${JSON.stringify(fresh.map(f => ({ id: f.id, title: f.title, severity: f.severity, file: f.file, rule: f.rule, rootCause: f.rootCause })))}\n` +
    `RULE_CLOSURE: ${JSON.stringify(ruleClosure.filter(r => r.status !== 'unchecked').map(r => ({ id: r.id, status: r.status, evidence: r.evidence })))}\n` +
    `FRAMEWORKS: ${JSON.stringify(frameworks)}`,
    { agentType: 'cklph-audit:audit-reviewer', label: 'compliance:map', schema: COMPLIANCE_SCHEMA, ...tier('reviewer') },
  )
  if (complianceOut) {
    complianceMatrix = complianceOut.complianceMatrix ?? []
    log(`compliance: ${complianceMatrix.length} control(s) mapped across ${frameworks.join(', ')}`)
  } else {
    log('compliance mapping died — no compliance matrix (flagged in appendix)')
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 9. PATCH — opt-in patch generation + validation (CodeMender second half)
// ════════════════════════════════════════════════════════════════════════════
const patchEnabled = ((config.patch?.enabled ?? false) || dastEnabled) && mode !== 'quick'
let patchRan = false
let patchResults = []
if (!patchEnabled) {
  if ((config.patch?.enabled === true || dastEnabled) && mode === 'quick') {
    log('quick mode: Patch phase SKIPPED — no patch generation (flagged in appendix)')
  }
} else if (fresh.length === 0) {
  log('Patch phase: no confirmed findings to patch — skipped')
} else {
  phase('Patch')
  const maxIters = config.patch?.maxIterations ?? 3
  // patch all confirmed findings (cap at a reasonable number to bound agent spawns)
  const toPatch = fresh.slice(0, 50)
  log(`Patch phase: generating patches for ${toPatch.length} confirmed finding(s)`)
  const patchOut = await agent(
    `PATCH GENERATION + VALIDATION: for each confirmed finding, generate a code patch addressing the ROOT ` +
    `CAUSE (not the symptom). Apply the patch in a sandbox git worktree, run the test suite, re-run the ` +
    `exploit (if DAST ran — the exploit MUST FAIL), and run an LLM-as-judge pass. Iterate up to ${maxIters} ` +
    `rounds if any step fails. You edit ONLY the sandbox worktree, never the real tree.\n` +
    `CONFIRMED_FINDINGS: ${JSON.stringify(toPatch.map(f => ({
      id: f.id, title: f.title, severity: f.severity, file: f.file, line: f.line,
      rootCause: f.rootCause, invariant: f.invariant, suggestedFix: f.suggestedFix,
      reachabilityTrace: f.reachabilityTrace,
    })))}\n` +
    `CONFIG: ${JSON.stringify({ maxIterations: maxIters, dastRan, exploitResults: exploitResults.map(e => ({ findingId: e.findingId, confirmed: e.confirmed })) })}`,
    { agentType: 'cklph-audit:audit-patcher', label: 'patch:generate', phase: 'Patch', schema: PATCH_SCHEMA, ...tier('reviewer') },
  )
  if (patchOut) {
    patchResults = patchOut.patches ?? []
    patchRan = true
    log(`Patch phase: ${patchResults.filter(p => p.status === 'patched').length} patched, ` +
        `${patchResults.filter(p => p.status === 'patch-unverified').length} unverified, ` +
        `${patchResults.filter(p => p.status === 'patch-failed').length} failed`)
  } else {
    log('audit-patcher died — no patch results (flagged in appendix)')
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 10. SYNTHESIZE — the report + remediation waves
// ════════════════════════════════════════════════════════════════════════════
phase('Synthesize')
// E2/A5b: only a truly clean run short-circuits — a held-untraced OR a deferred-unverified finding
// is NOT clean; it still needs an owner-review report so it is never silently gone.
if (!fresh.length && !heldUntraced.length && !deferred.length) {
  log('No new confirmed findings. Clean run. 🎉')
  return {
    report: null, fresh: [],
    units: { source: unitSource, lowConfidence },
    skipped: mode === 'quick',
    coverage: coverageSummary,
    positiveControls: positiveControls.length,
    heldUntraced: 0,
    deferred: 0,
    map: { ran: mapRan, trustBoundaries: model.trustBoundaries.length, invariants: model.invariants.length },
    variants: variantsConfirmed,
    dast: { ran: dastRan, findings: dastFindings.length, exploits: exploitResults.length },
    patch: { ran: patchRan, patches: patchResults.length },
    compliance: { ran: hasCompliance, controls: complianceMatrix.length },
    selfReview: { ran: false, gaps: 0, gapDetails: [], reScanned: false, notRunReason: 'clean run — no report to review' },
    vulnIntel: { mode: vulnIntelMode, enabled: vulnIntelEnabled, lenses: lenses.includes('sca') ? ['sca'] : [] },
    feedFreshnessChecked: false,
  }
}
const runMeta = {
  unitSource, lowConfidence, mode,
  reconRan: reconEnabled,
  reconMissing: reconEnabled ? lenses.filter(l => !reconByLens[l] && l !== 'compliance') : lenses,
  rulebookMissing: !rulebookOut,                 // extraction died — matrix empty for THAT reason
  rulebookSize: rulebook.length,
  mapRan,                                        // Map phase produced a threat model (else empty/flagged)
  variantRan,                                    // E3: true ONLY if the phase actually processed ≥1 seed
  dastRan,                                       // v4: DAST phase ran (opt-in, off by default)
  patchRan,                                      // v4: Patch phase ran (opt-in, auto-on with DAST)
  exploitRan: exploitResults.length > 0,         // v4: exploit verification produced PoC results
  // SelfReview runs AFTER this report is written, so the synthesizer cannot know its outcome: the
  // engine appends the "## Self-review" section and sets phases.self_review itself (see §11).
  selfReview: 'appended-by-engine',
  feedFreshnessChecked: false,                   // the engine never runs feed-status.sh — say so, don't invent ages
  heldUntracedCount: heldUntraced.length,        // E2: critical/high neither confirmed nor cleanly refuted (see heldReason)
  deferredCount: deferred.length,                // A5b: findings the verifier budget couldn't afford
  verifierBudget: maxVerifierAgents,             // A5b: the cap; verifierSpawns is what was actually used
  verifierSpawns,
  crownJewels: model.crownJewels,
}
// E2: held (inconclusive) critical/high findings, surfaced for owner review (never silently dropped)
const publicHeldUntraced = heldUntraced.map(f => ({ id: f.id, file: f.file, severity: f.severity, title: f.title, rule: f.rule, heldReason: f.heldReason }))
// A5b: deferred (unverified — budget-exhausted) findings, surfaced as candidates for a follow-up run
const publicDeferred = deferred.map(f => ({ id: f.id, file: f.file, severity: f.severity, title: f.title, rule: f.rule, ...(f.deferredNote ? { note: f.deferredNote } : {}) }))
// engine-internal fields stay out of the synthesizer's context (confirmed is always true here;
// refutedGuards were already harvested into positive controls above)
const publicFresh = fresh.map(({ refutedGuards, confirmed, ...rest }) => rest)
let report = await agent(
  `Write the audit report from these CONFIRMED, fresh findings. Load the audit-report-format skill for the ` +
  `AUDIT-<date>.md contract. Bucket by severity (critical/high/medium/low), each with file:line + why-it's-real ` +
  `(it survived adversarial verification) + a concrete fix + its confidence/bucket/context/validation fields. ` +
  `Each finding also carries (when present) rootCause, invariant, boundary, and reachabilityTrace — render them. ` +
  `For DAST findings (source: "dast"), render the request/response evidence. For findings with exploit results, ` +
  `render the PoC script + sandbox result + confirmed-exploitable/likely status. For findings with patch results, ` +
  `render the diff + test/exploit-closed/judge verdict. ` +
  `Render a Coverage summary (per denominator: examined X of N + the verbatim command; where X < N say ` +
  `"sampled" and give the risk-weighting rationale), a Coverage matrix (EVERY rulebook rule → finding IDs | ` +
  `verified-safe + citation | not-applicable + reason | NOT CHECKED — no rule silently absent), a Compliance ` +
  `matrix (when COMPLIANCE_MATRIX is non-empty: one sub-section per framework, each control → met/violation/` +
  `not-applicable/not-checked), a Coverage ` +
  `narrative (positive assurance from NEAR_MISSES + CROWN_JEWELS + COVERAGE_TOTALS: per area, what was probed, ` +
  `why clean areas held, and near-misses chased to ground), and a Positive controls (INFO) section (each: ` +
  `citation + what it protects + why it shipped). counts.info = positive-control count. When HELD_UNTRACED is ` +
  `non-empty, render the "Held-untraced (needs owner review)" section listing each (file, severity, title, rule, ` +
  `heldReason) — critical/high the panel could neither confirm nor cleanly refute. Render each one's heldReason ` +
  `plainly: "majority-held-no-trace" = held by the majority but no VOTER supplied an independent trace; ` +
  `"refuted-without-guard" = the majority refuted it but no voter cited a guard; "no-quorum" = too few voters ` +
  `returned to decide. Never call a refuted-without-guard or no-quorum entry "majority-held". Surface them for ` +
  `owner review, do NOT drop them and do NOT treat them as confirmed. When ` +
  `DEFERRED is non-empty, render a "Deferred — UNVERIFIED (verifier budget exhausted)" subsection listing each ` +
  `(file, severity, title, rule): the verifier budget (RUN_META.verifierBudget) ran out before these could be ` +
  `verified, so they are UNVERIFIED candidates that may include false positives — label them plainly and ` +
  `recommend a follow-up run with a higher verify.maxVerifierAgents or a narrower scope. Never treat them as ` +
  `confirmed and never silently drop them. Group fixes into ` +
  `ordered remediation WAVES consumable by /cklph-os:flow — quick-wins first within a severity band; ` +
  `owner-decision items go in their own "Owner decisions" subsection (questions, not work). Findings with a ` +
  `"patched" status from PATCH_RESULTS get a "patch-ready" tag in the wave entry. Flag in an ` +
  `appendix: unit derivation, low-confidence units, quick-mode sampling, whether the Map + Variant + DAST + ` +
  `Patch phases ran (and why not, if skipped), recon gaps, and ` +
  `(RUN_META — state plainly which denominators/seeds/phases are ` +
  `absent/partial and why). SelfReview runs AFTER you: do NOT write a Self-review section and do not guess ` +
  `its result — write "self_review: false" in the front-matter phases block; the engine rewrites that line and ` +
  `appends the "## Self-review" section itself. Feed freshness was NOT checked (RUN_META.feedFreshnessChecked ` +
  `is false): say so in the appendix and recommend running /cklph-audit:refresh-feeds before the next ` +
  `SCA/container audit; never state a database age.\n\n` +
  `FINDINGS:\n${JSON.stringify(publicFresh, null, 2)}\n\n` +
  `RULE_CLOSURE:\n${JSON.stringify(ruleClosure, null, 2)}\n\n` +
  `COVERAGE_TOTALS:\n${JSON.stringify(coverageTotals, null, 2)}\n\n` +
  `NEAR_MISSES:\n${JSON.stringify(nearMisses, null, 2)}\n\n` +
  `HELD_UNTRACED:\n${JSON.stringify(publicHeldUntraced, null, 2)}\n\n` +
  `DEFERRED:\n${JSON.stringify(publicDeferred, null, 2)}\n\n` +
  `CROWN_JEWELS:\n${JSON.stringify(model.crownJewels, null, 2)}\n\n` +
  `POSITIVE_CONTROLS:\n${JSON.stringify(positiveControls, null, 2)}\n\n` +
  (dastRan ? `DAST_FINDINGS:\n${JSON.stringify(dastFindings.map(f => ({ id: f.id, title: f.title, severity: f.severity, url: f.url, method: f.method, evidence: f.evidence, source: f.source })), null, 2)}\n\n` : '') +
  (exploitResults.length ? `EXPLOIT_RESULTS:\n${JSON.stringify(exploitResults, null, 2)}\n\n` : '') +
  (patchResults.length ? `PATCH_RESULTS:\n${JSON.stringify(patchResults, null, 2)}\n\n` : '') +
  (complianceMatrix.length ? `COMPLIANCE_MATRIX:\n${JSON.stringify(complianceMatrix, null, 2)}\n\n` : '') +
  `RUN_META:\n${JSON.stringify(runMeta, null, 2)}`,
  { agentType: 'cklph-audit:audit-synthesizer', label: 'synthesize:report', schema: REPORT_SCHEMA, ...tier('synthesizer') },
)

// ════════════════════════════════════════════════════════════════════════════
// 11. SELF-REVIEW — one adversarial pass over the written report; the engine appends its result
// ════════════════════════════════════════════════════════════════════════════
// There is no re-scan: a gap found here is reported as an OPEN coverage gap, not resolved. A second
// review of the same unchanged report adds nothing, so exactly one pass runs (selfReview.maxRounds
// is accepted for compatibility but only 0 disables it).
const selfReviewEnabled = (config.selfReview?.enabled ?? true) && mode !== 'quick' && (config.selfReview?.maxRounds ?? 1) > 0
let selfReviewRan = false
let selfReviewGaps = []
let selfReviewAssessment = ''
let selfReviewNotRun = !selfReviewEnabled
  ? (mode === 'quick' ? 'quick mode skips it' : 'disabled by config (selfReview.enabled: false or maxRounds: 0)')
  : ''
if (!report?.markdown) {
  // the synthesizer died: never let that read as a clean run (report: null is the clean-run signal)
  log('audit-synthesizer died — returning an engine fallback report so the run is not mistaken for clean')
  const lineOf = f => `- **${f.severity ?? '?'}** ${f.title ?? '(untitled)'} — \`${f.file ?? '?'}${f.line ? ':' + f.line : ''}\` (${f.rule ?? 'no rule'})`
  report = {
    markdown: `# Audit report — SYNTHESIS FAILED\n\n` +
      `> The audit-synthesizer agent died, so this is the engine's raw fallback, not the AUDIT contract. ` +
      `Re-run the audit to get the full report. Nothing below has been re-judged.\n\n` +
      `## Confirmed findings (${fresh.length})\n\n${fresh.map(lineOf).join('\n') || '_none_'}\n\n` +
      `## Held-untraced — needs owner review (${heldUntraced.length})\n\n${heldUntraced.map(f => lineOf(f) + (f.heldReason ? ` — ${f.heldReason}` : '')).join('\n') || '_none_'}\n\n` +
      `## Deferred — UNVERIFIED (${deferred.length})\n\n${deferred.map(lineOf).join('\n') || '_none_'}\n`,
    waves: [],
    counts: ['critical', 'high', 'medium', 'low'].reduce((c, s) => ({ ...c, [s]: fresh.filter(f => f.severity === s).length }), { info: 0 }),
    synthesisFailed: true,
  }
  if (selfReviewEnabled) selfReviewNotRun = 'the synthesizer died, so there was no report to review'
} else if (selfReviewEnabled) {
  phase('SelfReview')
  const reviewOut = await agent(
    `ADVERSARIAL SELF-REVIEW: you are reviewing an audit report for GAPS. Read the report below and ` +
    `identify what's missing, under-explored, or inconsistent. Specifically check: ` +
    `(1) did every unit × lens pair get coverage? (2) are crown jewels adequately explored? ` +
    `(3) are there findings that should have been caught but weren't? (4) is the coverage narrative ` +
    `honest — does any "clean" area lack a narrative? (5) are DAST/exploit/patch results (if any) ` +
    `rendered? (6) is the compliance matrix complete (if compliance ran)? ` +
    `(7) if the SCA lens ran, were MCP vulnerability intelligence tools (cve-mcp/vuln-intel-ext) ` +
    `used for enrichment if available? If not, flag as a gap. ` +
    `(The "## Self-review" section is added after you, so its absence is not a gap.) ` +
    `Return gaps as { area, whatWasMissed } pairs. If there are NO gaps, return an empty array.\n\n` +
    `REPORT:\n${report.markdown}\n\n` +
    `RUN_META:\n${JSON.stringify({ units: units.map(u => u.key), lenses, mode, mapRan, variantRan, dastRan, patchRan })}`,
    { agentType: 'cklph-audit:audit-reviewer', label: 'selfreview:round-1', phase: 'SelfReview', schema: SELF_REVIEW_SCHEMA, ...tier('reviewer') },
  )
  if (!reviewOut) {
    log('self-review died — the report says no self-review was performed')
    selfReviewNotRun = 'the self-review agent died'
  } else {
    selfReviewRan = true
    selfReviewGaps = reviewOut.gaps ?? []
    selfReviewAssessment = reviewOut.overallAssessment ?? ''
    log(selfReviewGaps.length
      ? `self-review: ${selfReviewGaps.length} gap(s) found — appended to the report as open coverage gaps (no re-scan)`
      : 'self-review: no gaps found')
  }
}

// The self-review outcome reaches the report in plain code: rewrite the front-matter flag the
// synthesizer could not know, and append the section. Never on the clean-run path (report null).
if (report?.markdown) {
  report.markdown = report.markdown.replace(/^(\s*self_review:\s*)[^\s#]+/m, `$1${selfReviewRan}`)
  const gapLines = selfReviewGaps.map(g => `- **${g.area ?? 'unspecified area'}** — ${g.whatWasMissed ?? ''}`).join('\n')
  report.markdown = report.markdown.replace(/\s*$/, '\n\n') + '## Self-review\n\n' + (
    !selfReviewRan
      ? `No adversarial self-review of this report was performed: ${selfReviewNotRun}.\n`
      : selfReviewGaps.length
        ? `One adversarial self-review pass ran after this report was written. It found ${selfReviewGaps.length} gap(s). ` +
          `They were **not re-scanned** (the engine has no re-scan step), so **coverage is incomplete in these areas**:\n\n${gapLines}\n` +
          (selfReviewAssessment ? `\nReviewer's assessment: ${selfReviewAssessment}\n` : '')
        : `One adversarial self-review pass ran after this report was written and found no gaps.` +
          (selfReviewAssessment ? ` Reviewer's assessment: ${selfReviewAssessment}` : '') + '\n'
  )
}

return {
  report,
  fresh,
  units: { source: unitSource, lowConfidence },
  skipped: mode === 'quick',
  coverage: coverageSummary,
  positiveControls: positiveControls.length,
  heldUntraced: heldUntraced.length,
  deferred: deferred.length,
  map: { ran: mapRan, trustBoundaries: model.trustBoundaries.length, invariants: model.invariants.length },
  variants: variantsConfirmed,
  dast: { ran: dastRan, findings: dastFindings.length, exploits: exploitResults.length },
  patch: { ran: patchRan, patches: patchResults.length },
  compliance: { ran: hasCompliance, controls: complianceMatrix.length },
  selfReview: { ran: selfReviewRan, gaps: selfReviewGaps.length, gapDetails: selfReviewGaps, reScanned: false, ...(selfReviewRan ? {} : { notRunReason: selfReviewNotRun }) },
  vulnIntel: { mode: vulnIntelMode, enabled: vulnIntelEnabled, lenses: lenses.includes('sca') ? ['sca'] : [] },
  feedFreshnessChecked: false,
}
