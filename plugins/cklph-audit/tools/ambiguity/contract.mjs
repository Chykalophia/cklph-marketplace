// contract.mjs: `ambiguity.sh contract` (SPEC-v4-ambiguity.md §3.5). Pure: works on {file,text}
// lists handed in by main.mjs; never touches the filesystem, process.env or stdout.
//
// A doc that prescribes value V for field F, where V is outside the allowed set for F that the
// doc's linked schemas define, is a `contract-mismatch` record. Allowed(F) = union of every
// same-named enum under the doc's package root plus enums in files the doc names by basename (D6).

import { codeSpanRanges } from './common.mjs';

const GENERIC = new Set(['type', 'kind', 'mode', 'format', 'name', 'id', 'version', 'level', 'lang', 'language', 'method']);
const SKIP = new Set(('see same varies depends context per as the a an any all very usually typically either both tbd n na by '
  + 'from set only one each no not never').split(' '));
const DOC_EXT = /\.(mdx?|mdc)$/i;   // .mdc = Cursor rules (markdown with front matter)
const VIA_ORDER = ['table-header', 'table-inferred', 'inline-assign', 'inline-connector', 'inline-prefix', 'inline-list'];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isGeneric = f => GENERIC.has(f.toLowerCase());
const dirOf = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseOf = p => p.slice(p.lastIndexOf('/') + 1);
const asc = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}
function lineAt(starts, index) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1; }
  return lo + 1;
}

const STR_LIT = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
function stringValues(body) {
  const out = [];
  for (const m of body.matchAll(STR_LIT)) out.push(m[1] ?? m[2]);
  return out;
}
const onlyStrings = body => body.replace(STR_LIT, '').replace(/[\s,]/g, '') === '';

