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

// Review findings, each a shape an earlier version got wrong.
test('a CRLF file with a multi-line catch, or a control byte, still yields parseable JSON', () => {
  const root = tree({
    'src/a.ts': 'try { a() } catch (e) {\r\n  console.error(e);\r\n  return [];\r\n}\r\n',
    'src/b.ts': 'p.catch(() => null) // \u0001\n',
  });
  assert.deepEqual(kinds(run(root)).sort(), ['catch-default', 'promise-default']);
});

test('a catch that answers 200 with an empty list is a site, not a visible failure', () => {
  const root = tree({
    'app/route.ts': [
      'export async function GET() {',
      '  try { return NextResponse.json(await list()) } catch (e) {',
      '    return NextResponse.json({ items: [] });',
      '  }',
      '}',
      'app.get("/x", async (req, res) => { try { res.json(await list()) } catch (e) { res.status(200).json([]) } })',
    ].join('\n'),
  });
  assert.equal(run(root).out.length, 2);
  const visible = tree({ 'app/r.ts': 'try { a() } catch (e) { return NextResponse.json({ error: "x" }, { status: 502 }) }\n' });
  assert.deepEqual(run(visible).out, [], 'a 5xx status stays visible');
});

test('multi-line block comments are code-free, so a JSDoc example is not a site', () => {
  const root = tree({ 'src/a.ts': '/**\n * try { x } catch (e) { return [] }\n */\nexport const x = 1;\n' });
  assert.deepEqual(run(root).out, []);
});

test('promise fallbacks: a multi-line .catch that returns a default, .catch(console.error), and Allman catch', () => {
  const root = tree({
    'src/a.ts': 'p.catch((e) => {\n  log.error(e);\n  return [];\n});\nq.catch(console.error);\n',
    'src/b.ts': 'try { a() } catch (e)\n{\n  return null;\n}\n',
    'src/c.ts': 'p.catch((e) => {\n  throw new Wrapped(e);\n});\n',
  });
  assert.deepEqual(run(root).out.map((f) => `${f.file}:${f.kind}`).sort(), ['src/a.ts:promise-default', 'src/a.ts:promise-default', 'src/b.ts:catch-default']);
});

test('a brace inside a string does not move the catch body', () => {
  const root = tree({ 'src/a.ts': 'try { a() } catch (e) {\n  log.error("bad {");\n  return [];\n}\n' + 'x();\n'.repeat(5) + 'throw new Error("unrelated");\n' });
  assert.deepEqual(kinds(run(root)), ['catch-default']);
});

test('Python one-line excepts are judged by their own body', () => {
  const root = tree({ 'svc/a.py': 'try:\n    g()\nexcept ValueError: raise\ntry:\n    g()\nexcept ValueError: return None\n' });
  assert.deepEqual(kinds(run(root)), ['catch-default']);
});

test('globs: **/ matches no folder, the extension filter stays on, and a trailing slash on the root is fine', () => {
  const root = tree({ 'c.ts': 'p.catch(() => null)\n', 'src/d.ts': 'p.catch(() => null)\n', 'notes.md': 'p.catch(() => null)\n', 'styles.css': 'p.catch(() => null)\n' });
  assert.deepEqual(run(root, ['**/*.ts']).out.map((f) => f.file).sort(), ['c.ts', 'src/d.ts']);
  assert.deepEqual(run(root, ['*']).out.map((f) => f.file).sort(), ['c.ts', 'src/d.ts'], 'no .md or .css read as code');
  assert.deepEqual(run(root + '/').out.map((f) => f.file).sort(), ['c.ts', 'src/d.ts']);
});

test('production folders named test or scripts are read; minified files and public/ are not', () => {
  const root = tree({
    'app/api/test/route.ts': 'p.catch(() => null)\n',
    'src/scripts/run.ts': 'p.catch(() => null)\n',
    'scripts/once.mjs': 'p.catch(() => null)\n',
    'src/vendor.min.js': 'p.catch(() => null)\n',
    'public/sw.js': 'p.catch(() => null)\n',
  });
  assert.deepEqual(run(root).out.map((f) => f.file).sort(), ['app/api/test/route.ts', 'src/scripts/run.ts']);
});

test('a long minified-style line is read in linear time', () => {
  const line = 'a();'.repeat(150000) + ' p.catch(() => null)\n';
  const root = tree({ 'src/big.ts': line });
  const t0 = Date.now();
  assert.deepEqual(kinds(run(root)), ['promise-default']);
  assert.ok(Date.now() - t0 < 8000, `600 KB line took ${Date.now() - t0} ms`);
});

