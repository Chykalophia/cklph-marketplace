// The DAST not-found baseline: tools/soft404.mjs and its use in tools/dast.sh.
//
//   node plugins/cklph-audit/tests/soft404.test.mjs     (also runs under `node --test`)
//
// A real HTTP server (a child process) answers every unknown path with 200 and an app shell that
// echoes the path, and has one real route (/admin, 401). A fake ffuf reports /admin, /.env and
// /backup as hits. dast.sh must keep /admin and drop the two shell responses. Teeth: the same run
// with the filter switched off keeps all three, and a shell that differs per path is not dropped.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signature, matchesBaseline, bogusPaths, takeBaseline } from '../tools/soft404.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = path.join(PLUGIN, 'tools');
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

console.log('signature and match');
{
  const shell = p => `<html><div id="root" data-path="${p}"></div></html>`;
  const base = [signature({ status: 200, body: shell('/cklph-nope-a1') }, '/cklph-nope-a1')];
  ok(matchesBaseline(signature({ status: 200, body: shell('/.env') }, '/.env'), base), 'the app shell for another path matches (path echo removed before hashing)');
  ok(!matchesBaseline(signature({ status: 200, body: 'DB_PASSWORD=x' }, '/.env'), base), 'a different 200 body does not match');
  ok(!matchesBaseline(signature({ status: 404, body: shell('/x') }, '/x'), base), 'the same body with a different status does not match');
  const redir = [signature({ status: 302, location: '/login?next=/cklph-nope-b2' }, '/cklph-nope-b2')];
  ok(matchesBaseline(signature({ status: 302, location: '/login?next=/admin' }, '/admin'), redir), 'a redirect-everything-to-login host matches on Location');
  ok(!matchesBaseline(signature({ status: 302, location: '/dashboard' }, '/admin'), redir), 'a redirect somewhere else does not match');
  const ps = bogusPaths();
  ok(ps.length === 3 && new Set(ps).size === 3 && ps[2].split('/').length === 3, `two depth-1 and one depth-2 bogus path (${ps.join(' ')})`);
}

// the server: unknown path -> 200 shell echoing the path; /admin -> 401; /shifting/* -> a body that
// differs per request (models a shell that is NOT a stable control)
const SERVER = `
const http = require('http');
let n = 0;
const s = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/admin') { res.writeHead(401, { 'content-type': 'text/plain' }); return res.end('auth required'); }
  if (process.env.SHIFTING) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>' + (n++) + '</html>'); }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<html><div id="root" data-path="' + p + '"></div></html>');
});
s.listen(0, '127.0.0.1', () => process.stdout.write(String(s.address().port) + '\\n'));
`;

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', SERVER], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.once('data', d => resolve({ child, origin: `http://127.0.0.1:${String(d).trim()}` }));
    child.once('error', reject);
  });
}

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cklph-soft404-'));
  const bin = path.join(root, 'bin');
  const tmp = path.join(root, 'tmp');
  fs.mkdirSync(bin); fs.mkdirSync(tmp);
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  // fake ffuf: reports three hits on the origin it was handed with -u
  fs.writeFileSync(path.join(bin, 'ffuf'), [
    '#!/bin/bash',
    'while [ $# -gt 0 ]; do [ "$1" = "-u" ] && U="$2"; shift; done',
    'O="${U%/FUZZ}"; cat >/dev/null',
    'for p in admin .env backup; do echo "{\\"status\\":200,\\"length\\":1,\\"url\\":\\"$O/$p\\"}"; done',
  ].join('\n'), { mode: 0o755 });
  const run = (args, env = {}) => spawnSync('/bin/bash', [path.join(TOOLS, 'dast.sh'), ...args], {
    encoding: 'utf8', cwd: root, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: root, TMPDIR: tmp, ...env },
  });
  return { root, tmp, run, done: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const hits = out => out.split('\n').filter(l => l.trim()).map(l => JSON.parse(l)).filter(f => f.tool === 'ffuf').map(f => new URL(f.url).pathname);

console.log('dast.sh with a soft-404 host');
{
  const { child, origin } = await startServer();
  try {
    const b = await takeBaseline(origin);
    ok(b.soft404 === true && b.baselines.length === 3 && b.errors.length === 0, `baseline records 3 controls and flags the host as soft-404 (${JSON.stringify(b.baselines.map(x => x.status))})`);

    const sb = sandbox();
    const r = sb.run(['.', origin]);
    ok(/dast\.sh: not-found baseline: \{.*"soft404":true/.test(r.stderr), 'the baseline is printed on stderr before probing');
    ok(JSON.stringify(hits(r.stdout)) === JSON.stringify(['/admin']), `only the real route survives (${JSON.stringify(hits(r.stdout))})`);
    ok(/dropped 2 path hit\(s\)/.test(r.stderr), 'stderr says how many hits were dropped');
    ok(fs.readdirSync(sb.tmp).length === 0, `no temp files left behind (${fs.readdirSync(sb.tmp).join(', ')})`);

    // teeth: the same run with the filter replaced by `cat` keeps the shell responses
    const copy = path.join(sb.root, 'tools');
    fs.cpSync(TOOLS, copy, { recursive: true });
    const src = fs.readFileSync(path.join(copy, 'dast.sh'), 'utf8');
    const noFilter = src.replace('then node "$SCRIPT_DIR/soft404.mjs" filter "$BASELINE_FILE"; else cat; fi', 'then cat; else cat; fi');
    ok(noFilter !== src, 'teeth: the filter line was found and disabled in a copy');
    fs.writeFileSync(path.join(copy, 'dast.sh'), noFilter);
    const r2 = spawnSync('/bin/bash', [path.join(copy, 'dast.sh'), '.', origin], { encoding: 'utf8', cwd: sb.root, env: { PATH: `${path.join(sb.root, 'bin')}:/usr/bin:/bin`, HOME: sb.root, TMPDIR: sb.tmp } });
    ok(hits(r2.stdout).length === 3, `teeth: without the filter all 3 hits are reported (${hits(r2.stdout).length})`);
    sb.done();
  } finally {
    child.kill();
  }
}

console.log('dast.sh with a host whose shell is not stable');
{
  const { child, origin } = await startServer({ SHIFTING: '1' });
  try {
    const sb = sandbox();
    const r = sb.run(['.', origin]);
    ok(hits(r.stdout).length === 3, `a body that differs per request never matches, so nothing is dropped (${hits(r.stdout).length})`);
    sb.done();
  } finally {
    child.kill();
  }
}

console.log('dast.sh with an unreachable host');
{
  const sb = sandbox();
  const r = sb.run(['.', 'http://127.0.0.1:9']);
  ok(/no usable not-found baseline/.test(r.stderr) && hits(r.stdout).length === 3, 'no baseline -> stderr says hits are NOT filtered, and nothing is dropped');
  sb.done();
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
