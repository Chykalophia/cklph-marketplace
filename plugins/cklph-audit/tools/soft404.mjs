#!/usr/bin/env node
// soft404.mjs: the not-found control for DAST path probing.
//
//   soft404.mjs baseline <origin-url>             print the host's baseline JSON
//   soft404.mjs check <baseline.json> <url>...    one JSON line per url: { url, status, notFound }
//   soft404.mjs filter <baseline.json>            stdin: finding JSON lines with a `url`; drop the
//                                                  ones whose response matches the baseline
//
// Many apps (SPAs, Next.js behind a CDN) answer every unknown path with 200 and the app shell, so a
// status code proves nothing. The baseline requests paths that cannot exist (two at depth 1, one at
// depth 2) and records status, length and a body hash for each. A later response is "not found"
// when its status and body hash (and Location, for a redirect) equal one of them. The requested
// path is removed from a body before hashing, so a shell that echoes the URL still matches.
// Exits 0 always; every failure is a line on stderr and fails open (nothing is dropped).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAX_BODY = 1024 * 1024;
const TIMEOUT_MS = 12000;

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The comparable signature of one response to `requestPath`. */
export function signature({ status, body = '', location = '' }, requestPath) {
  const variants = [...new Set([requestPath, encodeURI(requestPath), requestPath.replace(/^\/+/, '')].filter(v => v && v !== '/'))]
    .sort((a, b) => b.length - a.length);
  let norm = String(body);
  for (const v of variants) norm = norm.replace(new RegExp(escapeRe(v), 'g'), '');
  const loc = String(location ?? '');
  const normLoc = variants.reduce((acc, v) => acc.replace(new RegExp(escapeRe(v), 'g'), ''), loc);
  return {
    status,
    length: Buffer.byteLength(norm),
    hash: crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16),
    location: normLoc,
  };
}

/** True when a response signature equals any baseline signature: the path does not really exist. */
export function matchesBaseline(sig, baselines) {
  return (baselines ?? []).some(b => b.status === sig.status && b.hash === sig.hash && (b.location ?? '') === (sig.location ?? ''));
}

/** Paths that cannot exist: two independent names at depth 1 and one at depth 2. */
export function bogusPaths(rand = () => crypto.randomBytes(6).toString('hex')) {
  return [`/cklph-nope-${rand()}`, `/cklph-nope-${rand()}`, `/cklph-nope-${rand()}/cklph-nope-${rand()}`];
}

async function fetchOne(url) {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, body: buf.subarray(0, MAX_BODY).toString('utf8'), location: res.headers.get('location') ?? '' };
}

/** Fetch the bogus paths on `origin` and return { origin, baselines, soft404, errors }. */
export async function takeBaseline(origin, paths = bogusPaths()) {
  const base = new URL(origin);
  const baselines = [];
  const errors = [];
  for (const p of paths) {
    try {
      const r = await fetchOne(new URL(p, base));
      baselines.push({ path: p, ...signature(r, p) });
    } catch (e) {
      errors.push(`${p}: ${e.message}`);
    }
  }
  return { origin: base.origin, baselines, soft404: baselines.some(b => b.status >= 200 && b.status < 300), errors };
}

/** Is this URL's response the host's not-found control? null when it could not be fetched. */
export async function isNotFound(url, baseline) {
  const u = new URL(url);
  if (!baseline?.baselines?.length || u.origin !== baseline.origin) return null;
  try {
    const r = await fetchOne(u);
    return { status: r.status, notFound: matchesBaseline(signature(r, u.pathname), baseline.baselines) };
  } catch {
    return null;
  }
}

function readBaseline(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

async function main([cmd, ...rest]) {
  if (cmd === 'baseline' && rest[0]) {
    const b = await takeBaseline(rest[0]).catch(e => ({ origin: rest[0], baselines: [], soft404: false, errors: [e.message] }));
    for (const e of b.errors) process.stderr.write(`soft404.mjs: baseline request failed: ${e}\n`);
    process.stdout.write(`${JSON.stringify(b)}\n`);
    return;
  }
  if (cmd === 'check' && rest.length >= 2) {
    const b = readBaseline(rest[0]);
    for (const url of rest.slice(1)) process.stdout.write(`${JSON.stringify({ url, ...(await isNotFound(url, b) ?? { status: null, notFound: null }) })}\n`);
    return;
  }
  if (cmd === 'filter' && rest[0]) {
    const b = readBaseline(rest[0]);
    const usable = Boolean(b?.baselines?.length);
    if (!usable) process.stderr.write('soft404.mjs: no usable not-found baseline; path hits are NOT filtered, so a 200 may be the app shell\n');
    const input = fs.readFileSync(0, 'utf8');
    let dropped = 0;
    for (const line of input.split('\n')) {
      if (!line.trim()) continue;
      let f;
      try { f = JSON.parse(line); } catch { process.stdout.write(`${line}\n`); continue; }
      const verdict = usable && f?.url ? await isNotFound(f.url, b) : null;
      if (verdict?.notFound) { dropped++; continue; }
      process.stdout.write(`${line}\n`);
    }
    if (dropped) process.stderr.write(`soft404.mjs: dropped ${dropped} path hit(s) whose response matches the not-found baseline of ${b.origin}\n`);
    return;
  }
  process.stderr.write('usage: soft404.mjs baseline <url> | check <baseline.json> <url>... | filter <baseline.json>\n');
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(self)) {
  main(process.argv.slice(2)).catch(e => process.stderr.write(`soft404.mjs: ${e.message}\n`));
}
