// Deterministic end-to-end test for the REAL cklph-audit engine.
//
//   node plugins/cklph-audit/tests/engine-flow.test.mjs
//
// Loads audit.workflow.js, stubs the Workflow globals (agent/parallel/pipeline/
// phase/log/args/budget) with synthetic phase outputs, runs the ACTUAL engine
// body, and asserts the data handoffs between phases hold — the upstream/
// downstream conflicts that `node --check` and schema sweeps structurally cannot
// see (this class shipped 0.3.0–0.3.2 as runtime bugs). No agent registry, no
// tokens, no network. Exits non-zero on any conflict so it can gate a release.
import fs from 'node:fs';

const ENGINE = new URL('../workflows/audit.workflow.js', import.meta.url);
let src = fs.readFileSync(ENGINE, 'utf8');
// make it runnable as a function body: drop the ESM export, keep meta
src = src.replace(/export\s+const\s+meta\s*=/, 'const meta =');

// ── stub globals ─────────────────────────────────────────────────────────────
const logs = [];
const log = (m) => logs.push(String(m));
const phase = () => {};
const budget = { total: null, spent: () => 0, remaining: () => Infinity };
const parallel = (thunks) => Promise.all(thunks.map(t => Promise.resolve().then(t).catch(() => null)));
const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, idx) => {
  let v = item;
  for (const s of stages) { try { v = await s(v, item, idx); } catch { return null; } }
  return v;
}));

