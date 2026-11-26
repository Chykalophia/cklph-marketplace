// Tests for tools/fallbacks.sh, the fallback lens's recall tool.
//
//   node --test plugins/cklph-audit/tests/fallbacks.test.mjs
//
// Asserts outcomes: which sites come back, with which kind, on planted code and on visible-failure
// look-alikes taken from a real Next.js app. Each near miss is a shape an earlier version flagged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(PLUGIN, 'tools', 'fallbacks.sh');
const run = (root, globs = [], env = {}) => {
  const r = spawnSync('bash', [TOOL, root, ...globs], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: r.status, stderr: r.stderr, out: JSON.parse(r.stdout) };
};
const tree = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fallbacks-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
};
const kinds = (r) => r.out.map((f) => f.kind);

test('the should-flag fixture yields one site of each kind, in order', () => {
  const r = run(path.join(PLUGIN, 'fixtures', 'fallback', 'should-flag'));
  assert.equal(r.status, 0);
  assert.deepEqual(kinds(r), ['catch-default', 'catch-log-continue', 'swallowed', 'promise-default', 'default-over-failure']);
});

test('the should-not-flag fixture yields nothing', () => {
  assert.deepEqual(run(path.join(PLUGIN, 'fixtures', 'fallback', 'should-not-flag')).out, []);
});

test('a visible failure is not a site: rethrow, failure(), HTTP error, setError, new Error', () => {
  const root = tree({
    'src/a.ts': [
      'try { a() } catch (e) { log.error(e); throw e }',
      'try { a() } catch (e) { return failure("X", "y") }',
      'try { a() } catch (e) { log.error({ e }, "x"); return NextResponse.json({ error: "x" }, { status: 500 }) }',
      'try { a() } catch { setError("Could not save"); return; }',
      'p.catch((err) => { throw new PlanError(err) })',
    ].join('\n'),
  });
  assert.deepEqual(run(root).out, []);
});

test('logging is not visibility: a catch that only logs is still a site', () => {
  const root = tree({ 'src/a.ts': 'try { a() } catch (err) {\n  logger.error({ err }, "failed");\n}\n' });
  assert.deepEqual(kinds(run(root)), ['catch-log-continue']);
});

test('a default inside an argument, a body parse and a plain optional default are not sites', () => {
  const root = tree({
    'src/a.ts': [
      'const state = await list(rawFilters ?? {});',
      'const mode = await resolveStripeMode(user?.id ?? null);',
      'const body = await res.json().catch(() => ({}));',
      'const size = settings.pageSize ?? 20;',
    ].join('\n'),
  });
  assert.deepEqual(run(root).out, []);
  const hit = tree({ 'src/b.ts': 'const n = (await cache.get(key)) ?? 0;\n' });
  assert.deepEqual(kinds(run(hit)), ['default-over-failure']);
});

test('a comment never hides or creates a site', () => {
  const root = tree({ 'src/a.ts': 'try { a() } catch (e) {\n  // deliberately ignored\n}\n// } catch (e) { return [] }\n' });
  assert.deepEqual(kinds(run(root)), ['swallowed']);
});

test('Python: except pass and except return None are sites, except raise is not', () => {
  const root = tree({
    'svc/a.py': 'def f():\n    try:\n        g()\n    except Exception:\n        pass\n\ndef h():\n    try:\n        g()\n    except ValueError:\n        return None\n\ndef k():\n    try:\n        g()\n    except ValueError:\n        log.error("x")\n        raise\n',
  });
  assert.deepEqual(kinds(run(root)), ['swallowed', 'catch-default']);
});

test('tests and scripts are skipped unless a glob names them', () => {
  const files = { 'src/a.test.ts': 'p.catch(() => null)\n', 'tests/b.ts': 'p.catch(() => null)\n', 'scripts/c.mjs': 'p.catch(() => null)\n', 'src/d.ts': 'p.catch(() => null)\n' };
  const root = tree(files);
  assert.deepEqual(run(root).out.map((f) => f.file), ['src/d.ts']);
  assert.equal(run(root, ['tests/*']).out.length, 1);
});

test('the cap is loud, and a missing root is an empty list', () => {
  const root = tree({ 'src/a.ts': 'p.catch(() => null)\nq.catch(() => null)\nr.catch(() => null)\n' });
  const r = run(root, [], { FALLBACKS_MAX: '2' });
  assert.equal(r.out.length, 2);
  assert.match(r.stderr, /3 site\(s\), truncated to 2/);
  const missing = run(path.join(os.tmpdir(), 'no-such-fallbacks-root'));
  assert.equal(missing.status, 0);
  assert.deepEqual(missing.out, []);
});
