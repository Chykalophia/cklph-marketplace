#!/usr/bin/env node
// contrast.mjs: WCAG 2.x contrast check for text and UI color pairs, with alpha.
//
// Usage:
//   node contrast.mjs PAIRS.json [--canvas COLOR] [--json]
//   node contrast.mjs --design-md DESIGN.md [--canvas COLOR] [--json]
//   node contrast.mjs --help
//
// PAIRS.json is an array of pairs:
//   [{ "name": "badge-gold", "fg": "#b5681f", "bg": "#fdecd3",
//      "canvas": "#ffffff", "size": "normal" }]
//   size is "normal" (needs 4.5:1), "large" (3:1) or "ui" (3:1, for edges and icons).
//   size defaults to "normal". canvas is optional.
//
// --design-md reads every component in a DESIGN.md that has both textColor and
// backgroundColor, and resolves {colors.x} references. A component is large text
// when its typography reference has fontSize >= 24px, or >= 18.66px at weight 700+.
// Otherwise it is normal text. rem and em count as 16px.
//
// Colors: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba() (comma or space
// syntax, alpha as a number or percent), oklch() and "transparent".
// Alpha: the background is composited over the canvas, then the text over the
// result. The canvas is the page behind both, and defaults to #ffffff. --canvas
// sets it for every pair that does not name its own.
//
// YAML subset read from DESIGN.md: the front matter and any ```yaml blocks.
// Nested maps by space indentation, plain or quoted scalars, and # comments.
// List items and block scalars (| or >) are skipped. Flow style ({} or []) stays
// a raw string.
//
// --json prints { pass, results: [...] } instead of a table.
// Exit codes: 0 every pair passes, 2 any pair fails, 1 bad input.
// Node 22 or later, no dependencies.

import fs from 'node:fs';
import path from 'node:path';

/** Minimum ratio per size. "ui" is WCAG 1.4.11 non-text contrast. */
export const THRESHOLDS = Object.freeze({ normal: 4.5, large: 3, ui: 3 });

const clampByte = (n, src) => {
  if (!Number.isFinite(n) || n < 0 || n > 255) throw new Error(`color channel out of range in "${src}"`);
  return n;
};

const parseAlpha = (s, src) => {
  const a = s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s);
  if (!Number.isFinite(a) || a < 0 || a > 1) throw new Error(`alpha out of range in "${src}"`);
  return a;
};

/**
 * Parse a CSS color string into { r, g, b, a } with channels 0-255 and alpha 0-1.
 * Throws on any format it does not support.
 */
export function parseColor(input) {
  if (typeof input !== 'string') throw new Error(`color must be a string, got ${JSON.stringify(input)}`);
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const byte = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: byte(0), g: byte(2), b: byte(4), a: h.length === 8 ? byte(6) / 255 : 1 };
  }

  const fn = /^rgba?\(\s*([^)]*)\)$/.exec(s);
  if (fn) {
    const body = fn[1].trim();
    let parts;
    let alpha;
    if (body.includes(',')) {
      parts = body.split(',').map((p) => p.trim());
      if (parts.length === 4) alpha = parts.pop();
    } else {
      const [rgb, a] = body.split('/').map((p) => p.trim());
      parts = rgb.split(/\s+/);
      alpha = a;
    }
    if (parts.length !== 3) throw new Error(`cannot read color "${input}"`);
    const [r, g, b] = parts.map((p) => {
      const n = p.endsWith('%') ? (Number(p.slice(0, -1)) / 100) * 255 : Number(p);
      return clampByte(n, input);
    });
    return { r, g, b, a: alpha === undefined ? 1 : parseAlpha(alpha, input) };
  }

  const ok = /^oklch\(\s*([^)]*)\)$/.exec(s);
  if (ok) {
    const [lch, alpha] = ok[1].split('/').map((p) => p.trim());
    const parts = lch.split(/\s+/);
    if (parts.length !== 3) throw new Error(`cannot read color "${input}"`);
    const L = parts[0].endsWith('%') ? Number(parts[0].slice(0, -1)) / 100 : Number(parts[0]);
    const C = Number(parts[1]);
    const h = (Number(parts[2].replace(/deg$/, '')) * Math.PI) / 180;
    if (![L, C, h].every(Number.isFinite)) throw new Error(`cannot read color "${input}"`);
    return { ...oklabToSrgb(L, C * Math.cos(h), C * Math.sin(h)), a: alpha === undefined ? 1 : parseAlpha(alpha, input) };
  }

  throw new Error(`unsupported color "${input}" (use hex, rgb(), rgba() or oklch())`);
}

