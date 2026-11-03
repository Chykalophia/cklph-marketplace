// AC-070: every lens is registered everywhere a user or the engine looks for it (SPEC-v4-ambiguity.md §12).
//
//   node plugins/cklph-audit/tests/lens-registry.test.mjs     (also runs under `node --test`)
//
// A lens = a `skills/<name>-lens/` dir. Each must appear in the engine's LENS_HINTS (parsed from
// workflows/audit.workflow.js by tests/lib/engine-source.mjs, never a hand copy), as a README lens
// table row starting `| **<lens>**`, on line 13 of templates/audit.config.example.yaml (the YAML array
// or its trailing comment), and in plugin.json's description. marketplace.json's cklph-audit
// description must equal plugin.json's. Every lens has fixtures/<lens>/should-flag and should-not-flag,
// except the legacy allowlist. SPEC*.md are dated design records and are never read.
// Teeth: the README-row check on an in-memory README with the ambiguity row removed reports ambiguity.
// Exits non-zero on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLensHints } from './lib/engine-source.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(PLUGIN, '..', '..');
const LEGACY_NO_FIXTURES = new Set(['correctness', 'compliance', 'concurrency', 'state-machine', 'economic']);
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };
const read = rel => fs.readFileSync(path.join(PLUGIN, rel), 'utf8');

// a lens name as a whole token: `agent-config` must not match inside `agent-config-x`, nor `k8s` inside `k8sx`
const hasToken = (text, name) => new RegExp(`(?<![\\w-])${name.replace(/[-]/g, '\\-')}(?![\\w-])`).test(text);

// line 13 → the set of lens names in its YAML flow array plus its `# also:` comment
function configLenses(line) {
  const m = /^lenses:\s*\[([^\]]*)\]\s*(?:#\s*(.*))?$/.exec(line);
  if (!m) throw new Error(`templates/audit.config.example.yaml line 13 is not \`lenses: [...]  # ...\`: ${line}`);
  const arr = m[1].split(',').map(s => s.trim()).filter(Boolean);
  // the comment's parentheticals hold commas and prose, so drop them before splitting
  const comment = (m[2] ?? '').replace(/^also:\s*/, '').replace(/\([^)]*\)/g, '');
  const rest = comment.split(',').map(s => s.trim()).filter(Boolean);
  return new Set([...arr, ...rest]);
}

const readmeHasRow = (readme, lens) => readme.split('\n').some(l => l.startsWith(`| **${lens}**`));

// pure check over already-read inputs, so the teeth case can feed it an in-memory README
function checkRegistry({ lenses, hints, readme, configLine, pluginDesc, marketDesc, hasFixtures }) {
  const problems = [];
  const cfg = configLenses(configLine);
  for (const lens of lenses) {
    if (!hints.includes(lens)) problems.push(`${lens}: missing from LENS_HINTS in workflows/audit.workflow.js`);
    if (!readmeHasRow(readme, lens)) problems.push(`${lens}: no README lens table row starting \`| **${lens}**\``);
    if (!cfg.has(lens)) problems.push(`${lens}: not on line 13 of templates/audit.config.example.yaml`);
    if (!hasToken(pluginDesc, lens)) problems.push(`${lens}: not named in .claude-plugin/plugin.json description`);
    if (!LEGACY_NO_FIXTURES.has(lens) && !hasFixtures(lens)) problems.push(`${lens}: missing fixtures/${lens}/should-flag or should-not-flag`);
  }
  if (marketDesc !== pluginDesc) problems.push('marketplace.json cklph-audit description is not a verbatim copy of plugin.json\'s');
  return problems;
}

const lenses = fs.readdirSync(path.join(PLUGIN, 'skills'), { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name.endsWith('-lens'))
  .map(d => d.name.slice(0, -'-lens'.length))
  .sort();
const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
const market = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'marketplace.json'), 'utf8'));
const entry = (market.plugins ?? []).find(p => p.name === 'cklph-audit');
const inputs = {
  lenses,
  hints: parseLensHints(read('workflows/audit.workflow.js')),
  readme: read('README.md'),
  configLine: read('templates/audit.config.example.yaml').split('\n')[12] ?? '',
  pluginDesc: String(plugin.description ?? ''),
  marketDesc: entry ? entry.description : undefined,
  hasFixtures: lens => ['should-flag', 'should-not-flag'].every(d => fs.existsSync(path.join(PLUGIN, 'fixtures', lens, d))),
};

console.log('lens registry');
{
  ok(lenses.length >= 16 && lenses.includes('ambiguity'), `found ${lenses.length} skills/*-lens dirs, ambiguity among them (${lenses.join(', ')})`);
  ok(Boolean(entry), 'marketplace.json has a cklph-audit entry');
  const problems = checkRegistry(inputs);
  ok(problems.length === 0, `every lens registered in LENS_HINTS, README, example config line 13, plugin.json; marketplace description in sync`);
  for (const p of problems) console.log(`    problem: ${p}`);
}

console.log('teeth');
{
  const row = inputs.readme.split('\n').find(l => l.startsWith('| **ambiguity**'));
  const readme = row === undefined ? inputs.readme : inputs.readme.split('\n').filter(l => l !== row).join('\n');
  ok(row !== undefined && readme !== inputs.readme, 'removing the ambiguity row changed the in-memory README');
  const problems = checkRegistry({ ...inputs, readme });
  ok(problems.some(p => p.startsWith('ambiguity:') && p.includes('README')), `README without the ambiguity row → ambiguity reported (${JSON.stringify(problems)})`);

  const drift = checkRegistry({ ...inputs, marketDesc: `${inputs.pluginDesc} ` });
  ok(drift.some(p => p.startsWith('marketplace.json')), 'a marketplace description one character off → reported');

  const cfg = checkRegistry({ ...inputs, configLine: inputs.configLine.replace(/,\s*ambiguity \([^)]*\)/, '') });
  ok(cfg.some(p => p.startsWith('ambiguity:') && p.includes('line 13')), 'ambiguity removed from config line 13 → reported');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