// captured synthesizer input for cross-phase consistency checks
let synthInput = null;
function parseAfter(prompt, marker) {
  const i = prompt.indexOf(marker);
  if (i < 0) return null;
  const rest = prompt.slice(i + marker.length);
  // grab the first JSON array or object after the marker
  const m = rest.match(/(\[[\s\S]*?\]|\{[\s\S]*?\})\s*(?:\n\n|$)/);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

// ── the scenario: synthetic agent outputs keyed by label ─────────────────────
const RULES = [
  { id: 'agents-md:rule-1', source: 'AGENTS.md:9', text: 'by-id tenant read/mutation must verify workspace ownership', lensHint: 'security' },
  { id: 'agents-md:rule-2', source: 'AGENTS.md:12', text: 'never getSession() for server authz; use getUser()', lensHint: 'security' },
  { id: 'agents-md:rule-3', source: 'AGENTS.md:15', text: 'no hardcoded secrets', lensHint: 'security' },
  { id: 'agents-md:rule-4', source: 'AGENTS.md:18', text: 'state-changing routes must be rate-limited', lensHint: 'security' },
  { id: 'agents-md:rule-5', source: 'AGENTS.md:20', text: 'no unscoped invoice reads', lensHint: 'security' },
];
const F1 = { id: 'F1', title: 'IDOR: users route reads/updates by id with no ownership check', severity: 'critical', file: 'app/api/users/[id]/route.ts', line: 11, rule: 'agents-md:rule-1', rationale: '...', snippet: ".eq('id', params.id).single()", normalizedSnippet: "eq id params.id single", suggestedFix: 'scope by workspace', source: 'reasoning', rootCause: 'no ownership predicate', invariant: 'a row is only returned to a member of its workspace' };
const F2 = { id: 'F2', title: 'getSession() used as server authz gate in proxy.ts', severity: 'high', file: 'proxy.ts', line: 11, rule: 'agents-md:rule-2', rationale: '...', snippet: 'supabase.auth.getSession()', normalizedSnippet: 'supabase.auth.getsession', suggestedFix: 'use getUser()', source: 'reasoning', rootCause: 'JWT not re-validated', invariant: 'authz decisions use a server-validated identity' };
const F3 = { id: 'F3', title: 'IDOR in guarded.ts getInvoice', severity: 'high', file: 'lib/guarded.ts', line: 8, rule: 'agents-md:rule-1', rationale: '...(false positive)', snippet: ".eq('id', id)", normalizedSnippet: "eq id id", suggestedFix: 'n/a', source: 'reasoning', rootCause: 'looks like IDOR', invariant: 'ownership scoping' };
const SIBLING = { id: 'V1', title: 'IDOR: orders route reads by id with no ownership check', severity: 'critical', file: 'app/api/orders/[id]/route.ts', line: 9, rule: 'agents-md:rule-1', rationale: 'sibling of F1', snippet: ".eq('id', params.id).single()", normalizedSnippet: "eq id params.id single orders", suggestedFix: 'scope by workspace', source: 'tool', rootCause: 'no ownership predicate', invariant: 'row only to workspace member' };
const D1 = { id: 'D1', title: 'AGENTS.md references lib/middleware/auth.ts which does not exist', severity: 'low', file: 'AGENTS.md', line: 22, rule: 'docs-drift:path', rationale: 'drift', snippet: '`lib/middleware/auth.ts`', normalizedSnippet: 'lib/middleware/auth.ts', suggestedFix: 'update path', source: 'tool' };

async function agent(prompt, opts = {}) {
  const label = opts.label || '';
  if (label === 'discover:rulebook') return { rules: RULES };
  if (label === 'recon:security') return { domain: 'security', denominators: [{ pattern: '.single() by id', description: 'by-id lookups', command: "grep -rn '.eq(\\'id\\'' app/api", count: 3 }], seeds: [{ file: 'app/api/users/[id]/route.ts', line: 11, snippet: '.eq(id)', note: 'no workspace scope', suspectedRule: 'agents-md:rule-1' }, { file: 'app/api/orders/[id]/route.ts', line: 9, snippet: '.eq(id)', note: 'no workspace scope' }], safeControls: [{ file: 'lib/guarded.ts', line: 12, snippet: ".eq('workspace_id')", note: 'ownership guard present', rule: 'agents-md:rule-1' }] };
  if (label === 'recon:docs-drift') return { domain: 'docs-drift', denominators: [{ pattern: 'doc path tokens', description: 'paths referenced in docs', command: 'docsdrift.sh . AGENTS.md', count: 3 }], seeds: [{ file: 'AGENTS.md', line: 22, note: 'lib/middleware/auth.ts missing' }], safeControls: [] };
  if (label === 'map:model') return { trustBoundaries: [{ id: 'tb-authz', where: 'proxy.ts', note: 'edge authz gate' }, { id: 'tb-api', where: 'app/api/**', note: 'route handlers' }], dataFlows: [{ source: 'params.id', sink: 'supabase.from().eq()', crossesBoundary: 'tb-api' }], invariants: [{ unit: 'api-surface', text: 'a tenant row is returned only to a member of its workspace' }], crownJewels: ['user-role mutation', 'auth gate'] };
  if (label === 'review:api-surface:security') return {
    findings: [F1, F2, F3],
    ruleChecks: [
      { ruleId: 'agents-md:rule-1', status: 'violation', findingIds: ['F1', 'F3'] },   // NOTE: F3 will be refuted downstream
      { ruleId: 'agents-md:rule-2', status: 'violation', findingIds: ['F2'] },          // NOTE: F2 will be held-untraced downstream
      { ruleId: 'agents-md:rule-3', status: 'verified-safe', evidence: 'lib/guarded.ts:18 reads process.env, no literals' },
      { ruleId: 'agents-md:rule-4', status: 'not-applicable', evidence: 'no rate-limit convention in this fixture' },
      { ruleId: 'agents-md:rule-5', status: 'violation', findingIds: ['F3'] },   // F3 gets REFUTED -> rule-5's only evidence vanishes
    ],
    coverage: { seedsVerified: 2, seedsGiven: 2, toolCandidatesJudged: 5 },
    safeControlChecks: [{ file: 'lib/guarded.ts', confirmed: true, evidence: 'lib/guarded.ts:12 .eq(workspace_id) present' }],
  };
  if (label === 'review:docs:docs-drift' || (label.startsWith('review:') && label.endsWith(':docs-drift')))
    return { findings: [D1], ruleChecks: [], coverage: { seedsVerified: 1, seedsGiven: 1, toolCandidatesJudged: 3 } };
  if (label.startsWith('variant:')) return { findings: [SIBLING], ruleChecks: [], coverage: { seedsVerified: 1, seedsGiven: 0, toolCandidatesJudged: 2 } };
  if (label.startsWith('verify:')) {
    // parse the finding under test from the prompt
    let f = {};
    const m = prompt.match(/FINDING:\s*(\{[\s\S]*\})/);
    if (m) { try { f = JSON.parse(m[1]); } catch {} }
    const t = f.title || '';
    if (t.includes('users route')) return { refuted: false, reason: 'reachable', reachabilityTrace: 'GET /api/users/<victim-id> returns any user; no workspace predicate', confidence: 0.9 };
    if (t.includes('orders route')) return { refuted: false, reason: 'reachable sibling', reachabilityTrace: 'GET /api/orders/<victim-id> returns any order', confidence: 0.9 };
    if (t.includes('getSession')) return { refuted: false, reason: 'plausible but I produced no exploit path', confidence: 0.5 }; // holds, NO trace -> heldUntraced
    if (t.includes('guarded.ts')) return { refuted: true, reason: 'guard present', counterEvidence: 'lib/guarded.ts:12 .eq(workspace_id, workspaceId)', confidence: 0.9 }; // refuted w/ guard -> near-miss + PC
    if (t.includes('lib/middleware/auth.ts')) return { refuted: false, reason: 'file truly absent', reachabilityTrace: 'ls lib/middleware/auth.ts -> not found', confidence: 0.8 };
    return { refuted: true, reason: 'default refute' };
  }
  if (label === 'synthesize:report') {
    synthInput = {
      findings: parseAfter(prompt, 'FINDINGS:'),
      ruleClosure: parseAfter(prompt, 'RULE_CLOSURE:'),
      coverageTotals: parseAfter(prompt, 'COVERAGE_TOTALS:'),
      positiveControls: parseAfter(prompt, 'POSITIVE_CONTROLS:'),
      heldUntraced: parseAfter(prompt, 'HELD_UNTRACED:'),
      deferred: parseAfter(prompt, 'DEFERRED:'),
      runMeta: parseAfter(prompt, 'RUN_META:'),
    };
    return { markdown: '# report', waves: [{ title: 'W1', findingIds: ['F1', 'V1'], rationale: 'idor' }], counts: { critical: 2, high: 0, medium: 0, low: 1, info: 3 } };
  }
  return null;
}

// ── build a runnable fn from the real engine source ──────────────────────────
const runFn = new Function('G',
  'const {agent,parallel,pipeline,phase,log,args,budget}=G; return (async()=>{\n' + src + '\n})();');

const args = {
  lenses: ['security', 'docs-drift'], mode: 'full', deepUnits: false,
  config: {
    units: { autoInfer: false, list: [{ key: 'api-surface', title: 'API and auth surface', globs: ['proxy.ts', 'app/api/**', 'lib/**'], riskScore: 0.9 }] },
    lenses: ['security', 'docs-drift'], verify: { voters: 1 }, riskRouting: { enabled: false },
    recon: { enabled: true }, map: { enabled: true }, variant: { enabled: true, maxSeeds: 8, maxPerSeed: 20 },
    positiveControls: { max: 15 }, severityFloor: 'low', rulesFrom: ['AGENTS.md'], report: { dir: 'audits' },
  },
  baseline: { fingerprints: [] },
};

const result = await runFn({ agent, parallel, pipeline, phase, log, args, budget });

// ── report + consistency checks (the upline/downline conflict detector) ──────
console.log('=== LOGS ==='); logs.forEach(l => console.log('  ' + l));
console.log('\n=== ENGINE RETURN ===');
console.log('  report:', result?.report ? 'non-null' : 'null', '| fresh:', result?.fresh?.length, '| variants:', result?.variants, '| heldUntraced:', result?.heldUntraced, '| positiveControls:', result?.positiveControls);
console.log('  coverage:', JSON.stringify(result?.coverage));
console.log('\n=== SYNTHESIZER INPUT ===');
console.log('  fresh findings:', (synthInput?.findings || []).map(f => f.id + '/' + f.severity));
console.log('  heldUntraced:', (synthInput?.heldUntraced || []).map(f => f.title?.slice(0, 30)));
console.log('  ruleClosure:', (synthInput?.ruleClosure || []).map(r => r.id + '=' + r.status + (r.findingIds ? '(' + r.findingIds.join(',') + ')' : '')));
console.log('  positiveControls:', (synthInput?.positiveControls || []).map(p => p.label + ':' + (p.rule || p.file)));
console.log('  runMeta:', JSON.stringify(synthInput?.runMeta));

console.log('\n=== CROSS-PHASE CONSISTENCY CHECKS ===');
let problems = 0;
const freshIds = new Set((synthInput?.findings || []).map(f => f.id));
const heldIds = new Set((synthInput?.heldUntraced || []).map(f => f.id));
const heldTitles = (synthInput?.heldUntraced || []).map(f => f.title);
// C1: every ruleClosure 'violation' findingId must appear SOMEWHERE in the report — a severity
// section (fresh) OR the Held-untraced section (held-backed). Only a truly absent id is a phantom.
for (const r of (synthInput?.ruleClosure || [])) {
  if (r.status === 'violation') for (const id of (r.findingIds || [])) {
    const inReport = freshIds.has(id) || heldIds.has(id);
    if (!inReport) { problems++; console.log(`  ✗ PHANTOM: rule ${r.id} 'violation' cites ${id} which is in neither fresh nor held-untraced.`); }
    else if (heldIds.has(id) && !r.heldBacked) { problems++; console.log(`  ✗ rule ${r.id} cites held finding ${id} but is not marked heldBacked (matrix would imply a confirmed violation).`); }
  }
}
// C2: F2 (getSession, held, no trace) should be in heldUntraced, NOT fresh
if (freshIds.has('F2')) { problems++; console.log('  ✗ F2 (no-trace high) leaked into fresh'); }
if (!heldTitles.some(t => t.includes('getSession'))) { problems++; console.log('  ✗ F2 (getSession) missing from heldUntraced'); }
// C3: variant sibling confirmed and in fresh
if (!freshIds.has('V1')) { problems++; console.log('  ✗ variant sibling V1 not in fresh'); }
// C4: near-miss (F3 refuted) not in fresh, not in held
if (freshIds.has('F3')) { problems++; console.log('  ✗ F3 (refuted) leaked into fresh'); }
// C5: positive controls present (killed-candidate F3 + rule-verified r3 + recon guarded)
const pcs = synthInput?.positiveControls || [];
if (!pcs.length) { problems++; console.log('  ✗ no positive controls harvested'); }
// C6: rule-5's only violation evidence (F3) was refuted -> must NOT stay 'violation'; should degrade to inconclusive/unchecked
const r5 = (synthInput?.ruleClosure || []).find(r => r.id === 'agents-md:rule-5');
if (r5?.status === 'violation') { problems++; console.log('  ✗ rule-5 still "violation" though its only cited finding (F3) was refuted — phantom violation'); }
else console.log(`  ✓ rule-5 (all-evidence-refuted) degraded to '${r5?.status}'${r5?.note ? ' (' + r5.note.slice(0,40) + '…)' : ''}`);
// C7: F2 held BY the majority with no trace carries that reason (not a generic "majority-held" label)
const f2held = (synthInput?.heldUntraced || []).find(f => f.id === 'F2');
if (f2held?.heldReason !== 'majority-held-no-trace') { problems++; console.log(`  ✗ F2 heldReason is ${JSON.stringify(f2held?.heldReason)}, want "majority-held-no-trace"`); }
else console.log('  ✓ F2 held with heldReason "majority-held-no-trace"');
// C8: the self-review stub died here — the written report must SAY no self-review ran (it used to
// hard-code selfReviewRan:false into RUN_META and never mention the outcome in the markdown)
if (!/## Self-review\n\nNo adversarial self-review of this report was performed: the self-review agent died/.test(result?.report?.markdown || '')) { problems++; console.log('  ✗ report markdown does not state that self-review did not run'); }
else console.log('  ✓ report states no self-review was performed (agent died)');
if (synthInput?.runMeta?.feedFreshnessChecked !== false || 'selfReviewRan' in (synthInput?.runMeta || {})) { problems++; console.log('  ✗ RUN_META should carry feedFreshnessChecked:false and no pre-baked selfReviewRan'); }
else console.log('  ✓ RUN_META says feed freshness was not checked, and no longer pre-bakes selfReviewRan:false');
console.log(problems === 0 ? '\n✓ scenario A (uncapped) — all cross-phase checks passed' : `\n✗ scenario A: ${problems} conflict(s) found`);

// ── SCENARIO B: verifier fan-out cap (A5b) — a tiny budget must DEFER overflow, surfaced not dropped ─
console.log('\n=== SCENARIO B: verifier fan-out cap ===');
synthInput = null; logs.length = 0;
const argsB = JSON.parse(JSON.stringify(args));
argsB.config.verify = { voters: 1, maxVerifierAgents: 2 };   // only 2 verifier spawns allowed all run
const resultB = await runFn({ agent, parallel, pipeline, phase, log, args: argsB, budget });
const dIn = synthInput || {};
const freshB = (dIn.findings || []).map(f => f.id);
const heldB = (dIn.heldUntraced || []).map(f => f.id);
const defB = (dIn.deferred || []).map(f => f.id);
console.log('  budget=2 → verifierSpawns:', dIn.runMeta?.verifierSpawns, '| deferredCount:', dIn.runMeta?.deferredCount);
console.log('  fresh:', freshB, '| held:', heldB, '| DEFERRED:', defB, '| report:', resultB?.report ? 'written' : 'null');
// B1: the budget must be respected — no more than maxVerifierAgents spawns
if ((dIn.runMeta?.verifierSpawns ?? 0) > 2) { problems++; console.log('  ✗ verifierSpawns exceeded the cap'); }
else console.log('  ✓ verifier spawns stayed within the cap');
// B2: with 5 findings (F1,F2,F3,D1,V1-variant) and budget 2, some MUST be deferred
if (!defB.length) { problems++; console.log('  ✗ nothing deferred though budget < findings — cap not applied'); }
else console.log(`  ✓ ${defB.length} finding(s) deferred (surfaced, unverified)`);
// B3: NO finding may vanish — every reviewer finding ends up confirmed(fresh) | held | deferred | refuted-nearmiss
const accountedB = new Set([...freshB, ...heldB, ...defB]);
for (const id of ['F1', 'F2']) { // the crit/high that should be verified first (within budget) or surfaced
  if (!accountedB.has(id)) { problems++; console.log(`  ✗ ${id} vanished — neither confirmed, held, nor deferred`); }
}
// B4: a deferred-only-ish run still writes a report (not treated as clean)
if (!resultB?.report) { problems++; console.log('  ✗ report not written despite deferred findings'); }
else console.log('  ✓ report written (deferred findings are not "clean")');
// B5: crit/high verified before low — F1 (critical) should NOT be the one deferred
if (defB.includes('F1')) { problems++; console.log('  ✗ critical F1 was deferred while lower-severity findings were verified'); }
else console.log('  ✓ critical/high prioritized (within-call) for verification over lower severities');
// B6 (regression guard for the red-team HIGH): a rule whose ONLY cited finding was DEFERRED must NOT
// be closed with a "refuted on verification" note — it was never verified. rule-5 cites F3, deferred here.
const r5B = (dIn.ruleClosure || []).find(r => r.id === 'agents-md:rule-5');
if (r5B && /refuted on verification/i.test(r5B.note || '')) { problems++; console.log('  ✗ rule-5 cites a DEFERRED finding but is labeled "refuted on verification" — misinformation'); }
else if (r5B?.deferredBacked) console.log(`  ✓ rule-5 (cited finding deferred) honestly marked deferredBacked: "${(r5B.note||'').slice(0,44)}…"`);
else console.log(`  · rule-5 status='${r5B?.status}' note='${(r5B?.note||'').slice(0,40)}'`);
// B7: deferred variant sibling (V1, critical) keeps its pedigree note, not a generic label
const v1def = (dIn.deferred || []).find(f => f.id === 'V1');
if (v1def && !/sibling/i.test(v1def.note || '')) console.log('  · V1 deferred without pedigree note (minor)');
else if (v1def) console.log('  ✓ deferred variant sibling V1 keeps its "sibling of a confirmed critical" pedigree');

// ── SCENARIO C: agent-config lens — exactly ONE job over the AI-tooling globs, never crossed with units ─
console.log('\n=== SCENARIO C: agent-config single job ===');
synthInput = null; logs.length = 0;
const A1 = { id: 'A1', title: '.mcp.json runs an MCP server via npx -y pkg@latest (mutable selector)', severity: 'medium', file: '.mcp.json', line: 5, rule: 'agentcfg:mcp-unpinned', rationale: 'mutable', snippet: '"example-mcp@latest"', normalizedSnippet: 'example-mcp@latest', suggestedFix: 'pin reviewed version', source: 'reasoning' };
const seenLabels = [];
const seenPrompts = {};
const agentC = async (prompt, opts = {}) => {
  const label = opts.label || '';
  seenLabels.push(label); seenPrompts[label] = prompt;
  if (label === 'recon:agent-config') return { domain: 'agent-config', denominators: [{ pattern: 'mcp configs', description: 'repo MCP config files', command: "rg --files --hidden -g '**/.mcp.json'", count: 1 }], seeds: [{ file: '.mcp.json', line: 5, note: '@latest selector' }, { file: 'lib/llm/agent-runtime.ts', line: 14, note: 'LLM call site feeds fetched email into a tool-using agent' }, { file: './packages/app/lib/llm/in-scope-call.ts', line: 3, note: 'scoped LLM call site' }, { file: 'other/lib/llm/out-of-scope-call.ts', line: 3, note: 'LLM call site outside args.path' }], safeControls: [{ file: 'other/.mcp.json', line: 2, note: 'pinned server, outside args.path' }] };
  if (label === 'review:agent-config:agent-config') return { findings: [A1], ruleChecks: [], coverage: { seedsVerified: 1, seedsGiven: 1, toolCandidatesJudged: 0 } };
  if (label.startsWith('verify:') && /npx -y pkg@latest/.test(prompt)) return { refuted: false, reason: 'selector is @latest', reachabilityTrace: '.mcp.json:5 args contains example-mcp@latest', confidence: 0.9 };
  return agent(prompt, opts);
};
const argsC = JSON.parse(JSON.stringify(args));
argsC.lenses = ['security', 'agent-config'];
argsC.config.lenses = ['security', 'agent-config'];
await runFn({ agent: agentC, parallel, pipeline, phase, log, args: argsC, budget });
const acReviews = seenLabels.filter(l => l.startsWith('review:') && l.endsWith(':agent-config'));
// C1: exactly one agent-config review job, keyed 'agent-config' (not crossed with the api-surface unit)
if (acReviews.length !== 1 || acReviews[0] !== 'review:agent-config:agent-config') { problems++; console.log(`  ✗ expected exactly one review:agent-config:agent-config job, got ${JSON.stringify(acReviews)}`); }
else console.log('  ✓ exactly one agent-config review job (not crossed with units)');
// C2: the job is scoped to the AI-tooling globs and the recon prompt carries the static-only boundary
const acPrompt = seenPrompts['review:agent-config:agent-config'] || '';
if (!acPrompt.includes('**/.mcp.json') || !acPrompt.includes('**/hooks/hooks.json')) { problems++; console.log('  ✗ agent-config job not scoped to the AI-tooling globs'); }
else console.log('  ✓ agent-config job scoped to the AI-tooling globs');
if (!/never execute/i.test(seenPrompts['recon:agent-config'] || '')) { problems++; console.log('  ✗ recon:agent-config prompt lacks the static-only boundary'); }
else console.log('  ✓ recon:agent-config prompt carries the static-only boundary');
// C3: the security lens still crosses with the unit, and the agent-config finding reaches the report
if (!seenLabels.includes('review:api-surface:security')) { problems++; console.log('  ✗ security lens no longer runs per unit'); }
const freshC = (synthInput?.findings || []).map(f => f.id);
if (!freshC.includes('A1')) { problems++; console.log(`  ✗ confirmed agent-config finding A1 missing from synthesizer input (fresh: ${JSON.stringify(freshC)})`); }
else console.log('  ✓ confirmed agent-config finding reaches the report');
// C4: app code under a generic hooks/ dir (React hooks) is NOT in the agent-config scope, while
// real agent hook dirs are. Uses the engine's own globMatch over the globs the job was handed.
const globMatch = new Function(src.match(/function globMatch[\s\S]*?\n}\n/)[0] + '; return globMatch')();
const jobGlobs = (p) => { const m = p.match(/globs: (\[[^\]]*\])/); try { return m ? JSON.parse(m[1]) : []; } catch { return []; } };
const acGlobs = jobGlobs(acPrompt);
if (!acGlobs.length) { problems++; console.log('  ✗ could not read the agent-config job globs from its prompt'); }
else if (globMatch('src/hooks/x.ts', acGlobs)) { problems++; console.log('  ✗ src/hooks/x.ts (app code) is inside the agent-config scope'); }
else if (!globMatch('.claude/hooks/pre.sh', acGlobs) || !globMatch('plugins/p/hooks/run.sh', acGlobs) || !globMatch('hooks/hooks.json', acGlobs)) { problems++; console.log('  ✗ agent hook paths fell out of the agent-config scope'); }
else console.log('  ✓ src/hooks/x.ts is out of agent-config scope; .claude/hooks, plugin hooks, hooks.json are in');
// C5: recon seeds outside the config globs (LLM runtime call sites) still reach the agent-config reviewer
if (!acPrompt.includes('lib/llm/agent-runtime.ts')) { problems++; console.log('  ✗ agent-config recon seed in app code was filtered out of the review prompt'); }
else console.log('  ✓ agent-config recon seeds pass through unfiltered (runtime call site kept)');
// C6: args.path scopes the agent-config job's globs (as recon and unit inference do)
seenLabels.length = 0; for (const k of Object.keys(seenPrompts)) delete seenPrompts[k];
const argsC2 = JSON.parse(JSON.stringify(argsC));
argsC2.path = 'packages/app/';
await runFn({ agent: agentC, parallel, pipeline, phase, log, args: argsC2, budget });
const acGlobs2 = jobGlobs(seenPrompts['review:agent-config:agent-config'] || '');
if (!acGlobs2.length || !acGlobs2.every(g => g.startsWith('packages/app/') && !g.startsWith('packages/app//'))) { problems++; console.log(`  ✗ args.path not applied to agent-config globs: ${JSON.stringify(acGlobs2)}`); }
else if (globMatch('other/.mcp.json', acGlobs2) || !globMatch('packages/app/.mcp.json', acGlobs2)) { problems++; console.log('  ✗ args.path-scoped agent-config globs match the wrong files'); }
else console.log('  ✓ args.path prefixes the agent-config globs (packages/app/.mcp.json in, other/.mcp.json out)');
// C7-C9 re-run scenario C with a given args.path and return the agent-config job's prompt
const runScopedC = async (path) => {
  seenLabels.length = 0; for (const k of Object.keys(seenPrompts)) delete seenPrompts[k];
  const a = JSON.parse(JSON.stringify(argsC)); a.path = path;
  await runFn({ agent: agentC, parallel, pipeline, phase, log, args: a, budget });
  return seenPrompts['review:agent-config:agent-config'] || '';
};
// C7: args.path scoped to a plugin dir keeps that plugin's own hooks/ in scope; a non-plugin
// scope (src) still does not sweep app hooks in
const g7 = jobGlobs(await runScopedC('plugins/p'));
if (!globMatch('plugins/p/hooks/run.sh', g7)) { problems++; console.log(`  ✗ args.path=plugins/p drops the plugin's own hooks/run.sh: ${JSON.stringify(g7)}`); }
else console.log('  ✓ args.path=plugins/p keeps plugins/p/hooks/run.sh in scope');
const g7b = jobGlobs(await runScopedC('src'));
if (globMatch('src/hooks/useAuth.ts', g7b)) { problems++; console.log('  ✗ args.path=src sweeps src/hooks/useAuth.ts (app code) into agent-config'); }
else console.log('  ✓ args.path=src keeps src/hooks/useAuth.ts out of scope');
// C8: '.', './', '' mean unscoped; './sub' is normalized to 'sub/…' (no './' prefixed globs)
for (const p of ['.', './', '']) {
  const g = jobGlobs(await runScopedC(p));
  if (!g.length || g.some(x => x.startsWith('./') || x.startsWith('/')) || !globMatch('.mcp.json', g) || !globMatch('packages/app/.mcp.json', g)) { problems++; console.log(`  ✗ args.path=${JSON.stringify(p)} not treated as unscoped: ${JSON.stringify(g.slice(0, 3))}`); }
  else console.log(`  ✓ args.path=${JSON.stringify(p)} treated as unscoped`);
}
const g8 = jobGlobs(await runScopedC('./packages/app'));
if (!g8.length || !g8.every(x => x.startsWith('packages/app/')) || !globMatch('packages/app/.mcp.json', g8)) { problems++; console.log(`  ✗ args.path=./packages/app not normalized: ${JSON.stringify(g8.slice(0, 3))}`); }
else console.log('  ✓ args.path=./packages/app normalized to packages/app/… globs');
// C9: with args.path set, agent-config seeds/safeControls outside it never reach the reviewer,
// while an LLM call site inside it (but outside the config globs) still does
const p9 = await runScopedC('packages/app');
if (p9.includes('other/lib/llm/out-of-scope-call.ts') || p9.includes('other/.mcp.json') || p9.includes('lib/llm/agent-runtime.ts"')) { problems++; console.log('  ✗ out-of-scope agent-config seed/safeControl reached the reviewer despite args.path'); }
else if (!p9.includes('packages/app/lib/llm/in-scope-call.ts')) { problems++; console.log('  ✗ in-scope LLM call site (outside config globs) was dropped under args.path'); }
else console.log('  ✓ args.path filters agent-config seeds/safeControls; in-scope runtime call site kept');

