// AC-046: the commented `# ambiguity:` block in templates/audit.config.example.yaml matches the
// engine's AMBIGUITY_PROSE_DEFAULT / AMBIGUITY_EXCLUDE_DEFAULT literals (SPEC-v4-ambiguity.md §8).
//
//   node plugins/cklph-audit/tests/ambiguity-config.test.mjs     (also runs under `node --test`)
//
// The engine values are parsed out of workflows/audit.workflow.js by tests/lib/engine-source.mjs,
// never hand-copied here. Teeth: the same comparison on an in-memory template with one glob removed
// must name that glob. Exits non-zero on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProseDefault, parseExcludeDefault } from './lib/engine-source.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(PLUGIN, 'templates', 'audit.config.example.yaml');
const ENGINE = path.join(PLUGIN, 'workflows', 'audit.workflow.js');
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

// Flow array of single-quoted strings → JSON array; throws on anything else.
function flowArray(v, where) {
  const m = /^\[(.*)\]$/.exec(v);
  if (!m) throw new Error(`${where}: not a flow array: ${v}`);
  const json = m[1].replace(/'((?:[^'\\]|\\.)*)'/g, (_, s) => JSON.stringify(s));
  return JSON.parse(`[${json}]`);
}

// The run of `#` lines starting at `# ambiguity:` → { 'ambiguity.code': false, 'ambiguity.prose.groups.policy': [...], ... }
function readAmbiguityBlock(text) {
  const all = String(text).split('\n');
  const start = all.findIndex(l => /^# ?ambiguity:/.test(l));
  if (start < 0) throw new Error('no commented `# ambiguity:` block in the template');
  const block = [];
  for (let i = start; i < all.length && /^#/.test(all[i]); i++) block.push(all[i]);
  const out = {};
  const stack = []; // [{ indent, key }]
  for (const raw of block) {
    const line = raw.replace(/^# ?/, '').replace(/\s+#(\s.*)?$/, '');
    if (!line.trim()) continue;
    const m = /^(\s*)([\w-]+):\s*(.*)$/.exec(line);
    if (!m) throw new Error(`unparseable line in the ambiguity block: ${raw}`);
    const indent = m[1].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    stack.push({ indent, key: m[2] });
    const key = stack.map(s => s.key).join('.');
    const v = m[3].trim();
    if (v === '') continue;
    out[key] = v === 'true' ? true : v === 'false' ? false : v.startsWith('[') ? flowArray(v, key) : v;
  }
  return out;
}

// Every way the template disagrees with the engine, one string per problem (empty = match).
function compareConfig(templateText, engineSrc) {
  const problems = [];
  let got;
  try { got = readAmbiguityBlock(templateText); } catch (e) { return [e.message]; }
  const prose = parseProseDefault(engineSrc);
  const want = {
    'ambiguity.prose.groups.policy': prose.policy,
    'ambiguity.prose.groups.instructions': prose.instructions,
    'ambiguity.prose.exclude': parseExcludeDefault(engineSrc),
  };
  if (got['ambiguity.code'] !== false) problems.push(`ambiguity.code is ${JSON.stringify(got['ambiguity.code'])}, want false`);
  const groupKeys = Object.keys(got).filter(k => k.startsWith('ambiguity.prose.groups.')).sort();
  const wantGroupKeys = Object.keys(want).filter(k => k.startsWith('ambiguity.prose.groups.')).sort();
  if (JSON.stringify(groupKeys) !== JSON.stringify(wantGroupKeys)) problems.push(`group keys ${JSON.stringify(groupKeys)}, want ${JSON.stringify(wantGroupKeys)}`);
  for (const [key, exp] of Object.entries(want)) {
    const act = got[key];
    if (!Array.isArray(act)) { problems.push(`${key} is missing or not a flow array`); continue; }
    for (const g of exp) if (!act.includes(g)) problems.push(`${key} is missing ${g}`);
    for (const g of act) if (!exp.includes(g)) problems.push(`${key} has ${g}, which the engine default lacks`);
    if (exp.every(g => act.includes(g)) && act.every(g => exp.includes(g)) && JSON.stringify(act) !== JSON.stringify(exp)) {
      problems.push(`${key} order differs from the engine: ${JSON.stringify(act)}`);
    }
  }
  return problems;
}

const template = fs.readFileSync(TEMPLATE, 'utf8');
const engine = fs.readFileSync(ENGINE, 'utf8');

console.log('example config matches the engine');
{
  const problems = compareConfig(template, engine);
  for (const p of problems) console.log(`    ${p}`);
  ok(problems.length === 0, `template # ambiguity: block deep-equals the engine defaults (${problems.length} problem(s))`);
  let block = {};
  try { block = readAmbiguityBlock(template); } catch { /* reported above */ }
  ok(block['ambiguity.code'] === false, 'ambiguity.code is false');
  ok(Array.isArray(block['ambiguity.prose.groups.instructions']) && block['ambiguity.prose.groups.instructions'].includes('**/skills/**/*.md'),
    'instructions group reaches every skills/**/*.md (the PR #22 file is a SKILL.md sibling)');
  ok(/ambiguity/.test(template.split('\n')[12] ?? ''), 'line 13 (the lenses line) names ambiguity');
}

console.log('teeth');
{
  const glob = '**/skills/**/*.md';
  const line = template.split('\n').find(l => /^#\s+instructions:/.test(l)) ?? '';
  ok(line.includes(`'${glob}'`), `template instructions line carries '${glob}'`);
  const broken = template.replace(line, line.replace(`'${glob}', `, ''));
  ok(broken !== template, 'removing the glob changed the in-memory template');
  const problems = compareConfig(broken, engine);
  ok(problems.some(p => p.includes('ambiguity.prose.groups.instructions') && p.includes(`missing ${glob}`)),
    `one glob removed from instructions → reported by name (${JSON.stringify(problems)})`);

  const ex = '**/fixtures/**';
  const exLine = template.split('\n').find(l => /^#\s+exclude:/.test(l)) ?? '';
  const brokenEx = template.replace(exLine, exLine.replace(`'${ex}', `, ''));
  ok(brokenEx !== template && compareConfig(brokenEx, engine).some(p => p.includes(`ambiguity.prose.exclude is missing ${ex}`)),
    `one glob removed from exclude → reported by name`);

  const codeOn = template.replace(/^(#\s+code:\s*)false/m, '$1true');
  ok(codeOn !== template && compareConfig(codeOn, engine).some(p => p.startsWith('ambiguity.code is true')), 'code: true → reported');

  ok(compareConfig('version: 1\n', engine).some(p => /no commented `# ambiguity:` block/.test(p)), 'missing block → reported, never a silent pass');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
