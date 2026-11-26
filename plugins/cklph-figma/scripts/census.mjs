#!/usr/bin/env node
// census.mjs: compare what a live page renders with the tokens in its DESIGN.md.
//
// Usage:
//   node census.mjs CENSUS.json --design-md DESIGN.md [--near N] [--min-share P] [--json]
//   node census.mjs --help
//
// CENSUS.json is the string census-collect.js returns when run in the page. The token
// check in design-md goes one way: is each token in the live CSS? This goes the other way:
// what does the page paint that is not a token?
//
// Findings, each with its share of the page (text by characters, backgrounds by area,
// borders by length, radius and spacing by element count):
//   off-token color   a painted color more than 2 Delta E from every token
//   near a token      an off-token color within --near Delta E (default 6) of a token,
//                     usually a hand-typed copy of it
//   near-duplicates   two off-token colors within --near of each other
//   off-token family  a font family no typography token names
//   off-scale size    a font size no typography token has (within 0.5px)
//   off-scale radius  only when DESIGN.md has `rounded` tokens
//   off-scale spacing only when DESIGN.md has `spacing` tokens
// A value under --min-share percent of its kind (default 0.5) is counted as rare, not a finding.
//
// Exit codes: 0 nothing off-token, 2 findings, 1 bad input.
// Node 22 or later, no dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { parseColor, composite, parseDesignMd } from './contrast.mjs';

const SAME = 2;