// ── schema enum harvest (H1, H2, H3, H5) ──────────────────────────────────────
const H1 = /(['"]?)([A-Za-z_][\w-]*)\1\s*:\s*\{[^{}]*?\benum['"]?\s*:\s*\[([^\]]*)\]/g;
const H2 = /([A-Za-z_]\w*)\s*:\s*z\.enum\(\s*\[([^\]]*)\]/g;
const LIT = `(?:'[^'\\\\\\n]*'|"[^"\\\\\\n]*")`;
const H3_FIELD = new RegExp(`([A-Za-z_]\\w*)\\??\\s*:\\s*(${LIT}(?:\\s*\\|\\s*${LIT})+)`, 'g');
const H3_ALIAS = new RegExp(`\\btype\\s+(\\w+)\\s*=\\s*(${LIT}(?:\\s*\\|\\s*${LIT})+)`, 'g');
const H5_FIELD = /(['"]?)([A-Za-z_][\w-]*)\1\s*:\s*\{[^{}]*?\benum['"]?\s*:\s*([A-Za-z_$][\w$]*)\b/g;
const H5_CONST = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*\[([^\]]*)\]/g;

function harvest(schemaFiles) {
  const enums = [];
  schemaFiles.forEach(({ file, text }, order) => {
    const starts = lineStarts(text);
    const add = (field, values, index) => {
      const vals = [...new Set(values)];
      if (vals.length >= 2) enums.push({ field, values: vals, file, order, line: lineAt(starts, index) });
    };
    for (const m of text.matchAll(H1)) add(m[2], stringValues(m[3]), m.index + m[1].length);
    for (const m of text.matchAll(H2)) add(m[1], stringValues(m[2]), m.index);
    for (const m of text.matchAll(H3_FIELD)) add(m[1], stringValues(m[2]), m.index);
    for (const m of text.matchAll(H3_ALIAS)) add(m[1][0].toLowerCase() + m[1].slice(1), stringValues(m[2]), m.index + m[0].indexOf(m[1], 4));
    const consts = new Map();
    for (const m of text.matchAll(H5_CONST)) if (!consts.has(m[1]) && onlyStrings(m[2])) consts.set(m[1], stringValues(m[2]));
    for (const m of text.matchAll(H5_FIELD)) if (consts.has(m[3])) add(m[2], consts.get(m[3]), m.index + m[1].length);
  });
  // first (sorted) location wins: walk order of the file, then line
  return enums.sort((a, b) => (a.order - b.order) || (a.line - b.line));
}

// ── doc helpers ───────────────────────────────────────────────────────────────
// HTML comments removed, newlines kept, so line numbers survive.
const stripHtmlComments = t => t.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ''));

function fenceMap(lines) {
  const inFence = new Array(lines.length).fill(false);
  let open = null;
  lines.forEach((l, i) => {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(l);
    if (open) {
      if (m && m[1][0] === open[0] && m[1].length >= open.length && /^\s{0,3}[`~]+\s*$/.test(l)) open = null;
      else inFence[i] = true;
    } else if (m) open = m[1];
  });
  return inFence;
}

const codeSpans = codeSpanRanges;
const inSpan = (spans, i) => spans.some(([a, b]) => i > a && i < b);

const isSeparator = l => l.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l);

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

// Lead token (D2): strip leading whitespace/_`"'* and take ^[A-Za-z][\w-]* only when followed by
// end, whitespace or , ; ( ) ` " ' * _ (never : / . so `CWE-89`, `agentcfg:x` are not values).
function leadToken(cell) {
  const m = /^[\s_`"'*]*([A-Za-z][\w-]*)(?![\w-])(?=$|[\s,;()`"'*_])/.exec(cell);
  return m ? m[1] : null;
}

// ── main entry ────────────────────────────────────────────────────────────────
export function scanContract({ schemaFiles, docFiles, packageMarkers }) {
  const enums = harvest(schemaFiles);
  const fields = [...new Set(enums.map(e => e.field))].sort(asc);
  const stats = { enums: enums.length, fields, docs: docFiles.length };
  if (!enums.length) return { records: [], stats };

  const pkgDirs = new Set((packageMarkers ?? []).map(m => {
    const d = dirOf(m);
    return /(^|\/)\.claude-plugin\/plugin\.json$/.test(m) ? dirOf(d) : d;
  }));
  const pkgRoot = file => {
    for (let d = dirOf(file); ; d = dirOf(d)) { if (pkgDirs.has(d)) return d; if (d === '') return ''; }
  };
  const schemaBases = [...new Set(enums.map(e => baseOf(e.file)))];

  const records = [];
  for (const { file, text } of docFiles) {
    const isMd = DOC_EXT.test(file);
    const body = isMd ? stripHtmlComments(text) : text;
    const mentioned = new Set(schemaBases.filter(b => new RegExp(`(?<![\\w-])${esc(b)}(?!\\w)`).test(body)));
    const pkg = pkgRoot(file);
    const linked = enums.filter(e => pkg === '' || e.file.startsWith(pkg + '/') || mentioned.has(baseOf(e.file)));
    if (!linked.length) continue;

    // allowed(F): union, values in first-location order; schema = first sorted location
    const byField = new Map();
    for (const e of linked) {
      let f = byField.get(e.field);
      if (!f) byField.set(e.field, f = { values: [], allowed: new Set(), schema: `${e.file}:${e.line}`, bases: new Set() });
      for (const v of e.values) if (!f.allowed.has(v.toLowerCase())) { f.allowed.add(v.toLowerCase()); f.values.push(v); }
      f.bases.add(baseOf(e.file));
    }
    const matchable = [...byField.keys()].filter(f => !isGeneric(f)).sort(asc);
    if (!matchable.length) continue;

    const lowerBody = body.toLowerCase();
    const anchorCache = new Map();
    const anchored = F => {
      if (!anchorCache.has(F)) {
        const f = byField.get(F);
        const quoted = [...f.allowed].filter(v => lowerBody.includes('`' + v + '`') || lowerBody.includes('"' + v + '"') || lowerBody.includes("'" + v + "'"));
        anchorCache.set(F, quoted.length >= 2 || [...f.bases].some(b => mentioned.has(b)));
      }
      return anchorCache.get(F);
    };

    const lines = body.split('\n');
    const fence = isMd ? fenceMap(lines) : lines.map(() => false);
    const seen = new Map();
    const emit = (F, raw, i, via) => {
      const v = String(raw).toLowerCase();
      const f = byField.get(F);
      if (f.allowed.has(v) || !/^[a-z][a-z0-9-]+$/.test(v) || SKIP.has(v) || v === F.toLowerCase()) return;
      if (via.startsWith('inline') && !anchored(F)) return;
      const key = `${i}\0${F}\0${v}`;
      const rec = {
        file, line: i + 1, kind: 'contract-mismatch', rule: 'ambiguity:contract-mismatch', field: F, value: v,
        allowed: [...f.values],
        alsoValidFor: matchable.filter(g => g !== F && byField.get(g).allowed.has(v)),
        schema: f.schema, via, inFence: fence[i], signal: lines[i].trim().slice(0, 240),
      };
      const prev = seen.get(key);
      if (!prev || VIA_ORDER.indexOf(via) < VIA_ORDER.indexOf(prev.via)) seen.set(key, rec);
    };

    const inlineForms = (seg, i, { codeDoc = false } = {}) => {
      const spans = codeSpans(seg);
      for (const F of matchable) {
        const fe = esc(F);
        if (!codeDoc) {
          // D3 inline-assign: quoted value, or inside a code span, or inside a fence
          for (const m of seg.matchAll(new RegExp(`["']?\\b${fe}\\b["']?\\s*[:=]\\s*(["'\`]?)([A-Za-z][\\w-]*)\\1`, 'g'))) {
            if (m[1] || fence[i] || inSpan(spans, m.index)) emit(F, m[2], i, 'inline-assign');
          }
          // D4 inline-connector, post-field and prefix forms (case-insensitive)
          for (const m of seg.matchAll(new RegExp(`\\b${fe}\\b\`?\\s*(→|->|\\bto\\b|\\bof\\b|\\bat\\b|\\bas\\b|\\bis\\b|\\bequals?\\b)\\s*[\`"']([A-Za-z][\\w-]*)[\`"']`, 'gi'))) emit(F, m[2], i, 'inline-connector');
          for (const m of seg.matchAll(new RegExp(`\\b(at|to|as|with)\\s+\`?${fe}\\b\`?\\s+[\`"']([A-Za-z][\\w-]*)[\`"']`, 'gi'))) emit(F, m[2], i, 'inline-connector');
          // D5 inline-prefix: `v` F
          for (const m of seg.matchAll(new RegExp(`[\`"']([a-z][\\w-]*)[\`"']\\s+\`?${fe}\\b`, 'g'))) emit(F, m[1], i, 'inline-prefix');
        }
        // D6 inline-list: F (∈|(|=|:|in|one of) V sep V ...; code-file string text uses `|` only
        const V = '[`"\']?[a-z][\\w-]*[`"\']?';
        const sep = codeDoc ? '\\|' : '(?:\\||/)';
        for (const m of seg.matchAll(new RegExp(`\\b${fe}\\b\`?\\s*(?:∈|\\(|=|:|\\bin\\b|\\bone of\\b)\\s*(${V}(?:\\s*${sep}\\s*${V})+)`, 'g'))) {
          for (const el of m[1].split(new RegExp(`\\s*${sep}\\s*`))) emit(F, el.replace(/[`"']/g, ''), i, 'inline-list');
        }
      }
    };

    if (!isMd) {
      // code file selected as a doc: only its string literal text, only D6 with `|` separators
      lines.forEach((l, i) => { for (const m of l.matchAll(STR_LIT)) inlineForms(m[1] ?? m[2], i, { codeDoc: true }); });
    } else {
      const tableLine = new Array(lines.length).fill(false);
      for (let s = 1; s < lines.length; s++) {
        if (!isSeparator(lines[s]) || !lines[s - 1].includes('|') || isSeparator(lines[s - 1])) continue;
        const header = splitCells(lines[s - 1]);
        const rows = [];
        for (let r = s + 1; r < lines.length && lines[r].trim() && lines[r].includes('|'); r++) rows.push(r);
        tableLine[s - 1] = tableLine[s] = true;
        rows.forEach(r => { tableLine[r] = true; });
        const cells = rows.map(r => splitCells(lines[r]));
        for (let c = 0; c < header.length; c++) {
          const col = rows.map((r, k) => ({ i: r, lead: cells[k][c] == null ? null : leadToken(cells[k][c]) })).filter(x => x.lead);
          // D1 table-header: header cell (minus ` * _) names F
          const name = header[c].replace(/[`*_]/g, '').trim().toLowerCase();
          const byHeader = matchable.find(F => F.toLowerCase() === name);
          if (byHeader) { col.forEach(x => emit(byHeader, x.lead, x.i, 'table-header')); continue; }
          // D2 table-inferred: >=3 lead tokens in allowed(F), >=2 distinct, >= half the column, unique best F
          let best = null, bestN = 0, tie = false;
          for (const F of matchable) {
            const hits = col.filter(x => byField.get(F).allowed.has(x.lead.toLowerCase()));
            const n = hits.length;
            if (n < 3 || new Set(hits.map(x => x.lead.toLowerCase())).size < 2 || n * 2 < col.length) continue;
            if (n > bestN) { best = F; bestN = n; tie = false; } else if (n === bestN) tie = true;
          }
          if (best && !tie) col.forEach(x => emit(best, x.lead, x.i, 'table-inferred'));
        }
      }
      lines.forEach((l, i) => {
        if (tableLine[i]) splitCells(l).forEach(cell => inlineForms(cell, i));
        else inlineForms(l, i);
      });
    }
    records.push(...seen.values());
  }
  return { records, stats };
}