// Matrices from https://bottosson.github.io/posts/oklab/ (OKLab to linear sRGB).
// Out-of-gamut channels are clipped, which is close to but not exactly CSS gamut mapping.
function oklabToSrgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const encode = (v) => {
    const c = Math.min(1, Math.max(0, v));
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  };
  return {
    r: encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/**
 * Paint `top` over `bottom` in sRGB, the way browsers blend. The result is opaque
 * when `bottom` is opaque.
 */
export function composite(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t, b) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

/** WCAG 2.x relative luminance of an opaque color. */
export function relativeLuminance({ r, g, b }) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two opaque colors, from 1 to 21. Alpha is ignored here. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Check one pair. Composites bg over canvas and fg over that, then compares the
 * ratio with the threshold for `size`. Throws on bad colors or an unknown size.
 * Returns { name, fg, bg, canvas, size, ratio, required, pass }.
 */
export function checkPair(pair, defaultCanvas = '#ffffff') {
  if (!pair || typeof pair !== 'object') throw new Error('each pair must be an object');
  const name = String(pair.name ?? '(unnamed)');
  const size = pair.size ?? 'normal';
  if (!Object.hasOwn(THRESHOLDS, size)) throw new Error(`${name}: size must be normal, large or ui, got ${JSON.stringify(size)}`);
  const canvasStr = pair.canvas ?? defaultCanvas;
  let fg, bg, canvas;
  try {
    fg = parseColor(pair.fg);
    bg = parseColor(pair.bg);
    canvas = composite(parseColor(canvasStr), { r: 255, g: 255, b: 255, a: 1 });
  } catch (err) {
    throw new Error(`${name}: ${err.message}`);
  }
  const effectiveBg = composite(bg, canvas);
  const effectiveFg = composite(fg, effectiveBg);
  const ratio = contrastRatio(effectiveFg, effectiveBg);
  const required = THRESHOLDS[size];
  return { name, fg: pair.fg, bg: pair.bg, canvas: canvasStr, size, ratio, required, pass: ratio >= required };
}

const unquote = (raw) => {
  if (raw.startsWith('"')) {
    const end = raw.lastIndexOf('"');
    if (end <= 0) throw new Error(`unterminated string: ${raw}`);
    return JSON.parse(raw.slice(0, end + 1));
  }
  if (raw.startsWith("'")) {
    const end = raw.lastIndexOf("'");
    if (end <= 0) throw new Error(`unterminated string: ${raw}`);
    return raw.slice(1, end).replaceAll("''", "'");
  }
  return raw.replace(/\s+#.*$/, '').trim();
};

function parseYamlSubset(text) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  let skipDeeperThan = null;
  for (const [i, line] of text.split('\n').entries()) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s*\t/.test(line)) throw new Error(`YAML line ${i + 1}: tabs are not allowed for indentation`);
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    if (skipDeeperThan !== null) {
      if (indent > skipDeeperThan || (indent === skipDeeperThan && body.startsWith('-'))) continue;
      skipDeeperThan = null;
    }
    if (body.startsWith('-')) {
      skipDeeperThan = indent;
      continue;
    }
    const m = /^("[^"]*"|'[^']*'|[^:]+?)\s*:(?:\s+(.*))?$/.exec(body);
    if (!m) throw new Error(`YAML line ${i + 1}: cannot read "${body}"`);
    const key = /^["']/.test(m[1]) ? m[1].slice(1, -1) : m[1];
    while (stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).obj;
    const value = (m[2] ?? '').trim();
    if (value === '' || value.startsWith('#')) {
      parent[key] = {};
      stack.push({ indent, obj: parent[key] });
    } else if (/^[|>][-+0-9]*$/.test(value)) {
      parent[key] = '';
      skipDeeperThan = indent;
    } else {
      parent[key] = unquote(value);
    }
  }
  return root;
}

/**
 * Read the token tree from DESIGN.md text: the front matter plus any ```yaml blocks,
 * merged. A top-level key defined twice is an error, as in the spec.
 */
export function parseDesignMd(text) {
  const blocks = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let bodyStart = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end === -1) throw new Error('front matter has no closing ---');
    blocks.push(lines.slice(1, end).join('\n'));
    bodyStart = end + 1;
  }
  const fence = /```ya?ml\s*\n([\s\S]*?)\n```/g;
  for (const m of lines.slice(bodyStart).join('\n').matchAll(fence)) blocks.push(m[1]);
  const tree = {};
  for (const block of blocks) {
    for (const [k, v] of Object.entries(parseYamlSubset(block))) {
      if (Object.hasOwn(tree, k)) throw new Error(`top-level key "${k}" is defined more than once`);
      tree[k] = v;
    }
  }
  return tree;
}

function resolveRef(tree, value, seen = []) {
  const m = typeof value === 'string' && /^\{([^{}]+)\}$/.exec(value.trim());
  if (!m) return value;
  if (seen.includes(m[1])) throw new Error(`reference cycle: ${[...seen, m[1]].join(' -> ')}`);
  let node = tree;
  for (const part of m[1].split('.')) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, part)) {
      throw new Error(`reference {${m[1]}} does not resolve`);
    }
    node = node[part];
  }
  return resolveRef(tree, node, [...seen, m[1]]);
}

