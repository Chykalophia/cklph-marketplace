// A reviewer that threw, returned {}, or returned no coverage must never leave a run reading as clean.
// It once did: only a null review was caught, so the other three shapes produced "result: clean".
//
//   node plugins/cklph-audit/tests/reviewer-silence.test.mjs     (also runs under `node --test`)
import fs from 'node:fs';

const ENGINE = new URL('../workflows/audit.workflow.js', import.meta.url);
const src = fs.readFileSync(ENGINE, 'utf8').replace(/export\s+const\s+meta\s*=/, 'const meta =');
const runFn = new Function('G', 'const {agent,parallel,pipeline,phase,log,args,budget}=G; return (async()=>{\n' + src + '\n})();');

// Workflow-runtime stand-ins: a throwing thunk or stage resolves to null, as the runtime does.
const parallel = th => Promise.all(th.map(t => Promise.resolve().then(t).catch(() => null)));
const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, idx) => {
  let v = item;
  for (const s of stages) { try { v = await s(v, item, idx); } catch { return null; } }
  return v;
}));
const budget = { total: null, spent: () => 0, remaining: () => Infinity };
const run = review => runFn({
  agent: async (p, o = {}) => (o.label === 'review:api:security' ? review() : null),
  parallel, pipeline, phase: () => {}, log: () => {}, budget,
  args: {
    lenses: ['security'], mode: 'full', baseline: { fingerprints: [] },
    config: { units: { autoInfer: false, list: [{ key: 'api', title: 'API', globs: ['app/api/**'] }] }, lenses: ['security'],
      recon: { enabled: false }, map: { enabled: false }, variant: { enabled: false }, verify: { voters: 1 } },
  },
});

let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };
const clean = { findings: [], ruleChecks: [], coverage: { seedsVerified: 0, seedsGiven: 0, toolCandidatesJudged: 0, toolFailures: [] } };

console.log('reviewer silence');
const paired = await run(() => clean);
ok(/result: clean/.test(paired?.cleanReport || ''), 'paired: a reviewer that ran and reported coverage gives result: clean');
for (const [name, review] of [
  ['threw', () => { throw new Error('agent crashed'); }],
  ['returned {}', () => ({})],
  ['returned no coverage', () => ({ findings: [], ruleChecks: [] })],
  ['returned findings that are not an array', () => ({ findings: { a: 1 }, coverage: clean.coverage })],
]) {
  const r = await run(review);
  const cr = r?.cleanReport || '';
  ok(r?.report == null && /result: incomplete/.test(cr) && /NOT CHECKED/.test(cr), `a reviewer that ${name} makes the run result: incomplete (${(cr.match(/result: \w+/) || ['no record'])[0]})`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
