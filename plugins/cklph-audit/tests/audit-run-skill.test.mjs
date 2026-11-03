// skills/audit-run/SKILL.md must run a COPY of the engine, never the plugin-cache path itself.
//
//   node plugins/cklph-audit/tests/audit-run-skill.test.mjs     (also runs under `node --test`)
//
// Why: the Workflow tool only loads a scriptPath inside the working directory or a session-added
// directory. The installed plugin lives under ~/.claude/plugins/cache, which is neither, so a
// scriptPath of ${CLAUDE_PLUGIN_ROOT}/workflows/audit.workflow.js failed in every repo (1.3.0), and
// the model's fallback was to inline the 100 KB engine through `script`. Teeth: the checker on
// in-memory variants (the old direct scriptPath, the copy step removed, the inline ban removed) must
// report each problem by name. Exits non-zero on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(PLUGIN, 'skills', 'audit-run', 'SKILL.md');
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

// Pure: the problems in the skill's Workflow step.
function checkSkill(src) {
  const problems = [];
  const lines = src.split('\n');
  const scriptPathLines = lines.filter(l => /^\s*-\s*`scriptPath`/.test(l));
  if (scriptPathLines.length !== 1) problems.push(`want exactly 1 scriptPath bullet, found ${scriptPathLines.length}`);
  else if (/CLAUDE_PLUGIN_ROOT|plugins\/cache/.test(scriptPathLines[0])) problems.push('scriptPath points into the plugin cache');
  else if (!/scratchpad/.test(scriptPathLines[0])) problems.push('scriptPath is not the scratchpad copy');
  const cp = /cp\s+"\$\{CLAUDE_PLUGIN_ROOT\}\/workflows\/audit\.workflow\.js"\s+"<scratchpad>\/cklph-audit\.workflow\.js"/;
  if (!cp.test(src)) problems.push('no cp of the engine into the scratchpad');
  if (!/never pass the engine inline/i.test(src)) problems.push('does not forbid inlining the engine');
  if (!/\/add-dir/.test(src)) problems.push('no /add-dir fallback for a session without a scratchpad');
  // 1.3.1 review: a clean record must never replace a same-day findings report
  if (!/AUDIT-<YYYY-MM-DD>-clean\.md/.test(src)) problems.push('clean record is not written to its own -clean.md name');
  if (!/Never overwrite an existing report/.test(src)) problems.push('does not forbid overwriting an existing report');
  const cpAt = src.search(cp), callAt = src.search(/^\s*-\s*`scriptPath`/m);
  if (cpAt >= 0 && callAt >= 0 && cpAt > callAt) problems.push('the copy step comes after the Workflow call');
  return problems;
}

const skill = fs.readFileSync(SKILL, 'utf8');
console.log('audit-run SKILL.md (live)');
{
  const p = checkSkill(skill);
  ok(p.length === 0, `Workflow step runs a scratchpad copy${p.length ? `: ${p.join('; ')}` : ''}`);
}

console.log('teeth');
{
  const direct = skill.replace(/^(\s*-\s*`scriptPath`:).*$/m, '$1 `${CLAUDE_PLUGIN_ROOT}/workflows/audit.workflow.js`');
  ok(direct !== skill && checkSkill(direct).includes('scriptPath points into the plugin cache'), 'the 1.3.0 direct scriptPath → reported');

  const noCopy = skill.replace(/^cp .*$/m, '');
  ok(noCopy !== skill && checkSkill(noCopy).includes('no cp of the engine into the scratchpad'), 'copy step removed → reported');

  const inlineOk = skill.replace(/never pass the engine inline/gi, 'you may pass the engine inline');
  ok(inlineOk !== skill && checkSkill(inlineOk).includes('does not forbid inlining the engine'), 'inline ban removed → reported');

  const samePath = skill.replace(/AUDIT-<YYYY-MM-DD>-clean\.md/g, 'AUDIT-<YYYY-MM-DD>.md');
  ok(samePath !== skill && checkSkill(samePath).includes('clean record is not written to its own -clean.md name'), 'clean record at the findings-report path → reported');

  const overwrite = skill.replace(/Never overwrite an existing report/g, 'Overwrite any existing report');
  ok(overwrite !== skill && checkSkill(overwrite).includes('does not forbid overwriting an existing report'), 'overwrite allowed → reported');

  ok(checkSkill('# empty\n').includes('want exactly 1 scriptPath bullet, found 0'), 'empty skill → reported, never a silent pass');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
