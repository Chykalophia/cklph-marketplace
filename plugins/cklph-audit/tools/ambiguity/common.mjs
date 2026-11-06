// common.mjs: shared helpers for tools/ambiguity.sh (SPEC-v4-ambiguity.md §2.1, §3.1, §3.3).
// Zero-dependency Node >=18 ESM. Mode modules (contract/prose/code) import from here; only main.mjs
// and walk() touch the filesystem.
import fs from 'node:fs';
import nodePath from 'node:path';

// Verbatim port of globMatch in workflows/audit.workflow.js (`**/` = zero or more dirs).
// Never the bash `case` matching of omissions.sh:96, which misses `src/a.ts` for `src/**/*.ts`.
export function globMatch(path, globs) {
  // honest subset: '**/' = any depth (incl. none), '**' = anything, '*' = one segment, else literal.
  return (globs ?? []).some(g => {
    const re = '^' + g
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // escape regex chars ('*' and '/' survive)
      .replace(/\*\*\/|\*\*|\*/g, m =>        // single pass, longest-first
        m === '**/' ? '(?:.*/)?' : m === '**' ? '.*' : '[^/]*') + '$'
    return new RegExp(re).test(path)
  })
}

// Code-point order (never localeCompare): deterministic across hosts and locales.
function cmpCodePoint(a, b) {
  const x = String(a), y = String(b);
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    const cx = x.codePointAt(i), cy = y.codePointAt(j);
    if (cx !== cy) return cx < cy ? -1 : 1;
    i += cx > 0xffff ? 2 : 1; j += cy > 0xffff ? 2 : 1;
  }
  const restX = x.length - i, restY = y.length - j;
  return restX === restY ? 0 : restX < restY ? -1 : 1;
}

const PRUNE = new Set(['node_modules', '.git', 'vendor']);
// Generated-output names, pruned too, EXCEPT when the dir's OWN parent is an instruction dir
// (`skills/build/` is a skill named build, not build output) and that parent is not a package root
// (`packages/agents/dist/` beside `packages/agents/package.json` is build output). An instruction
// ANCESTOR is not enough: `skills/x/dist/` is pruned (§15 PRUNE). Each pruned one goes to onPrune.
const GENERATED = new Set(['dist', 'build', '.next', 'coverage']);
const INSTRUCTION_PARENT = /(^|\/)(agents|skills|commands|\.claude|\.cursor\/rules)$/;
const PACKAGE_ROOT = new Set(['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml']);

// walk(root) → root-relative file paths ('/'-separated, no leading '/'), code-point sorted.
// Prunes PRUNE dirs and GENERATED dirs outside instruction paths; skips `*.example.*` files whose
// path has a `fixtures/` segment (a backtest roots AT the case dir, so it still sees them). Symlinks
// are not followed. Unreadable dirs go to onSkip.
export function walk(root, onSkip = () => {}, onPrune = () => {}) {
  const out = [];
  const rec = (rel) => {
    let entries;
    try { entries = fs.readdirSync(rel ? nodePath.join(root, rel) : root, { withFileTypes: true }); }
    catch (e) { onSkip(rel || '.', e.code || e.message); return; }
    const keepGenerated = INSTRUCTION_PARENT.test(rel) && !entries.some(d => d.isFile() && PACKAGE_ROOT.has(d.name));
    for (const d of entries) {
      const p = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) {
        if (PRUNE.has(d.name)) continue;
        if (GENERATED.has(d.name) && !keepGenerated) { onPrune(p); continue; }
        rec(p);
      }
      else if (d.isFile()) {
        if (/(^|\/)fixtures\//.test(p) && /\.example\./.test(d.name)) continue;
        out.push(p);
      }
    }
  };
  rec('');
  return out.sort(cmpCodePoint);
}

// Markdown code spans as [start, end) ranges, in O(n): a backtick run pairs with the NEXT run of the
// same length; an unpaired run is literal (CommonMark). A lazy regex goes quadratic on many
// backtick runs (180KB took 14s).
export function codeSpanRanges(text) {
  const runs = [];
  for (let i = 0; i < text.length;) {
    if (text[i] !== '`') { i++; continue; }
    let j = i;
    while (j < text.length && text[j] === '`') j++;
    runs.push([i, j - i]);
    i = j;
  }
  const next = new Array(runs.length).fill(-1), seen = new Map();
  for (let k = runs.length - 1; k >= 0; k--) { next[k] = seen.get(runs[k][1]) ?? -1; seen.set(runs[k][1], k); }
  const spans = [];
  for (let k = 0; k < runs.length;) {
    if (next[k] < 0) { k++; continue; }
    const close = runs[next[k]];
    spans.push([runs[k][0], close[0] + close[1]]);
    k = next[k] + 1;
  }
  return spans;
}

