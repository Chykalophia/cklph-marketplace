// AC-072: dogfood the contract mode on cklph-audit's own default-group docs (SPEC-v4-ambiguity.md §12).
//
//   node plugins/cklph-audit/tests/dogfood-contract.test.mjs     (also runs under `node --test`)
//
// Runs the ONE fail-closed check (tests/lib/contract-check.mjs, §3.7): a run that scanned nothing,
// found no schema enums, or scanned fewer than 40 docs fails, so an empty result never reads as clean.
// SPEC*.md and docs/** sit outside the default prose groups (design records that quote bad values on
// purpose), so they are not checked. Teeth: the same check over the AC-002 pre-fix sandbox (the
// verbatim PR #22 row) must fail with exactly one offender at line 6. Exits non-zero on any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runContractCheck } from './lib/contract-check.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPTS = { minDocs: 40, engineGlobs: true, excludes: ['**/fixtures/**'] };
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

console.log('dogfood: contract mode over plugins/cklph-audit default-group docs');
{
  // root resolved from this file, so the check does not depend on the caller's cwd
  const r = runContractCheck({ root: PLUGIN, ...OPTS });
  ok(r.ok, `contract-check OK: enums=${r.summary.enums} docs=${r.summary.docs} emitted=${r.summary.emitted}`);
  if (!r.ok) {
    for (const p of r.problems) console.log(`    problem: ${p}`);
    for (const o of r.offenders) console.log(`    offender: ${o.file}:${o.line} field=${o.field} value=${o.value} via=${o.via} signal=${JSON.stringify(o.signal ?? '')}`);
  }
}

console.log('teeth: AC-002 pre-fix sandbox (PR #22 row)');
{
  // The row below is VERBATIM from `git show 2602aff:plugins/cklph-audit/skills/agent-config-lens/checklist.md`
  // line 13 (CI checks out depth 1, so the test embeds it instead of calling git).
  const PRE_ROW = '| `agentcfg:mcp-review` | Local script, unknown binary, editable install, direct URL, VCS ref, shell wrapper, or an invocation you can\'t parse confidently. Record it; never guess. | info, `needs-owner-input` |';
  const files = {
    '.claude-plugin/plugin.json': '{ "name": "x" }\n',
    'workflows/engine.js': [
      'const REVIEW_SCHEMA = {',
      "  severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },",
      "  confidence: { type: 'string', enum: ['confirmed', 'likely', 'needs-owner-input'] },",
      '}', ''].join('\n'),
    'skills/x/checklist.md': [
      '## 1. MCP configs',
      '| Rule id | What | Default |',
      '|---|---|---|',
      '| `agentcfg:mcp-unpinned` | Package selector can resolve to different code later: bare name, `@latest`. | medium; high if the server gets credentials or write/shell capability |',
      '| `agentcfg:mcp-range` | Selector permits a range (`^1.2.0`, `~1.2`, `>=1.2,<2`, `==1.*`). | low |',
      PRE_ROW,
      '| `agentcfg:mcp-remote` | Remote server (`url`, `type: http`/`sse`). | medium |',
      '| `agentcfg:mcp-shell` | Server command is a shell (`bash -c`, `sh -c`). | high |',
      '| `agentcfg:mcp-secret` | Literal credential in `env`, `headers`, or `args`. | high (critical if a live-looking key) |',
      ''].join('\n'),
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cklph-dogfood-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel), body);
    }
    // same options as the dogfood run, except a one-doc sandbox cannot meet minDocs 40
    const r = runContractCheck({ root: tmp, ...OPTS, minDocs: 1 });
    ok(!r.ok, 'pre-fix sandbox → !ok');
    ok(r.offenders.length === 1, `exactly one offender (${r.offenders.length}: ${r.problems.join(' | ')})`);
    const o = r.offenders[0] ?? {};
    ok(o.file === 'skills/x/checklist.md' && o.line === 6 && o.field === 'severity' && o.value === 'info',
      `offender is skills/x/checklist.md:6 (got ${o.file}:${o.line} field=${o.field})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
