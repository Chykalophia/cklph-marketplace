// The scheduler contract for run_checks.mjs: 0 clean, 1 regressions found, 2 engine error.
// Run: npm test   (node --test tests/*.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runChecks = fileURLToPath(new URL('../skills/monitor/scripts/run_checks.mjs', import.meta.url));

test('the exit code is never the regression count', async () => {
  const { exitCodeFor, EXIT } = await import('../skills/monitor/scripts/lib/evaluate.mjs');
  assert.equal(typeof exitCodeFor, 'function', 'exitCodeFor is not exported');
  assert.equal(exitCodeFor(0), EXIT.CLEAN);
  assert.equal(exitCodeFor(1), EXIT.REGRESSIONS);
  assert.equal(exitCodeFor(7), EXIT.REGRESSIONS);
  assert.equal(exitCodeFor(256), EXIT.REGRESSIONS); // 256 & 0xff would read as 0, "all good"
  assert.deepEqual(EXIT, { CLEAN: 0, REGRESSIONS: 1, ERROR: 2 });
});

test('an engine error exits 2, not 1 (which means "regressions found")', () => {
  const r = spawnSync(process.execPath, [runChecks, '--config', '/nonexistent/config.json', '--baseline', '/nonexistent'], { encoding: 'utf8' });
  assert.equal(r.status, 2, `stderr: ${r.stderr}`);
  assert.match(r.stderr, /error/i);
});

test('a dependency that fails to load exits 2, not 1', () => {
  // A copy of the scripts with no node_modules above it: playwright and pngjs cannot resolve.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-noddeps-'));
  try {
    fs.cpSync(path.dirname(runChecks), tmp, { recursive: true });
    const r = spawnSync(process.execPath, [path.join(tmp, 'run_checks.mjs'), '--config', '/nonexistent/config.json'], { encoding: 'utf8' });
    assert.match(r.stderr, /playwright|pngjs|pixelmatch/, `expected a module-load failure, got: ${r.stderr}`);
    assert.equal(r.status, 2, `stderr: ${r.stderr}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