// ── SCENARIO D: report truthfulness — self-review outcome, held reasons, vulnIntel off, dead synthesizer ─
console.log('\n=== SCENARIO D: report truthfulness ===');
{
  const calls = [];
  const FM = '---\nphases:\n  map: true\n  self_review: false         # set by the engine\n---\n# report';
  const mkAgent = (over) => async (prompt, opts = {}) => {
    const label = opts.label || '';
    calls.push(label);
    if (over[label] !== undefined) return typeof over[label] === 'function' ? over[label](prompt) : over[label];
    if (label === 'synthesize:report') { await agent(prompt, opts); return { markdown: FM, waves: [], counts: { critical: 2, high: 0, medium: 0, low: 1, info: 3 } }; }
    return agent(prompt, opts);
  };
  // D1: gaps found → front-matter flag rewritten to true, gaps appended as OPEN (not re-scanned), ONE pass only
  const argsD = JSON.parse(JSON.stringify(args));
  argsD.config.selfReview = { enabled: true, maxRounds: 3 };
  argsD.config.vulnIntel = { enabled: false };   // YAML boolean, not the string 'false'
  const rD = await runFn({ agent: mkAgent({ 'selfreview:round-1': { gaps: [{ area: 'billing unit × security', whatWasMissed: 'webhook signature check never reviewed' }], overallAssessment: 'mostly complete' } }), parallel, pipeline, phase, log, args: argsD, budget });
  const md = rD?.report?.markdown || '';
  const srCalls = calls.filter(l => l.startsWith('selfreview:')).length;
  if (!/^\s*self_review: true/m.test(md)) { problems++; console.log('  ✗ front-matter phases.self_review not rewritten to true after self-review ran'); }
  else console.log('  ✓ front-matter phases.self_review rewritten to true by the engine');
  if (!md.includes('webhook signature check never reviewed') || !/not re-scanned/.test(md) || !/coverage is incomplete in these areas/.test(md)) { problems++; console.log('  ✗ self-review gaps did not reach the report as open gaps'); }
  else console.log('  ✓ self-review gaps appended to the report, labeled not re-scanned / coverage incomplete');
  if (srCalls !== 1) { problems++; console.log(`  ✗ ${srCalls} self-review passes over an unchanged report (want exactly 1)`); }
  else console.log('  ✓ exactly one self-review pass even with maxRounds: 3 (no re-scan exists)');
  if (rD?.selfReview?.ran !== true || rD?.selfReview?.reScanned !== false || rD?.selfReview?.gaps !== 1) { problems++; console.log(`  ✗ result.selfReview wrong: ${JSON.stringify(rD?.selfReview)}`); }
  // D2: vulnIntel.enabled: false (boolean) turns enrichment off
  if (rD?.vulnIntel?.enabled !== false) { problems++; console.log(`  ✗ vulnIntel.enabled:false (boolean) still enabled: ${JSON.stringify(rD?.vulnIntel)}`); }
  else console.log('  ✓ vulnIntel.enabled: false (YAML boolean) disables MCP enrichment');
  // D3: a high refuted by the majority WITHOUT a guard, and a critical whose voters all die, are held
  // with their real reasons — never labeled "majority-held"
  synthInput = null;
  const verifyOver = (prompt) => {
    const m = prompt.match(/FINDING:\s*(\{[\s\S]*\})/); let f = {}; try { f = JSON.parse(m[1]); } catch {}
    if ((f.title || '').includes('getSession')) return { refuted: true, reason: 'probably fine' };   // no counterEvidence
    if ((f.title || '').includes('users route')) return null;                                       // voter died
    return undefined;
  };
  const agentD3 = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('verify:')) { const v = verifyOver(prompt); if (v !== undefined) return v; }
    return mkAgent({})(prompt, opts);
  };
  await runFn({ agent: agentD3, parallel, pipeline, phase, log, args: JSON.parse(JSON.stringify(args)), budget });
  const reasons = Object.fromEntries((synthInput?.heldUntraced || []).map(f => [f.id, f.heldReason]));
  if (reasons.F2 !== 'refuted-without-guard' || reasons.F1 !== 'no-quorum') { problems++; console.log(`  ✗ held reasons wrong: ${JSON.stringify(reasons)} (want F2 refuted-without-guard, F1 no-quorum)`); }
  else console.log('  ✓ refuted-without-guard and no-quorum highs are held with their own reasons');
  // D2b: the vulnIntel switch is checked on the path it gates — an SCA review job. With
  // enabled:false the SCA reviewer prompt carries no VULN_INTEL_MCP block; by default it does.
  const scaPrompt = async (vulnIntel) => {
    const prompts = {};
    const a = JSON.parse(JSON.stringify(args));
    a.lenses = ['security', 'sca']; a.config.lenses = ['security', 'sca'];
    if (vulnIntel) a.config.vulnIntel = vulnIntel;
    await runFn({ agent: async (p, o = {}) => { prompts[o.label || ''] = p; return mkAgent({})(p, o); }, parallel, pipeline, phase, log, args: a, budget });
    return prompts['review:api-surface:sca'];
  };
  const offP = await scaPrompt({ enabled: false }), onP = await scaPrompt(null);
  if (offP === undefined || onP === undefined) { problems++; console.log('  ✗ no SCA review job ran — the vulnIntel check exercised nothing'); }
  else if (offP.includes('VULN_INTEL_MCP') || !onP.includes('VULN_INTEL_MCP')) { problems++; console.log(`  ✗ SCA prompt VULN_INTEL_MCP: off=${offP.includes('VULN_INTEL_MCP')} on=${onP.includes('VULN_INTEL_MCP')} (want false/true)`); }
  else console.log('  ✓ SCA review prompt omits VULN_INTEL_MCP when vulnIntel.enabled is false, carries it by default');
  // D3b: three requested voters, some die. A split vote is NOT "refuted-without-guard"; a guard
  // cited by a vote that is not a majority (tie, or no quorum) does NOT cleanly refute a high.
  const run3 = async (perVoter) => {
    synthInput = null;
    const a = JSON.parse(JSON.stringify(args)); a.config.verify = { voters: 3 };
    await runFn({ agent: async (p, o = {}) => {
      if ((o.label || '').startsWith('verify:')) {
        const m = p.match(/FINDING:\s*(\{[\s\S]*\})/); let f = {}; try { f = JSON.parse(m[1]); } catch {}
        const n = Number((p.match(/Voter (\d+)\//) || [])[1]);
        const v = perVoter(f.title || '', n);
        if (v !== undefined) return v;
      }
      return mkAgent({})(p, o);
    }, parallel, pipeline, phase, log, args: a, budget });
    return { held: Object.fromEntries((synthInput?.heldUntraced || []).map(f => [f.id, f.heldReason])), fresh: (synthInput?.findings || []).map(f => f.id) };
  };
  const hold = { refuted: false, reason: 'looks real' };
  const refNoGuard = { refuted: true, reason: 'probably fine' };
  const refGuard = { refuted: true, reason: 'guarded', counterEvidence: 'proxy.ts:3 getUser()' };
  const tie = await run3((t, n) => t.includes('getSession') ? [null, hold, refNoGuard, null][n] : undefined);
  if (tie.held.F2 !== 'split-vote') { problems++; console.log(`  ✗ 1 hold / 1 refute (no guard) / 1 dead labeled ${JSON.stringify(tie.held.F2)}, want "split-vote"`); }
  else console.log('  ✓ a 1-1 split with a dead voter is held as "split-vote", not "refuted-without-guard"');
  const tieG = await run3((t, n) => t.includes('getSession') ? [null, hold, refGuard, null][n] : undefined);
  if (tieG.held.F2 !== 'split-vote') { problems++; console.log(`  ✗ 1 hold / 1 refute WITH guard / 1 dead → ${JSON.stringify(tieG.held.F2)} (a tie must not cleanly refute a high)`); }
  else console.log('  ✓ a guard cited in a tied vote does not drop the high — held as "split-vote"');
  const lone = await run3((t, n) => t.includes('users route') ? [null, refGuard, null, null][n] : undefined);
  if (lone.held.F1 !== 'no-quorum') { problems++; console.log(`  ✗ lone surviving voter refuting with a guard → ${JSON.stringify(lone.held.F1)} (want held "no-quorum", not dropped)`); }
  else console.log('  ✓ one surviving voter (no quorum) cannot cleanly refute a critical — held as "no-quorum"');
  // D5: a scanner failure the reviewer reports reaches COVERAGE_TOTALS, so it cannot read as zero candidates
  synthInput = null;
  const failMsg = 'semgrep failed (exit 2, no output) — not scanned';
  const reviewPrompts = {};
  await runFn({ agent: async (p, o = {}) => {
    if (o.label === 'review:api-surface:security') {
      reviewPrompts.sec = p;
      const r = await agent(p, o); return { ...r, coverage: { ...r.coverage, toolFailures: [failMsg] } };
    }
    if (o.label === 'synthesize:report') reviewPrompts.synth = p;
    return mkAgent({})(p, o);
  }, parallel, pipeline, phase, log, args: JSON.parse(JSON.stringify(args)), budget });
  // the block that follows the COVERAGE_TOTALS: data marker (the name also appears in the instructions)
  const ct = (reviewPrompts.synth || '').split('\nCOVERAGE_TOTALS:\n')[1]?.split('\n\n')[0];
  let tf; try { tf = JSON.parse(ct).security.reviewed.toolFailures; } catch {}
  if (!Array.isArray(tf) || !tf.some(x => x.includes(failMsg)) || !/toolFailures/.test(reviewPrompts.sec || '')) { problems++; console.log(`  ✗ reviewer tool failure did not reach COVERAGE_TOTALS (got ${JSON.stringify(tf)})`); }
  else console.log('  ✓ reviewer-reported scanner failure reaches COVERAGE_TOTALS.security.reviewed.toolFailures');
  // D4: a dead synthesizer must not look like a clean run (report:null is the clean signal)
  const rD4 = await runFn({ agent: mkAgent({ 'synthesize:report': null }), parallel, pipeline, phase, log, args: JSON.parse(JSON.stringify(args)), budget });
  if (!rD4?.report || !/SYNTHESIS FAILED/.test(rD4.report.markdown || '')) { problems++; console.log('  ✗ dead synthesizer returned report:null — reads as a clean run'); }
  else console.log('  ✓ dead synthesizer → engine fallback report, never report:null');
}

// ── SCENARIO E: ambiguity lens — one lens-hint list, prose jobs + TOOL ROOT, proof contract (AC-020..AC-029) ─
console.log('\n=== SCENARIO E: ambiguity lens ===');
{
  const fail = (m) => { problems++; console.log('  ✗ ' + m); };
  const ok = (m) => console.log('  ✓ ' + m);
  const UNITS_E = [
    { key: 'api-surface', title: 'API and auth surface', globs: ['proxy.ts', 'app/api/**', 'lib/**'], riskScore: 0.9 },
    { key: 'web', title: 'Web app', globs: ['web/**'], riskScore: 0.3 },
  ];
  const SEEDS_E = ['lib/SECURITY.md', 'lib/a.ts', 'docs/x.md', 'other/y.md', 'docs/fixtures/z.md', 'CHANGELOG.md']
    .map((file, i) => ({ file, line: i + 1, note: 'seed' }));
  // one engine run with a recording stub (label, prompt, opts.schema); unmatched labels fall back to the base stub
  const runE = async ({ lenses = ['ambiguity'], cfg = {}, path, mode = 'full', over = {} } = {}) => {
    const calls = [], logsE = [];
    const a = JSON.parse(JSON.stringify(args));
    a.lenses = lenses; a.config.lenses = lenses; a.mode = mode;
    a.config.units.list = JSON.parse(JSON.stringify(UNITS_E));
    Object.assign(a.config, JSON.parse(JSON.stringify(cfg)));
    if (path !== undefined) a.path = path;
    const stub = async (prompt, opts = {}) => {
      const label = opts.label || '';
      calls.push({ label, prompt, schema: opts.schema });
      if (over[label] !== undefined) return typeof over[label] === 'function' ? over[label](prompt) : over[label];
      if (label.startsWith('verify:') && over.verify) return over.verify(prompt);
      if (label === 'recon:ambiguity') return { domain: 'ambiguity', denominators: [], seeds: SEEDS_E, safeControls: [] };
      if (label.startsWith('review:')) return { findings: [], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } };
      if (label === 'synthesize:report') return { markdown: '# report', waves: [], counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } };
      return agent(prompt, opts);
    };
    const res = await runFn({ agent: stub, parallel, pipeline, phase, log: (m) => logsE.push(String(m)), args: a, budget });
    const by = (l) => calls.find(c => c.label === l);
    return { calls, logs: logsE, res, by, labels: calls.map(c => c.label), prompt: (l) => by(l)?.prompt || '' };
  };
  const globsOf = (p) => { const m = (p || '').match(/globs: (\[[^\]]*\])/); try { return m ? JSON.parse(m[1]) : []; } catch { return []; } };
  const skipOf = (p) => { const m = (p || '').match(/\(skip: (\[[^\]]*\])\)/); try { return m ? JSON.parse(m[1]) : []; } catch { return []; } };
  const toolCmd = (p, mode) => ((p || '').match(new RegExp('`([^`]*ambiguity\\.sh ' + mode + ' [^`]*)`')) || [])[1] || '';
  const toolArgs = (cmd) => { const o = { ex: [], globs: [] }; for (const m of cmd.matchAll(/(--exclude )?'([^']*)'/g)) (m[1] ? o.ex : o.globs).push(m[2]); return o; };
  const block = (p, name) => { const s = (p || '').split(`\n${name}:\n`)[1]; if (s === undefined) return undefined; try { return JSON.parse(s.split('\n\n')[0]); } catch { return undefined; } };
  const findingOf = (p) => { const m = (p || '').match(/FINDING:\s*(\{[\s\S]*\})/); try { return m ? JSON.parse(m[1]) : {}; } catch { return {}; } };
  const reviewLabels = (r) => r.labels.filter(l => l.startsWith('review:') && l.endsWith(':ambiguity')).sort();
  const POL = 'review:prose-policy:ambiguity', INS = 'review:prose-instructions:ambiguity';

  // AC-020: the rulebook prompt's lensHint list IS the schema enum (one LENS_HINTS source)
  const r0 = await runE();
  const rb = r0.by('discover:rulebook');
  const promptHints = ((rb?.prompt || '').match(/lensHint \(([^)]*)\)/) || [])[1]?.split('|') ?? [];
  const schemaHints = rb?.schema?.properties?.rules?.items?.properties?.lensHint?.enum ?? [];
  // kills: a hand-copied prompt list drifting from the schema enum. The prompt OFFERS only HEAD's base
  // hints plus the running review lenses (§15: a hint for a lens with no reviewer this run closes its
  // rule NOT CHECKED), so it must be the schema enum filtered in order, and carry ambiguity when it runs.
  const BASE_HINTS = ['security', 'correctness', 'architecture', 'docs-drift', 'agent-config', 'any'];
  const derived = (ls) => schemaHints.filter(h => BASE_HINTS.includes(h) || (h !== 'compliance' && ls.includes(h)));
  if (schemaHints.length !== 17 || JSON.stringify(promptHints) !== JSON.stringify(derived(['ambiguity'])) || !promptHints.includes('ambiguity')) fail(`rulebook prompt lensHints ${JSON.stringify(promptHints)} are not the 17-value schema enum ${JSON.stringify(schemaHints)} filtered to base + running lenses (or no ambiguity)`);
  else ok(`rulebook prompt lensHints = schema enum (17) filtered to base + running lenses, incl. ambiguity (${promptHints.join('|')})`);
  const reconMd = fs.readFileSync(new URL('../agents/audit-recon.md', import.meta.url), 'utf8');
  // kills: audit-recon.md keeping its own copied lensHint list
  if (reconMd.split('\n').some(l => /security`? *\| *`?correctness/.test(l))) fail('agents/audit-recon.md still carries a copied lensHint list');
  else ok('agents/audit-recon.md defers to the dispatch prompt for lensHint values');

  // AC-021: default config → exactly the two prose jobs, no unit-crossed ambiguity job
  // kills: crossing ambiguity with units by default, or a single prose job instead of one per group
  if (JSON.stringify(reviewLabels(r0)) !== JSON.stringify([INS, POL])) fail(`default ambiguity review labels ${JSON.stringify(reviewLabels(r0))}, want exactly the two prose jobs`);
  else ok('default ambiguity run = review:prose-policy + review:prose-instructions, no unit job');
  // kills: default groups missing the skills sibling glob (PR #22) or the policy docs; dropping rulesFrom from instructions
  if (!globsOf(r0.prompt(POL)).includes('**/SECURITY.md') || !globsOf(r0.prompt(INS)).includes('**/skills/**/*.md') || !globsOf(r0.prompt(INS)).includes('AGENTS.md')) fail('default prose group globs wrong (want **/SECURITY.md in policy; **/skills/**/*.md + rulesFrom AGENTS.md in instructions)');
  else ok('prose-policy covers **/SECURITY.md; prose-instructions covers **/skills/**/*.md + rulesFrom');
  // kills: recon telling the reviewer code mode ran when ambiguity.code is off
  if (!/code is OUT of scope \(ambiguity\.code is off\)/.test(r0.prompt('recon:ambiguity'))) fail('recon:ambiguity does not say code is out of scope when ambiguity.code is off');
  else ok('recon:ambiguity states code is OUT of scope by default');

  // AC-022: code:true adds one unit job per unit; a prose seed reaches the prose job, never the unit job
  const r2 = await runE({ cfg: { ambiguity: { code: true } } });
  const unitAmb = reviewLabels(r2).filter(l => !l.startsWith('review:prose-'));
  // kills: ignoring ambiguity.code (no unit jobs) or crossing only some units
  if (JSON.stringify(unitAmb) !== JSON.stringify(['review:api-surface:ambiguity', 'review:web:ambiguity'])) fail(`code:true unit ambiguity jobs ${JSON.stringify(unitAmb)}, want one per unit`);
  else ok('ambiguity.code: true adds one review:<unit>:ambiguity per unit');
  // kills: a code-job seed filter that does not drop prose files (inUnit alone keeps lib/SECURITY.md)
  if (!r2.prompt(POL).includes('"lib/SECURITY.md"') || r2.prompt('review:api-surface:ambiguity').includes('"lib/SECURITY.md"')) fail('seed lib/SECURITY.md not routed to prose-policy only');
  else if (!r2.prompt('review:api-surface:ambiguity').includes('"lib/a.ts"')) fail('code-job seed lib/a.ts dropped (filter too aggressive)');
  else ok('seed lib/SECURITY.md reaches prose-policy, not the unit job; lib/a.ts stays with the unit job');

  // AC-023: first matching group owns a file; default excludes and config.ignore skip
  const r3 = await runE({ cfg: { ignore: ['dist/**'], ambiguity: { prose: { groups: { a: ['docs/**'], b: ['**/*.md'] } } } } });
  const pa = r3.prompt('review:prose-a:ambiguity'), pb = r3.prompt('review:prose-b:ambiguity');
  // kills: no ownership (docs/x.md in both jobs) or groups that never receive their seeds
  if (!pa.includes('"docs/x.md"') || pb.includes('"docs/x.md"') || !pb.includes('"other/y.md"') || pa.includes('"other/y.md"')) fail('group ownership wrong: want docs/x.md only in prose-a, other/y.md only in prose-b');
  else ok('first matching group owns a file (docs/x.md → prose-a, other/y.md → prose-b)');
  // kills: seed filter ignoring the default excludes
  if (!pa || !pb || [pa, pb].some(p => p.includes('"docs/fixtures/z.md"') || p.includes('"CHANGELOG.md"'))) fail('fixtures/CHANGELOG seeds reached a prose prompt (or no prose prompts ran)');
  else ok('seeds under **/fixtures/** and CHANGELOG.md reach no prose prompt');
  // kills: a unit line without the skip list, or config.ignore not added to the excludes
  if (![pa, pb].every(p => skipOf(p).includes('**/fixtures/**') && skipOf(p).includes('dist/**'))) fail(`prose prompts lack skip: with **/fixtures/** and config.ignore (got ${JSON.stringify(skipOf(pb))})`);
  else ok('prose prompts carry skip: with **/fixtures/** and the config.ignore entry');

  // AC-024: args.path → scoped engine globs, but the tool runs from TOOL ROOT with unscoped globs (D25)
  const r4 = await runE({ path: 'packages/app/', cfg: { ignore: ['packages/app/gen/**', 'other/**'] } });
  const p4 = r4.prompt(POL), g4 = globsOf(p4);
  // kills: unscoped engine globs under args.path, or a './' / '//' prefix from naive joining
  if (!g4.includes('packages/app/README.md') || !g4.includes('packages/app/**/SECURITY.md') || g4.some(g => g.startsWith('./') || g.includes('//'))) fail(`scoped prose-policy globs wrong: ${JSON.stringify(g4)}`);
  else ok('prose-policy globs scoped to packages/app/ with no ./ or // artefacts');
  const c4 = toolCmd(p4, 'prose'), t4 = toolArgs(c4);
  // kills: the reviewer running the tool from the repo root, or with the scoped globs
  if (!p4.includes('TOOL ROOT: `packages/app`') || !c4.includes('ambiguity.sh prose packages/app ') || !t4.globs.includes('**/SECURITY.md') || c4.includes('packages/app/**/SECURITY.md')) fail(`prose tool command not rooted at packages/app with unscoped globs: ${JSON.stringify(c4)}`);
  else ok('prose prompt: TOOL ROOT `packages/app`, `ambiguity.sh prose packages/app … **/SECURITY.md` (unscoped)');
  // kills: passing config.ignore to the tool verbatim (repo-relative) or dropping it
  if (!t4.ex.includes('gen/**') || t4.ex.some(g => g.startsWith('other/') || g.startsWith('packages/app/'))) fail(`tool excludes not rebased onto TOOL ROOT: ${JSON.stringify(t4.ex)}`);
  else ok('config.ignore rebased for the tool: gen/** in, other/** out');
  // kills: the contract command (or recon) using a different root/globs than the review prose command
  if (!toolCmd(p4, 'contract').includes('ambiguity.sh contract packages/app ') || !r4.prompt('recon:ambiguity').includes('TOOL ROOT: `packages/app`') || !r4.prompt('recon:ambiguity').includes(c4)) fail('contract command or recon not rooted at the same TOOL ROOT / prose command');
  else ok('contract command and recon:ambiguity use the same TOOL ROOT and prose command');
  // kills: an unscoped run with an empty or repo-absolute tool root
  if (!r0.prompt(POL).includes('TOOL ROOT: `.`') || !toolCmd(r0.prompt(POL), 'prose').includes('ambiguity.sh prose . ')) fail('unscoped run: TOOL ROOT is not `.`');
  else ok('unscoped run: TOOL ROOT is `.`');

  // AC-025: quick mode samples units, never the prose jobs
  const r5 = await runE({ mode: 'quick', cfg: { quick: { topN: 1 }, ambiguity: { code: true } } });
  const l5 = reviewLabels(r5);
  // kills: pushing prose jobs before sampling, or sampling them away
  if (!l5.includes(POL) || !l5.includes(INS) || l5.filter(l => !l.startsWith('review:prose-')).length !== 1) fail(`quick topN:1 ambiguity jobs ${JSON.stringify(l5)}, want both prose jobs + exactly one unit job`);
  else ok('quick mode (topN 1): both prose jobs + exactly one unit ambiguity job');

  // AC-026..AC-029: proof contract prompt, arbiter, variant skip, readings reach synth
  const RD = { a: 'admin-only access is out of scope', b: 'all admin findings are out of scope', consumer: 'a reporter deciding scope', divergence: 'privilege-escalation reports withheld' };
  const mkF = (id, severity, extra = {}) => ({ id, title: `[${id}] ambiguous scope clause`, severity, file: 'SECURITY.md', line: 7, rule: 'ambiguity:scope-clause', snippet: `${id} clause`, normalizedSnippet: `${id} clause`, source: 'reasoning', ...extra });
  const AM1 = mkF('AM1', 'medium', { snippet: '// x\nand/or', remediationBucket: 'owner-decision', confidence: 'likely', readings: RD });
  const AL1 = mkF('AL1', 'low', { line: 9 });
  const AH1 = mkF('AH1', 'high', { line: 11 });
  const AH2 = mkF('AH2', 'high', { line: 13 });
  const SEC1 = { id: 'SEC1', title: '[SEC1] unchecked input', severity: 'medium', file: 'lib/a.ts', line: 3, rule: 'sec:input', snippet: 'run(x) // trusted', normalizedSnippet: 'run x', source: 'reasoning' };
  const TRACE = 'A → reporter files the bug | B → reporter withholds it @ SECURITY.md:7';
  const r6 = await runE({
    lenses: ['security', 'ambiguity'],
    over: {
      'review:api-surface:security': { findings: [SEC1], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } },
      [POL]: { findings: [AM1, AL1, AH1, AH2], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } },
      verify: (p) => {
        const id = (findingOf(p).title || '').match(/^\[(\w+)\]/)?.[1];
        return ['AM1', 'AH2'].includes(id) ? { refuted: false, reason: 'diverges', reachabilityTrace: TRACE } : { refuted: false, reason: 'held, no trace' };
      },
    },
  });
  const vp = (id) => r6.calls.find(c => c.label.startsWith('verify:') && findingOf(c.prompt).title?.startsWith(`[${id}]`))?.prompt || '';
  const vAM1 = vp('AM1'), vSEC1 = vp('SEC1');
  // kills: ambiguity findings verified with the security-shaped prompt, or readings left out of FINDING
  if (!vAM1.includes('AMBIGUITY PROOF CONTRACT') || !vAM1.includes('"readings"') || vAM1.includes('attacker-controlled input')) fail('ambiguity verifier prompt lacks the proof contract / readings, or keeps the security intro');
  else ok('ambiguity verifier prompt carries AMBIGUITY PROOF CONTRACT + readings, no security intro');
  // kills: stripComments applied to ambiguity snippets (the comment IS the evidence)
  if (findingOf(vAM1).snippet !== '// x\nand/or') fail(`ambiguity snippet altered before the verifier: ${JSON.stringify(findingOf(vAM1).snippet)}`);
  else ok('ambiguity snippet "// x\\nand/or" reaches the verifier intact');
  // kills: the contract leaking into other lenses, or comment-stripping turned off for them
  if (!vSEC1 || vSEC1.includes('AMBIGUITY PROOF CONTRACT') || findingOf(vSEC1).snippet !== 'run(x) ') fail(`security verifier prompt changed (marker present or snippet ${JSON.stringify(findingOf(vSEC1).snippet)})`);
  else ok('security verifier prompt unchanged: no contract marker, snippet comment-stripped');
  const synth6 = r6.prompt('synthesize:report');
  const F6 = block(synth6, 'FINDINGS') || [], H6 = block(synth6, 'HELD_UNTRACED') || [], D6 = block(synth6, 'PROOF_CONTRACT_DROPPED');
  const fIds = F6.map(f => f.id).sort(), hIds = H6.map(f => f.id), dIds = (D6 || []).map(f => f.id);
  // kills: an arbiter that drops traced ambiguity findings, or loses the voter trace
  if (!fIds.includes('AM1') || F6.find(f => f.id === 'AM1')?.reachabilityTrace !== TRACE) fail(`traced medium ambiguity AM1 not in FINDINGS with its trace (FINDINGS ${JSON.stringify(fIds)})`);
  else ok('medium ambiguity held WITH a trace → FINDINGS with that trace');
  // kills: the low/medium majority rule promoting an untraced ambiguity finding
  if (fIds.includes('AL1') || hIds.includes('AL1')) fail('untraced low ambiguity AL1 reached FINDINGS or HELD_UNTRACED');
  else if (!r6.logs.some(l => l.includes('AL1') && /proof contract/.test(l))) fail('no log line names the proof contract for AL1');
  else ok('low ambiguity held WITHOUT a trace → neither FINDINGS nor HELD_UNTRACED, logged against the proof contract');
  // kills: a silent drop (no PROOF_CONTRACT_DROPPED), or one that also lists highs / other lenses
  if (JSON.stringify(dIds) !== JSON.stringify(['AL1']) || JSON.stringify(D6[0]) !== JSON.stringify({ id: 'AL1', file: 'SECURITY.md', line: 9, rule: 'ambiguity:scope-clause', severity: 'low' })) fail(`PROOF_CONTRACT_DROPPED ${JSON.stringify(D6)}, want exactly [{AL1 …}]`);
  else ok('PROOF_CONTRACT_DROPPED lists exactly AL1 {id,file,line,rule,severity}');
  // kills: extending the trace requirement to every lens's low/medium findings
  if (!fIds.includes('SEC1') || dIds.includes('SEC1')) fail('untraced medium security SEC1 not confirmed (or listed as proof-contract dropped)');
  else ok('medium security finding held without a trace stays confirmed, not proof-contract dropped');
  // kills: routing an untraced high ambiguity into the dropped list instead of HELD_UNTRACED
  if (!hIds.includes('AH1') || dIds.includes('AH1') || fIds.includes('AH1')) fail(`untraced high ambiguity AH1 not held-untraced (held ${JSON.stringify(hIds)}, dropped ${JSON.stringify(dIds)})`);
  else ok('high ambiguity held without a trace → HELD_UNTRACED, not dropped');
  // AC-028 — kills: variant seeds that include confirmed ambiguity highs
  if (!fIds.includes('AH2')) fail('traced high ambiguity AH2 not confirmed (variant check would be vacuous)');
  else if (r6.labels.some(l => l.startsWith('variant:'))) fail(`confirmed high ambiguity spawned a variant hunt: ${JSON.stringify(r6.labels.filter(l => l.startsWith('variant:')))}`);
  else ok('confirmed high ambiguity AH2 spawns no variant: job');
  // AC-029 — kills: readings stripped between review and synth
  if (JSON.stringify(F6.find(f => f.id === 'AM1')?.readings) !== JSON.stringify(RD) || F6.find(f => f.id === 'AM1')?.remediationBucket !== 'owner-decision') fail('owner-decision ambiguity AM1 reached synth without its readings');
  else ok('owner-decision ambiguity reaches synth FINDINGS with readings intact');
  const rs = r6.by(POL)?.schema?.properties?.findings?.items;
  // kills: no readings in REVIEW_SCHEMA, wrong keys, or readings made required for every lens
  if (JSON.stringify(Object.keys(rs?.properties?.readings?.properties || {}).sort()) !== JSON.stringify(['a', 'b', 'consumer', 'divergence']) || (rs?.required || []).includes('readings')) fail('REVIEW_SCHEMA findings lack optional readings {a,b,consumer,divergence}');
  else ok('REVIEW_SCHEMA findings carry optional readings {a, b, consumer, divergence}');
  // AC-027 paired — kills: PROOF_CONTRACT_DROPPED only passed when non-empty. An ambiguity run that
  // writes a report (a confirmed security finding) but drops no ambiguity finding must still state zero
  // (§4.10). A run with nothing confirmed short-circuits as clean and writes no report at all.
  const rZ = await runE({ lenses: ['security', 'ambiguity'], over: { 'review:api-surface:security': { findings: [SEC1], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } }, verify: () => ({ refuted: false, reason: 'held' }) } });
  if (!(block(rZ.prompt('synthesize:report'), 'FINDINGS') || []).some(f => f.id === 'SEC1')) fail('AC-027 zero-drop run wrote no report with SEC1 (the [] check below would be vacuous)');
  const dZ = block(rZ.prompt('synthesize:report'), 'PROOF_CONTRACT_DROPPED');
  if (!Array.isArray(dZ) || dZ.length !== 0) fail(`ambiguity run without ambiguity findings: PROOF_CONTRACT_DROPPED is ${JSON.stringify(dZ)}, want []`);
  else ok('ambiguity run without ambiguity findings passes PROOF_CONTRACT_DROPPED: []');
  // kills: the ambiguity rendering instructions and data block leaking into runs without the lens (§4.11)
  const rA = await runE({ lenses: ['security', 'docs-drift'], over: { 'review:api-surface:security': (p) => agent(p, { label: 'review:api-surface:security' }), 'review:docs:docs-drift': (p) => agent(p, { label: 'review:docs:docs-drift' }) } });
  const sA = rA.prompt('synthesize:report');
  if (!sA || sA.includes('PROOF_CONTRACT_DROPPED') || sA.includes('ambiguity:*') || sA.includes('Readings (A / B)')) fail('security + docs-drift run: synth prompt carries the ambiguity instructions or PROOF_CONTRACT_DROPPED');
  else ok('security + docs-drift run: synth prompt has no ambiguity instructions and no PROOF_CONTRACT_DROPPED block');
  // kills: the synth losing the ambiguity rendering instructions (only the data block was pinned)
  const missingSynth = ['ambiguity:*', 'Readings (A / B)', 'Diverges for', 'Proposed wording', 'A-or-B question', 'Dropped by the ambiguity proof contract'].filter(t => !synth6.includes(t));
  if (missingSynth.length) fail(`ambiguity synth prompt lacks ${JSON.stringify(missingSynth)}`);
  else ok('ambiguity synth prompt carries Readings (A / B), Diverges for, Proposed wording, A-or-B question, the dropped-count line');

  // ── review-round fixes (§15, 2026-11-02) ──
  // a run that throws at load surfaces as a rejected promise; report it instead of crashing the suite
  const tryRun = async (o) => { try { return { r: await runE(o) }; } catch (e) { return { err: String(e?.message ?? e) }; } };
  // kills: ambiguity config computed unguarded at load — a string config.ignore or prose.exclude crashed
  // EVERY run (even security-only); a string exclude unscoped was spread into one-character globs
  const c1 = await tryRun({ lenses: ['security'], cfg: { ignore: 'dist/**' } });
  const c2 = await tryRun({ lenses: ['security'], path: 'pkg', cfg: { ambiguity: { prose: { exclude: '**/CHANGELOG.md' } } } });
  if (c1.err || !c1.r.res || c2.err || !c2.r.res) fail(`security-only run crashed on a string ignore/exclude: ${c1.err ?? ''} ${c2.err ?? ''}`);
  else ok('security-only run with a string config.ignore / ambiguity.prose.exclude completes');
  const c3 = await tryRun({ cfg: { ignore: 'dist/**', ambiguity: { prose: { exclude: '**/CHANGELOG.md', groups: { a: 'docs/**' } } } } });
  const t3 = toolArgs(toolCmd(c3.r?.prompt('review:prose-a:ambiguity'), 'prose'));
  if (c3.err || JSON.stringify(t3.ex) !== JSON.stringify(['**/CHANGELOG.md', 'dist/**']) || JSON.stringify(t3.globs) !== JSON.stringify(['docs/**'])) fail(`string exclude/ignore/group not read as one glob each: ${c3.err ?? JSON.stringify(t3)}`);
  else ok("string exclude, ignore and group value each read as one glob (--exclude '**/CHANGELOG.md' --exclude 'dist/**' 'docs/**')");

  // kills: a rulebook prompt offering every hint (17) in a default run — rules hinted concurrency /
  // compliance / ambiguity reach no reviewer and close NOT CHECKED. The default run is HEAD's list.
  const hintsOf = (r) => ((r.prompt('discover:rulebook').match(/lensHint \(([^)]*)\)/) || [])[1] ?? '');
  const h1 = await runE({ lenses: ['security', 'correctness', 'architecture'] });
  const h2 = await runE({ lenses: ['security', 'compliance', 'concurrency'] });
  if (hintsOf(h1) !== 'security|correctness|architecture|docs-drift|agent-config|any') fail(`default-lens rulebook hints changed from HEAD: ${hintsOf(h1)}`);
  else if (hintsOf(h2) !== 'security|correctness|architecture|docs-drift|concurrency|agent-config|any') fail(`hints for security+compliance+concurrency: ${hintsOf(h2)} (want concurrency added, compliance never)`);
  else ok('rulebook hints: HEAD list for default lenses; a running review lens is added; compliance never offered');

  // kills: a trace check that accepts any non-blank filler, the critical ceiling living only in
  // prompts, routing by lens only (E09) or rule prefix only (E10), and a Variant seed filter that
  // checks lens only (a confirmed high security-lens ambiguity:* finding would seed a hunt)
  const SH = (id, sev, line, extra = {}) => mkF(id, sev, { line, ...extra });
  const AN1 = SH('AN1', 'low', 21), AN2 = SH('AN2', 'medium', 23), AN3 = SH('AN3', 'high', 25), AT1 = SH('AT1', 'low', 27), ACR = SH('ACR', 'critical', 29);
  const ANP = SH('ANP', 'medium', 31, { rule: 'scope-clause' });
  const SAU = { ...SEC1, id: 'SAU', title: '[SAU] unit-less timeout in docs', rule: 'ambiguity:unit', severity: 'medium', file: 'lib/README.md', line: 4 };
  const SAH = { ...SEC1, id: 'SAH', title: '[SAH] two readings of the retry budget', rule: 'ambiguity:unit', severity: 'high', file: 'lib/README.md', line: 8 };
  const ASCII = 'A -> retries 5 times | B -> retries for 5 s @ lib/retry.ts:9';
  const r7 = await runE({
    lenses: ['security', 'ambiguity'],
    over: {
      'review:api-surface:security': { findings: [SAU, SAH], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } },
      [POL]: { findings: [AN1, AN2, AN3, AT1, ACR, ANP], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } },
      verify: (p) => {
        const id = (findingOf(p).title || '').match(/^\[(\w+)\]/)?.[1];
        if (['AT1', 'SAH'].includes(id)) return { refuted: false, reason: 'diverges', reachabilityTrace: ASCII };
        if (id === 'ACR') return { refuted: false, reason: 'diverges', reachabilityTrace: TRACE };
        return { refuted: false, reason: 'held', reachabilityTrace: id === 'AN2' ? 'see reason' : 'n/a' };
      },
    },
  });
  const s7 = r7.prompt('synthesize:report');
  const F7 = block(s7, 'FINDINGS') || [], H7 = (block(s7, 'HELD_UNTRACED') || []).map(f => f.id), D7 = (block(s7, 'PROOF_CONTRACT_DROPPED') || []).map(f => f.id).sort();
  const f7 = F7.map(f => f.id).sort();
  if (JSON.stringify(D7) !== JSON.stringify(['AN1', 'AN2', 'ANP', 'SAU']) || !H7.includes('AN3') || f7.some(id => ['AN1', 'AN2', 'AN3', 'ANP', 'SAU'].includes(id))) fail(`filler traces / routing: dropped ${JSON.stringify(D7)}, held ${JSON.stringify(H7)}, findings ${JSON.stringify(f7)} (want dropped AN1,AN2,ANP,SAU; AN3 held)`);
  else ok("filler traces ('n/a', 'see reason') never confirm: low/medium → PROOF_CONTRACT_DROPPED, high → HELD_UNTRACED; contract applies by lens OR rule prefix");
  if (!f7.includes('AT1') || !f7.includes('SAH')) fail(`an ASCII-arrow divergence trace did not confirm (findings ${JSON.stringify(f7)})`);
  else ok("'A -> … | B -> … @ consumer' (ASCII arrows) confirms");
  const vp7 = (id) => r7.calls.find(c => c.label.startsWith('verify:') && findingOf(c.prompt).title?.startsWith(`[${id}]`))?.prompt || '';
  if (!['SAU', 'ANP'].every(id => vp7(id).includes('AMBIGUITY PROOF CONTRACT'))) fail('a security-lens ambiguity:* finding or a prefix-less ambiguity-lens finding did not get the proof contract prompt');
  else ok('proof contract prompt for a security-lens ambiguity:unit finding and for an ambiguity-lens finding without the prefix');
  const acr = F7.find(f => f.id === 'ACR');
  if (acr?.severity !== 'high' || !r7.logs.some(l => l.includes('ACR') && /never critical/.test(l))) fail(`critical ambiguity ACR not clamped to high with a log line (severity ${acr?.severity})`);
  else ok('a critical ambiguity finding is confirmed as high, and the clamp is logged');
  if (r7.labels.some(l => l.startsWith('variant:'))) fail(`a confirmed high ambiguity:* finding (security lens) seeded a Variant hunt: ${JSON.stringify(r7.labels.filter(l => l.startsWith('variant:')))}`);
  else ok('a confirmed high security-lens ambiguity:* finding seeds no Variant hunt');

  // kills: config.ignore '**/x/**' (applies inside the scope too) dropped from a scoped tool command
  const r8 = await runE({ path: 'packages/app/', cfg: { ignore: ['**/generated/**', 'packages/app/dist/**', '*.snap', 'other/**'] } });
  const t8 = toolArgs(toolCmd(r8.prompt(POL), 'prose')).ex;
  if (!t8.includes('**/generated/**') || !t8.includes('dist/**') || t8.includes('*.snap') || t8.some(g => g.startsWith('other/') || g.startsWith('packages/'))) fail(`scoped tool excludes from config.ignore: ${JSON.stringify(t8)}`);
  else ok("scoped tool excludes: '**/generated/**' kept, 'packages/app/dist/**' → 'dist/**', root-anchored '*.snap' / 'other/**' dropped");

  // kills: tool-relative seeds/findings dropped or misfiled in a scoped run (TOOL ROOT ≠ repo root)
  const r9 = await runE({
    path: 'packages/app',
    over: {
      'recon:ambiguity': { domain: 'ambiguity', denominators: [], seeds: [{ file: 'SECURITY.md', line: 3, note: 'tool-relative' }, { file: 'packages/app/docs/SECURITY.md', line: 4, note: 'repo-relative' }], safeControls: [] },
      [POL]: { findings: [mkF('TR1', 'medium', { file: 'SECURITY.md', line: 3 })], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } },
    },
  });
  const p9 = r9.prompt(POL);
  if (!p9.includes('"packages/app/SECURITY.md"') || !p9.includes('"packages/app/docs/SECURITY.md"') || !p9.includes('prefix `packages/app/`') || !r9.prompt('recon:ambiguity').includes('prefix `packages/app/`')) fail('scoped run: tool-relative seed not rebased onto the scope, or no repo-relative path instruction in recon/review');
  else ok('scoped run: seed SECURITY.md reaches prose-policy as packages/app/SECURITY.md; recon + review are told to prefix packages/app/');
  if (findingOf(r9.calls.find(c => c.label.startsWith('verify:'))?.prompt).file !== 'packages/app/SECURITY.md') fail('scoped run: a tool-relative finding reached the verifier without the scope prefix');
  else ok('scoped run: a finding filed as SECURITY.md is verified as packages/app/SECURITY.md');

  // kills: the code-job command losing its D25 rebase (scoped unit globs from TOOL ROOT match nothing)
  const r10 = await runE({ path: 'packages/app/', cfg: { ambiguity: { code: true }, units: { autoInfer: false, list: [{ key: 'app', title: 'App', globs: ['packages/app/lib/**'], riskScore: 0.5 }] } } });
  const c10 = toolCmd(r10.prompt('review:app:ambiguity'), 'code');
  if (!c10.includes("ambiguity.sh code packages/app 'lib/**'") || c10.includes('packages/app/lib')) fail(`scoped code-job command not rebased: ${JSON.stringify(c10)}`);
  else ok("scoped code job: ambiguity.sh code packages/app 'lib/**'");

  // kills: case-sensitive policy defaults (a lowercase docs/security.md reached no prose job)
  const r11 = await runE({ over: { 'recon:ambiguity': { domain: 'ambiguity', denominators: [], seeds: [{ file: 'docs/security.md', line: 2, note: 'lowercase' }, { file: 'contributing.md', line: 3, note: 'lowercase' }], safeControls: [] } } });
  if (!r11.prompt(POL).includes('"docs/security.md"') || !r11.prompt(POL).includes('"contributing.md"') || !globsOf(r11.prompt(POL)).includes('**/security.md')) fail('lowercase security.md / contributing.md seeds did not reach prose-policy');
  else ok('lowercase docs/security.md and contributing.md seeds reach prose-policy');

  // kills: dropping ownedRaw from the tool excludes (the later group's tool run rescans the earlier group's docs)
  const exA = toolArgs(toolCmd(pa, 'prose')).ex, exB = toolArgs(toolCmd(pb, 'prose')).ex;
  if (!exB.includes('docs/**') || exA.includes('docs/**')) fail(`tool-side ownership: prose-a excludes ${JSON.stringify(exA)}, prose-b excludes ${JSON.stringify(exB)}`);
  else ok("tool-side ownership: prose-b's tool command excludes prose-a's 'docs/**'; prose-a's does not");

  // §15 TRACE-PARSE — kills the DIVERGENCE_TRACE regex: (1) a trace that quotes the falsy-coalescing
  // operator (`x || 3`, the very code ambiguity:falsy-default is about) or uses ⇒ arrows was dropped
  // (low/medium) or held untraced (high); (2) a long arrow-only trace with no '@' backtracked
  // super-linearly (4KB took 5s, 10KB 137s), blocking the engine's event loop.
  const FD = (id, sev, line) => ({ ...mkF(id, sev, { line }), rule: 'ambiguity:falsy-default', file: 'src/client.ts' });
  const FD_TRACES = {
    FDQ: 'A: cfg.retries=0 → `cfg.retries || 3` yields 3 | B: 0 → zero retries @ src/client.ts:12',
    FDH: 'A → `x || 3` returns 3 | B → 0 kept @ lib/a.ts:4',
    FDB: 'A → x || 3 returns 3 | B → 0 kept @ lib/a.ts:4',
    FDP: 'A (0 means disabled) → no retry | B (`x || 3`) → 3 retries @ src/run.ts:9',
    FDW: 'A ⇒ merges on 2 of 3 green | B ⇒ waits for all green @ agents/release.md:3',
    FDL: 'A → merge | ' + 'B -> wait '.repeat(820),                    // ~8KB, arrows, no '@'
    FDT: 'A → x | B → y | C → z @ lib/a.ts:4',                          // three sides is not A | B
  };
  const t12 = Date.now();
  const r12 = await runE({
    over: {
      [POL]: { findings: [FD('FDQ', 'medium', 12), FD('FDH', 'high', 4), FD('FDB', 'low', 5), FD('FDP', 'medium', 9), FD('FDW', 'medium', 3), FD('FDL', 'medium', 7), FD('FDT', 'low', 8)], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } },
      verify: (p) => ({ refuted: false, reason: 'diverges', reachabilityTrace: FD_TRACES[(findingOf(p).title || '').match(/^\[(\w+)\]/)?.[1]] }),
    },
  });
  const ms12 = Date.now() - t12;
  const s12 = r12.prompt('synthesize:report');
  const f12 = (block(s12, 'FINDINGS') || []).map(f => f.id).sort(), d12 = (block(s12, 'PROOF_CONTRACT_DROPPED') || []).map(f => f.id).sort();
  if (JSON.stringify(f12) !== JSON.stringify(['FDB', 'FDH', 'FDP', 'FDQ', 'FDW'])) fail(`traces quoting \`x || 3\` / using ⇒ not confirmed: findings ${JSON.stringify(f12)}, dropped ${JSON.stringify(d12)}`);
  else ok('divergence traces quoting `x || 3` (backticked or bare), `(`x || 3`)` and ⇒ arrows confirm, incl. a high');
  if (JSON.stringify(d12) !== JSON.stringify(['FDL', 'FDT'])) fail(`malformed traces not dropped: dropped ${JSON.stringify(d12)} (want FDL, FDT)`);
  else ok("an arrow-only trace with no '@' and a three-sided trace are dropped by the proof contract");
  if (ms12 > 2000) fail(`an 8KB malformed trace stalled the engine: run took ${ms12}ms`);
  else ok(`8KB arrow-only trace with no '@': whole run in ${ms12}ms (< 2000ms)`);
  // the check itself, timed directly from the engine source (no hand copy)
  const engSrc = fs.readFileSync(ENGINE, 'utf8');
  const fnSrc = (engSrc.match(/(?:\nconst TRACE_FILLER[^\n]*)?\nfunction isDivergenceTrace\([\s\S]*?\n}\n/) || [])[0];
  let isTrace = null;
  try { isTrace = fnSrc ? new Function(`${fnSrc}; return isDivergenceTrace`)() : null; } catch { isTrace = null; }
  if (!isTrace) fail('no standalone `const TRACE_FILLER` + `function isDivergenceTrace(...)` in the engine source');
  else {
    const big = 'A → merge | ' + 'B -> wait '.repeat(820), t = process.hrtime.bigint();
    const res = isTrace(big), dt = Number(process.hrtime.bigint() - t) / 1e6;
    const huge = isTrace('A → a | B → b @ ' + 'x'.repeat(5000) + ' @ f:1');   // past the 4000-char window: the last '@' is cut off, still a trace
    if (res !== false || dt > 50) fail(`isDivergenceTrace(8KB, no '@') = ${res} in ${dt.toFixed(1)}ms (want false in < 50ms)`);
    else if (huge !== true || isTrace('') || isTrace(undefined) || isTrace('→ x | B → y @ f:1') || isTrace('A → x | B → y @  ')) fail('isDivergenceTrace edge cases wrong (blank side, blank consumer, empty input, or long-trace window)');
    else ok(`isDivergenceTrace(8KB, no '@') → false in ${dt.toFixed(1)}ms (< 50ms); blank side / blank consumer / empty rejected`);
    // §15 TRACE-SHAPE — kills: a pipe after the last '@' (a third side) passing; filler sides or a filler
    // consumer passing; arrows inside a backticked reading being masked away; '=>' not counted as an
    // arrow; an '@' inside a code span being taken as the consumer separator.
    const SHAPE = [
      ['A → x | B → y @ f:1 | C → z', false], ['n/a -> n/a | n/a -> n/a @ n/a', false], ['A → x | B → y @ see reason', false],
      ['A → none | B → y @ f:1', false], ['A → x | B → TBD @ f:1', false],
      ['`A → 3` | `B → 0` @ src/x.ts:1', true], ['A => x | B => y @ f:1', true],
      ['A → x | B → y @ `user@host` src/a.ts:2', true], ['A → `a@b` | B → y @ src/a.ts:2', true],
    ];
    const wrongShape = SHAPE.filter(([t, want]) => isTrace(t) !== want).map(([t, want]) => `${JSON.stringify(t)} → ${!want}`);
    if (wrongShape.length) fail(`isDivergenceTrace shape cases wrong: ${wrongShape.join('; ')}`);
    else ok('trace shape: a pipe after @, filler sides/consumer rejected; backticked readings, => and a code-span @ accepted');
  }

  // §15 TRACE-CHAIN — kills a proof contract that only accepts `A | B @`: the verifier is told to hold a
  // contract-mismatch with the full load chain, which has no '|' and no '@', and an allowed set written as
  // a union (`critical | high | medium | low`) has several lone pipes. Both must confirm for
  // ambiguity:contract-mismatch only; the same chain on another ambiguity rule, or a chain with fewer
  // than 2 file:line cites, is still dropped.
  const CM = (id, rule, line) => ({ ...mkF(id, 'medium', { line }), rule, file: 'skills/x/checklist.md' });
  const CM_TRACES = {
    CMC: 'skills/x/checklist.md:13 prescribes info for severity → agents/reviewer.md:20 loads the checklist → workflows/audit.workflow.js:300 allowed set critical/high/medium/low → info not in it → finding rejected by schema',
    CMU: 'checklist.md:13 says info → reviewer.md:20 loads it → audit.workflow.js:300 allows critical | high | medium | low → info rejected',
    CMN: 'the checklist prescribes info → the reviewer loads it → the schema rejects it → lost',
    CMO: 'skills/x/checklist.md:13 says if mostly green → agents/reviewer.md:20 loads it → workflows/a.js:3 merges → lost',
  };
  const r14 = await runE({
    over: {
      [POL]: { findings: [CM('CMC', 'ambiguity:contract-mismatch', 13), CM('CMU', 'ambiguity:contract-mismatch', 14), CM('CMN', 'ambiguity:contract-mismatch', 15), CM('CMO', 'ambiguity:vague-conditional', 16)], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } },
      verify: (p) => ({ refuted: false, reason: 'chain', reachabilityTrace: CM_TRACES[(findingOf(p).title || '').match(/^\[(\w+)\]/)?.[1]] }),
    },
  });
  const s14 = r14.prompt('synthesize:report');
  const f14 = (block(s14, 'FINDINGS') || []).map(f => f.id).sort(), d14 = (block(s14, 'PROOF_CONTRACT_DROPPED') || []).map(f => f.id).sort();
  if (JSON.stringify(f14) !== JSON.stringify(['CMC', 'CMU'])) fail(`contract-mismatch chain traces not confirmed: findings ${JSON.stringify(f14)}, dropped ${JSON.stringify(d14)}`);
  else ok('contract-mismatch: a load-chain trace and one quoting a `a | b | c` allowed set both confirm');
  if (JSON.stringify(d14) !== JSON.stringify(['CMN', 'CMO'])) fail(`chain without cites / chain on a non-contract rule not dropped: dropped ${JSON.stringify(d14)} (want CMN, CMO)`);
  else ok('a chain with no file:line cites, and a chain on ambiguity:vague-conditional, are dropped by the proof contract');
  if (!/put that chain[^.]*in reachabilityTrace/.test((r14.calls.find(c => c.label.startsWith('verify:')) || {}).prompt || '')) fail('verifier proof prompt does not tell the voter where the contract-mismatch chain goes');
  else ok('verifier proof prompt says the contract-mismatch chain goes in reachabilityTrace');

  // §15 CLEAN-DROP — kills the clean-run short-circuit ignoring proofContractDropped: an ambiguity-only
  // run whose every held finding lacked a trace logged "Clean run", returned report:null and put the
  // dropped ids nowhere, though §4.10 requires them in the report's Coverage summary.
  const r13 = await runE({
    over: {
      [POL]: { findings: [mkF('DL1', 'low', { line: 5 }), mkF('DM1', 'medium', { line: 6 })], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } },
      verify: () => ({ refuted: false, reason: 'held, no trace' }),
    },
  });
  const d13 = (block(r13.prompt('synthesize:report'), 'PROOF_CONTRACT_DROPPED') || []).map(f => f.id).sort();
  if (r13.logs.some(l => /Clean run/.test(l)) || !r13.res?.report) fail(`all-dropped ambiguity run short-circuited as clean (report ${JSON.stringify(r13.res?.report)})`);
  else if (JSON.stringify(d13) !== JSON.stringify(['DL1', 'DM1'])) fail(`all-dropped run: synth PROOF_CONTRACT_DROPPED ${JSON.stringify(d13)}, want DL1, DM1`);
  else ok('an ambiguity run whose findings were all proof-contract dropped writes a report listing them, no "Clean run"');
  if (JSON.stringify((r13.res?.proofContractDropped || []).map(f => f.id).sort()) !== JSON.stringify(['DL1', 'DM1'])) fail(`result.proofContractDropped ${JSON.stringify(r13.res?.proofContractDropped)}, want DL1, DM1`);
  else ok('result.proofContractDropped carries the dropped findings');
  // paired: a truly clean run still short-circuits, and its result says nothing was dropped
  if (!r0.logs.some(l => /Clean run/.test(l)) || r0.res?.report !== null || !Array.isArray(r0.res?.proofContractDropped) || r0.res.proofContractDropped.length) fail(`truly clean run: report ${JSON.stringify(r0.res?.report)}, proofContractDropped ${JSON.stringify(r0.res?.proofContractDropped)} (want null and [])`);
  else ok('a truly clean ambiguity run still short-circuits, with proofContractDropped: []');

  // §15 PROSE-MAP — kills: an ambiguity-only run on OOOhm spawned the threat modeler (15 trust
  // boundaries no prose reviewer reads). Paired: a run with a code lens still maps.
  if (r0.labels.includes('map:model') || r0.res?.map?.ran !== false || r0.res?.map?.skipReason !== 'prose-only') fail(`ambiguity-only run: map:model spawned=${r0.labels.includes('map:model')}, map ${JSON.stringify(r0.res?.map)} (want skipped, skipReason prose-only)`);
  else ok('an ambiguity-only run skips the Map phase (skipReason prose-only, no modeler spawned)');
  const rDD = await runE({ lenses: ['docs-drift'] });
  if (rDD.labels.includes('map:model')) fail('a docs-drift-only run still spawned the threat modeler');
  else ok('a docs-drift-only run skips the Map phase too');
  const rMix = await runE({ lenses: ['ambiguity', 'security'] });
  if (!rMix.labels.includes('map:model') || rMix.res?.map?.ran !== true || rMix.res?.map?.skipReason) fail(`ambiguity+security run: map ${JSON.stringify(rMix.res?.map)} (want ran, no skipReason)`);
  else ok('paired: ambiguity + security still runs the Map phase');

  // §15 RULE-SCOPE — kills: the same run reported "6 of 96 checked, 90 NOT CHECKED" for code rules no
  // ambiguity job could receive. The base rulebook is 5 security rules; add one 'any' and one
  // 'ambiguity' rule, which ARE handed to ambiguity jobs and so stay in scope.
  const RS = { 'discover:rulebook': { rules: [...RULES, { id: 'docs:any-1', source: 'AGENTS.md:30', text: 'any rule', lensHint: 'any' }, { id: 'docs:amb-1', source: 'AGENTS.md:31', text: 'prose rule', lensHint: 'ambiguity' }] } };
  const rRS = await runE({ over: RS });
  const cRS = rRS.res?.coverage || {};
  if (cRS.rulebookSize !== 7 || cRS.outOfScope !== 5 || JSON.stringify(cRS.outOfScopeByLens) !== '{"security":5}' || JSON.stringify([...(cRS.uncheckedRuleIds || [])].sort()) !== '["docs:amb-1","docs:any-1"]' || cRS.checked !== 0)
    fail(`ambiguity-only closure: ${JSON.stringify(cRS)} (want 7 rules, 5 out of scope {security:5}, unchecked = the any + ambiguity rules, checked 0)`);
  else ok('ambiguity-only closure: 5 security rules out of scope, not NOT CHECKED; the any + ambiguity rules stay in scope');
  const rRSmix = await runE({ lenses: ['ambiguity', 'security'], over: RS });
  if (rRSmix.res?.coverage?.outOfScope !== 0 || rRSmix.res?.coverage?.uncheckedRuleIds?.length !== 7) fail(`ambiguity+security closure: ${JSON.stringify(rRSmix.res?.coverage)} (want 0 out of scope, all 7 unchecked by the empty stubs)`);
  else ok('paired: with a security job in the run, the security rules are in scope again');
  // the synthesizer is told about out-of-scope rows only when there are some (other prompts unchanged)
  const DROP = { [POL]: { findings: [mkF('OS1', 'low', { line: 5 })], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } }, verify: () => ({ refuted: false, reason: 'held, no trace' }) };
  const sOut = (await runE({ over: { ...RS, ...DROP } })).prompt('synthesize:report');
  const sIn = (await runE({ lenses: ['ambiguity', 'security'], over: { ...RS, ...DROP } })).prompt('synthesize:report');
  if (!/outOfScope: true are NOT rows/.test(sOut) || /outOfScope: true/.test(sIn)) fail(`synth out-of-scope clause: present with out-of-scope rules=${/outOfScope: true are NOT rows/.test(sOut)}, present without=${/outOfScope: true/.test(sIn)}`);
  else ok('the synthesizer gets the out-of-scope rendering rule only when the run has out-of-scope rules');

  // §15 CLEAN-RECORD — kills: a clean run that refuted 6 candidates (one of them a real doc error)
  // wrote nothing to disk. report stays null (the clean signal); cleanReport carries the record.
  const rCR = await runE({
    over: {
      ...RS,
      [POL]: { findings: [mkF('RF1', 'low', { line: 5 }), mkF('RF2', 'medium', { line: 6 })], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } },
      verify: () => ({ refuted: true, reason: 'one reading only: the clause names its subject' }),
    },
  });
  const cr = rCR.res?.cleanReport || '';
  if (rCR.res?.report !== null || rCR.labels.includes('synthesize:report')) fail(`refuted-only run is not clean: report ${JSON.stringify(rCR.res?.report)}, synthesizer spawned=${rCR.labels.includes('synthesize:report')}`);
  else ok('a refuted-only run is still clean: report null, no synthesizer agent');
  const want = ['result: clean', 'date: __AUDIT_DATE__', 'repo_sha: __REPO_SHA__', 'out_of_scope: 5', 'refuted_candidates: 2', '## Refuted candidates (2)',
    '`SECURITY.md:5` low, `ambiguity:scope-clause`', '`SECURITY.md:6` medium', 'Votes: held 0, refuted 1. Why refuted: one reading only: the clause names its subject',
    'Out of scope for this run\'s lenses: security 5', 'Map: skipped (prose-only lenses'];
  const missing = want.filter(w => !cr.includes(w));
  if (missing.length) fail(`cleanReport missing ${JSON.stringify(missing)}`);
  else ok('cleanReport lists both refuted candidates with tally and reason, scoped closure, and the Map skip');
  if (!/^---\n[\s\S]*?\n---\n/.test(cr) || !/## Refuted candidates \(0\)\n\nNone: reviewers raised nothing\./.test(r0.res?.cleanReport || '')) fail('cleanReport has no front-matter, or a run with nothing raised does not say so');
  else ok('cleanReport opens with front-matter; a run with nothing raised says "None: reviewers raised nothing."');
  if (r13.res?.cleanReport !== undefined) fail('a non-clean run also returned cleanReport');
  else ok('paired: a run with a report returns no cleanReport');

  // review round 1 on 1.3.1 — each case below passed the first draft of the change.
  // RULE-SCOPE by REQUESTED lens — kills: scoping by the jobs that existed, so a run whose requested lens
  // produced no job (no units, no prose groups) read as "out of scope, none NOT CHECKED".
  const UNH = { id: 'docs:unhinted-1', source: 'AGENTS.md:40', text: 'unhinted rule' };
  const AMB = { id: 'docs:amb-1', source: 'AGENTS.md:31', text: 'prose rule', lensHint: 'ambiguity' };
  const CMP = { id: 'docs:cmp-1', source: 'AGENTS.md:41', text: 'compliance rule', lensHint: 'compliance' };
  const RSD = { 'discover:rulebook': { rules: [...RULES, UNH, AMB, CMP] } };
  const noUnits = await runE({ lenses: ['security'], cfg: { units: { autoInfer: false, list: [] } }, over: { ...RSD, 'discover:units': { units: [] }, 'discover:unit-mapper': { units: [] } } });
  const cNU = noUnits.res?.coverage || {};
  const nuJobs = noUnits.labels.filter(l => l.startsWith('review:')).length;
  if (nuJobs !== 0) fail(`no-units probe still ran ${nuJobs} review job(s) (${JSON.stringify(noUnits.labels.filter(l => l.startsWith('review:')))}): the degraded path is not exercised`);
  else if (!(cNU.uncheckedRuleIds || []).includes('agents-md:rule-1') || !(cNU.uncheckedRuleIds || []).includes(UNH.id) || cNU.outOfScopeByLens?.security || 'undefined' in (cNU.outOfScopeByLens || {}))
    fail(`security run with no review jobs: ${JSON.stringify(cNU)} (want the security + unhinted rules NOT CHECKED, no security/undefined out-of-scope key)`);
  else ok('a requested lens that produced no review job leaves its rules NOT CHECKED, never out of scope');
  const noGroups = await runE({ cfg: { ambiguity: { prose: { groups: {} } } }, over: RSD });
  const cNG = noGroups.res?.coverage || {};
  if (!(cNG.uncheckedRuleIds || []).includes(AMB.id) || (cNG.outOfScopeByLens || {}).ambiguity)
    fail(`ambiguity run with no prose groups: ${JSON.stringify(cNG)} (want the ambiguity rule NOT CHECKED, not out of scope)`);
  else ok('an ambiguity run with no prose groups leaves the ambiguity rule NOT CHECKED');
  const withCmp = await runE({ lenses: ['ambiguity', 'compliance'], over: RSD });
  const cWC = withCmp.res?.coverage || {};
  if ((cWC.outOfScopeByLens || {}).compliance || !(cWC.uncheckedRuleIds || []).includes(CMP.id))
    fail(`ambiguity+compliance run: ${JSON.stringify(cWC)} (want the compliance rule in scope, NOT CHECKED)`);
  else ok('a compliance-hinted rule is in scope when the compliance lens runs');
  if ('undefined' in (rRS.res?.coverage?.outOfScopeByLens || {}) || 'undefined' in (cNG.outOfScopeByLens || {})) fail('an out-of-scope lens key rendered as "undefined"');
  else ok('no out-of-scope lens key is ever "undefined"');

  // PROSE-MAP with ambiguity.code: true — kills: the code job lost its invariants/boundaries
  const rCode = await runE({ cfg: { ambiguity: { code: true } } });
  if (!rCode.labels.includes('map:model') || rCode.res?.map?.skipReason) fail(`ambiguity code mode: map ${JSON.stringify(rCode.res?.map)} (want the Map phase to run)`);
  else ok('ambiguity with code: true is not prose-only: the Map phase runs');

  // CLEAN-RECORD refuted vs inconclusive — kills: a no-quorum, split or short-of-unanimous panel listed as "refuted"
  const seen = {};
  const PANEL = {
    RF3: ['r', 'r', 'r'],          // majority refuted
    UN3: ['h', 'h', 'r'],          // held 2/3 but the threshold is unanimous: inconclusive
    NQ3: [null, null, null],       // every voter died: no quorum
  };
  const rPN = await runE({
    cfg: { verify: { voters: 3, passThreshold: 'unanimous' } },
    over: {
      [POL]: { findings: [mkF('RF3', 'low', { line: 5 }), mkF('UN3', 'low', { line: 6 }), mkF('NQ3', 'medium', { line: 7 })], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0 } },
      verify: (p) => {
        const id = (findingOf(p).title || '').match(/^\[(\w+)\]/)?.[1];
        const k = seen[id] = (seen[id] ?? -1) + 1;
        const v = PANEL[id]?.[k];
        return v === null ? null : v === 'h' ? { refuted: false, reason: 'two readings' } : { refuted: true, reason: `one reading (${id})` };
      },
    },
  });
  const pr = rPN.res?.cleanReport || '';
  const refSec = pr.split('## Refuted candidates')[1]?.split('\n## ')[0] || '';
  const incSec = pr.split('## Not confirmed: inconclusive panel')[1]?.split('\n## ')[0] || '';
  if (rPN.res?.report !== null) fail(`panel probe is not a clean run (report ${JSON.stringify(rPN.res?.report)})`);
  else if (!refSec.includes('[RF3]') || refSec.includes('[UN3]') || refSec.includes('[NQ3]') || !incSec.includes('[UN3]') || !incSec.includes('[NQ3]') || !/refuted_candidates: 1\n/.test(pr) || !/inconclusive_candidates: 2\n/.test(pr))
    fail(`refuted/inconclusive split wrong:\n${pr.split('## Positive controls')[0]}`);
  else ok('only a majority refutation is listed as refuted; unanimous-short and no-quorum panels are inconclusive');

  // front-matter is flat YAML a parser can read: top-level keys, flow lists as JSON
  const fm = (cr.match(/^---\n([\s\S]*?)\n---\n/) || [])[1] || '';
  const badFm = fm.split('\n').filter(l => !/^([a-z_]+: .+|coverage:|  [a-z_]+: .+)$/.test(l) || (/: \[/.test(l) && (() => { try { JSON.parse(l.split(': ').slice(1).join(': ')); return false; } catch { return true; } })()));
  if (!fm || badFm.length) fail(`cleanReport front-matter lines that would not parse: ${JSON.stringify(badFm)}`);
  else ok('cleanReport front-matter is flat key: value YAML with JSON flow lists');

  // panel internals stay internal — kills: dropping the publicFresh / returned-fresh strip
  const leakKeys = ['votes', 'refuteReason', 'majorityRefuted'];
  const synthF = block(r14.prompt('synthesize:report'), 'FINDINGS') || [];
  const leaked = [...synthF, ...(r14.res?.fresh || [])].flatMap(f => leakKeys.filter(k => k in f));
  if (!synthF.length || !(r14.res?.fresh || []).length) fail('leak probe has no confirmed findings to inspect');
  else if (leaked.length) fail(`panel internals leaked into synth FINDINGS or returned fresh: ${JSON.stringify([...new Set(leaked)])}`);
  else ok('votes / refuteReason / majorityRefuted never reach synth FINDINGS or the returned fresh');
}

