// Tests for scripts/copy-lint.mjs.
//
//   node --test plugins/cklph-visual-qa/tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromHtml, fromMarkdown, checkDoc, checkRepeats, groupRepeats, isReframe } from '../scripts/copy-lint.mjs';
import { applyExceptions, normalize } from '../scripts/lint-filter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'copy-lint.mjs');
const HTML = path.join(HERE, 'fixtures', 'copy-page.html');
const MDX = path.join(HERE, 'fixtures', 'copy-article.mdx');
const run = (args, cwd = HERE) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
const gates = (findings) => findings.map((f) => f.gate);

test('isReframe catches the "X, not Y" shapes and leaves plain headings alone', () => {
  for (const h of ['Growth partners, not vendors', 'Not a feature. A platform.', "It's not the design, it's the offer", 'Partners, not just builders']) {
    assert.ok(isReframe(h), h);
  }
  for (const h of ['No surprises, no lock-in games', 'Not sure where you fit?', 'Why redesigns stall', 'What we do not offer']) {
    assert.ok(!isReframe(h), h);
  }
});

test('fromHtml skips head, scripts, header, nav and footer', () => {
  const doc = fromHtml(fs.readFileSync(HTML, 'utf8'));
  assert.deepEqual(doc.headings, ['Growth partners, not vendors', 'Not a feature. A platform.']);
  const all = doc.blocks.join(' ');
  assert.ok(!/synergy|Footer text|document\.write|color:red/.test(all));
  assert.ok(all.includes('—'), 'entities decode to the real dash');
  assert.equal(doc.labels.filter((l) => l === 'Book a call').length, 5, 'nav link is not counted');
});

test('fromMarkdown skips frontmatter, imports, code and JSX tags but keeps their text', () => {
  const doc = fromMarkdown(fs.readFileSync(MDX, 'utf8'));
  assert.deepEqual(doc.headings, ['Why redesigns stall', 'Partners, not vendors']);
  const all = doc.blocks.join(' ');
  assert.ok(all.includes('Write the page copy before anyone opens a design tool.'));
  assert.ok(all.includes('The scope comes first'));
  assert.ok(!/leverage|import|title:|—/.test(all));
});

