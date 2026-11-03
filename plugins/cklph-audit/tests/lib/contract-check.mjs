// contract-check.mjs: the ONE fail-closed contract check (SPEC-v4-ambiguity.md §3.7, D27).
//
//   node plugins/cklph-audit/tests/lib/contract-check.mjs --root <dir> --min-docs <N>
//        [--engine-globs] [--exclude <glob>]... [--tool <path>] [glob...]
//
// ambiguity.sh prints `[]` and exits 0 on every failure by design, so "no bad records" alone proves
// nothing. This check also requires the stderr summary line, enums > 0, docs >= minDocs and no
// NOTHING scanned / NOT run / helper failed / skipped / truncated line, exactly one summary line (the
// LAST is read, so a forged earlier one cannot win) and a tool that actually ran. `skipped` is a doc
// the tool did not read; the `N schema candidate(s) ... not harvested` line is informational (§15
// SCHEMA-CAP) and never a failure. Offenders = contract-mismatch records with an
// empty alsoValidFor (a non-empty one points at overloaded-term, which the reviewer judges).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseProseDefault } from './engine-source.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_TOOL = path.join(PLUGIN, 'tools', 'ambiguity.sh');
const ENGINE = path.join(PLUGIN, 'workflows', 'audit.workflow.js');
const SUMMARY = /^ambiguity\.sh contract: enums=(\d+) fields=\[([^\]]*)\] docs=(\d+) emitted=(\d+)$/;

export function runContractCheck({ root, minDocs = 1, engineGlobs = false, excludes = [], globs = [], tool = DEFAULT_TOOL } = {}) {
  const problems = [];
  let allGlobs = [...globs];
  if (engineGlobs) {
    const d = parseProseDefault(fs.readFileSync(ENGINE, 'utf8'));
    allGlobs = [...allGlobs, ...d.policy, ...d.instructions];
  }
  const args = [tool, 'contract', root, ...excludes.flatMap(e => ['--exclude', e]), ...allGlobs];
  const r = spawnSync('bash', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // ambiguity.sh exits 0 on every path it controls, so any other status means it never ran
  if (r.error) problems.push(`could not run ${tool}: ${r.error.message}`);
  else if (r.status !== 0) problems.push(`could not run ${tool}: exit ${r.status}${r.stderr ? ` (${String(r.stderr).trim().split('\n').pop()})` : ''}`);

  let records = null;
  try { records = JSON.parse(r.stdout ?? ''); } catch { /* reported below */ }
  if (!Array.isArray(records)) { problems.push('stdout is not a JSON array'); records = []; }

  const errLines = String(r.stderr ?? '').split('\n');
  const sums = errLines.map(l => SUMMARY.exec(l)).filter(Boolean);
  const m = sums[sums.length - 1];
  if (sums.length > 1) problems.push(`more than one summary line on stderr (${sums.length}); a file name may be forging one`);
  const summary = m
    ? { enums: Number(m[1]), fields: m[2] ? m[2].split(',') : [], docs: Number(m[3]), emitted: Number(m[4]) }
    : { enums: 0, fields: [], docs: 0, emitted: 0 };
  if (!m) problems.push('no `ambiguity.sh contract: enums=K fields=[...] docs=D emitted=E` summary line on stderr');
  if (errLines.some(l => /no schema enums found/.test(l)) || (m && summary.enums === 0)) problems.push('enums=0: no schema enums found, contract check NOT run');
  if (m && summary.docs < minDocs) problems.push(`docs=${summary.docs} is below --min-docs ${minDocs}: too few docs scanned`);
  for (const l of errLines) if (/NOTHING scanned|NOT run|helper failed|^ambiguity\.sh: skipped |truncated to \d+/.test(l)) problems.push(`stderr: ${l}`);

  const offenders = records.filter(x => x && x.kind === 'contract-mismatch' && Array.isArray(x.alsoValidFor) && x.alsoValidFor.length === 0);
  for (const o of offenders) problems.push(`offender ${o.file}:${o.line} field=${o.field} value=${o.value} via=${o.via}`);
  return { ok: problems.length === 0, problems, summary, offenders };
}

function cli(argv) {
  const opts = { root: null, minDocs: 1, engineGlobs: false, excludes: [], globs: [], tool: DEFAULT_TOOL };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') opts.root = argv[++i];
    else if (a === '--min-docs') opts.minDocs = Number(argv[++i]);
    else if (a === '--engine-globs') opts.engineGlobs = true;
    else if (a === '--exclude') opts.excludes.push(argv[++i]);
    else if (a === '--tool') opts.tool = path.resolve(argv[++i]);
    else opts.globs.push(a);
  }
  if (!opts.root || !Number.isFinite(opts.minDocs)) {
    process.stderr.write('usage: contract-check.mjs --root <dir> --min-docs <N> [--engine-globs] [--exclude <glob>]... [--tool <path>] [glob...]\n');
    return 2;
  }
  const res = runContractCheck(opts);
  if (!res.ok) { for (const p of res.problems) process.stdout.write(`${p}\n`); return 1; }
  process.stdout.write(`contract-check OK: enums=${res.summary.enums} docs=${res.summary.docs} emitted=${res.summary.emitted}\n`);
  return 0;
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(self)) {
  process.exitCode = cli(process.argv.slice(2));
}
