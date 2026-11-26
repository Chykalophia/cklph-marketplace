// Tests for scripts/census.mjs.
//
//   node --test plugins/cklph-figma/tests/*.test.mjs
//
// Asserts outcomes: which painted values come back as findings, their shares, and the CLI's
// exit codes. The fixture's colors were picked by measured Delta E from the DESIGN.md navy
// (#09182f): #0a192f 0.97 (same), #0c1f3a 4.2 (near), #14294a 10.2 (far).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, deltaE, familyKey, toPx, tokensFrom } from '../scripts/census.mjs';
import { parseColor, parseDesignMd } from '../scripts/contrast.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'census.mjs');
const DESIGN = path.join(HERE, 'fixtures', 'DESIGN.md');
const CENSUS = path.join(HERE, 'fixtures', 'census.json');
const tokens = () => tokensFrom(parseDesignMd(fs.readFileSync(DESIGN, 'utf8')));
const census = () => JSON.parse(fs.readFileSync(CENSUS, 'utf8'));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const find = (r, kind, value) => r.findings.find((f) => f.kind === kind && f.value === value);

test('deltaE is 0 for the same color and about 100 for black on white', () => {
  assert.equal(deltaE(parseColor('#09182f'), parseColor('#09182f')), 0);
  assert.ok(Math.abs(deltaE(parseColor('#000000'), parseColor('#ffffff')) - 100) < 0.5);
});

test('familyKey compares the first family and ignores a variable-cut suffix', () => {
  assert.equal(familyKey('"Inter Variable", system-ui, sans-serif'), 'inter');
  assert.equal(familyKey('Public Sans VF'), 'public sans');
  assert.equal(familyKey('Inter Tight'), 'inter tight');
});

test('toPx reads px, rem and bare numbers', () => {
  assert.equal(toPx('14px'), 14);
  assert.equal(toPx('1.5rem'), 24);
  assert.equal(toPx('8'), 8);
  assert.equal(toPx('clamp(1rem, 2vw, 2rem)'), null);
});

test('a color within 2 Delta E of a token is the token, not a finding', () => {
  const r = analyze(census(), tokens());
  assert.equal(find(r, 'off-token color', '#09182f'), undefined);
  assert.equal(find(r, 'off-token color', '#0a192f'), undefined);
});

test('a color within --near of a token is reported as near it, with its share', () => {
  const f = find(analyze(census(), tokens()), 'off-token color', '#0c1f3a');
  assert.ok(f, 'the hand-typed navy should be a finding');
  assert.match(f.near, /^navy \(Delta E 4\.2\)$/);
  assert.equal(f.share, 15);
  assert.equal(f.role, 'text');
});

test('off-token colors close to each other are reported once, as a cluster', () => {
  const f = find(analyze(census(), tokens()), 'near-duplicates', '#c0392b, #c2412e');
  assert.ok(f);
  assert.equal(f.share, 14.6);
});

test('forty near-identical greys come back as one cluster, not hundreds of pairs', () => {
  const text = {};
  for (let v = 100; v < 140; v++) text[`rgb(${v}, ${v}, ${v})`] = 10;
  const r = analyze({ tally: { text } }, tokens());
  const dups = r.findings.filter((f) => f.kind === 'near-duplicates');
  assert.equal(dups.length, 1);
  assert.equal(dups[0].share, 100);
});

test('a cluster only joins colors that pass the share cut', () => {
  const text = { 'rgb(9, 24, 47)': 9940, 'rgb(150, 150, 150)': 30, 'rgb(151, 151, 151)': 30 };
  const r = analyze({ tally: { text } }, tokens());
  assert.equal(r.findings.length, 0, 'two rare near-identical colors stay rare');
});

test('the share cut uses the raw share, not the rounded one', () => {
  const r = analyze({ tally: { text: { 'rgb(9, 24, 47)': 9954, 'rgb(200, 0, 0)': 46 } } }, tokens());
  assert.equal(r.findings.length, 0, '0.46% is under a 0.5% cut even though it rounds to 0.5');
  assert.equal(r.rare[0].share, 0.5);
});

test('a translucent color is judged over white and says so', () => {
  const r = analyze({ tally: { text: { 'rgba(192, 57, 43, 0.5)': 10 } } }, tokens());
  assert.equal(r.findings[0].value, '#e09c95');
  assert.equal(r.findings[0].note, 'alpha 0.5, judged over white');
});

test('an unreadable color is listed, not fatal and not dropped', () => {
  const r = analyze({ tally: { text: { 'rgb(9, 24, 47)': 90, 'oklab(0 0 0 / 0.5)': 10 } } }, tokens());
  assert.deepEqual(r.unreadable, [{ role: 'text', value: 'oklab(0 0 0 / 0.5)', share: 10 }]);
});

