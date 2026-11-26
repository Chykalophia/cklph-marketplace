#!/usr/bin/env node
// ledger.mjs: the tested-clean ledger, kept next to .audit-baseline.json.
//
//   ledger.mjs record --repo <root> --result <engine-return.json> [--max-bytes N]
//   ledger.mjs status --repo <root> [--lenses a,b] [--globs 'src/**,app/**'] [--json]
//   ledger.mjs plan   --repo <root> --lenses a,b
//
// The baseline says which findings were accepted. The ledger says what was reviewed and found clean:
// one entry per (lens, file) with the file's git blob hash, the commit and the date. A file is
// covered for a lens while its current content hashes to the recorded blob; any edit uncovers it.
// `record` reads the `ledger` block of the engine's return value: clean files are upserted and files
// with a surviving finding are removed. `status` reports covered, changed and untested files.
// `plan` prints the covered files per lens as JSON, the engine's `coveredClean` argument.
//
// Size is capped: when .audit-ledger.json would exceed --max-bytes (default 1 MB), its oldest
// entries move to .audit-ledger.1.json, which is held to the same cap by dropping its oldest.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const LEDGER = '.audit-ledger.json';
export const ROTATED = '.audit-ledger.1.json';
export const DEFAULT_MAX_BYTES = 1024 * 1024;

