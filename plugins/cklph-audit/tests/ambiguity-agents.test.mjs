// Agents match the engine for the ambiguity lens (SPEC-v4-ambiguity.md AC-043, AC-047).
//
//   node plugins/cklph-audit/tests/ambiguity-agents.test.mjs
//   node --test plugins/cklph-audit/tests/ambiguity-agents.test.mjs
//
// Asserts outcomes against the engine source, never a hand copy: the reviewer's tool path resolves to
// a real executable, its `readings` keys equal REVIEW_SCHEMA's (parsed from audit.workflow.js), the
// verifier's "Ambiguity findings" section carries the four proof parts, the synthesizer asks A-or-B
// owner questions, and compliance-lens stops enumerating lenses. Exits non-zero on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(PLUGIN, rel), 'utf8');
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

// ── parsers (pure, so the teeth cases run them on in-memory text) ────────────
// The body of the `{ ... }` that opens at src[open] (single-quoted strings skipped).
function braceBody(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "'") { i++; while (i < src.length && src[i] !== "'") { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error('unbalanced braces');
}

// Top-level keys of an object-literal body: `a: { ... }, b: { ... }` → ['a', 'b'].
function topKeys(body) {
  const keys = [];
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'") { i++; while (i < body.length && body[i] !== "'") { if (body[i] === '\\') i++; i++; } continue; }
    if (c === '{' || c === '[') { depth++; continue; }
    if (c === '}' || c === ']') { depth--; continue; }
    if (depth === 0) {
      const m = /^([A-Za-z_]\w*)\s*:/.exec(body.slice(i));
      if (m && (i === 0 || /[\s,]/.test(body[i - 1]))) { keys.push(m[1]); i += m[0].length - 1; }
    }
  }
  return keys;
}