// §3.6 unit-name test: lowercased, `_`/`-` removed, ENDS with one of these (so `timeoutMs`,
// `ttlSeconds` pass on their own; `age`, `window` are excluded). Shared by code mode and prose config
// rows, so it lives here: a half-edited code.mjs must not break a prose run (D23).
const UNIT_SUFFIX = ['timeout', 'delay', 'interval', 'ttl', 'expiry', 'expires', 'expiresin', 'maxage', 'duration', 'wait',
  'backoff', 'cooldown', 'retention', 'period', 'grace', 'debounce', 'throttle', 'staletime', 'cachetime', 'gctime', 'persist',
  'maxlife', 'lifetime', 'maxsize', 'sizelimit', 'bodylimit', 'quota'];
export function isUnitName(name) {
  const n = String(name).toLowerCase().replace(/[_-]/g, '');
  return UNIT_SUFFIX.some(s => n.endsWith(s));
}
export const UNIT_WORD = /\b(ms|milliseconds?|seconds?|secs?|minutes?|mins?|hours?|days?|bytes?|kb|mb)\b/i;

// §3.6 test paths.
export function isTestPath(file) {
  return /(^|\/)(__tests__|tests?|spec|__mocks__)\//.test(file)
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
    || /_test\.(go|py)$/.test(file)
    || /(^|\/)test_[^/]*\.py$/.test(file);
}

// §3.3 kind priority (lower sorts first, and survives the AMBIGUITY_MAX cap first).
export const PRIORITY = Object.freeze({
  'contract-mismatch': 0, scope: 1, unit: 2, 'vague-conditional': 3, 'falsy-default': 4, sentinel: 5, normative: 6,
});

// Sort by (kind priority, file, line, field, value); via/signal only break exact ties.
export function sortRecords(records) {
  const pr = k => (k in PRIORITY ? PRIORITY[k] : 99);
  return [...records].sort((a, b) =>
    (pr(a.kind) - pr(b.kind))
    || cmpCodePoint(a.file, b.file)
    || ((a.line ?? 0) - (b.line ?? 0))
    || cmpCodePoint(a.field ?? '', b.field ?? '')
    || cmpCodePoint(a.value ?? '', b.value ?? '')
    || cmpCodePoint(a.via ?? '', b.via ?? '')
    || cmpCodePoint(a.signal ?? '', b.signal ?? ''));
}

// §2.1 docClass: ONE function, anchored regexes on the root-relative path, first match wins:
//   1. POLICY_BASE, case-SENSITIVE prefix + suffix (`skills/SECURITY.md`, `SECURITY-advisories.md`);
//   2. instruction (basename or path);
//   3. POLICY_EXACT, case-INSENSITIVE: the bare policy word, or the word plus ONE policy-type suffix
//      (`security.md`, `docs/Security.md`, `privacy-policy.md`, `privacy_notice.md`, `Security-Policy.md`).
// Never case-insensitive prefix + ANY suffix: `commands/security-review.md` is an instruction doc and
// `docs/security-review.md` a reference doc named for a policy word, not policies (§15 POLICY-CASE).
const POLICY_WORDS = 'SECURITY|CONTRIBUTING|CODE_OF_CONDUCT|PRIVACY|TERMS|SUPPORT|GOVERNANCE|DISCLOSURE|VULNERABILITY';
const POLICY_SUFFIX = 'POLICY|NOTICE|STATEMENT|POLICIES|OF[-_]SERVICE|OF[-_]USE|GUIDELINES';
const POLICY_BASE = new RegExp(`^(${POLICY_WORDS})[\\w.-]*\\.mdx?$`);
const POLICY_EXACT = new RegExp(`^(${POLICY_WORDS})([-_.](${POLICY_SUFFIX}))?\\.mdx?$`, 'i');
const INSTRUCTION_BASE = /^(CLAUDE|AGENTS|GEMINI|SKILL)\.md$|^copilot-instructions\.md$/;
const INSTRUCTION_PATH = /(^|\/)(agents|skills|commands)\/|(^|\/)\.(claude|cursor\/rules)\//;
export function docClass(file) {
  const base = String(file).split('/').pop();
  if (POLICY_BASE.test(base)) return 'policy';
  if (INSTRUCTION_BASE.test(base) || INSTRUCTION_PATH.test(file)) return 'instruction';
  if (POLICY_EXACT.test(base)) return 'policy';
  return 'reference';
}

// §2.1 matrix as data (rule ids without the `ambiguity:` prefix).
export const DOC_CLASS_RULES = Object.freeze({
  policy: Object.freeze(['scope-clause', 'contradiction', 'unit', 'vague-conditional']),
  instruction: Object.freeze(['contract-mismatch', 'contradiction', 'vague-conditional', 'unit', 'overloaded-term', 'scope-clause']),
  reference: Object.freeze(['contract-mismatch', 'unit', 'contradiction']),
});

// §1 rule ids. The table has 9 rows; `ambiguity:unit` is both a prose and a code row, so the set
// holds 8 distinct ids.
export const RULE_IDS = Object.freeze([
  'ambiguity:contract-mismatch', 'ambiguity:scope-clause', 'ambiguity:vague-conditional', 'ambiguity:unit',
  'ambiguity:contradiction', 'ambiguity:overloaded-term', 'ambiguity:falsy-default', 'ambiguity:sentinel',
]);
