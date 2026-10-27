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

console.log(problems === 0 ? '\n✓ ALL SCENARIOS PASSED' : `\n✗ ${problems} conflict(s) found across scenarios`);
process.exit(problems === 0 ? 0 : 1);
