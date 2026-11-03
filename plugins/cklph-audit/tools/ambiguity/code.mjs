// code.mjs: `ambiguity.sh code` (SPEC-v4-ambiguity.md §3.6). Pure: works on {file,text} lists
// handed in by main.mjs; never touches the filesystem, process.env or stdout.
//
// Per line: `code` (comments removed), `masked` (`code` with single-line string contents blanked),
// `raw` (kept for the documented-sentinel and unit-comment exemptions). Kinds: falsy-default,
// sentinel, unit. At most one record per (line, kind).
import { isUnitName, UNIT_WORD } from './common.mjs';

const JS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const C_STYLE = /\.(ts|tsx|js|jsx|mjs|cjs|java|php|rs|go)$/;
const PY = /\.py$/;
const SH = /\.sh$|(^|\/)[^/]*\.env\.(example|sample)$/;
const CONF = /\.(ya?ml|toml)$/;

const FALSY_JS = /(?<![\w$.])([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^\]]+\])*)\s*\|\|=?\s*(-?[1-9]\d*(?:\.\d+)?|-?0\.\d*[1-9]\d*|true)\b/;
const FALSY_PY = /([A-Za-z_][\w.]*)\s+or\s+(-?[1-9]\d*(?:\.\d+)?|True)\b/;
const FALSY_GUARD = /if\s*\(\s*!\s*([\w$.]*?(count|limit|max\w*|min\w*|timeout|ttl|retries|size|port|offset|page|index|threshold|delay|interval|amount|price|qty|quantity))\s*\)/i;

