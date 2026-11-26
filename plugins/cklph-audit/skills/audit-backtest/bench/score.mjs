// score.mjs: score benchmark results. Pure functions plus a small CLI.
//
//   node score.mjs <results.jsonl> [--condition on]
//
// Each JSONL record is one case outcome: { id, ground: "vulnerable"|"safe", lookalike, flagged,
// condition?, turns?, costUsd?, inTok?, outTok?, error? }. A record with `error` set never ran to a
// verdict: it is counted under `errors` and left out of every rate, so a crashed run cannot pass for
// a clean one. Recall is over vulnerable cases, precision over flagged ones, and the false-positive
// rate is reported twice: over the safe lookalikes, and over every safe case.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const rate = (num, den) => (den ? num / den : null);

/** Median of the finite numbers in xs, or null when there are none. */
export function median(xs) {
  const v = xs.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Confusion counts and rates for one set of case outcomes. */
export function scoreCases(records) {
  const ran = records.filter(r => !r.error);
  const s = { n: records.length, errors: records.length - ran.length, tp: 0, fn: 0, fp: 0, tn: 0, lookalikes: 0, lookalikeFp: 0 };
  for (const r of ran) {
    if (r.ground === 'vulnerable') r.flagged ? s.tp++ : s.fn++;
    else {
      r.flagged ? s.fp++ : s.tn++;
      if (r.lookalike) { s.lookalikes++; if (r.flagged) s.lookalikeFp++; }
    }
  }
  return {
    ...s,
    recall: rate(s.tp, s.tp + s.fn),
    precision: rate(s.tp, s.tp + s.fp),
    fpRateLookalike: rate(s.lookalikeFp, s.lookalikes),
    fpRateSafe: rate(s.fp, s.fp + s.tn),
    falsePositives: ran.filter(r => r.ground === 'safe' && r.flagged).map(r => r.id),
    falseNegatives: ran.filter(r => r.ground === 'vulnerable' && !r.flagged).map(r => r.id),
  };
}

/** Per-condition scores with median turns and cost, plus on-minus-off deltas when both exist. */
export function summarizeConditions(records, { on = 'on', off = 'off' } = {}) {
  const byCond = new Map();
  for (const r of records) {
    const k = r.condition ?? 'all';
    if (!byCond.has(k)) byCond.set(k, []);
    byCond.get(k).push(r);
  }
  const conditions = {};
  for (const [k, rs] of byCond) {
    const ran = rs.filter(r => !r.error);
    conditions[k] = { ...scoreCases(rs), medianTurns: median(ran.map(r => r.turns)), medianCostUsd: median(ran.map(r => r.costUsd)) };
  }
  let delta = null;
  if (conditions[on] && conditions[off]) {
    const d = key => (conditions[on][key] == null || conditions[off][key] == null ? null : conditions[on][key] - conditions[off][key]);
    delta = { recall: d('recall'), fpRateLookalike: d('fpRateLookalike'), fpRateSafe: d('fpRateSafe'), medianTurns: d('medianTurns'), medianCostUsd: d('medianCostUsd') };
  }
  return { conditions, delta };
}

const pct = x => (x == null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
const signedPct = x => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`);
const num = (x, digits = 1) => (x == null ? 'n/a' : x.toFixed(digits));
const signed = (x, digits = 1) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`);

/** A markdown table for a summarizeConditions result. */
export function renderTable({ conditions, delta }) {
  const rows = [
    '| Condition | Recall | FP rate (lookalikes) | FP rate (all safe) | Precision | Median turns | Median $ | Errors |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const [k, c] of Object.entries(conditions)) {
    rows.push(`| ${k} | ${c.tp}/${c.tp + c.fn} ${pct(c.recall)} | ${c.lookalikeFp}/${c.lookalikes} ${pct(c.fpRateLookalike)} | ` +
      `${c.fp}/${c.fp + c.tn} ${pct(c.fpRateSafe)} | ${pct(c.precision)} | ${num(c.medianTurns)} | ${num(c.medianCostUsd, 3)} | ${c.errors} |`);
  }
  if (delta) {
    rows.push(`| **delta (on - off)** | ${signedPct(delta.recall)} | ${signedPct(delta.fpRateLookalike)} | ${signedPct(delta.fpRateSafe)} | | ` +
      `${signed(delta.medianTurns)} | ${signed(delta.medianCostUsd, 3)} | |`);
  }
  return rows.join('\n');
}

/** Parse a JSONL file; a line that is not JSON is an error, never silently skipped. */
export function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map((l, i) => {
    try { return JSON.parse(l); } catch { throw new Error(`${file}:${i + 1} is not JSON`); }
  });
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(self)) {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) {
    process.stderr.write('usage: score.mjs <results.jsonl> [--condition <name>]\n');
    process.exit(2);
  }
  const ci = rest.indexOf('--condition');
  let records = readJsonl(file);
  if (ci >= 0) records = records.filter(r => r.condition === rest[ci + 1]);
  const summary = summarizeConditions(records);
  process.stdout.write(`${renderTable(summary)}\n`);
  for (const [k, c] of Object.entries(summary.conditions)) {
    if (c.falsePositives.length) process.stdout.write(`${k} false positives: ${c.falsePositives.join(', ')}\n`);
    if (c.falseNegatives.length) process.stdout.write(`${k} false negatives: ${c.falseNegatives.join(', ')}\n`);
  }
}