test('checkDoc grades each giveaway on the fixture page', () => {
  const f = checkDoc('/fixture', fromHtml(fs.readFileSync(HTML, 'utf8')));
  const byGate = Object.fromEntries(f.map((x) => [x.gate + (x.gate === 'ai-vocabulary' ? ':' + x.evidence.match(/"([^"]+)"/)[1] : ''), x.grade]));
  assert.equal(byGate['reframe-heading'], 'FAIL');
  assert.equal(byGate['ai-vocabulary:leverage'], 'FAIL');
  assert.equal(byGate['ai-vocabulary:seamless'], 'FAIL');
  assert.equal(byGate['ai-vocabulary:unlock'], 'FAIL');
  assert.equal(byGate.signpost, 'FAIL');
  assert.equal(byGate['dash-in-prose'], 'FAIL');
  assert.equal(byGate.intensifier, 'WARN');
  assert.equal(byGate['stiff-english'], 'WARN');
  assert.equal(byGate.exclamation, 'WARN');
  assert.equal(byGate['repeated-cta'], 'WARN');
  assert.ok(f.every((x) => x.evidence.startsWith('[/fixture] ')));
});

test('checkDoc allows one reframe heading and reports a clean article as clean', () => {
  assert.deepEqual(checkDoc('a', fromMarkdown(fs.readFileSync(MDX, 'utf8'))), []);
});

test('checkRepeats finds each shared block, and needs the minimum number of pages', () => {
  const shared = 'Every account, credential, file and line of code stays in your name, and you can leave any time.';
  const second = 'Projects run on a deposit and a payment schedule, and retainers are billed at the start of each month.';
  const doc = (extra) => ({ blocks: [shared, second, extra] });
  const docs = [{ name: '/a', doc: doc('one') }, { name: '/b', doc: doc('two') }, { name: '/c', doc: doc('three') }];
  const f = checkRepeats(docs, 3);
  assert.equal(f.length, 2);
  assert.ok(f.every((x) => x.grade === 'WARN' && x.evidence.startsWith('on 3 pages (/a, /b, /c): "')));
  assert.deepEqual(checkRepeats(docs.slice(0, 2), 3), []);

  const grouped = groupRepeats(normalize('copy', { findings: f }));
  assert.equal(grouped.length, 1);
  assert.match(grouped[0].text, /^2 blocks on 3 pages \(\/a, \/b, \/c\), first: "Every account/);

  const exc = [{ tool: 'copy', rule: 'repeated-block', match: 'Projects run on a deposit', reason: 'Terms on purpose.' }];
  const { kept, excused } = applyExceptions(normalize('copy', { findings: f }), exc);
  assert.equal(excused.length, 1, 'only the matched block is excused');
  const left = groupRepeats(kept);
  assert.equal(left.length, 1);
  assert.match(left[0].text, /^1 block on 3 pages .*first: "Every account/);
});

test('fromMarkdown handles CRLF files and scans heading text', () => {
  const crlf = fs.readFileSync(MDX, 'utf8').replace(/\n/g, '\r\n');
  assert.deepEqual(checkDoc('a', fromMarkdown(crlf)), []);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-lint-'));
  const file = path.join(tmp, 'crlf.mdx');
  fs.writeFileSync(file, crlf);
  assert.equal(run([file], tmp).status, 0);
  const f = checkDoc('b', fromMarkdown('# Seamless growth\n\nWe plan the work, then we build it.\n'));
  assert.ok(f.some((x) => x.gate === 'ai-vocabulary' && x.evidence.includes('"seamless"')));
});

test('a paragraph under different Markdown headings still counts as repeated', () => {
  const para = 'Every account, credential, file and line of code stays in your name, and you can leave any time.';
  const docs = ['One', 'Two', 'Three'].map((h, i) => ({ name: `/${i}`, doc: fromMarkdown(`## ${h} heading\n${para}\n`) }));
  assert.deepEqual(docs[0].doc.blocks, ['One heading', para]);
  const f = checkRepeats(docs, 3);
  assert.equal(f.length, 1);
  assert.match(f[0].evidence, /Every account/);
});

test('CLI exits 2 on findings, 0 on a clean file, 1 on a missing file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-lint-'));
  assert.equal(run([HTML], tmp).status, 2);
  assert.equal(run([MDX], tmp).status, 0);
  const missing = run([path.join(tmp, 'nope.md')], tmp);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /copy-lint:/);
});

test('CLI applies the exceptions file to copy findings, and --raw feeds lint-filter', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-lint-'));
  const exc = path.join(tmp, 'exc.json');
  fs.writeFileSync(exc, JSON.stringify({ exceptions: [{ tool: 'copy', rule: 'ai-vocabulary', match: '"leverage"', reason: 'Client term.' }] }));
  const out = JSON.parse(run([HTML, '--exceptions', exc, '--json'], tmp).stdout);
  assert.equal(out.excused.length, 1);
  assert.equal(out.excused[0].reason, 'Client term.');
  assert.ok(out.kept.some((f) => f.rule === 'ai-vocabulary' && f.text.includes('"seamless"')));
  const raw = run([HTML, '--raw'], tmp);
  const filter = spawnSync(process.execPath, [path.join(HERE, '..', 'scripts', 'lint-filter.mjs'), '--tool', 'copy'], { input: raw.stdout, cwd: tmp, encoding: 'utf8' });
  assert.equal(filter.status, 2);
  assert.match(filter.stdout, /\[copy reframe-heading FAIL\]/);
});

test('--help prints the usage header and stops before the code', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^copy-lint: /);
  assert.match(r.stdout, /Exit codes: 0 nothing that blocks/);
  assert.ok(!r.stdout.includes('import '));
});
