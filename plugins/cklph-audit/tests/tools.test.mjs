// Deterministic tests for the scanner wrappers in tools/*.sh.
//
//   node plugins/cklph-audit/tests/tools.test.mjs
//
// No scanner needs to be installed: each case puts FAKE scanner binaries (recorded output
// shapes) on an isolated PATH (fake bin dir + /usr/bin + /bin, with node symlinked in), so the
// real wrapper and its real embedded parser run against known input. Asserts outcomes — finding
// counts, parsed fields, what stderr says, which temp files survive — not the presence of code.
// Exits non-zero on any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = path.join(PLUGIN, 'tools');
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };
const lines = (s) => s.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

// ── 1. every embedded `node -e '…'` program parses ──────────────────────────
console.log('node -e syntax');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cklph-nodee-'));
  let n = 0;
  for (const f of fs.readdirSync(TOOLS).filter(f => f.endsWith('.sh'))) {
    const src = fs.readFileSync(path.join(TOOLS, f), 'utf8');
    const re = /node -e '/g;
    let m;
    while ((m = re.exec(src))) {
      const start = m.index + m[0].length;
      const body = src.slice(start, src.indexOf("'", start));
      const tmp = path.join(dir, `b${n++}.js`);
      fs.writeFileSync(tmp, body);
      const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
      if (r.status !== 0) ok(false, `${f}:${src.slice(0, m.index).split('\n').length} node -e body does not parse: ${r.stderr.split('\n').find(l => /Error/.test(l))}`);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  ok(n > 0, `${n} node -e bodies parse`);
}

// ── harness: a sandbox with fake scanners on an isolated PATH ────────────────
function sandbox(fakes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cklph-tooltest-'));
  const bin = path.join(root, 'bin');
  const tmp = path.join(root, 'tmp');
  fs.mkdirSync(bin); fs.mkdirSync(tmp);
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  for (const [name, body] of Object.entries(fakes)) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  }
  const run = (tool, args, opts = {}) => spawnSync('/bin/bash', [path.join(TOOLS, tool), ...args], {
    encoding: 'utf8', cwd: opts.cwd ?? root,
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: root, TMPDIR: tmp, ...(opts.env ?? {}) },
  });
  const leftovers = () => fs.readdirSync(tmp);
  const done = () => fs.rmSync(root, { recursive: true, force: true });
  return { root, bin, tmp, run, leftovers, done };
}
// a fake that writes canned output only when its LAST argument is an existing directory —
// models a scanner that finds nothing when handed a path that does not resolve
const lastArgDirGuard = 'last="${@: -1}"; [ -d "$last" ] || { echo "{\\"results\\":[],\\"errors\\":[]}"; exit 0; }';