const key = e => `${e.lens}::${e.file}`;
const norm = f => String(f ?? '').replace(/^\.\//, '');
const empty = () => ({ version: 1, entries: [] });

/** Serialized form, one entry per line so a diff of the committed file stays readable. */
export function serialize(ledger) {
  const lines = ledger.entries.map(e => `    ${JSON.stringify(e)}`);
  return `{\n  "version": ${ledger.version ?? 1},\n  "entries": [${lines.length ? `\n${lines.join(',\n')}\n  ` : ''}]\n}\n`;
}

/** Apply one engine run: drop entries for files that are not clean, upsert the clean ones. */
export function applyRun(ledger, run, { commit, date, blobOf }) {
  const byKey = new Map((ledger?.entries ?? []).map(e => [key(e), e]));
  for (const d of run?.dirty ?? []) byKey.delete(key({ lens: d.lens, file: norm(d.file) }));
  for (const t of run?.tested ?? []) {
    if (t.toolFailed) continue;
    for (const raw of t.clean ?? []) {
      const file = norm(raw);
      const blob = blobOf(file);
      if (!blob) continue;
      byKey.delete(key({ lens: t.lens, file }));
      byKey.set(key({ lens: t.lens, file }), { lens: t.lens, file, unit: t.unit, blob, commit, date });
    }
  }
  return { version: 1, entries: [...byKey.values()] };
}

/** Cap both files at maxBytes. Oldest entries (by date, then position) leave first. */
export function rotate(active, rotated, maxBytes = DEFAULT_MAX_BYTES) {
  const order = es => es.map((e, i) => ({ e, i })).sort((a, b) => String(a.e.date).localeCompare(String(b.e.date)) || a.i - b.i).map(x => x.e);
  // serialize() is a fixed frame plus one `    <json>` line per entry, joined by ",\n"
  const lineBytes = e => Buffer.byteLength(`    ${JSON.stringify(e)}`) + 2;
  const trimOldest = es => {
    let size = Buffer.byteLength(serialize({ version: 1, entries: es }));
    let drop = 0;
    while (drop < es.length && size > maxBytes) size -= lineBytes(es[drop++]);
    let rest = es.slice(drop);
    while (rest.length && Buffer.byteLength(serialize({ version: 1, entries: rest })) > maxBytes) rest = rest.slice(1);
    return { kept: rest, dropped: es.slice(0, es.length - rest.length) };
  };
  const { kept, dropped } = trimOldest(order(active.entries));
  const keptKeys = new Set(kept.map(key));
  const droppedKeys = new Set(dropped.map(key));
  const older = (rotated?.entries ?? []).filter(e => !keptKeys.has(key(e)) && !droppedKeys.has(key(e)));
  const { kept: old } = trimOldest(order([...older, ...dropped]));
  return {
    active: { version: 1, entries: active.entries.filter(e => keptKeys.has(key(e))) },
    rotated: { version: 1, entries: old },
  };
}

/** Per lens: covered (blob unchanged), changed (edited or deleted since), untested (never clean). */
export function status(ledger, current, lenses) {
  const cur = new Map(current.map(c => [norm(c.file), c.blob]));
  const lensList = lenses?.length ? lenses : [...new Set(ledger.entries.map(e => e.lens))].sort();
  const out = {};
  for (const lens of lensList) {
    const entries = ledger.entries.filter(e => e.lens === lens);
    const seen = new Set(entries.map(e => e.file));
    const covered = [];
    const changed = [];
    for (const e of entries) (cur.get(e.file) === e.blob ? covered : changed).push(e.file);
    out[lens] = {
      covered: covered.sort(),
      changed: changed.sort(),
      untested: [...cur.keys()].filter(f => !seen.has(f)).sort(),
      lastClean: entries.reduce((m, e) => (String(e.date) > m ? String(e.date) : m), ''),
    };
  }
  return out;
}

/** The engine's coveredClean argument: per lens, the files still covered. */
export function plan(ledger, current, lenses) {
  return Object.fromEntries(Object.entries(status(ledger, current, lenses)).map(([l, s]) => [l, s.covered]));
}

function globRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function git(repo, args, input) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || '').trim()}`);
  return r.stdout;
}

/** Blob hashes of the working-tree content of `files` (missing files map to null). */
export function hashFiles(repo, files) {
  const present = files.filter(f => fs.existsSync(path.join(repo, f)) && fs.statSync(path.join(repo, f)).isFile());
  const out = new Map(files.map(f => [f, null]));
  if (!present.length) return out;
  const hashes = git(repo, ['hash-object', '--stdin-paths'], `${present.join('\n')}\n`).trim().split('\n');
  present.forEach((f, i) => out.set(f, hashes[i] || null));
  return out;
}

function trackedFiles(repo, globs) {
  const files = git(repo, ['ls-files', '-z']).split('\0').filter(Boolean);
  const res = (globs ?? []).map(globRe);
  return res.length ? files.filter(f => res.some(r => r.test(f))) : files;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function opts(argv) {
  const o = { lenses: [], globs: [], json: false, maxBytes: DEFAULT_MAX_BYTES };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') o.repo = path.resolve(argv[++i]);
    else if (a === '--result') o.result = path.resolve(argv[++i]);
    else if (a === '--lenses') o.lenses = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--globs') o.globs = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--max-bytes') o.maxBytes = Number(argv[++i]);
    else if (a === '--json') o.json = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.repo) throw new Error('--repo is required');
  return o;
}

function main([cmd, ...argv]) {
  const o = opts(argv);
  const ledgerPath = path.join(o.repo, LEDGER);
  const rotatedPath = path.join(o.repo, ROTATED);
  const ledger = readJson(ledgerPath) ?? empty();

  if (cmd === 'record') {
    const result = o.result && readJson(o.result);
    const run = result?.ledger ?? result;
    if (!run || !Array.isArray(run.tested)) throw new Error('--result must be the engine return value (with a `ledger` block)');
    const files = [...new Set(run.tested.flatMap(t => (t.clean ?? []).map(norm)))];
    const blobs = hashFiles(o.repo, files);
    const commit = git(o.repo, ['rev-parse', 'HEAD']).trim();
    const next = applyRun(ledger, run, { commit, date: new Date().toISOString(), blobOf: f => blobs.get(f) });
    const { active, rotated } = rotate(next, readJson(rotatedPath), o.maxBytes);
    fs.writeFileSync(ledgerPath, serialize(active));
    if (rotated.entries.length || fs.existsSync(rotatedPath)) fs.writeFileSync(rotatedPath, serialize(rotated));
    const clean = run.tested.reduce((n, t) => n + (t.toolFailed ? 0 : (t.clean ?? []).length), 0);
    process.stdout.write(`ledger: ${clean} clean (lens, file) pair(s) recorded, ${(run.dirty ?? []).length} cleared; ` +
      `${active.entries.length} entr(ies) in ${LEDGER}${rotated.entries.length ? `, ${rotated.entries.length} in ${ROTATED}` : ''}\n`);
    return 0;
  }

  const tracked = trackedFiles(o.repo, o.globs);
  const blobs = hashFiles(o.repo, [...new Set([...tracked, ...ledger.entries.map(e => e.file)])]);
  const current = tracked.map(f => ({ file: f, blob: blobs.get(f) }));
  if (cmd === 'plan') {
    process.stdout.write(`${JSON.stringify(plan(ledger, current, o.lenses))}\n`);
    return 0;
  }
  if (cmd === 'status') {
    const s = status(ledger, current, o.lenses);
    if (o.json) { process.stdout.write(`${JSON.stringify(s, null, 2)}\n`); return 0; }
    if (!Object.keys(s).length) process.stdout.write(`ledger: nothing recorded yet in ${LEDGER}\n`);
    for (const [lens, x] of Object.entries(s)) {
      const sample = xs => (xs.length ? `: ${xs.slice(0, 10).join(', ')}${xs.length > 10 ? `, +${xs.length - 10} more` : ''}` : '');
      process.stdout.write(`${lens}: ${x.covered.length} covered, ${x.changed.length} changed since clean${sample(x.changed)}, ` +
        `${x.untested.length} never reviewed clean${sample(x.untested)}${x.lastClean ? ` (last clean ${x.lastClean.slice(0, 10)})` : ''}\n`);
    }
    return 0;
  }
  throw new Error('usage: ledger.mjs record|status|plan --repo <root> ...');
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(self)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { process.stderr.write(`ledger.mjs: ${e.message}\n`); process.exitCode = 2; }
}
