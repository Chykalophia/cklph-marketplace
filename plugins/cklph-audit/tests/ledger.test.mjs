// The tested-clean ledger: tools/ledger.mjs against a real throwaway git repo.
//
//   node plugins/cklph-audit/tests/ledger.test.mjs     (also runs under `node --test`)
//
// Asserts outcomes: an unchanged clean file is reported covered and handed to the engine by `plan`,
// an edited file is not, a file with a surviving finding is cleared, a failed tool records nothing,
// and rotation keeps both files under the byte cap while the newest entries stay active.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyRun, rotate, serialize, status } from '../tools/ledger.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_TOOL = path.join(PLUGIN, 'tools', 'ledger.mjs');
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', GIT_CONFIG_NOSYSTEM: '1', HOME: os.tmpdir() };
const git = (repo, ...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: GIT_ENV });
const tool = (...a) => spawnSync(process.execPath, [LEDGER_TOOL, ...a], { encoding: 'utf8', env: GIT_ENV });

function repo() {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cklph-ledger-'));
  git(r, 'init', '-q');
  fs.mkdirSync(path.join(r, 'src'));
  for (const f of ['a.ts', 'b.ts', 'c.ts']) fs.writeFileSync(path.join(r, 'src', f), `export const ${f[0]} = 1\n`);
  git(r, 'add', '.');
  git(r, 'commit', '-qm', 'init');
  return r;
}
const writeResult = (r, ledger) => { const p = path.join(r, '..', `${path.basename(r)}-result.json`); fs.writeFileSync(p, JSON.stringify({ report: null, ledger })); return p; };
const json = s => JSON.parse(s.stdout);

console.log('record, status, plan');
{
  const r = repo();
  const res1 = writeResult(r, {
    tested: [
      { unit: 'core', lens: 'security', toolFailed: false, clean: ['src/a.ts', './src/b.ts'] },
      { unit: 'core', lens: 'web-auth', toolFailed: true, clean: [] },
    ],
    dirty: [{ lens: 'security', file: 'src/c.ts' }],
  });
  const rec = tool('record', '--repo', r, '--result', res1);
  ok(rec.status === 0 && fs.existsSync(path.join(r, '.audit-ledger.json')), `record writes .audit-ledger.json (${rec.stdout.trim() || rec.stderr.trim()})`);
  const led = JSON.parse(fs.readFileSync(path.join(r, '.audit-ledger.json'), 'utf8'));
  const head = git(r, 'rev-parse', 'HEAD').stdout.trim();
  ok(led.entries.length === 2 && led.entries.every(e => e.commit === head && /^[0-9a-f]{40}$/.test(e.blob) && e.date), 'two entries, each with blob, commit sha and date');

  const s1 = json(tool('status', '--repo', r, '--lenses', 'security', '--json')).security;
  ok(JSON.stringify(s1.covered) === '["src/a.ts","src/b.ts"]', `unchanged clean files are covered (${JSON.stringify(s1.covered)})`);
  ok(s1.untested.includes('src/c.ts') && !s1.covered.includes('src/c.ts'), 'a file with a surviving finding is untested, not covered');

  fs.appendFileSync(path.join(r, 'src', 'b.ts'), 'export const evil = 2\n');
  const s2 = json(tool('status', '--repo', r, '--lenses', 'security', '--json')).security;
  ok(JSON.stringify(s2.covered) === '["src/a.ts"]' && JSON.stringify(s2.changed) === '["src/b.ts"]', `an edited file (even uncommitted) is changed, not covered (${JSON.stringify(s2)})`);
  const p = json(tool('plan', '--repo', r, '--lenses', 'security,web-auth'));
  ok(JSON.stringify(p) === '{"security":["src/a.ts"],"web-auth":[]}', `plan hands the engine only covered files, and nothing for a failed-tool lens (${JSON.stringify(p)})`);

  const res2 = writeResult(r, { tested: [], dirty: [{ lens: 'security', file: './src/a.ts' }] });
  tool('record', '--repo', r, '--result', res2);
  const s3 = json(tool('status', '--repo', r, '--lenses', 'security', '--json')).security;
  ok(!s3.covered.includes('src/a.ts'), 'a later finding on a covered file clears it');
  const human = tool('status', '--repo', r);
  ok(/security: 0 covered, 1 changed since clean: src\/b\.ts/.test(human.stdout), `human status names the changed file (${human.stdout.trim()})`);
  fs.rmSync(r, { recursive: true, force: true });
}