const toPx = (dim) => {
  const m = /^([\d.]+)\s*(px|rem|em|pt)?$/.exec(String(dim).trim());
  if (!m) return null;
  const n = Number(m[1]);
  return { px: n, rem: n * 16, em: n * 16, pt: (n * 4) / 3 }[m[2] ?? 'px'];
};

function sizeFromTypography(typo) {
  if (!typo || typeof typo !== 'object') return 'normal';
  const px = toPx(typo.fontSize);
  const weight = Number(typo.fontWeight ?? 400);
  if (px === null) return 'normal';
  if (px >= 24 || (px >= 18.66 && weight >= 700)) return 'large';
  return 'normal';
}

/**
 * Turn DESIGN.md text into pairs for checkPair. Takes every component with both
 * textColor and backgroundColor. Returns { pairs, skipped } where skipped lists
 * components that lack one of the two.
 */
export function pairsFromDesignMd(text) {
  const tree = parseDesignMd(text);
  const components = tree.components && typeof tree.components === 'object' ? tree.components : {};
  const pairs = [];
  const skipped = [];
  for (const [name, comp] of Object.entries(components)) {
    if (!comp || typeof comp !== 'object' || comp.textColor === undefined || comp.backgroundColor === undefined) {
      skipped.push(name);
      continue;
    }
    try {
      pairs.push({
        name,
        fg: resolveRef(tree, comp.textColor),
        bg: resolveRef(tree, comp.backgroundColor),
        size: sizeFromTypography(resolveRef(tree, comp.typography)),
      });
    } catch (err) {
      throw new Error(`components.${name}: ${err.message}`);
    }
  }
  return { pairs, skipped };
}

const fmtRatio = (r) => {
  let s = r.ratio.toFixed(2);
  if (!r.pass && Number(s) >= r.required) s = (Math.floor(r.ratio * 1000) / 1000).toFixed(3);
  return s;
};

function table(results) {
  const rows = [['RESULT', 'RATIO', 'NEED', 'SIZE', 'NAME', 'FG', 'BG']];
  for (const r of results) {
    rows.push([r.pass ? 'pass' : 'FAIL', fmtRatio(r), `${r.required}`, r.size, r.name, r.fg, r.bg]);
  }
  const widths = rows[0].map((_, c) => Math.max(...rows.map((row) => row[c].length)));
  return rows.map((row) => row.map((cell, c) => cell.padEnd(widths[c])).join('  ').trimEnd()).join('\n');
}

function usage() {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n');
  const out = [];
  for (const line of src.slice(1)) {
    if (!line.startsWith('//')) break;
    out.push(line.replace(/^\/\/ ?/, ''));
  }
  return out.join('\n');
}

function main(argv) {
  const opts = { json: false, canvas: '#ffffff', designMd: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      process.stdout.write(usage() + '\n');
      return 0;
    } else if (a === '--json') opts.json = true;
    else if (a === '--canvas' || a === '--design-md') {
      if (argv[i + 1] === undefined) throw new Error(`${a} needs a value`);
      opts[a === '--canvas' ? 'canvas' : 'designMd'] = argv[++i];
    } else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else if (opts.file) throw new Error('give one pairs file');
    else opts.file = a;
  }
  if (!opts.file === !opts.designMd) throw new Error('give a pairs file or --design-md FILE, not both or neither');

  let pairs;
  let skipped = [];
  if (opts.designMd) {
    ({ pairs, skipped } = pairsFromDesignMd(fs.readFileSync(opts.designMd, 'utf8')));
  } else {
    try {
      pairs = JSON.parse(fs.readFileSync(opts.file, 'utf8'));
    } catch (err) {
      throw new Error(`${path.basename(opts.file)}: ${err.message}`);
    }
    if (!Array.isArray(pairs)) throw new Error('the pairs file must hold a JSON array');
  }
  if (pairs.length === 0) throw new Error('no pairs to check');

  const results = pairs.map((p) => checkPair(p, opts.canvas));
  const pass = results.every((r) => r.pass);
  if (opts.json) {
    process.stdout.write(JSON.stringify({ pass, results, skipped }, null, 2) + '\n');
  } else {
    process.stdout.write(table(results) + '\n');
    const failed = results.filter((r) => !r.pass).length;
    process.stdout.write(`\n${results.length - failed} of ${results.length} pairs pass.\n`);
    if (skipped.length) process.stdout.write(`Skipped (no textColor/backgroundColor pair): ${skipped.join(', ')}\n`);
  }
  return pass ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`contrast.mjs: ${err.message}\n`);
    process.exitCode = 1;
  }
}