// ── 2. sast.sh: semgrep parse, relative == absolute target, failures are loud ─
console.log('sast.sh');
{
  const SEMGREP_OUT = JSON.stringify({ results: [
    { check_id: 'js.sqli', path: 'x/injection.js', start: { line: 8 }, extra: { severity: 'ERROR', lines: 'pool.query(`…${name}`)', metadata: { cwe: ['CWE-89'], impact: 'HIGH' } } },
    { check_id: 'js.ssrf', path: 'x/injection.js', start: { line: 14 }, extra: { severity: 'WARNING', lines: 'fetch(url)', metadata: {} } },
  ], errors: [] });
  const sb = sandbox({ semgrep: `${lastArgDirGuard}\ncat <<'EOF'\n${SEMGREP_OUT}\nEOF` });
  fs.mkdirSync(path.join(sb.root, 'src'));
  const abs = sb.run('sast.sh', [path.join(sb.root, 'src')]);
  const rel = sb.run('sast.sh', ['src']);
  const a = lines(abs.stdout), r = lines(rel.stdout);
  ok(a.length === 2, `absolute target → 2 findings (got ${a.length})`);
  ok(r.length === 2, `relative target → 2 findings (got ${r.length}) — was 0 when the root was re-resolved after cd`);
  ok(a[0]?.severity === 'high' && a[0]?.cwe === 'CWE-89' && a[0]?.line === 8, 'severity/cwe/line parsed from semgrep JSON');
  ok(sb.leftovers().length === 0, `no temp files left behind (found ${sb.leftovers().join(',')})`);
  sb.done();

  const sb2 = sandbox({ semgrep: 'echo "this is not json"' });
  const bad = sb2.run('sast.sh', ['.']);
  ok(bad.stdout.trim() === '' && /not valid JSON/.test(bad.stderr), 'unparseable semgrep output → no findings AND a stderr warning');
  sb2.done();

  const sb3 = sandbox({ semgrep: 'echo boom >&2; exit 2' });
  const dead = sb3.run('sast.sh', ['.']);
  ok(/semgrep failed \(exit 2/.test(dead.stderr), 'semgrep crash → stderr names the failure and exit code');
  sb3.done();

  const sb4 = sandbox({ semgrep: `echo '{"results":[],"errors":[{"level":"error","message":"Failed to download configuration"}]}'` });
  const cfg = sb4.run('sast.sh', ['.']);
  ok(/reported 1 error/.test(cfg.stderr), 'semgrep errors[] (bad ruleset) → stderr warning, not a silent clean');
  sb4.done();

  const sb5 = sandbox({ semgrep: 'printf "%s\\n" "$@" > "$HOME/args"; echo \'{"results":[],"errors":[]}\'' });
  sb5.run('sast.sh', ['.', 'py']);
  const sargs = fs.readFileSync(path.join(sb5.root, 'args'), 'utf8');
  ok(!/--lang/.test(sargs) && /p\/python/.test(sargs), 'language arg adds the p/python ruleset instead of the invalid bare --lang');
  sb5.done();

  // CodeQL SARIF (synthetic sample — CodeQL is not installed in CI)
  const SARIF = JSON.stringify({ runs: [{ tool: { driver: { rules: [{ id: 'js/sql-injection', properties: { 'security-severity': '8.8', tags: ['security', 'external/cwe/cwe-089'] } }] } },
    results: [{ ruleId: 'js/sql-injection', level: 'error', message: { text: 'query built from user input' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/db.js' }, region: { startLine: 12 } } }] }] }] });
  const sb6 = sandbox({ semgrep: 'echo \'{"results":[],"errors":[]}\'',
    codeql: `out=""; for a in "$@"; do case "$a" in --output=*) out="\${a#--output=}";; esac; done\ncat > "$out" <<'EOF'\n${SARIF}\nEOF` });
  const cq = lines(sb6.run('sast.sh', ['.'], { env: { CODEQL_DATABASE: sb6.root } }).stdout).filter(f => f.tool === 'codeql');
  ok(cq.length === 1 && cq[0].file === 'src/db.js' && cq[0].line === 12 && cq[0].severity === 'high' && /cwe-089/.test(cq[0].cwe),
    `CodeQL SARIF → file/line/severity from the location + rule, not the rule id as the file (${JSON.stringify(cq[0] ?? {})})`);
  sb6.done();
}

// ── 3. supplychain.sh: semgrep parse + SLSA check on a real .github/workflows dir ─
console.log('supplychain.sh');
{
  const OUT = JSON.stringify({ results: [{ check_id: 'yaml.github-actions.pull-request-target', path: '.github/workflows/deploy.yml', start: { line: 3 }, extra: { severity: 'ERROR', metadata: {} } }], errors: [] });
  const sb = sandbox({ semgrep: `${lastArgDirGuard}\ncat <<'EOF'\n${OUT}\nEOF` });
  const wf = path.join(sb.root, 'repo', '.github', 'workflows');
  fs.mkdirSync(wf, { recursive: true });
  fs.copyFileSync(path.join(PLUGIN, 'fixtures/supply-chain/should-flag/deploy.yml'), path.join(wf, 'deploy.yml'));
  const out = lines(sb.run('supplychain.sh', ['repo']).stdout);
  const tools = out.map(f => f.tool).sort().join(',');
  ok(out.some(f => f.tool === 'semgrep-ci'), `semgrep-ci finding parsed (relative target) — the parser was a SyntaxError before (${tools})`);
  ok(out.some(f => f.rule === 'supplychain:pull-request-target'), 'pull_request_target + secrets flagged');
  ok(out.some(f => f.rule === 'supplychain:no-provenance'), 'missing SLSA provenance flagged (.github/workflows is a directory: -d, not -f)');
  ok(sb.leftovers().length === 0, 'no temp files left behind');
  sb.done();
}

// ── 4. secrets.sh: report redacted, private, and deleted ────────────────────
console.log('secrets.sh');
{
  const sb = sandbox({ gitleaks: [
    'printf "%s\\n" "$@" > "$HOME/args"',
    'rp=""; prev=""; for a in "$@"; do [ "$prev" = "--report-path" ] && rp="$a"; prev="$a"; done',
    'ls -ld "$(dirname "$rp")" > "$HOME/dirperm"',
    'printf "%s" "$rp" > "$HOME/reportpath"',
    'echo \'[{"RuleID":"aws-access-token","File":"app/config.js","StartLine":3,"Description":"AWS key","Secret":"REDACTED"}]\' > "$rp"',
    'exit 1',
  ].join('\n') });
  const res = sb.run('secrets.sh', ['.']);
  const out = lines(res.stdout);
  ok(out.length === 1 && out[0].file === 'app/config.js' && out[0].line === 3, 'gitleaks finding parsed (exit 1 = leaks found is not a failure)');
  ok(/--redact/.test(fs.readFileSync(path.join(sb.root, 'args'), 'utf8')), 'gitleaks runs with --redact');
  ok(/^drwx------/.test(fs.readFileSync(path.join(sb.root, 'dirperm'), 'utf8')), 'report lives in a 0700 directory while it exists');
  const reportPath = fs.readFileSync(path.join(sb.root, 'reportpath'), 'utf8');
  ok(reportPath && !fs.existsSync(reportPath) && !fs.existsSync(path.dirname(reportPath)), `report and its dir deleted on exit (${reportPath})`);
  ok(sb.leftovers().length === 0, `nothing left in TMPDIR (left: ${sb.leftovers().join(',') || 'nothing'})`);
  ok(!/REDACTED|Secret/.test(res.stdout), 'no secret field is echoed to stdout');
  sb.done();

  const sb2 = sandbox({ gitleaks: 'echo "fatal: bad config" >&2; exit 126' });
  const r2 = sb2.run('secrets.sh', ['.']);
  ok(r2.stdout.trim() === '' && /gitleaks failed \(exit 126/.test(r2.stderr), 'gitleaks crash → stderr says the scan did not run');
  ok(sb2.leftovers().length === 0, 'temp dir removed after a failed scan too');
  sb2.done();
}

// ── 5. sca.sh: OSV-Scanner's real (nested) JSON shape ───────────────────────
console.log('sca.sh');
{
  const OSV = JSON.stringify({ results: [{ source: { path: '/r/package-lock.json', type: 'lockfile' }, packages: [{
    package: { name: 'lodash', version: '4.17.20', ecosystem: 'npm' },
    vulnerabilities: [{ id: 'GHSA-35jh-r3h4-6jhm', aliases: ['CVE-2021-23337'],
      affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }],
      database_specific: { severity: 'HIGH' } }],
    groups: [{ ids: ['GHSA-35jh-r3h4-6jhm'], max_severity: '7.2' }],
  }] }] });
  const sb = sandbox({ 'osv-scanner': `${lastArgDirGuard}\ncat <<'EOF'\n${OSV}\nEOF\nexit 1` });
  fs.mkdirSync(path.join(sb.root, 'app'));
  for (const t of [path.join(sb.root, 'app'), 'app']) {
    const out = lines(sb.run('sca.sh', [t]).stdout);
    const v = out[0] ?? {};
    ok(out.length === 1 && v.package === 'lodash' && v.version === '4.17.20' && v.fixedVersion === '4.17.21' && v.cve === 'CVE-2021-23337' && v.severity === 'high',
      `${path.isAbsolute(t) ? 'absolute' : 'relative'} target: OSV result parsed (${JSON.stringify(v)})`);
  }
  sb.done();

  const sb2 = sandbox({ 'osv-scanner': 'echo "No package sources found" >&2; exit 128' });
  const r2 = sb2.run('sca.sh', ['.']);
  ok(/no lockfile\/manifest/.test(r2.stderr), 'osv-scanner exit 128 → stderr says nothing was scanned');
  sb2.done();
}

// ── 6. dast.sh: ffuf -json lines parsed; no boot when a URL is given ────────
console.log('dast.sh');
{
  const sb = sandbox({ ffuf: [
    'printf "%s\\n" "$@" > "$HOME/args"',
    'cat >/dev/null',
    'echo \'{"input":{"FUZZ":"YWRtaW4="},"position":1,"status":401,"length":12,"url":"http://127.0.0.1:9/admin"}\'',
    'echo \'{"input":{"FUZZ":"LmVudg=="},"position":3,"status":200,"length":40,"url":"http://127.0.0.1:9/.env"}\'',
  ].join('\n') });
  const res = sb.run('dast.sh', ['.', 'http://127.0.0.1:9']);
  const out = lines(res.stdout).filter(f => f.tool === 'ffuf');
  ok(/-json/.test(fs.readFileSync(path.join(sb.root, 'args'), 'utf8')), 'ffuf runs with -json (not -s, which prints bare words)');
  ok(out.length === 2 && out[1].url === 'http://127.0.0.1:9/.env' && /HTTP 200/.test(out[1].evidence), `2 ffuf hits parsed (${out.length})`);
  sb.done();

  // compose.yaml (the modern name) is detected, and the SAME file is used for up and down
  const sb2 = sandbox({ docker: [
    'echo "$*" >> "$HOME/docker.log"',
    '[ "$1 $2" = "compose port" ] && echo "web 3000 http://127.0.0.1:9"',
    'exit 0',
  ].join('\n') });
  fs.mkdirSync(path.join(sb2.root, 'app'));
  fs.writeFileSync(path.join(sb2.root, 'app', 'compose.yaml'), 'services: {}\n');
  sb2.run('dast.sh', ['app']);
  const dlog = fs.readFileSync(path.join(sb2.root, 'docker.log'), 'utf8');
  const cf = path.join(fs.realpathSync(sb2.root), 'app', 'compose.yaml');   // bash resolves the physical cwd
  ok(dlog.includes(`compose -f ${cf} up`) && dlog.includes(`compose -f ${cf} down`), 'compose.yaml found via a relative root and used for both up and down');
  ok(!/down --quiet/.test(dlog), 'teardown does not pass --quiet (not a `docker compose down` flag, so teardown never ran)');
  sb2.done();
}

// ── 7. cpg.sh: relative root, sinks fallback, reachable says it did not run ─
console.log('cpg.sh');
{
  const sb = sandbox({});
  fs.mkdirSync(path.join(sb.root, 'src'));
  fs.writeFileSync(path.join(sb.root, 'src', 'a.js'), 'const x = 1\neval(userInput)\n');
  const rel = lines(sb.run('cpg.sh', ['src', 'sinks', 'eval\\(']).stdout);
  const abs = lines(sb.run('cpg.sh', [path.join(sb.root, 'src'), 'sinks', 'eval\\(']).stdout);
  ok(rel.length === 1 && abs.length === 1 && rel[0].line === 2, `sinks fallback finds eval( with a relative (${rel.length}) and absolute (${abs.length}) root`);
  const reach = sb.run('cpg.sh', ['src', 'reachable', 'query']);
  ok(reach.stdout.trim() === '' && /needs Joern/.test(reach.stderr), 'reachable without Joern → stderr says nothing was queried');
  sb.done();
}

// ── 8. exploit-runner.sh: image override honoured; PoC run through its interpreter ─
console.log('exploit-runner.sh');
{
  const sb = sandbox({ docker: [
    '[ "$1" = run ] && { printf "%s\\n" "$@" > "$HOME/run.args"; echo "SUCCESS exploit"; echo; echo "EXIT_CODE:0"; }',
    'exit 0',
  ].join('\n') });
  fs.writeFileSync(path.join(sb.root, 'poc.py'), 'print("x")\n');   // no exec bit, no shebang
  const def = lines(sb.run('exploit-runner.sh', ['poc.py', 'http://localhost:3000', '', 'F1']).stdout)[0] ?? {};
  const a1 = fs.readFileSync(path.join(sb.root, 'run.args'), 'utf8').split('\n');
  ok(a1.includes('python:3.12-slim') && a1.slice(-4).join(' ').includes('python /exploit.py'), 'default image by extension; .py PoC runs as `python /exploit.py`');
  ok(def.findingId === 'F1' && def.confirmed === true, '4th arg is the finding id; SUCCESS + exit 0 → confirmed');
  sb.run('exploit-runner.sh', ['poc.py', 'http://localhost:3000', 'my/python:3.13', 'F1']);
  const a2 = fs.readFileSync(path.join(sb.root, 'run.args'), 'utf8').split('\n');
  ok(a2.includes('my/python:3.13') && !a2.includes('python:3.12-slim'), 'an explicit [container-image] is no longer overwritten by the extension default');
  sb.done();
}

console.log(failed === 0 ? '\n✓ ALL TOOL TESTS PASSED' : `\n✗ ${failed} tool test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