const SENTINEL = /\b([\w$.]*?(limit|max\w*|timeout|ttl|retries|depth|budget|quota|size|expir\w*)\w*)\s*(?:===?|!==?|=|:)\s*(-1|Infinity|Number\.MAX_SAFE_INTEGER|9{4,})\b/i;
const SENTINEL_ZERO = /\b([\w$.]*?(?:timeout|ttl|limit|max\w*))(?![\w$])\s*(?:===?|!==?|=|:)\s*0(?![\w.])/i;
const INDEX_CALL = /indexOf\(|findIndex\(|lastIndexOf\(|\.search\(/;
// a same-line or preceding-line comment that documents the sentinel IS the disambiguation
const DOC_SENTINEL = /(-1|0|Infinity)\s*(=|means|:|→|->|is|for)\s*(no|unlimited|disabled|off|none|infinite|never|default)|\b(unlimited|no limit|disables?|infinite|never expires)\b/i;

// a numeric literal or a product of them (`30 * 1000`)
const NUM = String.raw`(\d[\d_]*(?:\.\d+)?(?:\s*\*\s*\d[\d_]*(?:\.\d+)?)*)(?![\w.])`;
const UNIT_JS_DECL = new RegExp(String.raw`\b(?:const|let|var|static|readonly)\s+(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*(?::\s*[A-Za-z_$][\w$.<>\[\]]*\s*)?=\s*${NUM}`, 'g');
const UNIT_JS_KEY = new RegExp(String.raw`(?<![\w$.])([A-Za-z_$][\w$]*)\s*:\s*${NUM}`, 'g');
const UNIT_PY = new RegExp(String.raw`(?<![\w.])([A-Za-z_][\w.]*)\s*=\s*${NUM}`, 'g');
const UNIT_SH = new RegExp(String.raw`(?:^|[\s;])(?:export\s+|local\s+|readonly\s+)?([A-Za-z_]\w*)=${NUM}`, 'g');
const UNIT_SH_DEFAULT = new RegExp(String.raw`\$\{([A-Za-z_]\w*):-${NUM}\}`, 'g');
const UNIT_CONF = new RegExp(String.raw`^\s*(?:-\s+)?([A-Za-z_][\w.-]*)\s*[:=]\s*${NUM}\s*(#.*)?$`);

const numValue = s => s.split('*').reduce((p, f) => p * Number(f.trim().replace(/_/g, '')), 1);

// Split one raw line into code / masked / comment. `state.block` carries a JS-family `/*` across lines.
// `//` is a comment unless preceded by `:` (URLs); `#` only in hash-comment languages (in shell-like
// files only at a word start, so `${#x}` / `$#` survive). String literals are single-line.
function splitLine(raw, style, hashAnywhere, state) {
  let code = '', masked = '', comment = '', q = null;
  for (let i = 0; i < raw.length;) {
    const c = raw[i];
    if (state.block) {
      const end = raw.indexOf('*/', i);
      if (end < 0) { comment += raw.slice(i); break; }
      comment += raw.slice(i, end + 2); i = end + 2; state.block = false;
      code += ' '; masked += ' ';
      continue;
    }
    if (q) {
      if (c === '\\') { const e = raw.slice(i, i + 2); code += e; masked += ' '.repeat(e.length); i += 2; continue; }
      code += c; masked += c === q ? c : ' ';
      if (c === q) q = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || (c === '`' && style === 'c')) { q = c; code += c; masked += c; i++; continue; }
    if (style === 'c') {
      if (c === '/' && raw[i + 1] === '/' && raw[i - 1] !== ':') { comment += raw.slice(i); break; }
      if (c === '/' && raw[i + 1] === '*') { state.block = true; comment += '/*'; i += 2; continue; }
    } else if (style === 'hash' && c === '#' && (hashAnywhere || i === 0 || /\s/.test(raw[i - 1]))) {
      comment += raw.slice(i); break;
    }
    code += c; masked += c; i++;
  }
  return { code, masked, comment };
}

export function scanCode(srcFiles) {
  const records = [];
  for (const { file, text } of srcFiles) {
    const style = C_STYLE.test(file) ? 'c' : (PY.test(file) || SH.test(file) || CONF.test(file)) ? 'hash' : 'none';
    const raws = text.split('\n');
    const state = { block: false };
    raws.forEach((raw, i) => {
      const { code, masked, comment } = splitLine(raw, style, PY.test(file), state);
      if (!code.trim()) return;
      const signal = code.trim().slice(0, 160);
      const emit = (kind, detail) => records.push({ file, line: i + 1, kind, rule: `ambiguity:${kind}`, signal, ...(detail ? { detail } : {}) });

      // falsy-default: `x || 3` / `x or 3` / `if (!count)`; never `?? 3` or a falsy/string default
      if (JS.test(file)) {
        if (FALSY_JS.test(masked)) emit('falsy-default');
        else if (FALSY_GUARD.test(masked)) emit('falsy-default', 'guard');
      } else if (PY.test(file) && FALSY_PY.test(masked)) emit('falsy-default');

      // sentinel: one in-band value for two states, unless documented on line i or line i-1 ONLY
      if (!INDEX_CALL.test(code) && (SENTINEL.test(masked) || SENTINEL_ZERO.test(masked))
        && !DOC_SENTINEL.test(raw) && !(i > 0 && DOC_SENTINEL.test(raws[i - 1]))) emit('sentinel');

      // unit: an unsuffixed time/size knob assigned a bare number; a same-line unit comment exempts
      if (UNIT_WORD.test(comment)) return;
      const names = [];
      // parenSkip: a match inside an open `(` (a call option such as `{ timeout: 30000 }`) is skipped.
      // Depth is tracked incrementally: re-counting the prefix per match was quadratic on bundles.
      const take = (re, s, { parenSkip = false } = {}) => {
        let depth = 0, pos = 0;
        for (const m of s.matchAll(re)) {
          if (parenSkip) {
            for (; pos < m.index; pos++) { if (s[pos] === '(') depth++; else if (s[pos] === ')') depth--; }
            if (depth > 0) continue;
          }
          if (isUnitName(m[1]) && numValue(m[2]) !== 0) names.push(m[1]);
        }
      };
      if (JS.test(file)) { take(UNIT_JS_DECL, masked); take(UNIT_JS_KEY, masked, { parenSkip: true }); }
      else if (PY.test(file)) take(UNIT_PY, masked, { parenSkip: true });
      else if (SH.test(file)) { take(UNIT_SH, code); take(UNIT_SH_DEFAULT, code); }
      else if (CONF.test(file)) {
        const m = UNIT_CONF.exec(raw);
        if (m && isUnitName(m[1]) && numValue(m[2]) !== 0) names.push(m[1]);
      }
      if (names.length) emit('unit', names[0]);
    });
  }
  return { records, stats: { files: srcFiles.length } };
}
