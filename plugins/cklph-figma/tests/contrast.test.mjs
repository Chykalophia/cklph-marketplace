// Tests for scripts/contrast.mjs.
//
//   node --test plugins/cklph-figma/tests/*.test.mjs
//
// Asserts outcomes: computed ratios, pass or fail per size, and the CLI's exit codes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseColor, composite, contrastRatio, checkPair, pairsFromDesignMd } from '../scripts/contrast.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'contrast.mjs');
const FIXTURE = path.join(HERE, 'fixtures', 'DESIGN.md');
const round2 = (n) => Math.round(n * 100) / 100;

test('parseColor reads hex, short hex, alpha hex, rgb() and rgba()', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('#0066cc'), { r: 0, g: 102, b: 204, a: 1 });
  assert.deepEqual(parseColor('#00000000'), { r: 0, g: 0, b: 0, a: 0 });
  assert.deepEqual(parseColor('rgb(28, 36, 51)'), { r: 28, g: 36, b: 51, a: 1 });
  assert.deepEqual(parseColor('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseColor('rgb(255 255 255 / 66%)'), { r: 255, g: 255, b: 255, a: 0.66 });
});

test('parseColor converts oklch(), the Tailwind v4 palette format', () => {
  const hex = (c) => '#' + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
  assert.equal(hex(parseColor('oklch(50.5% 0.213 27.518)')), '#c10007');
  assert.equal(hex(parseColor('oklch(1 0 0)')), '#ffffff');
  assert.equal(parseColor('oklch(50% 0.1 200 / 0.5)').a, 0.5);
});

test('parseColor rejects what it cannot read', () => {
  assert.throws(() => parseColor('#12'));
  assert.throws(() => parseColor('hsl(0 100% 50%)'));
  assert.throws(() => parseColor('rgb(300, 0, 0)'));
});