// ── SCENARIO F: maxConcurrentAgents (D24, AC-031) — one semaphore over every agent spawn ─
console.log('\n=== SCENARIO F: concurrency cap ===');
{
  const fail = (m) => { problems++; console.log('  ✗ ' + m); };
  const ok = (m) => console.log('  ✓ ' + m);
  // a stuck semaphore leaves the run's promise pending forever; node then exits on an unsettled
  // top-level await, so say why before it does
  let fSettled = false;
  process.on('exit', () => { if (!fSettled) console.log('  ✗ scenario F never settled: a capped run deadlocked (a rejected agent never released its slot)'); });
  // the base stub, wrapped to record agents alive at once; it yields so siblings can overlap
  const runF = async (cap, throwLabel) => {
    let inFlight = 0, max = 0;
    const stub = async (prompt, opts = {}) => {
      inFlight++; max = Math.max(max, inFlight);
      try {
        await new Promise(r => setImmediate(r));
        if (throwLabel && opts.label === throwLabel) throw new Error(`stub: ${throwLabel} died`);
        return await agent(prompt, opts);
      } finally { inFlight--; }
    };
    const a = JSON.parse(JSON.stringify(args));
    a.config.verify = { voters: 3 };
    if (cap !== undefined) a.config.maxConcurrentAgents = cap;
    synthInput = null;
    const res = await runFn({ agent: stub, parallel, pipeline, phase, log: () => {}, args: a, budget });
    return { max, res, ids: (synthInput?.findings || []).map(f => f.id).sort() };
  };
  const free = await runF(undefined);
  // kills: a harness that cannot see overlap (every capped assertion below would pass vacuously)
  if (!(free.max > 3)) fail(`uncapped run peaked at ${free.max} agents in flight, want > 3`);
  else ok(`uncapped run peaks at ${free.max} agents in flight (overlap is observable)`);
  const c3 = await runF(3);
  // kills: a release that decrements AND hands the slot to a waiter (the waiter runs uncounted,
  // so a newcomer takes the "free" slot → peak 4; verified by reinjection)
  if (!(c3.max <= 3) || c3.max < 1) fail(`maxConcurrentAgents: 3 peaked at ${c3.max} agents in flight`);
  else ok(`maxConcurrentAgents: 3 peaks at ${c3.max} agents in flight`);
  // kills: a cap that drops or reorders work (waiters never started, a phase skipped)
  if (!c3.res?.report || !c3.ids.length || JSON.stringify(c3.ids) !== JSON.stringify(free.ids)) fail(`capped FINDINGS ${JSON.stringify(c3.ids)} != uncapped ${JSON.stringify(free.ids)} (or no report)`);
  else ok(`capped run completes with the uncapped FINDINGS ids ${JSON.stringify(c3.ids)}`);
  const c1 = await runF(1);
  // kills: a missed call site (an uncounted spawn overlaps a counted one) or an off-by-one cap
  if (c1.max !== 1 || JSON.stringify(c1.ids) !== JSON.stringify(free.ids)) fail(`maxConcurrentAgents: 1 peaked at ${c1.max} (want exactly 1) with FINDINGS ${JSON.stringify(c1.ids)}`);
  else ok('maxConcurrentAgents: 1 serializes every spawn (peak exactly 1), same FINDINGS');
  // kills: a cap that ignores rejections — at cap 1 the dead recon keeps the only slot and every
  // later spawn waits forever. The uncapped run with the same death is the control.
  const deadFree = await runF(undefined, 'recon:docs-drift');
  const dead1 = await runF(1, 'recon:docs-drift');
  if (!deadFree.res?.report) fail('control: uncapped run with a dead recon:docs-drift produced no report');
  else if (!dead1.res?.report || dead1.max !== 1 || JSON.stringify(dead1.ids) !== JSON.stringify(deadFree.ids)) fail(`capped run with a dead recon:docs-drift: report=${!!dead1.res?.report} peak=${dead1.max} FINDINGS ${JSON.stringify(dead1.ids)} (want ${JSON.stringify(deadFree.ids)})`);
  else ok('a rejected agent releases its slot: capped run with a dead recon:docs-drift completes');
  // kills: a call site that still calls the global directly, bypassing the semaphore
  const body = (src.match(/function callAgent\([^)]*\) \{[\s\S]*?\n\}\n/) || [''])[0];
  const bare = src.replace(body, '').split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /(?<![A-Za-z])agent\(/.test(l));
  if (!body || !/(?<![A-Za-z])agent\(/.test(body)) fail('callAgent body not found (or it never calls agent) — the bare-call check would be vacuous');
  else if (bare.length) fail(`bare agent( call outside callAgent: ${JSON.stringify(bare.map(([n, l]) => `${n}: ${l.trim()}`))}`);
  else ok(`every agent spawn goes through callAgent (${(src.match(/(?<![A-Za-z])callAgent\(/g) || []).length - 1} call sites)`);
  fSettled = true;
}

console.log(problems === 0 ? '\n✓ ALL SCENARIOS PASSED' : `\n✗ ${problems} conflict(s) found across scenarios`);
process.exit(problems === 0 ? 0 : 1);
