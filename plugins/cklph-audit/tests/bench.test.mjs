// The fixture benchmark: case list, neutral staging, scoring and the ablation runner.
//
//   node plugins/cklph-audit/tests/bench.test.mjs     (also runs under `node --test`)
//
// Asserts outcomes: the numbers score.mjs computes for known records, that staged cases carry no
// label text, that the two ablation conditions differ only in --plugin-dir, and an end-to-end
// ablate.mjs run against a fake `claude` binary. Each block has a teeth case.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listCases, loadLookalikes, neutralize, neutralName, stageCase, LABEL_PATTERN } from '../skills/audit-backtest/bench/cases.mjs';
import { median, scoreCases, summarizeConditions, renderTable } from '../skills/audit-backtest/bench/score.mjs';
import { claudeArgs, parseResult, copyPluginStripped } from '../skills/audit-backtest/bench/ablate.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ABLATE = path.join(PLUGIN, 'skills', 'audit-backtest', 'bench', 'ablate.mjs');
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

console.log('safe-lookalikes manifest');
{
  const looks = loadLookalikes(PLUGIN);
  ok(looks.size >= 7, `${looks.size} safe lookalikes listed`);
  for (const [file, e] of looks) {
    const abs = path.join(PLUGIN, 'fixtures', file);
    ok(fs.existsSync(abs) && file.includes('/should-not-flag/'), `${file} exists under should-not-flag`);
    ok(Boolean(e.class), `${file} names its lookalike class`);
    if (e.twin) ok(fs.existsSync(path.join(PLUGIN, 'fixtures', e.twin)) && e.twin.includes('/should-flag/'), `twin ${e.twin} exists under should-flag`);
  }
  const classes = new Set([...looks.values()].map(e => e.class));
  for (const c of ['encoded-output', 'redirect-allowlist', 'parameterized-sql', 'cors-public-data', 'fetch-host-allowlist', 'admin-gated-action', 'documented-example-key']) {
    ok(classes.has(c), `class ${c} is covered`);
  }
}

console.log('case list');
{
  const cases = listCases(PLUGIN);
  const looks = cases.filter(c => c.lookalike);
  ok(cases.length > 30, `${cases.length} cases in the default lenses`);
  ok(looks.length === loadLookalikes(PLUGIN).size && looks.every(c => c.ground === 'safe'), `every lookalike is a case with ground safe (${looks.length})`);
  ok(cases.every(c => (c.file.includes('/should-flag/') ? c.ground === 'vulnerable' : c.ground === 'safe')), 'ground truth follows the folder');
  ok(!listCases(PLUGIN, { lenses: ['security'] }).some(c => c.lens !== 'security'), '--lenses narrows the set');
}

