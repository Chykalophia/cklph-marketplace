// self_test.mjs — end-to-end proof of the engine against the seeded fixtures, in a temp dir.
// Never touches the tracked fixtures. Needs `npm install` + `npx playwright install chromium`.
// Usage: node skills/monitor/scripts/self_test.mjs   (or: npm run self-test)
// 1) baseline good.html, re-check it          -> exit 0, PASS (masked #ticker causes no false alarm)
// 2) swap in bad.html, re-check it            -> exit 1, 7 confirmed regressions
// 3) re-check from another cwd, after moving the baseline dir -> visual check still runs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'regression-watch-selftest-'));
const site = path.join(tmp, 'site');
fs.mkdirSync(site);
fs.copyFileSync(path.join(root, 'fixtures/good.html'), path.join(site, 'page.html'));

const demo = JSON.parse(fs.readFileSync(path.join(root, 'config.fixture-demo.json'), 'utf8'));
const config = path.join(tmp, 'config.json');
fs.writeFileSync(config, JSON.stringify({ ...demo, baseUrl: site + path.sep }, null, 2));

const run = (script, args, cwd = root) => {
  const r = spawnSync(process.execPath, [path.join(here, script), ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const failures = [];
const expect = (ok, msg, out) => { process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${msg}\n`); if (!ok) failures.push(msg + '\n' + out); };

try {
  const cap = run('capture.mjs', ['--config', config, '--out', 'baselines/selftest'], tmp); // relative --out, cwd = tmp
  expect(cap.code === 0, 'capture writes a baseline', cap.out);
  let shotPath = null;
  try {
    shotPath = JSON.parse(fs.readFileSync(path.join(tmp, 'baselines/selftest/baseline.json'), 'utf8')).pages['page.html'].screenshotPath;
  } catch (e) {
    expect(false, 'baseline.json is readable', String(e));
  }
  expect(shotPath && !path.isAbsolute(shotPath) && shotPath.startsWith('screens'), `screenshot path is baseline-relative (${shotPath})`, '');
  if (failures.length) throw new Error('no usable baseline; skipping the re-check steps');

  const baseDir = path.join(tmp, 'baselines/selftest');
  const good = run('run_checks.mjs', ['--config', config, '--baseline', baseDir]);
  expect(good.code === 0 && /— PASS/.test(good.out), `good page: exit 0 and PASS (got exit ${good.code})`, good.out);
  expect(/\[VR1/.test(good.out) === false && !/visual check skipped/.test(good.out), 'good page: no visual finding', good.out);

  fs.copyFileSync(path.join(root, 'fixtures/bad.html'), path.join(site, 'page.html'));
  const bad = run('run_checks.mjs', ['--config', config, '--baseline', baseDir]);
  expect(bad.code === 1, `bad page: exit 1 (got ${bad.code})`, bad.out);
  expect(/7 REGRESSION\(S\)/.test(bad.out), 'bad page: 7 confirmed regressions', bad.out);

  const moved = path.join(tmp, 'moved-baseline');
  fs.renameSync(baseDir, moved);
  const mv = run('run_checks.mjs', ['--config', config, '--baseline', moved], os.tmpdir());
  expect(/\[VR1 · High\]/.test(mv.out) && !/visual check skipped/.test(mv.out), 'moved baseline, other cwd: VR1 still evaluated', mv.out);

  const extra = path.join(tmp, 'config-extra.json');
  fs.writeFileSync(extra, JSON.stringify({ ...demo, baseUrl: site + path.sep, urls: ['page.html', 'not-in-baseline.html'] }, null, 2));
  const ex = run('run_checks.mjs', ['--config', extra, '--baseline', moved]);
  expect(/\[BASELINE\].*not-in-baseline\.html/.test(ex.out), 'a URL missing from the baseline is reported', ex.out);
} catch (e) {
  failures.push(`self-test stopped: ${e && e.message ? e.message : e}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (failures.length) {
  process.stderr.write('\n' + failures.join('\n----\n') + '\n');
  process.exit(1);
}
process.stdout.write('\nself-test passed\n');