test('a null tally is bad input with a clear message', () => {
  assert.throws(() => analyze({ tally: null }, tokens()), /no tally/);
});

test('a value under the share cut is rare, not a finding', () => {
  const r = analyze(census(), tokens());
  assert.equal(find(r, 'off-token color', '#14294a'), undefined);
  assert.ok(r.rare.some((f) => f.value === '#14294a' && f.share === 0.4));
  const strict = analyze(census(), tokens(), { minShare: 0.1 });
  assert.ok(find(strict, 'off-token color', '#14294a'));
});

test('backgrounds and borders are checked, and a transparent background is ignored', () => {
  const r = analyze(census(), tokens());
  const bg = r.findings.filter((f) => f.role === 'background');
  assert.deepEqual(bg.map((f) => [f.value, f.share]), [['#faf0c8', 5]]);
  assert.equal(find(r, 'off-token color', '#c80000').role, 'border');
});

test('families and font sizes outside the typography tokens are findings', () => {
  const r = analyze(census(), tokens());
  assert.equal(find(r, 'off-token family', 'Public Sans Variable'), undefined);
  assert.equal(find(r, 'off-token family', 'Comic Neue').share, 10);
  assert.equal(find(r, 'off-scale size', '13px').share, 10);
  assert.equal(find(r, 'off-scale size', '24px'), undefined, '1.5rem is 24px');
});

test('a clamp() font size token is named as not compared', () => {
  const t = tokensFrom(parseDesignMd('---\ncolors:\n  ink: "#000000"\ntypography:\n  hero:\n    fontFamily: Inter\n    fontSize: clamp(2rem, 5vw, 4rem)\n  body:\n    fontFamily: Inter\n    fontSize: 16px\n---\n'));
  assert.deepEqual(t.sizes, [16]);
  const r = analyze({ tally: { fontSize: { 16: 10 } } }, t);
  assert.ok(r.skipped.some((s) => /hero is clamp/.test(s)));
});

test('radius and spacing are skipped, not passed, when DESIGN.md has no tokens for them', () => {
  const r = analyze(census(), tokens());
  assert.ok(r.skipped.some((s) => s.startsWith('rounded')));
  assert.ok(r.skipped.some((s) => /3 elements use a percentage radius/.test(s)));
  assert.ok(r.skipped.some((s) => s.startsWith('spacing')));
  assert.ok(!r.findings.some((f) => /radius|spacing/.test(f.kind)));
});

test('CLI exits 2 with findings, 0 when the page uses only tokens, 1 on bad input', () => {
  assert.equal(run([CENSUS, '--design-md', DESIGN]).status, 2);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'census-'));
  const clean = path.join(dir, 'clean.json');
  fs.writeFileSync(clean, JSON.stringify({ url: 'x', tally: { text: { 'rgb(9, 24, 47)': 10 }, family: { 'Public Sans': 10 }, fontSize: { 14: 10 } } }));
  const ok = run([clean, '--design-md', DESIGN]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /Nothing off-token/);
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{"url": "x"}');
  assert.equal(run([bad, '--design-md', DESIGN]).status, 1);
  assert.equal(run([CENSUS]).status, 1);
});

test('CLI reads the census as the browser tool returns it, a JSON string', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'census-'));
  const wrapped = path.join(dir, 'wrapped.json');
  fs.writeFileSync(wrapped, JSON.stringify(fs.readFileSync(CENSUS, 'utf8')));
  const r = run([wrapped, '--design-md', DESIGN, '--json']);
  assert.equal(r.status, 2);
  assert.ok(JSON.parse(r.stdout).findings.length > 0);
});

test('the CLI still runs when reached through a symlinked plugin directory', () => {
  // Regression: a symlinked install path (or macOS /tmp) made the CLI exit 0 with no output.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'census-link-'));
  const link = path.join(dir, 'plugin');
  fs.symlinkSync(fs.realpathSync(path.join(HERE, '..')), link);
  for (const [script, args, status] of [
    ['census.mjs', [CENSUS, '--design-md', DESIGN], 2],
    ['contrast.mjs', ['--design-md', DESIGN], 2],
    ['figma-audit.mjs', ['--help'], 0],
  ]) {
    const r = spawnSync(process.execPath, [path.join(link, 'scripts', script), ...args], { encoding: 'utf8' });
    assert.equal(r.status, status, `${script} through a symlink`);
    assert.ok(r.stdout.length > 0, `${script} printed nothing through a symlink`);
  }
});
