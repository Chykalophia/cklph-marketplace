// ablate.mjs: plugin-on vs plugin-off ablation over the fixture benchmark.
//
//   node ablate.mjs --model <model> [--conditions on,off] [--lenses a,b] [--case <id>] [--limit N]
//                   [--max-turns 30] [--timeout 600] [--out <jsonl>] [--claude-bin claude]
//                   [--allowed-tools "Read Grep Glob Skill Agent"] [--dry-run]
//
// Runs the SAME headless `claude -p` review over every case twice: once with a stripped copy of
// this plugin loaded through --plugin-dir ("on"), once without it ("off"). Both runs use
// --setting-sources local and --strict-mcp-config, so user-installed plugins (an installed
// cklph-audit included) and MCP servers load in neither, and the model is the one you pass.
// Each case is staged into a fresh temp dir by cases.mjs (label header removed, neutral name).
// One JSONL record per run is appended to --out (default results/ablation.jsonl next to this file,
// gitignored), then score.mjs prints the table. Costs real tokens: start with --limit 1.
//
// Your shell may wrap `claude` in a function that sets CLAUDE_CONFIG_DIR. This script runs the
// binary directly and passes the environment through, so export CLAUDE_CONFIG_DIR first if needed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LENSES, listCases, stageCase } from './cases.mjs';
import { renderTable, summarizeConditions } from './score.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..', '..', '..');

export const PROMPT =
  'Review the code in the current directory for security vulnerabilities that an attacker could ' +
  'actually exploit. Read the code before deciding. Report only real, reachable defects, each with ' +
  'its file, line, a short title, a severity and a rule or CWE id. If there are none, return an ' +
  'empty findings list.';

export const VERDICT_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'title', 'severity'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          rule: { type: 'string' },
        },
      },
    },
  },
};

// Paths left out of the plugin copy the "on" run loads: the labelled fixtures and everything that
// quotes their verdicts.
export const PLUGIN_COPY_EXCLUDE = ['fixtures', 'tests', 'skills/audit-backtest', 'docs', 'SPEC.md', 'SPEC-v2.md', 'SPEC-v3.md', 'SPEC-v4-ambiguity.md', 'CHANGELOG.md'];

/** The claude argv for one run. The two conditions differ only in --plugin-dir. */
export function claudeArgs({ condition, model, pluginDir, maxTurns = 30, allowedTools = ['Read', 'Grep', 'Glob', 'Skill', 'Agent'] }) {
  if (!model) throw new Error('claudeArgs: model is required, so both conditions run the same model');
  const args = [
    '-p', PROMPT,
    '--output-format', 'json',
    '--json-schema', JSON.stringify(VERDICT_SCHEMA),
    '--model', model,
    '--max-turns', String(maxTurns),
    '--no-session-persistence',
    '--setting-sources', 'local',
    '--strict-mcp-config',
    '--permission-mode', 'dontAsk',
    '--allowedTools', allowedTools.join(' '),
  ];
  if (condition === 'on') {
    if (!pluginDir) throw new Error('claudeArgs: the on condition needs pluginDir');
    args.push('--plugin-dir', pluginDir);
  } else if (condition !== 'off') {
    throw new Error(`claudeArgs: unknown condition ${condition}`);
  }
  return args;
}

/** Turn the CLI's --output-format json stdout into an outcome. Never throws. */
export function parseResult(stdout, status = 0) {
  let d;
  try { d = JSON.parse(stdout); } catch { return { error: `parse: stdout is not JSON (${String(stdout).slice(0, 120)})` }; }
  if (!d || typeof d !== 'object') return { error: 'parse: result is not an object' };
  const usage = d.usage ?? {};
  const base = {
    turns: d.num_turns ?? null,
    costUsd: d.total_cost_usd ?? null,
    inTok: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    outTok: usage.output_tokens ?? null,
  };
  if (status !== 0) return { ...base, error: `exit ${status}` };
  if (d.is_error) return { ...base, error: `error result: ${d.subtype ?? 'unknown'}` };
  const out = d.structured_output;
  if (!out || !Array.isArray(out.findings)) return { ...base, error: 'no structured_output.findings (schema not honoured or max turns hit)' };
  return { ...base, flagged: out.findings.length > 0, findings: out.findings };
}

