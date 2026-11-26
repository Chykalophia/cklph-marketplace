// The never-report list in skills/trust-precedents must hand every class to a rule that exists.
//
//   node plugins/cklph-audit/tests/trust-precedents.test.mjs     (also runs under `node --test`)
//
// A "report it when" exception that names a rule id no lens defines would silently drop the real
// version of the class: the verifier refutes the finding and the owning rule is never checked. So
// every `<lens>:<rule>` id in the trust-precedents tables must be a checklist row in that lens's
// SKILL.md, and the lens family the list binds must be the same set the verifier treats as
// security-family. Teeth: an unknown rule id and a dropped lens are both reported.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(PLUGIN, rel), 'utf8');
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

const LENSES = fs.readdirSync(path.join(PLUGIN, 'skills')).filter(d => d.endsWith('-lens')).map(d => d.slice(0, -5));
const definedRules = new Set(LENSES.flatMap(l => [...read(`skills/${l}-lens/SKILL.md`).matchAll(/^(?:\| |- \*\*)`([a-z-]+:[a-z0-9-]+)`(?: \||\*\*)/gm)].map(m => m[1])));

function ruleProblems(text) {
  const ids = [...text.matchAll(/`([a-z-]+):([a-z0-9-]+)`/g)].map(m => `${m[1]}:${m[2]}`).filter(id => LENSES.includes(id.split(':')[0]));
  return { ids, missing: ids.filter(id => !definedRules.has(id)) };
}

// the first "security, llm, ..." run in a doc, up to the closing parenthesis or semicolon
const lensList = text => {
  const m = /\bsecurity, llm,[^;)]*/.exec(text);
  return new Set(m ? m[0].split(',').map(x => x.trim().replace(/^or\s+/, '')).filter(Boolean) : []);
};

console.log('never-report list');
{
  const tp = read('skills/trust-precedents/SKILL.md');
  const section = tp.slice(tp.indexOf('## Never report on its own'), tp.indexOf('## How to use this'));
  ok(section.length > 200, 'the section exists');
  const { ids, missing } = ruleProblems(section);
  ok(ids.length >= 6, `${ids.length} rule ids named as owners`);
  ok(missing.length === 0, `every owner rule is a lens checklist row${missing.length ? ` (unknown: ${missing.join(', ')})` : ''}`);
  const all = ruleProblems(tp);
  ok(all.missing.length === 0, `every rule id anywhere in trust-precedents exists${all.missing.length ? ` (unknown: ${all.missing.join(', ')})` : ''}`);

  const fam = lensList(section);
  const verifierFam = lensList(read('agents/audit-verifier.md'));
  const diff = [...fam].filter(x => !verifierFam.has(x)).concat([...verifierFam].filter(x => !fam.has(x)));
  ok(fam.size >= 10 && diff.length === 0, `the list binds the same lens family the verifier uses (${fam.size} lenses${diff.length ? `; differ: ${diff.join(', ')}` : ''})`);
}

console.log('teeth');
{
  const { missing } = ruleProblems('| x | `web-auth:cookie-scope` and `availability:not-a-rule` |');
  ok(missing.length === 1 && missing[0] === 'availability:not-a-rule', 'an unknown owner rule id is reported');
  const a = lensList('(security, llm, data-isolation, web-auth)');
  const b = lensList('(security, llm, web-auth)');
  ok([...a].some(x => !b.has(x)), 'a lens dropped from one family list is detected');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