// `readings.properties` keys from REVIEW_SCHEMA in the engine SOURCE TEXT.
function engineReadingsKeys(src) {
  const start = src.search(/\bconst\s+REVIEW_SCHEMA\s*=\s*\{/);
  if (start < 0) throw new Error('no `const REVIEW_SCHEMA = {` in the engine source');
  const schema = braceBody(src, src.indexOf('{', start));
  const r = /\breadings\s*:\s*\{/.exec(schema);
  if (!r) throw new Error('REVIEW_SCHEMA has no `readings` property');
  const readings = braceBody(schema, r.index + r[0].length - 1);
  const p = /\bproperties\s*:\s*\{/.exec(readings);
  if (!p) throw new Error('REVIEW_SCHEMA.readings has no `properties`');
  const keys = topKeys(braceBody(readings, p.index + p[0].length - 1));
  if (!keys.length) throw new Error('REVIEW_SCHEMA.readings.properties is empty');
  return keys;
}

// Keys of the literal `readings: { a, b, ... }` in a doc, or null when the literal is absent.
function docReadingsKeys(doc) {
  const m = /readings: \{ ([A-Za-z_]\w*(?:, [A-Za-z_]\w*)*) \}/.exec(doc);
  return m ? m[1].split(', ') : null;
}

// Problems comparing a doc's readings literal to the engine's keys (empty = match).
function compareReadings(doc, engineKeys) {
  const keys = docReadingsKeys(doc);
  if (!keys) return ['no literal `readings: { ... }` in the doc'];
  const problems = [];
  for (const k of engineKeys) if (!keys.includes(k)) problems.push(`missing ${k}`);
  for (const k of keys) if (!engineKeys.includes(k)) problems.push(`extra ${k}`);
  return problems;
}

// The body of the first markdown heading whose text contains `needle`, up to the next heading of the
// same or a higher level (deeper subheadings stay inside the section).
function section(doc, needle) {
  const lines = doc.split('\n');
  const i = lines.findIndex(l => /^#{1,6} /.test(l) && l.includes(needle));
  if (i < 0) return null;
  const level = /^(#+)/.exec(lines[i])[1].length;
  let j = i + 1;
  while (j < lines.length && !(new RegExp(`^#{1,${level}} `).test(lines[j]))) j++;
  return lines.slice(i, j).join('\n');
}

// Problems with a verifier doc's ambiguity section (empty = complete).
function verifierProblems(doc) {
  const s = section(doc, 'Ambiguity findings');
  if (s == null) return ['no heading containing "Ambiguity findings"'];
  return ['reading A', 'consumer', 'outcome', 'disambiguator', 'human']
    .filter(part => !s.toLowerCase().includes(part.toLowerCase()))
    .map(part => `section lacks "${part}"`);
}

const engine = read('workflows/audit.workflow.js');
const reviewer = read('agents/audit-reviewer.md');
const verifier = read('agents/audit-verifier.md');
const synthesizer = read('agents/audit-synthesizer.md');
const compliance = read('skills/compliance-lens/SKILL.md');

// ── reviewer: tool map + readings ────────────────────────────────────────────
console.log('audit-reviewer.md');
{
  const entry = reviewer.split('\n').find(l => /\*\*ambiguity\*\*\s*→/.test(l));
  ok(!!entry, 'tool map has an `**ambiguity** →` entry');
  const m = entry && /\$\{CLAUDE_PLUGIN_ROOT\}\/(tools\/ambiguity\.sh)/.exec(entry);
  ok(!!m, 'the ambiguity entry names `${CLAUDE_PLUGIN_ROOT}/tools/ambiguity.sh`');
  let exec = false;
  if (m) {
    const abs = path.join(PLUGIN, m[1]);
    try { fs.accessSync(abs, fs.constants.X_OK); exec = fs.statSync(abs).isFile(); } catch { exec = false; }
  }
  ok(exec, 'that path, with the variable replaced by the plugin dir, is an existing executable file');

  const keys = engineReadingsKeys(engine);
  ok(keys.join(',') === 'a,b,consumer,divergence', `REVIEW_SCHEMA.readings keys parse from the engine (${keys.join(', ')})`);
  ok(reviewer.includes('readings: { a, b, consumer, divergence }'), 'the literal `readings: { a, b, consumer, divergence }` appears');
  const problems = compareReadings(reviewer, keys);
  ok(problems.length === 0, `reviewer readings keys equal the engine's${problems.length ? `: ${problems.join('; ')}` : ''}`);
}

// ── verifier: the proof-contract section ─────────────────────────────────────
console.log('audit-verifier.md');
{
  const problems = verifierProblems(verifier);
  ok(problems.length === 0, `"Ambiguity findings" section has reading A, consumer, outcome, disambiguator, human${problems.length ? `: ${problems.join('; ')}` : ''}`);
}

// ── synthesizer + compliance ─────────────────────────────────────────────────
console.log('audit-synthesizer.md / compliance-lens');
ok(/A or B|A-or-B/.test(synthesizer), 'synthesizer phrases owner decisions as A or B');
ok(!/\(security, sca,/.test(compliance), 'compliance-lens no longer enumerates lenses `(security, sca, ...)`');
ok(/ambiguity/.test(compliance), 'compliance-lens mentions ambiguity');

// ── teeth: each check fails on a plausible broken doc ────────────────────────
console.log('teeth');
{
  const keys = engineReadingsKeys(engine);
  const broken = reviewer.replace('readings: { a, b, consumer, divergence }', 'readings: { a, b, consumer }');
  const p = compareReadings(broken, keys);
  ok(p.length === 1 && p[0] === 'missing divergence', `keys comparison on a reviewer doc without \`divergence\` reports it (${p.join('; ')})`);
  const extra = compareReadings('readings: { a, b, consumer, divergence, intent }', keys);
  ok(extra.length === 1 && extra[0] === 'extra intent', 'keys comparison reports a key the engine does not have');
  ok(compareReadings('readings { a, b }', keys).length === 1, 'a doc without the literal fails, not passes');

  const fakeEngine = engine.replace(/(readings\s*:\s*\{\s*type:\s*'object',\s*properties:\s*\{[^\n]*?)divergence: \{ type: 'string' \} /, '$1');
  ok(fakeEngine !== engine && !engineReadingsKeys(fakeEngine).includes('divergence'), 'engine parser follows the source (divergence removed from REVIEW_SCHEMA → not parsed)');

  // the four parts must sit INSIDE the section: moving them to a later section must fail
  const outside = '## Ambiguity findings: prove the divergence\nshort.\n\n## Output discipline\nreading A, consumer, outcome, disambiguator, human\n';
  ok(verifierProblems(outside).length === 5, 'parts outside the "Ambiguity findings" section do not count');
  ok(verifierProblems('## Something else\nreading A consumer outcome disambiguator human\n')[0] === 'no heading containing "Ambiguity findings"', 'a missing heading is reported');
  const sub = '## Ambiguity findings\n### By class\nreading A, consumer, outcome, disambiguator, a human reader\n## Next\n';
  ok(verifierProblems(sub).length === 0, 'deeper subheadings stay inside the section');

  ok(/\(security, sca,/.test('aggregated findings from all other lenses (security, sca, iac)'), 'the stale-list pattern matches the old compliance text');
}

console.log(failed === 0 ? '\n✓ ALL AMBIGUITY AGENT TESTS PASSED' : `\n✗ ${failed} ambiguity agent test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