test('composite blends in sRGB and keeps opaque colors unchanged', () => {
  const white = parseColor('#ffffff');
  assert.deepEqual(composite(parseColor('#000000'), white), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(composite(parseColor('rgba(0, 0, 0, 0.5)'), white), { r: 127.5, g: 127.5, b: 127.5, a: 1 });
});

test('known ratios match WCAG 2.x', () => {
  assert.equal(round2(contrastRatio(parseColor('#000'), parseColor('#fff'))), 21);
  assert.equal(round2(contrastRatio(parseColor('#b5681f'), parseColor('#fdecd3'))), 3.65);
  assert.equal(round2(contrastRatio(parseColor('#77787c'), parseColor('#09182f'))), 4.02);
});

test('gold badge fails as normal text', () => {
  const r = checkPair({ name: 'badge-gold', fg: '#b5681f', bg: '#fdecd3', size: 'normal' });
  assert.equal(round2(r.ratio), 3.65);
  assert.equal(r.required, 4.5);
  assert.equal(r.pass, false);
});

test('hero strikethrough fails as normal text but passes as large text', () => {
  const normal = checkPair({ name: 'hero', fg: '#77787c', bg: '#09182f', size: 'normal' });
  const large = checkPair({ name: 'hero', fg: '#77787c', bg: '#09182f', size: 'large' });
  assert.equal(round2(normal.ratio), 4.02);
  assert.equal(normal.pass, false);
  assert.equal(large.required, 3);
  assert.equal(large.pass, true);
});

test('ui edges need 3:1', () => {
  assert.equal(checkPair({ name: 'field', fg: '#908b86', bg: '#ffffff', size: 'ui' }).pass, true);
  assert.equal(checkPair({ name: 'hairline', fg: '#e7e5e4', bg: '#ffffff', size: 'ui' }).pass, false);
});

test('size defaults to normal, the strictest threshold', () => {
  assert.equal(checkPair({ name: 'x', fg: '#77787c', bg: '#09182f' }).required, 4.5);
});

test('a transparent background shows the canvas: #0066cc on white is 5.57, not 3.77', () => {
  const r = checkPair({ name: 'text-link', fg: '#0066cc', bg: '#00000000', size: 'normal' });
  assert.equal(round2(r.ratio), 5.57);
  assert.equal(r.pass, true);
  const onBlack = checkPair({ name: 'text-link', fg: '#0066cc', bg: '#00000000', canvas: '#000000', size: 'normal' });
  assert.equal(round2(onBlack.ratio), 3.77);
});

test('fully transparent text on white fails', () => {
  const r = checkPair({ name: 'invisible', fg: 'rgba(0, 0, 0, 0)', bg: '#ffffff', size: 'large' });
  assert.equal(round2(r.ratio), 1);
  assert.equal(r.pass, false);
});

test('semi-transparent text is blended into its background', () => {
  const solid = checkPair({ name: 'a', fg: '#000000', bg: '#ffffff' });
  const half = checkPair({ name: 'b', fg: 'rgba(0, 0, 0, 0.5)', bg: '#ffffff' });
  assert.ok(half.ratio < solid.ratio / 4, `half-alpha black should be far below 21:1, got ${half.ratio}`);
});

test('checkPair rejects an unknown size', () => {
  assert.throws(() => checkPair({ name: 'x', fg: '#000', bg: '#fff', size: 'huge' }));
});

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const tmpDirs = [];
after(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const tmpJson = (data) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cklph-contrast-'));
  tmpDirs.push(dir);
  const file = path.join(dir, 'pairs.json');
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
  return file;
};

test('pairsFromDesignMd resolves a {colors.x} chain and reads size from typography', () => {
  const { pairs, skipped } = pairsFromDesignMd(fs.readFileSync(FIXTURE, 'utf8'));
  const byName = Object.fromEntries(pairs.map((p) => [p.name, p]));
  assert.deepEqual(Object.keys(byName), ['hero-strikethrough', 'footer-link', 'text-link']);
  assert.equal(byName['hero-strikethrough'].bg, '#09182f');
  assert.equal(byName['hero-strikethrough'].fg, '#77787c');
  assert.equal(byName['hero-strikethrough'].size, 'large');
  assert.equal(byName['footer-link'].size, 'normal');
  assert.deepEqual(skipped, ['button-hover']);
});

test('pairsFromDesignMd reports a reference that does not resolve', () => {
  const text = '---\ncolors:\n  primary: "#000"\ncomponents:\n  x:\n    textColor: "{colors.primry}"\n    backgroundColor: "#fff"\n---\n';
  assert.throws(() => pairsFromDesignMd(text), /\{colors\.primry\} does not resolve/);
});

test('CLI --design-md: same colors pass as large text and fail as normal text', () => {
  const r = run('--design-md', FIXTURE, '--json');
  assert.equal(r.status, 2, r.stderr);
  const out = JSON.parse(r.stdout);
  const byName = Object.fromEntries(out.results.map((x) => [x.name, x]));
  assert.equal(byName['hero-strikethrough'].pass, true);
  assert.equal(byName['footer-link'].pass, false);
  assert.equal(round2(byName['text-link'].ratio), 5.57);
  assert.equal(out.pass, false);
});

test('CLI exits 0 when every pair passes', () => {
  const r = run(tmpJson([{ name: 'ok', fg: '#000000', bg: '#ffffff', size: 'normal' }]));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 of 1 pairs pass/);
});

test('CLI exits 2 when any pair fails, and names it', () => {
  const r = run(tmpJson([
    { name: 'ok', fg: '#000000', bg: '#ffffff' },
    { name: 'badge-gold', fg: '#b5681f', bg: '#fdecd3', size: 'normal' },
  ]));
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stdout, /FAIL\s+3\.65\s+4\.5\s+normal\s+badge-gold/);
});

test('CLI exits 1 on bad input', () => {
  assert.equal(run(tmpJson('not json')).status, 1);
  assert.equal(run(tmpJson({ name: 'not an array' })).status, 1);
  assert.equal(run(tmpJson([])).status, 1);
  assert.equal(run(tmpJson([{ name: 'x', fg: 'hsl(0 100% 50%)', bg: '#fff' }])).status, 1);
  assert.equal(run(tmpJson([{ name: 'x', fg: '#000', bg: '#fff', size: 'huge' }])).status, 1);
  assert.equal(run('--bogus').status, 1);
  assert.equal(run().status, 1);
});

test('CLI --help prints the usage header and exits 0', () => {
  const r = run('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^contrast\.mjs:/);
  assert.match(r.stdout, /Exit codes: 0 every pair passes, 2 any pair fails, 1 bad input\./);
});