console.log('pure functions');
{
  const blobOf = f => `blob-${f}`;
  const l1 = applyRun({ entries: [] }, { tested: [{ unit: 'u', lens: 'security', clean: ['x.ts'] }] }, { commit: 'c1', date: '2026-01-01', blobOf });
  const s = status(l1, [{ file: 'x.ts', blob: 'blob-x.ts' }, { file: 'y.ts', blob: 'blob-y.ts' }], ['security']).security;
  ok(s.covered.join() === 'x.ts' && s.untested.join() === 'y.ts', 'covered vs untested');
  const s2 = status(l1, [{ file: 'x.ts', blob: 'other' }], ['security']).security;
  ok(s2.changed.join() === 'x.ts' && s2.covered.length === 0, 'teeth: same file, different blob is never covered');
  const l2 = applyRun(l1, { tested: [{ lens: 'security', clean: ['gone.ts'] }] }, { commit: 'c2', date: '2026-01-02', blobOf: () => null });
  ok(l2.entries.length === 1, 'a clean file that no longer exists is not recorded');
}

console.log('rotation');
{
  const big = n => ({ version: 1, entries: Array.from({ length: n }, (_, i) => ({ lens: 'security', file: `src/f${String(i).padStart(4, '0')}.ts`, unit: 'u', blob: 'b'.repeat(40), commit: 'c'.repeat(40), date: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() })) });
  const cap = 4096;
  const full = big(200);
  const before = Buffer.byteLength(serialize(full));
  const { active, rotated } = rotate(full, null, cap);
  const a = Buffer.byteLength(serialize(active));
  const b = Buffer.byteLength(serialize(rotated));
  ok(before > cap * 4, `teeth: the unrotated ledger is ${before} bytes, far over the ${cap} cap`);
  ok(a <= cap && b <= cap, `both files are under the cap after rotation (${a} and ${b} bytes)`);
  ok(active.entries.length > 0 && active.entries.every(e => e.file >= `src/f${String(200 - active.entries.length).padStart(4, '0')}`), `the newest entries stay active (${active.entries.length}, oldest kept ${active.entries[0]?.file})`);
  const rotKeys = new Set(rotated.entries.map(e => e.file));
  ok(!active.entries.some(e => rotKeys.has(e.file)), 'no entry is in both files');

  // end to end: repeated records with a tiny cap never grow the files past it
  const r = repo();
  for (let i = 0; i < 30; i++) fs.writeFileSync(path.join(r, 'src', `g${i}.ts`), `export const g${i} = ${i}\n`);
  git(r, 'add', '.');
  git(r, 'commit', '-qm', 'more');
  for (let i = 0; i < 30; i++) {
    const res = writeResult(r, { tested: [{ unit: 'u', lens: 'security', clean: [`src/g${i}.ts`] }], dirty: [] });
    tool('record', '--repo', r, '--result', res, '--max-bytes', '2048');
  }
  const sa = fs.statSync(path.join(r, '.audit-ledger.json')).size;
  const sb = fs.statSync(path.join(r, '.audit-ledger.1.json')).size;
  const last = JSON.parse(fs.readFileSync(path.join(r, '.audit-ledger.json'), 'utf8')).entries.map(e => e.file);
  ok(sa <= 2048 && sb <= 2048, `after 30 records under a 2048-byte cap: ${sa} and ${sb} bytes`);
  ok(last.includes('src/g29.ts'), 'the most recent record is in the active file');
  fs.rmSync(r, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
