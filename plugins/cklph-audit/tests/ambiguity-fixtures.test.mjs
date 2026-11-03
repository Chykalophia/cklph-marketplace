// AC-041 + AC-042: the ambiguity fixtures and their labels.json sidecar (SPEC-v4-ambiguity.md §9).
//
//   node plugins/cklph-audit/tests/ambiguity-fixtures.test.mjs     (also runs under `node --test`)
//
// AC-041 (parity): every fixture file is labelled and every labelled file exists, `.example.` names,
// the neutral FIXTURE header (no case id, no labels path: §15), no answer-leaking text, label lines
// inside the file, and every should-flag rule allowed for its file's docClass (docClass /
// DOC_CLASS_RULES / RULE_IDS imported from the tool, never a hand copy).
// AC-042 (tool vs labels): runs the real tools/ambiguity.sh per case and mode with root = the case dir
// and compares `kind@file:line` to toolExpect: exact for contract/code AND for every should-not-flag
// prose case (§15: a subset check cannot catch a false positive), subset for should-flag prose. Fails
// closed on a missing summary line, a wrong file/doc count, or any NOTHING scanned / NOT run / not
// implemented / helper failed line. Every checker is a pure function with a teeth self-check on
// synthetic input. The two ACs are reported separately. Exits non-zero on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { docClass, DOC_CLASS_RULES, RULE_IDS } from '../tools/ambiguity/common.mjs';
import { isGateTreeDeleted, GATE_MIRROR_OK } from './lib/gate-tree.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(PLUGIN, 'fixtures', 'ambiguity');
const TOOL = path.join(PLUGIN, 'tools', 'ambiguity.sh');
const LABELS = JSON.parse(fs.readFileSync(path.join(FIX, 'labels.json'), 'utf8'));
const CASES = LABELS.cases ?? [];

const tally = { 'AC-041': 0, 'AC-042': 0 };
let current = 'AC-041';
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) tally[current]++; };

// Neutral header: an EMPTY comment that only keeps line 1 (labels count it). No case id (F/N/C is the
// verdict), no labels path (the answer key) and no `FIXTURE` marker: instruction docs' HTML comments
// are read, and the lens SKILL calls fixtures "ground truth, not findings", which biases the panel
// toward suppressing (§15 LEAK, review round 3).
const HEADER = { md: '<!-- -->', js: '//' };
const FORBIDDEN = ['Expected verdict', 'Reading A', 'Reading B', 'expect:', 'should-flag', 'should-not-flag', 'labels.json', 'FIXTURE'];
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const MD_EXT = /\.mdx?$/;
const HISTORY = /^(CHANGELOG[^/]*|HISTORY\.md|LICENSE[^/]*|NOTICE[^/]*)$/;
const CODE_RULES = ['unit', 'falsy-default', 'sentinel'];
const strip = r => String(r).replace(/^ambiguity:/, '');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const base = f => f.slice(f.lastIndexOf('/') + 1);

// Every file under fixtures/ambiguity/should-*/, as `<should-…>/<case>/<rel path>`, '/'-separated.
function listFixtureFiles() {
  const out = [];
  const rec = (rel) => {
    for (const d of fs.readdirSync(path.join(FIX, rel), { withFileTypes: true })) {
      const p = `${rel}/${d.name}`;
      if (d.isDirectory()) rec(p); else out.push(p);
    }
  };
  for (const top of ['should-flag', 'should-not-flag']) if (fs.existsSync(path.join(FIX, top))) rec(top);
  return out.sort();
}

// Pure: which on-disk files are unlabelled, which labelled files are missing.
function parityProblems(onDisk, cases) {
  const labelled = new Set(cases.flatMap(c => (c.files ?? []).map(f => `${c.dir}/${f}`)));
  const disk = new Set(onDisk);
  return {
    unlabeled: [...disk].filter(f => !labelled.has(f)).sort(),
    missing: [...labelled].filter(f => !disk.has(f)).sort(),
  };
}

// Pure: every should-flag expected rule (and every alsoAccept anchor) must be allowed for its file.
function docClassProblems(entries) {
  const out = [];
  for (const { caseId = '?', file, rules } of entries) {
    for (const r of rules ?? []) {
      const rule = strip(r);
      if (CODE_EXT.test(file)) {
        if (!CODE_RULES.includes(rule)) out.push(`${caseId} ${file}: ${r} is not a code rule`);
      } else {
        const cls = docClass(file);
        if (!(DOC_CLASS_RULES[cls] ?? []).includes(rule)) out.push(`${caseId} ${file}: ${r} not allowed for docClass ${cls}`);
      }
    }
  }
  return out;
}