/** CIE Lab from an opaque sRGB color, D65. */
export function toLab({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return { L: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

/** CIE76 Delta E between two colors. */
export function deltaE(c1, c2) {
  const p = toLab(c1);
  const q = toLab(c2);
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

const hex = (c) => '#' + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');

/** px from "16px", "1.5rem", "1em" or a bare number. rem and em count as 16px. */
export function toPx(v) {
  const m = String(v).trim().match(/^(-?[\d.]+)\s*(px|rem|em)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
}

/** A family name for comparison: first in the stack, unquoted, lower case, without a variable-cut suffix. */
export function familyKey(stack) {
  return stack.split(',')[0].trim().replace(/^["']|["']$/g, '').replace(/\s+(variable|vf)$/i, '').toLowerCase();
}

/** The token sets a census is compared with. Unresolvable or non-color values are skipped. */
export function tokensFrom(tree) {
  const resolve = (v, seen = new Set()) => {
    const m = typeof v === 'string' && v.match(/^\{colors\.([^}]+)\}$/);
    if (!m) return v;
    if (seen.has(m[1])) return null;
    seen.add(m[1]);
    return resolve(tree.colors?.[m[1]], seen);
  };
  const colors = [];
  for (const [name, raw] of Object.entries(tree.colors || {})) {
    const c = parseColor(String(resolve(raw) ?? ''));
    if (c && c.a > 0) colors.push({ name, color: composite(c, { r: 255, g: 255, b: 255, a: 1 }) });
  }
  const families = new Set();
  const sizes = [];
  for (const t of Object.values(tree.typography || {})) {
    if (t && typeof t === 'object') {
      if (t.fontFamily) families.add(familyKey(String(t.fontFamily)));
      const s = toPx(t.fontSize ?? '');
      if (s != null) sizes.push(s);
    }
  }
  const scale = (obj) => Object.values(obj || {}).map(toPx).filter((n) => n != null);
  return { colors, families, sizes, rounded: scale(tree.rounded), spacing: scale(tree.spacing) };
}

const shares = (bucket = {}) => {
  const total = Object.values(bucket).reduce((a, b) => a + b, 0);
  return { total, rows: Object.entries(bucket).map(([value, w]) => ({ value, weight: w, share: total ? (100 * w) / total : 0 })) };
};

/**
 * Compare a census with the tokens.
 * @returns {{findings: object[], rare: object[], skipped: string[]}}
 */
export function analyze(census, tokens, { near = 6, minShare = 0.5 } = {}) {
  if (!census || typeof census.tally !== 'object') throw new Error('census JSON has no tally (run census-collect.js in the page)');
  const findings = [];
  const rare = [];
  const skipped = [];
  const keep = (f) => (f.share >= minShare ? findings : rare).push(f);
  const round = (n) => Math.round(n * 10) / 10;

  if (!tokens.colors.length) skipped.push('colors: DESIGN.md has no color tokens');
  else {
    for (const role of ['text', 'background', 'border']) {
      const { rows } = shares(census.tally[role]);
      const off = [];
      for (const row of rows) {
        const c = parseColor(row.value);
        if (!c || c.a === 0) continue;
        const flat = composite(c, { r: 255, g: 255, b: 255, a: 1 });
        let best = null;
        for (const t of tokens.colors) {
          const d = deltaE(flat, t.color);
          if (!best || d < best.d) best = { d, name: t.name };
        }
        if (best.d <= SAME) continue;
        const f = { kind: 'off-token color', role, value: hex(flat), share: round(row.share), color: flat };
        if (c.a < 1) f.note = `alpha ${c.a}, judged over white`;
        if (best.d <= near) f.near = `${best.name} (Delta E ${round(best.d)})`;
        off.push(f);
        keep(f);
      }
      for (let i = 0; i < off.length; i++) {
        for (let j = i + 1; j < off.length; j++) {
          const d = deltaE(off[i].color, off[j].color);
          if (d <= near) keep({ kind: 'near-duplicates', role, value: `${off[i].value} and ${off[j].value}`, share: round(off[i].share + off[j].share), deltaE: round(d) });
        }
      }
    }
  }

  if (!tokens.families.size) skipped.push('families: DESIGN.md has no typography fontFamily');
  else for (const row of shares(census.tally.family).rows) {
    if (!tokens.families.has(familyKey(row.value))) keep({ kind: 'off-token family', value: row.value, share: round(row.share) });
  }

  const offScale = (kind, bucket, scale, label, tol) => {
    if (!scale.length) return skipped.push(`${label}: DESIGN.md has no ${label} tokens`);
    for (const row of shares(bucket).rows) {
      const v = parseFloat(row.value);
      if (!scale.some((s) => Math.abs(s - v) <= tol)) keep({ kind, value: `${row.value}px`, share: round(row.share) });
    }
  };
  offScale('off-scale size', census.tally.fontSize, tokens.sizes, 'font size', 0.5);
  offScale('off-scale radius', census.tally.radius, tokens.rounded, 'rounded', 0.5);
  offScale('off-scale spacing', census.tally.spacing, tokens.spacing, 'spacing', 0.5);

  const order = (a, b) => b.share - a.share;
  for (const list of [findings, rare]) {
    list.sort(order);
    for (const f of list) delete f.color;
  }
  return { findings, rare, skipped };
}

function report({ findings, rare, skipped }, census) {
  const lines = [`census: ${census.url ?? '(no url)'} at ${census.viewport?.width ?? '?'}px`];
  if (findings.length) {
    lines.push(`Not a token (${findings.length}):`);
    for (const f of findings) {
      const extra = [f.role, f.near && `near ${f.near}`, f.deltaE != null && `Delta E ${f.deltaE}`, f.note].filter(Boolean).join(', ');
      lines.push(`  ${f.kind}: ${f.value}  ${f.share}%${extra ? `  (${extra})` : ''}`);
    }
  }
  if (rare.length) lines.push(`Rare (under the share cut, not findings): ${rare.length}`);
  for (const s of skipped) lines.push(`Not checked: ${s}`);
  lines.push(findings.length ? `${findings.length} findings.` : 'Nothing off-token at this width.');
  return lines.join('\n');
}

function usage() {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n');
  return src.slice(1, src.findIndex((l) => l.startsWith('import'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n').trim();
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return 0;
  }
  const opts = { near: 6, minShare: 0.5 };
  let file = null;
  let design = null;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--design-md') design = argv[++i];
    else if (a === '--near') opts.near = Number(argv[++i]);
    else if (a === '--min-share') opts.minShare = Number(argv[++i]);
    else if (a === '--json') json = true;
    else if (!a.startsWith('--') && !file) file = a;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!file || !design) throw new Error('need CENSUS.json and --design-md DESIGN.md (see --help)');
  if (!Number.isFinite(opts.near) || !Number.isFinite(opts.minShare)) throw new Error('--near and --min-share take numbers');
  let census = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof census === 'string') census = JSON.parse(census);
  const result = analyze(census, tokensFrom(parseDesignMd(fs.readFileSync(design, 'utf8'))), opts);
  console.log(json ? JSON.stringify({ url: census.url, viewport: census.viewport, ...result }, null, 2) : report(result, census));
  return result.findings.length ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`census: ${e.message}`);
    process.exitCode = 1;
  }
}