console.log('neutral staging');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cklph-bench-'));
  const leaks = [];
  let raw = 0;
  for (const c of listCases(PLUGIN)) {
    const original = fs.readFileSync(path.join(PLUGIN, 'fixtures', c.file), 'utf8');
    if (LABEL_PATTERN.test(original)) raw++;
    const out = stageCase(PLUGIN, c, path.join(dir, c.id.replace(/\//g, '_')));
    const staged = fs.readFileSync(out, 'utf8');
    if (LABEL_PATTERN.test(staged) || LABEL_PATTERN.test(path.basename(out))) leaks.push(c.id);
    if (staged.trim() === '') leaks.push(`${c.id} (empty)`);
  }
  ok(raw > 20, `teeth: ${raw} fixtures carry label text before staging`);
  ok(leaks.length === 0, `no staged case keeps label text or comes out empty${leaks.length ? `: ${leaks.join(', ')}` : ''}`);
  ok(neutralName('security/should-not-flag/admin-delete-user.example.ts') === 'handler.ts', 'name keeps only the extension');
  ok(neutralName('x/should-flag/policies.example.sql') === 'schema.sql' && neutralName('x/should-not-flag/a.example.md') === 'README.md', 'sql and md names');
  const keep = '// ordinary comment\nconst a = 1\n';
  ok(neutralize(keep, 'a.ts') === keep, 'a leading comment with no label is kept');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('score.mjs');
{
  ok(median([3, 1, 2]) === 2 && median([4, 1, 3, 2]) === 2.5 && median([null, undefined]) === null, 'median odd, even, empty');
  const recs = [
    { id: 'v1', ground: 'vulnerable', flagged: true },
    { id: 'v2', ground: 'vulnerable', flagged: true },
    { id: 'v3', ground: 'vulnerable', flagged: false },
    { id: 's1', ground: 'safe', lookalike: true, flagged: true },
    { id: 's2', ground: 'safe', lookalike: true, flagged: false },
    { id: 's3', ground: 'safe', lookalike: false, flagged: false },
    { id: 's4', ground: 'safe', lookalike: true, error: 'timeout' },
  ];
  const s = scoreCases(recs);
  ok(s.tp === 2 && s.fn === 1 && s.fp === 1 && s.tn === 2 && s.errors === 1, `confusion counts ${JSON.stringify({ tp: s.tp, fn: s.fn, fp: s.fp, tn: s.tn, errors: s.errors })}`);
  ok(Math.abs(s.recall - 2 / 3) < 1e-9 && Math.abs(s.precision - 2 / 3) < 1e-9, 'recall and precision');
  ok(s.fpRateLookalike === 0.5 && Math.abs(s.fpRateSafe - 1 / 3) < 1e-9, `FP rate lookalikes 1/2, all safe 1/3 (errored lookalike excluded)`);
  ok(s.falsePositives.join() === 's1' && s.falseNegatives.join() === 'v3', 'FP and FN ids listed');
  const worse = scoreCases(recs.map(r => (r.id === 's2' ? { ...r, flagged: true } : r)));
  ok(worse.fpRateLookalike === 1, 'teeth: flagging one more lookalike raises its FP rate');
  const errAsClean = scoreCases(recs.map(r => (r.error ? { ...r, error: undefined, flagged: false } : r)));
  ok(errAsClean.lookalikes === s.lookalikes + 1, 'teeth: an errored run is not silently scored as clean');

  const cond = [
    ...recs.filter(r => !r.error).map(r => ({ ...r, condition: 'on', turns: 4, costUsd: 0.2 })),
    ...recs.filter(r => !r.error).map(r => ({ ...r, condition: 'off', flagged: r.ground === 'safe' ? true : r.flagged, turns: 2, costUsd: 0.1 })),
  ];
  const sum = summarizeConditions(cond);
  ok(sum.conditions.on.fpRateLookalike === 0.5 && sum.conditions.off.fpRateLookalike === 1, 'per-condition FP rate');
  ok(sum.delta.fpRateLookalike === -0.5 && sum.delta.medianTurns === 2 && Math.abs(sum.delta.medianCostUsd - 0.1) < 1e-9, `deltas on minus off ${JSON.stringify(sum.delta)}`);
  const table = renderTable(sum);
  ok(/\| on \| 2\/3 67% \| 1\/2 50% \|/.test(table) && /delta \(on - off\)\*\* \| \+0% \| -50%/.test(table), 'table rows render the numbers');
}

console.log('ablate.mjs args and parsing');
{
  const on = claudeArgs({ condition: 'on', model: 'm', pluginDir: '/p' });
  const off = claudeArgs({ condition: 'off', model: 'm', pluginDir: '/p' });
  const extra = on.filter((a, i) => off[i] !== a);
  ok(on.length === off.length + 2 && on.slice(0, off.length).every((a, i) => a === off[i]) && extra.join(' ') === '--plugin-dir /p', 'on = off + --plugin-dir, nothing else differs');
  ok(off.includes('--strict-mcp-config') && off[off.indexOf('--setting-sources') + 1] === 'local', 'both conditions drop user settings (installed plugins) and MCP');
  let threw = false; try { claudeArgs({ condition: 'on', pluginDir: '/p' }); } catch { threw = true; }
  ok(threw, 'a run without a model is refused');

  const good = JSON.stringify({ is_error: false, num_turns: 4, total_cost_usd: 0.01, usage: { input_tokens: 6, cache_read_input_tokens: 100, output_tokens: 50 }, structured_output: { findings: [{ file: 'src/handler.ts', title: 'x', severity: 'high' }] } });
  const p = parseResult(good);
  ok(p.flagged === true && p.turns === 4 && p.costUsd === 0.01 && p.inTok === 106 && p.outTok === 50, `parsed ${JSON.stringify(p)}`);
  ok(parseResult(JSON.stringify({ structured_output: { findings: [] } })).flagged === false, 'empty findings -> not flagged');
  ok(Boolean(parseResult('not json').error) && Boolean(parseResult(good, 1).error) && Boolean(parseResult(JSON.stringify({ result: 'text' })).error), 'bad JSON, non-zero exit and missing structured output are errors, not verdicts');
}

console.log('plugin copy');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cklph-plugcopy-'));
  const copy = copyPluginStripped(PLUGIN, path.join(dir, 'p'));
  ok(fs.existsSync(path.join(copy, '.claude-plugin', 'plugin.json')) && fs.existsSync(path.join(copy, 'skills', 'security-lens', 'SKILL.md')), 'the copy keeps the manifest and the lenses');
  ok(!fs.existsSync(path.join(copy, 'fixtures')) && !fs.existsSync(path.join(copy, 'tests')) && !fs.existsSync(path.join(copy, 'skills', 'audit-backtest')), 'the copy has no fixtures, tests or backtest skill');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('ablate.mjs end to end (fake claude)');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cklph-ablate-test-'));
  const fake = path.join(dir, 'claude');
  // flags every case when --plugin-dir is absent, nothing when present; logs cwd contents
  fs.writeFileSync(fake, `#!/usr/bin/env node
const fs = require('fs');
const on = process.argv.includes('--plugin-dir');
fs.appendFileSync(${JSON.stringify(path.join(dir, 'calls.log'))}, JSON.stringify({ on, files: fs.readdirSync('src') }) + '\\n');
process.stdout.write(JSON.stringify({ is_error: false, num_turns: on ? 5 : 3, total_cost_usd: on ? 0.02 : 0.01, usage: {}, structured_output: { findings: on ? [] : [{ file: 'src/handler.ts', title: 't', severity: 'low' }] } }));
`, { mode: 0o755 });
  const out = path.join(dir, 'res.jsonl');
  const ids = ['security/should-flag/search-page-unescaped.example.ts', 'security/should-not-flag/search-page-escaped.example.ts'];
  const r = spawnSync(process.execPath, [ABLATE, '--model', 'm', '--claude-bin', fake, '--out', out, ...ids.flatMap(i => ['--case', i])], { encoding: 'utf8' });
  ok(r.status === 0, `exit 0 (${r.stderr.split('\n').slice(-3).join(' | ')})`);
  const recs = fs.readFileSync(out, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  ok(recs.length === 4, `4 records (2 cases x 2 conditions), got ${recs.length}`);
  const get = (id, c) => recs.find(x => x.id === id && x.condition === c);
  ok(get(ids[0], 'off').correct === true && get(ids[0], 'on').correct === false, 'vulnerable case: flagged off is correct, clean on is wrong');
  ok(get(ids[1], 'on').correct === true && get(ids[1], 'off').correct === false, 'lookalike: clean on is correct, flagged off is a false positive');
  ok(get(ids[1], 'on').lookalike === true && get(ids[1], 'on').turns === 5 && get(ids[1], 'on').costUsd === 0.02, 'record carries lookalike, turns and cost');
  const calls = fs.readFileSync(path.join(dir, 'calls.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  ok(calls.every(c => c.files.length === 1 && c.files[0] === 'handler.ts'), 'each run sees one neutral file');
  ok(/\| on \| 0\/1 0% \| 0\/1 0% \|/.test(r.stdout) && /\| off \| 1\/1 100% \| 1\/1 100% \|/.test(r.stdout), 'printed table matches the records');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