// Pure: prompt overlap. Every N-word run (lowercased, punctuation-free) of a fixture's prose that also
// occurs in a prompt the gate panel loads. Code spans and quoted one-token values are dropped from the
// PROMPT side first: they are contract values (`verified-safe`, "not-applicable"), not prose a fixture
// could be copied from.
// Kills: a SKILL example that quotes a fixture sentence ("if the checks are mostly green"), which turns
// recall on that case into prompt recall (§15 LEAK, review round 3).
const words = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
function shingles(text, n) {
  const ws = words(text), out = new Set();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' '));
  return out;
}
function promptOverlap(fixtureLines, promptText, n = 4) {
  const prompt = shingles(String(promptText).replace(/`[^`\n]*`|"[\w.-]+"/g, ' zzcodezz '), n);   // a gap no run can cross
  const out = [];
  fixtureLines.forEach((l, i) => { for (const s of shingles(l, n)) if (prompt.has(s)) out.push({ index: i, run: s }); });
  return out;
}

// Pure: the line-1 header problem for a file, or null.
function headerProblem(file, firstLine) {
  const want = MD_EXT.test(file) ? HEADER.md : HEADER.js;
  return firstLine === want ? null : `${file} line 1 is ${JSON.stringify(firstLine)}, want ${JSON.stringify(want)}`;
}
// Pure: answer-leaking strings in a fixture's text (incl. a case id such as F3 / N1 / C2 after FIXTURE).
function leakProblems(text) {
  const out = FORBIDDEN.filter(x => text.includes(x));
  if (/FIXTURE ambiguity\/[A-Z]\d+/.test(text)) out.push('case id in the FIXTURE header');
  return out;
}
// Pure: a label anchor outside its file (lines count the header; 1 is the header itself).
function rangeProblem({ file, lo, hi }, n) {
  return n > 0 && Number.isInteger(lo) && Number.isInteger(hi) && lo >= 2 && lo <= hi && hi <= n ? null
    : `${file ?? '?'}:${lo}-${hi} outside the file (1 header + ${n - 1} lines)`;
}
// Pure: stderr lines that mean the tool did not really scan. The empty-selection line is expected only
// when the case has 0 eligible docs (N8: its one doc is history); the count check still pins docs=0.
function loudLines(stderr, eligibleDocs) {
  return String(stderr ?? '').split('\n').filter(l => /NOTHING scanned|NOT run|not implemented|helper failed|internal error/.test(l)
    && !(eligibleDocs === 0 && /^ambiguity\.sh (prose|contract): 0 docs selected or readable, NOTHING scanned$/.test(l)));
}
// Pure: the summary's file/doc count vs the case's eligible files (fail closed on "scanned nothing").
function countProblem(mode, sum, files) {
  const docs = files.filter(f => MD_EXT.test(f) && !HISTORY.test(base(f))).length;
  if (!sum) return `${mode}: no summary line`;
  if (mode === 'contract') return Number(sum[1]) > 0 && Number(sum[3]) === docs ? null : `contract: enums=${sum[1]} docs=${sum[3]}, want enums>0 and docs=${docs}`;
  if (mode === 'prose') return Number(sum[1]) === docs ? null : `prose: files=${sum[1]}, want ${docs}`;
  const src = files.filter(f => CODE_EXT.test(f)).length;
  return Number(sum[1]) === src ? null : `code: files=${sum[1]}, want ${src}`;
}
// Pure: got vs want; exact unless `subset` (should-flag prose only).
function compareProblem(got, want, subset) {
  const absent = want.filter(k => !got.includes(k)), extra = subset ? [] : got.filter(k => !want.includes(k));
  return absent.length || extra.length ? `missing: ${absent.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}` : null;
}

const fileLines = (abs) => {
  const t = fs.readFileSync(abs, 'utf8').replace(/\r/g, '');
  return (t.endsWith('\n') ? t.slice(0, -1) : t).split('\n');
};
const keyOf = r => `${r.kind}@${r.file}:${r.line}`;

// ── AC-041 ────────────────────────────────────────────────────────────────────
console.log('AC-041 fixtures parity and labels');
{
  current = 'AC-041';
  const ids = CASES.map(c => c.id);
  ok(LABELS.lens === 'ambiguity', `labels.json lens is ambiguity (${LABELS.lens})`);
  ok(new Set(ids).size === ids.length && ids.length === 18, `18 unique case ids (${ids.join(',')})`);
  for (const c of CASES) {
    const flag = /^[FC]\d+$/.test(c.id);
    ok(c.dir?.startsWith(flag ? 'should-flag/' : 'should-not-flag/') && fs.existsSync(path.join(FIX, c.dir)),
      `${c.id} dir ${c.dir} exists under ${flag ? 'should-flag' : 'should-not-flag'}`);
    ok(Array.isArray(c.modes) && c.modes.length > 0 && c.modes.every(m => ['contract', 'prose', 'code'].includes(m)),
      `${c.id} modes ${JSON.stringify(c.modes)}`);
    const hasExact = c.modes?.some(m => m !== 'prose'), hasIncl = c.modes?.includes('prose');
    ok((!hasExact || Array.isArray(c.toolExpect?.exact)) && (!hasIncl || Array.isArray(c.toolExpect?.includes)),
      `${c.id} toolExpect has exact for contract/code and includes for prose`);
    if (flag) ok(Array.isArray(c.expect) && c.expect.length >= 1, `${c.id} should-flag has ≥1 expect entry`);
    else ok(Array.isArray(c.expect) && c.expect.length === 0, `${c.id} should-not-flag expect is []`);
    for (const e of c.expect ?? []) {
      ok((e.rules ?? []).length > 0 && e.rules.every(r => RULE_IDS.includes(r)), `${c.id} ${e.file} rules ${JSON.stringify(e.rules)} ⊆ RULE_IDS`);
    }
  }

  // parity
  const onDisk = listFixtureFiles();
  const { unlabeled, missing } = parityProblems(onDisk, CASES);
  ok(onDisk.length > 0 && unlabeled.length === 0, `every fixture file is listed in labels.json (unlabeled: ${unlabeled.join(', ') || 'none'})`);
  ok(missing.length === 0, `every labelled file exists (missing: ${missing.join(', ') || 'none'})`);
  const badName = onDisk.filter(f => !base(f).includes('.example.'));
  ok(badName.length === 0, `every basename contains .example. (${badName.join(', ') || 'all'})`);

  // per-file content
  const caseOf = f => CASES.find(c => f.startsWith(`${c.dir}/`));
  for (const f of onDisk) {
    const c = caseOf(f);
    const lines = fileLines(path.join(FIX, f));
    const hp = headerProblem(f, lines[0] ?? '');
    ok(!!c && !hp, `${f} line 1 is only the neutral FIXTURE header${hp ? ` (${hp})` : ''}`);
    const leaks = leakProblems(lines.join('\n'));
    ok(leaks.length === 0, `${f} has no answer-leaking text (${leaks.join(', ') || 'clean'})`);
    if (c?.dir.startsWith('should-flag/') && CODE_EXT.test(f)) {
      const commented = lines.slice(1).map((l, i) => [i + 2, l]).filter(([, l]) => /\/\/|\/\*|^\s*\*/.test(l)).map(([n]) => n);
      ok(commented.length === 0, `${f} has no comment after line 1 (${commented.join(', ') || 'none'})`);
    }
  }

  // label lines within file length (expect, alsoAccept, lookAlikes, toolExpect)
  for (const c of CASES) {
    const anchors = [
      ...(c.expect ?? []).flatMap(e => [e, ...(e.alsoAccept ?? [])]),
      ...(c.lookAlikes ?? []),
    ].map(a => ({ file: a.file, lo: a.lines?.[0], hi: a.lines?.[1] }));
    for (const k of [...(c.toolExpect?.exact ?? []), ...(c.toolExpect?.includes ?? [])]) {
      const km = /^([a-z-]+)@(.+):(\d+)$/.exec(k);
      ok(!!km, `${c.id} toolExpect entry ${k} is kind@file:line`);
      if (km) anchors.push({ file: km[2], lo: Number(km[3]), hi: Number(km[3]) });
    }
    for (const a of anchors) {
      const abs = path.join(FIX, c.dir, a.file ?? '');
      const n = a.file && fs.existsSync(abs) ? fileLines(abs).length : 0;
      const rp = rangeProblem(a, n);
      ok(!rp, `${c.id} ${a.file}:${a.lo}-${a.hi} inside the file${rp ? ` (${rp})` : ''}`);
    }
  }

  // no fixture prose in a prompt the gate panel loads (§15 LEAK): the lens SKILL and every agent def
  const PROMPTS = ['skills/ambiguity-lens/SKILL.md', ...fs.readdirSync(path.join(PLUGIN, 'agents')).filter(f => f.endsWith('.md')).map(f => `agents/${f}`)];
  const promptText = Object.fromEntries(PROMPTS.map(p => [p, fs.readFileSync(path.join(PLUGIN, p), 'utf8')]));
  for (const f of onDisk.filter(f => MD_EXT.test(f))) {
    const body = fileLines(path.join(FIX, f)).slice(1);
    const hits = PROMPTS.flatMap(p => promptOverlap(body, promptText[p]).map(h => `line ${h.index + 2} ~ ${p}: "${h.run}"`));
    ok(hits.length === 0, `${f}: no 4-word run of its prose appears in the lens SKILL or an agent def (${hits.join('; ') || 'none'})`);
  }

  // §15 LEAK, widened: no 5-word run of fixture prose in ANY text file that survives in the gate tree
  // (the repo minus GATE_TREE_DELETE), except the documented contract mirrors. Kills a cklph-os or
  // backtest doc that quotes a fixture sentence as the worked ambiguity example — the panel can grep it.
  const git = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: PLUGIN, encoding: 'utf8' });
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: PLUGIN, encoding: 'utf8' }).stdout?.trim();
  if (git.status !== 0 || !top) ok(false, 'gate-tree overlap: not in a git checkout, cannot list surviving files');
  else {
    const prefix = path.relative(top, PLUGIN).split(path.sep).join('/') + '/';
    const surviving = git.stdout.split('\n').filter(Boolean).map(f => prefix + f)
      .filter(f => /\.(md|mdx|mjs|js|ts|json|ya?ml|sh)$/.test(f) && !isGateTreeDeleted(f));
    const rootFiles = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: top, encoding: 'utf8' })
      .stdout.split('\n').filter(f => f && !f.startsWith(prefix) && /\.(md|mdx|mjs|js|ts|json|ya?ml|sh)$/.test(f) && !isGateTreeDeleted(f));
    const all = [...surviving, ...rootFiles];
    const first = new Map();
    for (const f of all) {
      let t; try { t = fs.readFileSync(path.join(top, f), 'utf8'); } catch { continue; }
      if (t.length > 2e6) continue;
      for (const s of shingles(String(t).replace(/`[^`\n]*`|"[\w.-]+"/g, ' zzcodezz '), 5)) if (!first.has(s)) first.set(s, f);
    }
    const leaks = [];
    for (const f of onDisk.filter(f => MD_EXT.test(f))) {
      fileLines(path.join(FIX, f)).slice(1).forEach((l, i) => {
        for (const s of shingles(l, 5)) {
          const hit = first.get(s);
          if (hit && !GATE_MIRROR_OK.has(`${f} ~ ${hit}`)) leaks.push(`${f}:${i + 2} ~ ${hit}: "${s}"`);
        }
      });
    }
    ok(all.length > 100 && leaks.length === 0, `no fixture prose in any of ${all.length} gate-tree survivors (${[...new Set(leaks)].slice(0, 6).join('; ') || 'none'})`);
    // teeth: the deny list is what keeps cklph-os out — a survivor list that ignored it would see the
    // SECURITY.md example quoted in plugins/cklph-os/CHANGELOG.md
    ok(isGateTreeDeleted('plugins/cklph-os/CHANGELOG.md') && isGateTreeDeleted('plugins/cklph-audit/tests/tools.test.mjs')
      && isGateTreeDeleted('plugins/cklph-audit/fixtures/README.md') && !isGateTreeDeleted('plugins/cklph-audit/fixtures/README.md.bak')
      && !isGateTreeDeleted('plugins/cklph-audit/skills/ambiguity-lens/SKILL.md'),
      'teeth: GATE_TREE_DELETE covers cklph-os, tests/ and the fixtures README, and keeps the lens SKILL');
  }

  // docClass check (§9.2)
  const entries = CASES.filter(c => c.dir?.startsWith('should-flag/')).flatMap(c => (c.expect ?? []).flatMap(e =>
    [e, ...(e.alsoAccept ?? [])].map(a => ({ caseId: c.id, file: a.file, rules: e.rules }))));
  const dcp = docClassProblems(entries);
  ok(entries.length >= 9 && dcp.length === 0, `every should-flag expected rule is allowed for its file's docClass (${dcp.join('; ') || `${entries.length} anchors`})`);

  // teeth: the checkers can fail
  const synthetic = [...onDisk, 'should-flag/contract-mismatch/unlabeled.example.md'];
  const t1 = parityProblems(synthetic, CASES);
  ok(t1.unlabeled.length === 1 && t1.unlabeled[0] === 'should-flag/contract-mismatch/unlabeled.example.md' && t1.missing.length === 0,
    `teeth: parity checker reports exactly the one unlabeled synthetic path (${t1.unlabeled.join(', ')})`);
  const t2 = docClassProblems([{ caseId: 'T', file: 'release.example.md', rules: ['ambiguity:vague-conditional'] }]);
  ok(t2.length === 1 && t2[0].includes('release.example.md') && t2[0].includes('reference'),
    `teeth: docClass check reports release.example.md at a case root (${t2.join('; ')})`);
  // kills: a disabled header, leak or range check (each passed on any input)
  ok(!!headerProblem('a.example.md', '<!-- FIXTURE ambiguity/F3 (labels: fixtures/ambiguity/labels.json) -->') && !!headerProblem('a.example.ts', '<!-- -->')
    && !!headerProblem('a.example.md', '<!-- FIXTURE ambiguity -->') && !!headerProblem('a.example.ts', '// FIXTURE ambiguity')
    && !headerProblem('a.example.ts', '//') && !headerProblem('a.example.md', '<!-- -->'),
    'teeth: header check rejects the old id/labels header, the old FIXTURE header and a wrong comment style');
  ok(same(leakProblems('x\nExpected verdict: flag\n'), ['Expected verdict']) && leakProblems('<!-- FIXTURE ambiguity/N1 -->').includes('case id in the FIXTURE header')
    && leakProblems('<!-- FIXTURE ambiguity -->').includes('FIXTURE')
    && leakProblems('see labels.json').includes('labels.json') && leakProblems('clean text').length === 0, 'teeth: leak check reports a verdict, a case id, the FIXTURE marker and the labels path');
  // kills: a disabled prompt-overlap check, or one that counts a backticked enum list as copied prose
  ok(promptOverlap(['After CI, merge if the checks are mostly green.'], 'branches on ("if the checks are mostly green", "as needed")').length > 0
    && promptOverlap(['Statuses are violation | verified-safe | not-applicable.'], 'one of `violation` | `verified-safe` | `not-applicable`').length === 0
    && promptOverlap(['Statuses are violation | verified-safe | not-applicable.'], 'status ∈ "violation" | "verified-safe" | "not-applicable"').length === 0
    && promptOverlap(['Merge when every required check passed.'], 'if the checks are mostly green').length === 0,
    'teeth: prompt-overlap check reports a copied 4-word run, ignores a backticked value list and unrelated prose');
  ok(!!rangeProblem({ file: 'a.md', lo: 9, hi: 9 }, 8) && !!rangeProblem({ file: 'a.md', lo: 1, hi: 1 }, 8) && !rangeProblem({ file: 'a.md', lo: 8, hi: 8 }, 8),
    'teeth: range check rejects a line past EOF and the header line');
}
console.log(tally['AC-041'] === 0 ? 'AC-041: PASS ✓' : `AC-041: FAIL ✗ (${tally['AC-041']} problem(s))`);

