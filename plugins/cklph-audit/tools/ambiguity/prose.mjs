// prose.mjs: `ambiguity.sh prose` (SPEC-v4-ambiguity.md §3.4). Pure: works on {file,text} lists
// handed in by main.mjs; never touches the filesystem, process.env or stdout.
//
// Markdown → units (paragraphs, list items with their continuation lines, table rows) → sentences
// → kinds (scope, vague-conditional, unit, normative). Headings are context, never units. Each
// sentence reports its OWN starting line through an offset→line map kept per unit.
import { codeSpanRanges, docClass, isUnitName, UNIT_WORD } from './common.mjs';

const SCOPE = /\b(out of scope|out-of-scope|in scope|in-scope|not in scope|excluded|exclusions?|not covered|does not (?:cover|apply)|do not (?:cover|apply)|applies only|only applies|not eligible|ineligible|qualif(?:y|ies) for)\b/gi;
const SCOPE_HEADING = /\b(scope|exclusions?|excluded|not covered|ineligible|eligib|qualifying)/i;
// policy docs only: in instruction docs "unless" is ordinary grammar
const EXCEPT = /\b(except(?: for| when| where| if)?|unless|excluding|other than|apart from)\b/gi;
const COND = /\b(if|when|unless|where|once|until)\b/gi;
const VAGUE = /\b(appropriate(?:ly)?|reasonabl[ey]|significant(?:ly)?|as needed|if necessary|where possible|when possible|as appropriate|sufficient(?:ly)?|timely|promptly|soon|quickly|recent(?:ly)?|stale|mostly|large|small|many|few|several|frequently|often|rarely|relevant|and\/or|and so on|or similar|etc\.?)\b/gi;
const QTY = /\b(timeouts?|ttl|delay|interval|limits?|max(?:imum)?|min(?:imum)?|budget|size|retention|expir(?:y|es|ation)|duration|threshold|cap|retries|wait|within|after|every)\b/gi;
const NORM_UP = /\b(MUST(?: NOT)?|SHALL(?: NOT)?|SHOULD(?: NOT)?|REQUIRED|MAY)\b/g;
const NORM_LO = /\b(must(?: not)?|never|always|do not|don['’]t|required)\b/gi;

// Placeholders, same length as what they replace, so masked text and signal text stay aligned.
const CODE = '';   // every char of a code span
const DOT = '';    // a protected `.` (abbreviation or decimal)
// a number that is not part of `HTTP/2`, `v1.2`, `x-3` or a word; `5,000` is ONE number (§15)
const NUMBER = new RegExp(`(?<![\\w/.\\-${DOT}])(?:\\d{1,3}(?:,\\d{3})+(?!\\d)|\\d+)(?:${DOT}\\d+)?`, 'g');
const AFTER_NUMBER = new RegExp(`^\\)?\\s*(?:$|[.,;:!?)\\]"'${DOT}]|(?:and|or|to|before|after|by|for|then|is|are|was)\\b)`, 'i');
const SPLIT = new RegExp(`(?<=[.!?])(["')\\]]*)\\s+(?=[A-Z0-9"'*_(\\[${CODE}])`, 'g');

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const ATX = /^\s{0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT = /^\s{0,3}(=+|-+)[ \t]*$/;
const THEMATIC = /^\s{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const ITEM = /^\s*(?:[-*+]|\d{1,9}[.)])[ \t]+(\S.*)$/;
const isSeparator = l => l.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l);

const uniq = xs => [...new Set(xs)];
const matches = (re, s) => [...s.matchAll(re)].map(m => m[0].toLowerCase());

// cells of a table row: outer pipes dropped; split on `|` that is not escaped and not in a code span
function splitCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '', tick = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (c === '`') tick = !tick;
    if (c === '|' && !tick) { cells.push(cur); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

// Markdown → units: { kind: 'para'|'item'|'row', text, map: [[offset, line]], headings, cells? }
function toUnits(text, cls) {
  const body = cls === 'instruction' ? text : text.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ''));
  const lines = body.split('\n').map(l => l.replace(/^\s{0,3}(?:>[ \t]?)+/, ''));
  let start = 0;
  if (/^---\s*$/.test(lines[0] ?? '')) {
    const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0) start = end + 1;
  }
  // fences: close only on the same char at >= the opening length
  const fence = new Array(lines.length).fill(false);
  let open = null;
  for (let i = start; i < lines.length; i++) {
    const m = FENCE.exec(lines[i]);
    if (open) {
      fence[i] = true;
      if (m && m[1][0] === open[0] && m[1].length >= open.length && /^\s{0,3}[`~]+\s*$/.test(lines[i])) open = null;
    } else if (m) { open = m[1]; fence[i] = true; }
  }
  // tables: a header line followed by a separator, then rows until a blank or pipe-less line
  const row = new Array(lines.length).fill(false), sep = new Array(lines.length).fill(false);
  for (let i = start; i + 1 < lines.length; i++) {
    if (fence[i] || fence[i + 1] || row[i] || !lines[i].includes('|') || isSeparator(lines[i]) || !isSeparator(lines[i + 1])) continue;
    row[i] = true; sep[i + 1] = true;
    for (let r = i + 2; r < lines.length && !fence[r] && lines[r].trim() && lines[r].includes('|'); r++) row[r] = true;
  }

  const units = [], stack = [];
  let cur = null;
  const close = () => { if (cur) units.push(cur); cur = null; };
  const add = (i, content) => {
    if (cur.text) cur.text += ' ';
    cur.map.push([cur.text.length, i + 1]);
    cur.text += content;
  };
  const begin = (kind, i, content) => { close(); cur = { kind, text: '', map: [], headings: stack.map(h => h.text) }; add(i, content); };
  const pushHeading = (level, txt) => {
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, text: txt.trim() });
  };
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (fence[i]) { close(); continue; }
    if (sep[i]) continue;
    if (row[i]) {
      close();
      const cells = splitCells(l);
      units.push({ kind: 'row', text: cells.join(' | '), map: [[0, i + 1]], headings: stack.map(h => h.text), cells, raw: l });
      continue;
    }
    if (!l.trim()) { close(); continue; }
    const atx = ATX.exec(l);
    if (atx) { close(); pushHeading(atx[1].length, atx[2] ?? ''); continue; }
    if (cur?.kind === 'para' && SETEXT.test(l)) {   // the open paragraph was a setext heading
      const txt = cur.text; cur = null;
      pushHeading(l.trim()[0] === '=' ? 1 : 2, txt);
      continue;
    }
    if (THEMATIC.test(l)) { close(); continue; }
    const item = ITEM.exec(l);
    if (item) { begin('item', i, item[1].trim()); continue; }
    if (cur) add(i, l.trim());
    else begin('para', i, l.trim());
  }
  close();
  return units;
}

// Unit text → { plain, masked, src }: links reduced to their text (outside code spans), code spans
// masked with same-length placeholders, abbreviations and decimals protected. plain and masked are
// aligned char for char; src[k] is the offset in the unit text, for the line map. O(n): code spans
// come from the linear codeSpanRanges, and the link regex runs on a copy with span chars blanked.
const LINK = /!?\[([^\]]*)\]\([^)]*\)/g;
function prepare(text) {
  const inSpan = new Uint8Array(text.length);
  for (const [a, b] of codeSpanRanges(text)) inSpan.fill(1, a, b);
  let probe = '';   // UTF-16 units, so indexes match inSpan and text[k]
  for (let k = 0; k < text.length; k++) probe += inSpan[k] ? CODE : text[k];
  let plain = '', masked = '';
  const src = [];
  const copy = (a, b) => { for (let k = a; k < b; k++) { plain += text[k]; masked += inSpan[k] ? CODE : text[k]; src.push(k); } };
  let last = 0;
  for (const m of probe.matchAll(LINK)) {
    copy(last, m.index);
    const t = m.index + m[0].indexOf('[') + 1;
    copy(t, t + m[1].length);
    last = m.index + m[0].length;
  }
  copy(last, text.length);
  masked = masked
    .replace(/(?<![\w.])(?:e\.g\.|i\.e\.|etc\.|vs\.|cf\.|approx\.|incl\.)/gi, m => m.replace(/\./g, DOT))
    .replace(/(?<![\w.])(?:No\.|Fig\.)/g, m => m.replace(/\./g, DOT))
    .replace(/(?<=\d)\.(?=\d)/g, DOT);
  return { plain, masked, src };
}

function sentences(unit) {
  const { plain, masked, src } = prepare(unit.text);
  // binary search: the last map entry whose offset is <= off (a linear scan per sentence was quadratic)
  const lineOf = off => {
    let lo = 0, hi = unit.map.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (unit.map[mid][0] <= off) lo = mid; else hi = mid - 1; }
    return unit.map[lo][1];
  };
  const out = [];
  const push = (s, e) => {
    while (s < e && /\s/.test(masked[s])) s++;
    while (e > s && /\s/.test(masked[e - 1])) e--;
    if (s < e) out.push({ masked: masked.slice(s, e), signal: plain.slice(s, e).slice(0, 240), line: lineOf(src[s]) });
  };
  let s = 0;
  for (const m of masked.matchAll(SPLIT)) { push(s, m.index + m[1].length); s = m.index + m[0].length; }
  push(s, masked.length);
  return { list: out, plain };
}

// §3.4 unit kind on one sentence: a quantity noun within 24 chars before a nonzero number that is
// followed by end, punctuation or a connective (skipping at most one `)`).
function unitTerms(s) {
  for (const n of s.matchAll(NUMBER)) {
    if (Number(n[0].replace(DOT, '.').replace(/,/g, '')) === 0) continue;
    if (!AFTER_NUMBER.test(s.slice(n.index + n[0].length))) continue;
    const nouns = [...s.slice(0, n.index).matchAll(QTY)].filter(q => q.index >= n.index - 24);
    if (nouns.length) return uniq([...nouns.map(q => q[0].toLowerCase()), n[0].replace(DOT, '.')]);
  }
  return null;
}

// §3.4 config-table row: first cell passes the §3.6 unit-name test, some cell is a bare nonzero
// number, and no unit word appears anywhere in the row.
function configRow(unit) {
  const name = unit.cells[0].replace(/`/g, '').toLowerCase().replace(/[._-]/g, '');
  if (!name || !isUnitName(name) || UNIT_WORD.test(unit.raw)) return null;
  const num = unit.cells.slice(1).map(c => c.replace(/`/g, '').trim()).find(c => /^\d+(?:\.\d+)?$/.test(c) && Number(c) !== 0);
  return num ? [unit.cells[0].replace(/`/g, ''), num] : null;
}

export function scanProse(docFiles, { allSites = false } = {}) {
  const records = [];
  let nSentences = 0, nNormative = 0;
  for (const { file, text } of docFiles) {
    const cls = docClass(file);
    for (const unit of toUnits(text, cls)) {
      const heading = unit.headings[unit.headings.length - 1] ?? '';
      const headingTerms = unit.headings.map(h => SCOPE_HEADING.exec(h)?.[0].toLowerCase()).filter(Boolean);
      const emit = (line, kind, rule, signal, terms) => records.push({ file, line, kind, rule, docClass: cls, heading, signal, terms: uniq(terms) });
      const { list, plain } = sentences(unit);
      let rowUnit = false;
      for (const s of list) {
        nSentences++;
        const m = s.masked;
        const scope = [...matches(SCOPE, m), ...headingTerms, ...(cls === 'policy' ? matches(EXCEPT, m) : [])];
        if (scope.length) emit(s.line, 'scope', 'ambiguity:scope-clause', s.signal, scope);
        const cond = matches(COND, m), vague = matches(VAGUE, m);
        if (cond.length && vague.length) emit(s.line, 'vague-conditional', 'ambiguity:vague-conditional', s.signal, [...cond, ...vague]);
        const unitHit = unitTerms(m);
        if (unitHit) { emit(s.line, 'unit', 'ambiguity:unit', s.signal, unitHit); rowUnit = true; }
        const norm = [...matches(NORM_UP, m), ...matches(NORM_LO, m)];
        if (norm.length) {
          nNormative++;
          if (allSites) emit(s.line, 'normative', 'ambiguity:site', s.signal, norm);
        }
      }
      if (unit.kind === 'row' && !rowUnit) {
        const hit = configRow(unit);
        if (hit) emit(unit.map[0][1], 'unit', 'ambiguity:unit', plain.trim().slice(0, 240), hit);
      }
    }
  }
  return { records, stats: { files: docFiles.length, sentences: nSentences, normative: nNormative } };
}
