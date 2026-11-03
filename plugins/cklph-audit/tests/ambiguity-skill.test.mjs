// AC-040: skills/ambiguity-lens/SKILL.md and trigger-tests.md (SPEC-v4-ambiguity.md §7.1).
//
//   node plugins/cklph-audit/tests/ambiguity-skill.test.mjs     (also runs under `node --test`)
//
// The rule-id set is compared to RULE_IDS imported from tools/ambiguity/common.mjs, and the allowed
// severities are parsed out of REVIEW_SCHEMA in workflows/audit.workflow.js; neither is hand-copied
// here. Teeth: the same checker on in-memory variants (one rule row removed, a bad severity cell, a
// description with a colon-space, a missing miss line) must report each problem by name. Exits
// non-zero on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE_IDS } from '../tools/ambiguity/common.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(PLUGIN, 'skills', 'ambiguity-lens', 'SKILL.md');
const TRIGGERS = path.join(PLUGIN, 'skills', 'ambiguity-lens', 'trigger-tests.md');
const ENGINE = path.join(PLUGIN, 'workflows', 'audit.workflow.js');
const TOOL_REF = '${CLAUDE_PLUGIN_ROOT}/tools/ambiguity.sh';
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

// ── parsers (pure, so the teeth cases run them on in-memory text) ────────────
// REVIEW_SCHEMA severity enum: the first `severity: { type: 'string', enum: [...] }` in the engine.
function parseSeverities(engineSrc) {
  const m = /severity:\s*\{\s*type:\s*'string',\s*enum:\s*\[([^\]]*)\]/.exec(engineSrc);
  if (!m) throw new Error('no severity enum in workflows/audit.workflow.js');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

// `description:` from the YAML front matter (plain or double-quoted scalar).
function parseDescription(text) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) return null;
  const m = /^description:\s*(.*)$/m.exec(fm[1]);
  if (!m) return null;
  const v = m[1].trim();
  return /^".*"$/.test(v) ? JSON.parse(v) : v;
}

// Cells of a markdown table row, split on unescaped pipes.
const cells = row => row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim());

// The table whose header has a `Rule id` cell → { header, rows: [cells...] } or null.
function parseRuleTable(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|/.test(lines[i])) continue;
    const header = cells(lines[i]);
    if (!header.some(c => /^rule id$/i.test(c))) continue;
    if (!/^\s*\|[\s|:-]+\|?\s*$/.test(lines[i + 1])) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) rows.push(cells(lines[j]));
    return { header, rows };
  }
  return null;
}