// ── AC-042 ────────────────────────────────────────────────────────────────────
console.log('\nAC-042 tool vs labels (tools/ambiguity.sh, root = case dir)');
{
  current = 'AC-042';
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AMBIGUITY_')));
  const SUMMARY = {
    prose: /^ambiguity\.sh prose: files=(\d+) sentences=(\d+) normative=(\d+) emitted=(\d+)$/m,
    code: /^ambiguity\.sh code: files=(\d+) skippedTests=(\d+) emitted=(\d+)$/m,
    contract: /^ambiguity\.sh contract: enums=(\d+) fields=\[([^\]]*)\] docs=(\d+) emitted=(\d+)$/m,
  };
  for (const c of CASES) {
    const root = path.join(FIX, c.dir);
    for (const mode of c.modes ?? []) {
      const r = spawnSync('bash', [TOOL, mode, root], { encoding: 'utf8', env });
      let out = null;
      try { out = JSON.parse(r.stdout); } catch { /* reported below */ }
      const eligibleDocs = (c.files ?? []).filter(f => MD_EXT.test(f) && !HISTORY.test(base(f))).length;
      const loud = loudLines(r.stderr, eligibleDocs);
      const sum = SUMMARY[mode].exec(r.stderr ?? '');
      ok(r.status === 0 && Array.isArray(out) && loud.length === 0 && !!sum,
        `${c.id} ${mode}: ran, JSON array, summary line, nothing loud${loud.length ? ` (${loud.join(' | ')})` : ''}${sum ? '' : ` (stderr: ${(r.stderr ?? '').trim().slice(0, 200)})`}`);
      if (!Array.isArray(out)) continue;

      // Fail closed on "scanned nothing": the summary's file/doc count equals the case's eligible files.
      if (sum) { const cp = countProblem(mode, sum, c.files ?? []); ok(!cp, `${c.id} ${mode}: summary count matches the case's eligible files${cp ? ` (${cp})` : ''}`); }

      const got = [...new Set(out.map(keyOf))].sort();
      const subset = mode === 'prose' && c.dir.startsWith('should-flag/');
      const want = [...(mode === 'prose' ? c.toolExpect?.includes ?? [] : c.toolExpect?.exact ?? [])].sort();
      const cmp = compareProblem(got, want, subset);
      ok(!cmp, `${c.id} ${mode} ${subset ? '⊇' : '=='} ${JSON.stringify(want)}${cmp ? ` — ${cmp}; got ${JSON.stringify(got)}` : ''}`);
    }
  }
  // F1 / N1 are the named AC-042 anchors (PR #22 row, HEAD precision traps).
  const f1 = CASES.find(c => c.id === 'F1'), n1 = CASES.find(c => c.id === 'N1');
  ok(f1?.toolExpect?.exact?.length === 1 && /^contract-mismatch@checklist\.example\.md:\d+$/.test(f1.toolExpect.exact[0]),
    'F1 labels exactly one contract-mismatch on the checklist (the mcp-review row)');
  ok(Array.isArray(n1?.toolExpect?.exact) && n1.toolExpect.exact.length === 0, 'N1 labels exact []');
  // teeth: each AC-042 checker can fail (kills a disabled loud-line, count or compare check)
  ok(loudLines('ambiguity.sh: helper failed (exit 1), NOTHING scanned', 1).length === 1 && loudLines('ambiguity.sh prose: 0 docs selected or readable, NOTHING scanned', 1).length === 1
    && loudLines('ambiguity.sh prose: 0 docs selected or readable, NOTHING scanned', 0).length === 0, 'teeth: loud-line check reports helper failed, and an empty selection unless the case has 0 eligible docs');
  ok(!!countProblem('contract', SUMMARY.contract.exec('ambiguity.sh contract: enums=2 fields=[a] docs=0 emitted=0'), ['a.example.md'])
    && !!countProblem('prose', null, ['a.example.md']) && !countProblem('prose', SUMMARY.prose.exec('ambiguity.sh prose: files=1 sentences=1 normative=0 emitted=0'), ['a.example.md']),
    'teeth: count check reports docs=0 against 1 eligible doc, and a missing summary');
  ok(!!compareProblem(['vague-conditional@a:6'], [], false) && !compareProblem(['vague-conditional@a:6'], [], true) && !!compareProblem([], ['scope@a:2'], true),
    'teeth: exact compare reports an extra record; subset compare reports only a missing one');
}
console.log(tally['AC-042'] === 0 ? 'AC-042: PASS ✓' : `AC-042: FAIL ✗ (${tally['AC-042']} problem(s))`);

const failed = tally['AC-041'] + tally['AC-042'];
console.log(failed === 0 ? '\n✓ ALL AMBIGUITY FIXTURE TESTS PASSED' : `\n✗ ${failed} ambiguity fixture check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