/** Copy the plugin into dest without the labelled material. */
export function copyPluginStripped(pluginRoot, dest) {
  fs.cpSync(pluginRoot, dest, {
    recursive: true,
    filter: src => {
      const rel = path.relative(pluginRoot, src).split(path.sep).join('/');
      return !PLUGIN_COPY_EXCLUDE.some(x => rel === x || rel.startsWith(`${x}/`));
    },
  });
  return dest;
}

function parseArgv(argv) {
  const o = { conditions: ['on', 'off'], lenses: DEFAULT_LENSES, limit: 0, maxTurns: 30, timeout: 600, claudeBin: 'claude', out: path.join(HERE, 'results', 'ablation.jsonl'), dryRun: false, cases: [], allowedTools: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--model') o.model = next();
    else if (a === '--conditions') o.conditions = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--lenses') o.lenses = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--case') o.cases.push(next());
    else if (a === '--limit') o.limit = Number(next());
    else if (a === '--max-turns') o.maxTurns = Number(next());
    else if (a === '--timeout') o.timeout = Number(next());
    else if (a === '--out') o.out = path.resolve(next());
    else if (a === '--claude-bin') o.claudeBin = next();
    else if (a === '--allowed-tools') o.allowedTools = next().split(/[\s,]+/).filter(Boolean);
    else if (a === '--dry-run') o.dryRun = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.model) throw new Error('--model is required (both conditions must run the same model)');
  return o;
}

function main(argv) {
  let o;
  try { o = parseArgv(argv); } catch (e) { process.stderr.write(`ablate.mjs: ${e.message}\n`); return 2; }
  let cases = listCases(PLUGIN, { lenses: o.lenses });
  if (o.cases.length) cases = cases.filter(c => o.cases.includes(c.id));
  if (o.limit > 0) cases = cases.slice(0, o.limit);
  if (!cases.length) { process.stderr.write('ablate.mjs: no cases selected\n'); return 2; }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cklph-ablate-'));
  const pluginCopy = copyPluginStripped(PLUGIN, path.join(work, 'plugin', 'cklph-audit'));
  fs.mkdirSync(path.dirname(o.out), { recursive: true });
  const runAt = new Date().toISOString();
  const written = [];
  try {
    let n = 0;
    for (const c of cases) {
      for (const condition of o.conditions) {
        const dir = path.join(work, `case-${String(++n).padStart(3, '0')}`);
        stageCase(PLUGIN, c, dir);
        const args = claudeArgs({ condition, model: o.model, pluginDir: pluginCopy, maxTurns: o.maxTurns, ...(o.allowedTools ? { allowedTools: o.allowedTools } : {}) });
        if (o.dryRun) { process.stdout.write(`${c.id} [${condition}] ${o.claudeBin} ${args.map(a => JSON.stringify(a)).join(' ')}\n`); continue; }
        const t0 = Date.now();
        const r = spawnSync(o.claudeBin, args, { cwd: dir, encoding: 'utf8', timeout: o.timeout * 1000, maxBuffer: 64 * 1024 * 1024 });
        const outcome = r.error
          ? { error: r.error.code === 'ETIMEDOUT' ? 'timeout' : `launch: ${r.error.message}` }
          : parseResult(r.stdout, r.status ?? 1);
        const rec = {
          runAt, condition, model: o.model, id: c.id, lens: c.lens, ground: c.ground, lookalike: c.lookalike, class: c.class,
          flagged: outcome.flagged ?? null,
          correct: outcome.error ? null : (c.ground === 'vulnerable') === outcome.flagged,
          turns: outcome.turns ?? null, costUsd: outcome.costUsd ?? null, inTok: outcome.inTok ?? null, outTok: outcome.outTok ?? null,
          durationS: Math.round((Date.now() - t0) / 100) / 10,
          ...(outcome.findings ? { findings: outcome.findings } : {}),
          ...(outcome.error ? { error: outcome.error } : {}),
        };
        fs.appendFileSync(o.out, `${JSON.stringify(rec)}\n`);
        written.push(rec);
        process.stderr.write(`${c.id} [${condition}] ${rec.error ? `ERROR ${rec.error}` : rec.flagged ? 'flagged' : 'clean'}${rec.correct === false ? ' (WRONG)' : ''}\n`);
      }
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  if (o.dryRun) return 0;
  process.stdout.write(`${renderTable(summarizeConditions(written))}\n`);
  process.stdout.write(`records appended to ${o.out}; score every run in it with: node ${path.join(HERE, 'score.mjs')} ${o.out}\n`);
  return 0;
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(self)) {
  process.exitCode = main(process.argv.slice(2));
}

