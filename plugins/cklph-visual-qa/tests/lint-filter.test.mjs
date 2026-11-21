// Tests for scripts/lint-filter.mjs.
//
//   node --test plugins/cklph-visual-qa/tests/*.test.mjs
//
// Fixtures are trimmed real output from impeccable 4.8.2 and Hallmark 04977e1 on chykalophia.com.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExceptions, normalize, applyExceptions } from '../scripts/lint-filter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'lint-filter.mjs');
const read = (name) => fs.readFileSync(path.join(HERE, 'fixtures', name), 'utf8');
const IMPECCABLE = read('impeccable.json');
const HALLMARK = read('hallmark.json');
const EXCEPTIONS = read('design-exceptions.json');

const run = (args, input, cwd = HERE) => spawnSync(process.execPath, [SCRIPT, ...args], { input, cwd, encoding: 'utf8' });

test('parseExceptions accepts the example file', () => {
  const list = parseExceptions(EXCEPTIONS);
  assert.ok(list.length >= 3);
  assert.ok(list.every((e) => e.reason.length > 0));
});

test('parseExceptions refuses an entry without a reason', () => {
  const text = JSON.stringify({ exceptions: [{ tool: 'impeccable', rule: 'kicker-above-heading' }] });
  assert.throws(() => parseExceptions(text), /reason is required/);
});

test('parseExceptions refuses an unknown tool and a missing array', () => {
  assert.throws(() => parseExceptions(JSON.stringify({ exceptions: [{ tool: 'axe', rule: 'x', reason: 'y' }] })), /tool must be/);
  assert.throws(() => parseExceptions('{}'), /"exceptions" array/);
});

test('normalize marks impeccable quality as blocking and slop as taste', () => {
  const f = normalize('impeccable', JSON.parse(IMPECCABLE));
  assert.ok(f.some((x) => x.rule === 'tight-leading' && x.blocking));
  assert.ok(f.some((x) => x.rule === 'kicker-above-heading' && !x.blocking));
});

test('normalize marks only Hallmark FAIL as blocking', () => {
  const f = normalize('hallmark', JSON.parse(HALLMARK));
  assert.deepEqual([...new Set(f.filter((x) => x.blocking).map((x) => x.level))], ['FAIL']);
  assert.ok(f.some((x) => x.level === 'REFLEX' && !x.blocking));
});

test('normalize rejects the wrong shape for the tool', () => {
  assert.throws(() => normalize('impeccable', JSON.parse(HALLMARK)), /JSON array/);
  assert.throws(() => normalize('hallmark', JSON.parse(IMPECCABLE)), /findings array/);
});

test('applyExceptions excuses by tool and rule, and match narrows it', () => {
  const findings = normalize('hallmark', JSON.parse(HALLMARK));
  const all = applyExceptions(findings, [{ tool: 'hallmark', rule: '49b', reason: 'footer labels' }]);
  assert.ok(all.excused.length >= 2);
  assert.ok(all.kept.every((f) => f.rule !== '49b'));
  const narrow = applyExceptions(findings, [{ tool: 'hallmark', rule: '49b', reason: 'one link', match: 'AI for manufacturers' }]);
  assert.equal(narrow.excused.length, 1);
  const otherTool = applyExceptions(findings, [{ tool: 'impeccable', rule: '49b', reason: 'wrong tool' }]);
  assert.equal(otherTool.excused.length, 0);
});

test('CLI exits 2 while a blocking finding remains, 0 when only taste is left', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-filter-'));
  const ex = path.join(dir, 'ex.json');
  fs.writeFileSync(ex, EXCEPTIONS);
  assert.equal(run(['--tool', 'impeccable', '--exceptions', ex], IMPECCABLE).status, 2);
  const slopOnly = JSON.stringify(JSON.parse(IMPECCABLE).filter((f) => f.category === 'slop'));
  const r = run(['--tool', 'impeccable', '--exceptions', ex], slopOnly);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /0 to check, 0 taste, \d+ excused\./);
});

test('CLI reads .cklph/design-exceptions.json from the current directory by default', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-filter-'));
  fs.mkdirSync(path.join(dir, '.cklph'));
  fs.writeFileSync(path.join(dir, '.cklph', 'design-exceptions.json'), EXCEPTIONS);
  const r = run(['--tool', 'impeccable', '--json'], IMPECCABLE, dir);
  const out = JSON.parse(r.stdout);
  assert.ok(out.excused.some((e) => e.finding.rule === 'kicker-above-heading'));
});

test('CLI exits 1 on bad input or a missing tool', () => {
  assert.equal(run(['--tool', 'hallmark'], 'not json').status, 1);
  assert.equal(run([], IMPECCABLE).status, 1);
});