// Every way SKILL.md breaks AC-040, one string per problem (empty = pass).
function checkSkill(text, { ruleIds, severities }) {
  const problems = [];
  const desc = parseDescription(text);
  if (!/^---\n[\s\S]*?^name:\s*ambiguity-lens\s*$/m.test(text)) problems.push('front matter lacks `name: ambiguity-lens`');
  if (desc == null) problems.push('front matter has no description');
  else {
    if (desc.length >= 300) problems.push(`description is ${desc.length} chars, want < 300`);
    if (!desc.startsWith('Use when')) problems.push('description does not start with `Use when`');
    if (desc.includes(': ')) problems.push('description contains a colon-space');
  }

  const table = parseRuleTable(text);
  if (!table) { problems.push('no rule table (a header cell `Rule id`)'); return problems; }
  const idCol = table.header.findIndex(c => /^rule id$/i.test(c));
  const sevCol = table.header.findIndex(c => /severity/i.test(c));
  const ids = table.rows.map(r => (/^`?(ambiguity:[a-z-]+)`?$/.exec(r[idCol] ?? '') ?? [])[1] ?? `<unparsed: ${r[idCol]}>`);
  const got = new Set(ids);
  for (const id of ruleIds) if (!got.has(id)) problems.push(`rule table is missing ${id}`);
  for (const id of got) if (!ruleIds.includes(id)) problems.push(`rule table has ${id}, which RULE_IDS lacks`);
  if (table.rows.length !== 9) problems.push(`rule table has ${table.rows.length} rows, want the 9 rows of §1`);
  if (sevCol < 0) problems.push('rule table has no severity column');
  else {
    table.rows.forEach((r, k) => {
      const lead = (/^[`"'*_\s]*([A-Za-z][\w-]*)/.exec(r[sevCol] ?? '') ?? [])[1];
      if (!severities.includes(lead)) problems.push(`severity cell of ${ids[k]} starts with ${JSON.stringify(lead ?? r[sevCol])}, not an allowed severity`);
      if (/^critical\b/i.test(lead ?? '')) problems.push(`severity cell of ${ids[k]} starts with critical`);
    });
  }
  if (!/never critical/i.test(text)) problems.push('does not state never critical');
  if (!/precision\s*(≥|>=)\s*0\.8\b/i.test(text)) problems.push('does not state precision ≥ 0.8');
  if (!text.includes(TOOL_REF)) problems.push(`does not name the tool as ${TOOL_REF}`);
  return problems;
}

// trigger-tests.md: exactly 3 `- fire:` and 3 `- miss:` lines.
function checkTriggers(text) {
  const problems = [];
  const fire = text.split('\n').filter(l => /^- fire:\s+\S/.test(l)).length;
  const miss = text.split('\n').filter(l => /^- miss:\s+\S/.test(l)).length;
  if (fire !== 3) problems.push(`trigger-tests.md has ${fire} fire line(s), want 3`);
  if (miss !== 3) problems.push(`trigger-tests.md has ${miss} miss line(s), want 3`);
  return problems;
}

// ── real files ───────────────────────────────────────────────────────────────
const engine = fs.readFileSync(ENGINE, 'utf8');
const severities = parseSeverities(engine);
const opts = { ruleIds: [...RULE_IDS], severities };

console.log('skills/ambiguity-lens/SKILL.md');
ok(fs.existsSync(SKILL), 'SKILL.md exists');
const skill = fs.existsSync(SKILL) ? fs.readFileSync(SKILL, 'utf8') : '';
{
  const problems = checkSkill(skill, opts);
  for (const p of problems) console.log(`    ${p}`);
  ok(problems.length === 0, `SKILL.md meets AC-040 (${problems.length} problem(s))`);
  ok(severities.length >= 4 && !severities.includes('info'), `severities parsed from REVIEW_SCHEMA: ${severities.join(',')}`);
  ok(RULE_IDS.length === 8, `RULE_IDS has the 8 distinct ids of the 9 §1 rows (${RULE_IDS.length})`);
  const tool = path.join(PLUGIN, 'tools', 'ambiguity.sh');
  ok(fs.existsSync(tool), 'the tool the skill names exists at tools/ambiguity.sh');
}

console.log('skills/ambiguity-lens/trigger-tests.md');
ok(fs.existsSync(TRIGGERS), 'trigger-tests.md exists');
const triggers = fs.existsSync(TRIGGERS) ? fs.readFileSync(TRIGGERS, 'utf8') : '';
{
  const problems = checkTriggers(triggers);
  for (const p of problems) console.log(`    ${p}`);
  ok(problems.length === 0, `3 fire and 3 miss lines (${problems.length} problem(s))`);
}

// ── teeth: the same checkers must catch each break by name ───────────────────
console.log('teeth');
{
  const row = skill.split('\n').find(l => /^\|\s*`ambiguity:sentinel`/.test(l)) ?? '';
  ok(row !== '', 'found the ambiguity:sentinel row');
  const noRow = skill.replace(`${row}\n`, '');
  ok(noRow !== skill, 'removing the row changed the in-memory SKILL');
  const p1 = checkSkill(noRow, opts);
  ok(p1.includes('rule table is missing ambiguity:sentinel'), `one row removed → missing id reported (${JSON.stringify(p1)})`);

  const extra = skill.replace(row, `${row}\n| \`ambiguity:loose-match\` | code | x | low | quick-win |`);
  ok(checkSkill(extra, opts).includes('rule table has ambiguity:loose-match, which RULE_IDS lacks'), 'an id outside RULE_IDS → reported');

  const badSev = skill.replace(row, row.replace(/\|\s*medium; high if it fails open on authz or quota\s*\|/, '| info, needs-owner-input |'));
  ok(badSev !== skill && checkSkill(badSev, opts).some(p => p.startsWith('severity cell of ambiguity:sentinel starts with "info"')),
    'a severity cell that is not an allowed severity → reported');

  const crit = skill.replace(row, row.replace(/\|\s*medium; high if it fails open on authz or quota\s*\|/, '| critical |'));
  ok(crit !== skill && checkSkill(crit, opts).some(p => p.includes('starts with critical')), 'a critical severity cell → reported');

  const colon = skill.replace(/^description: Use when/m, 'description: Use when this: audit');
  ok(colon !== skill && checkSkill(colon, opts).includes('description contains a colon-space'), 'description with a colon-space → reported');

  const noPrecision = skill.replace(/precision ≥ 0\.8/g, 'precision ≥ 0.7');
  ok(noPrecision !== skill && checkSkill(noPrecision, opts).includes('does not state precision ≥ 0.8'), 'precision 0.7 → reported');

  const noCrit = skill.replace(/never critical/gi, 'rarely high');
  ok(noCrit !== skill && checkSkill(noCrit, opts).includes('does not state never critical'), 'never-critical removed → reported');

  const twoMiss = triggers.replace(/^- miss:.*\n/m, '');
  ok(twoMiss !== triggers && checkTriggers(twoMiss).includes('trigger-tests.md has 2 miss line(s), want 3'), 'a miss line removed → reported');

  ok(checkSkill('# no front matter\n', opts).includes('front matter has no description'), 'empty SKILL → reported, never a silent pass');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
