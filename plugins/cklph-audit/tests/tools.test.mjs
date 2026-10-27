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
// sandbox(fakes, { noNode: true }) leaves node off PATH (models a host with a scanner but no Node).
function sandbox(fakes, { noNode = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cklph-tooltest-'));
  const bin = path.join(root, 'bin');
  const tmp = path.join(root, 'tmp');
  fs.mkdirSync(bin); fs.mkdirSync(tmp);
  if (!noNode) fs.symlinkSync(process.execPath, path.join(bin, 'node'));
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
  fs.copyFileSync(path.join(PLUGIN, 'fixtures/supply-chain/should-flag/.github/workflows/deploy.yml'), path.join(wf, 'deploy.yml'));
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

// ── 9. a scanner that exits non-zero but still wrote output: parsed AND reported ─
console.log('non-zero exit with output');
{
  const ONE = JSON.stringify({ results: [{ check_id: 'r1', path: 'a.js', start: { line: 1 }, extra: { severity: 'ERROR', metadata: {} } }], errors: [] });
  const sb = sandbox({ semgrep: `cat <<'EOF'\n${ONE}\nEOF\necho "partial: timeout on 3 files" >&2\nexit 2` });
  fs.mkdirSync(path.join(sb.root, 'repo', '.github', 'workflows'), { recursive: true });
  const s = sb.run('sast.sh', ['.']);
  ok(lines(s.stdout).length === 1 && /semgrep exited 2/.test(s.stderr), `sast.sh: semgrep exit 2 with output → finding kept AND stderr says the scan may be incomplete (${s.stderr.trim().slice(0, 80)})`);
  const c = sb.run('supplychain.sh', ['repo']);
  ok(lines(c.stdout).some(f => f.tool === 'semgrep-ci') && /semgrep exited 2/.test(c.stderr), 'supplychain.sh: semgrep exit 2 with output → finding kept AND reported');
  sb.done();

  const outArg = 'out=""; prev=""; for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; done';
  const sb2 = sandbox({
    trivy: `${outArg}\necho '{"SchemaVersion":2,"Results":[]}' > "\${out:-/dev/stdout}"\necho "fatal: db corrupt" >&2\nexit 1`,
    grype: `echo '{"matches":[]}'\necho "failed to load db" >&2\nexit 1`,
    syft: `echo '{"artifacts":[]}'\nexit 1`,
  });
  const sca = sb2.run('sca.sh', ['.']);
  ok(/trivy exited 1/.test(sca.stderr) && /grype exited 1/.test(sca.stderr) && /syft exited 1/.test(sca.stderr), 'sca.sh: trivy/grype/syft non-zero exit with an empty report → stderr says so, not a silent clean');
  const con = sb2.run('container.sh', ['.', 'img:1']);
  ok(/trivy image exited 1/.test(con.stderr) && /grype exited 1/.test(con.stderr), 'container.sh: trivy/grype image non-zero exit with an empty report → stderr says so');
  sb2.done();
}

// ── 10. output that parses but has the wrong shape is reported, not read as zero ─
console.log('unexpected output shape');
{
  const sb = sandbox({ grype: `echo '{"unexpected":true}'`,
    codeql: 'for a in "$@"; do case "$a" in --output=*) echo "{}" > "${a#--output=}";; esac; done' });
  const r = sb.run('sca.sh', ['.']);
  ok(/grype output has no matches array/.test(r.stderr), 'sca.sh: grype JSON without matches[] → stderr warning');
  const q = sb.run('sast.sh', ['.'], { env: { CODEQL_DATABASE: sb.root } });
  ok(/no runs array/.test(q.stderr), 'sast.sh: CodeQL SARIF without runs[] → stderr warning');
  sb.done();

  const sb2 = sandbox({ hadolint: `echo '{"error":"unexpected"}'` });
  fs.mkdirSync(path.join(sb2.root, 'app'));
  fs.writeFileSync(path.join(sb2.root, 'app', 'Dockerfile'), 'FROM node:latest\n');
  const h = sb2.run('container.sh', ['app']);
  ok(h.stdout.trim() === '' && /not an array/.test(h.stderr), 'container.sh: hadolint JSON that is not an array → stderr warning');
  sb2.done();
}

// ── 11. scanner installed but Node missing: the wrapper says it could not parse ─
console.log('no node on PATH');
{
  const sb = sandbox({
    checkov: `echo '{"results":{"failed_checks":[{"check_id":"CKV_1","file_path":"/main.tf"}]}}'`,
    kubescape: 'exit 0',
    grype: `echo '{"matches":[]}'`,
    hadolint: `echo '[]'`,
    semgrep: `echo '{"results":[],"errors":[]}'`,
    'detect-secrets': `echo '{"results":{"a.js":[{"type":"Secret Keyword","line_number":1}]}}'`,
  }, { noNode: true });
  fs.mkdirSync(path.join(sb.root, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(sb.root, 'pod.yaml'), 'apiVersion: v1\nkind: Pod\n');
  for (const t of ['iac.sh', 'k8s.sh', 'sca.sh', 'container.sh', 'supplychain.sh', 'secrets.sh']) {
    const r = sb.run(t, ['.']);
    ok(/node not found/.test(r.stderr), `${t}: no node → stderr says findings were NOT collected (${r.stderr.trim().split('\n')[0].slice(0, 70)})`);
  }
  sb.done();
  // supplychain.sh with no semgrep either: the SLSA / pull_request_target checks emit through node too
  const sb2 = sandbox({}, { noNode: true });
  fs.mkdirSync(path.join(sb2.root, '.github', 'workflows'), { recursive: true });
  const sc = sb2.run('supplychain.sh', ['.']);
  ok(/node not found/.test(sc.stderr), 'supplychain.sh: no node, no semgrep → the SLSA check is reported as not run, not silently dropped');
  sb2.done();
}

// ── 12. iac / k8s / container: relative and absolute targets give the same findings ─
console.log('iac.sh / k8s.sh / container.sh targets');
{
  const sb = sandbox({
    checkov: `d=""; prev=""; for a in "$@"; do [ "$prev" = "-d" ] && d="$a"; prev="$a"; done\n[ -f "$d/main.tf" ] || { echo '[]'; exit 0; }\necho '{"results":{"failed_checks":[{"check_id":"CKV_AWS_20","file_path":"/main.tf","resource":"aws_s3_bucket.b","check_name":"public bucket"}]}}'`,
    kubescape: [
      'out=""; prev=""; dir=""; for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; [ "$prev" = nsa ] && dir="$a"; prev="$a"; done',
      'ls "$dir"/*.yaml >/dev/null 2>&1 || exit 0',
      `echo '{"results":[{"objectMetadata":{"name":"web","namespace":"prod"},"assessmentTests":[{"testName":"privileged","severity":"High","testResults":[{"status":{"status":"failed"}}]}]}]}' > "$out"`,
    ].join('\n'),
    hadolint: `echo '[{"code":"DL3007","level":"warning","line":1,"message":"pin the tag"}]'`,
  });
  const app = path.join(sb.root, 'app');
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(app, 'main.tf'), 'resource "aws_s3_bucket" "b" {}\n');
  fs.writeFileSync(path.join(app, 'pod.yaml'), 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: web\n');
  fs.writeFileSync(path.join(app, 'Dockerfile'), 'FROM node:latest\n');
  for (const [t, tool] of [['iac.sh', 'checkov'], ['k8s.sh', 'kubescape'], ['container.sh', 'hadolint']]) {
    const rel = lines(sb.run(t, ['app']).stdout).filter(f => f.tool === tool);
    const abs = lines(sb.run(t, [app]).stdout).filter(f => f.tool === tool);
    ok(rel.length === 1 && abs.length === 1, `${t}: ${tool} finding with a relative (${rel.length}) and absolute (${abs.length}) target`);
  }
  ok(sb.leftovers().length === 0, 'no temp files left behind');
  sb.done();

  // k8s.sh: if the manifest staging dir cannot be created, say so (never copy into "/")
  const sb2 = sandbox({ mkdir: 'exit 1', cp: 'echo "$*" >> "$HOME/cp.log"', kubescape: 'exit 0' });
  fs.writeFileSync(path.join(sb2.root, 'pod.yaml'), 'apiVersion: v1\nkind: Pod\n');
  const r2 = sb2.run('k8s.sh', ['.']);
  ok(/could not stage/.test(r2.stderr) && !fs.existsSync(path.join(sb2.root, 'cp.log')), 'k8s.sh: staging mkdir fails → stderr warning and no copy');
  sb2.done();
}

// ── 13. secrets.sh: a target named like an option is still a directory ─────
console.log('secrets.sh option-like target');
{
  const sb = sandbox({ gitleaks: [
    'prev=""; for a in "$@"; do [ "$prev" = "--source" ] && printf "%s" "$a" > "$HOME/source"; [ "$prev" = "--report-path" ] && echo "[]" > "$a"; prev="$a"; done',
    'exit 0',
  ].join('\n') });
  fs.mkdirSync(path.join(sb.root, '-P'));
  sb.run('secrets.sh', ['-P']);
  const src = fs.readFileSync(path.join(sb.root, 'source'), 'utf8');
  ok(src.endsWith('/-P'), `secrets.sh -P scans the directory named -P, not the caller's cwd (${src})`);
  sb.done();
}

// ── 14. dast.sh: ffuf failure is loud; the compose URL comes from the selected file ─
console.log('dast.sh boot + ffuf');
{
  const sb = sandbox({ ffuf: 'cat >/dev/null; echo "Encountered error(s): connection refused" >&2; exit 1' });
  const r = sb.run('dast.sh', ['.', 'http://127.0.0.1:9']);
  ok(/ffuf failed \(exit 1/.test(r.stderr), 'ffuf exit 1 → stderr says content discovery did not run');
  sb.done();

  const sb2 = sandbox({
    docker: [
      'echo "$*" >> "$HOME/docker.log"',
      `case "$*" in *" config --format json"*) echo '{"services":{"db":{"image":"pg"},"web":{"ports":[{"target":3000,"published":"8089","protocol":"tcp"}]}}}';; esac`,
      'exit 0',
    ].join('\n'),
    curl: 'exit 0',
    ffuf: 'printf "%s\\n" "$@" > "$HOME/ffuf.args"; cat >/dev/null; exit 0',
  });
  fs.writeFileSync(path.join(sb2.root, 'compose.yaml'), 'services: {}\n');
  sb2.run('dast.sh', ['.']);
  const fa = fs.readFileSync(path.join(sb2.root, 'ffuf.args'), 'utf8');
  ok(fa.includes('http://localhost:8089/FUZZ'), `compose: scans the port published in the selected compose file (${fa.split('\n')[1]})`);
  sb2.done();
}

// ── 15. await.sh: a file target still finds its tsconfig root ───────────────
console.log('await.sh');
{
  const sb = sandbox({ npx: 'echo "$PWD $*" >> "$HOME/npx.log"; exit 0' });
  fs.mkdirSync(path.join(sb.root, 'src'));
  fs.writeFileSync(path.join(sb.root, 'tsconfig.json'), '{}');
  fs.writeFileSync(path.join(sb.root, 'src', 'a.ts'), 'export const a = 1\n');
  const r = sb.run('await.sh', ['src/a.ts']);
  const log = fs.existsSync(path.join(sb.root, 'npx.log')) ? fs.readFileSync(path.join(sb.root, 'npx.log'), 'utf8') : '';
  ok(log.split('\n').some(l => l.startsWith(fs.realpathSync(sb.root) + ' ') && /tsc --noEmit/.test(l)), `file target → tsc runs from the tsconfig root (${r.stderr.trim().split('\n').pop()})`);
  sb.done();
}

// ── 16. deadcode.sh: nested-package findings point at the repo-relative file ─
console.log('deadcode.sh');
{
  const sb = sandbox({ npx: [
    'case "$*" in *knip*) echo \'{"issues":[{"file":"src/a.ts","exports":[{"name":"unused","line":3}]},{"file":"other/b.ts","exports":[{"name":"x","line":1}]}]}\';; esac',
    'exit 0',
  ].join('\n') });
  const pkg = path.join(sb.root, 'packages', 'app');
  fs.mkdirSync(path.join(pkg, 'src'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), '{}');
  const out = lines(sb.run('deadcode.sh', ['packages/app']).stdout);
  ok(out.length === 2 && out[0].file === 'packages/app/src/a.ts', `knip path is relative to the caller's cwd, not the package (${out.map(f => f.file).join(',')})`);
  sb.done();
}

// ── 17. feed-status.sh: platform cache dir, and overrides are authoritative ─
console.log('feed-status.sh');
{
  const meta = (hoursAgo) => JSON.stringify({ DownloadedAt: new Date(Date.now() - hoursAgo * 3600000).toISOString() });
  const mk = (os_) => sandbox({ trivy: 'echo "Version: 0.50.0"', uname: `echo ${os_}` });
  const seed = (sb) => {
    for (const [d, h] of [['.cache/trivy/db', 100], ['Library/Caches/trivy/db', 1]]) {
      fs.mkdirSync(path.join(sb.root, d), { recursive: true });
      fs.writeFileSync(path.join(sb.root, d, 'metadata.json'), meta(h));
    }
    fs.mkdirSync(path.join(sb.root, 'empty-cache'));
  };
  const age = (sb, env) => (lines(sb.run('feed-status.sh', [], { env }).stdout).find(l => l.tool === 'trivy') ?? {}).dbAge;
  const lin = mk('Linux'); seed(lin);
  ok(age(lin) === '100', `Linux reads ~/.cache/trivy, not a stale ~/Library/Caches copy (dbAge ${age(lin)})`);
  ok(age(lin, { TRIVY_CACHE_DIR: path.join(lin.root, 'empty-cache') }) === 'unknown', 'TRIVY_CACHE_DIR with no DB → unknown, never another cache\'s age');
  lin.done();
  const mac = mk('Darwin'); seed(mac);
  ok(age(mac) === '1', `macOS reads ~/Library/Caches/trivy (dbAge ${age(mac)})`);
  mac.done();
}

// ── 18. cpg.sh: a Joern query is never built from a non-identifier target ───
console.log('cpg.sh Joern target');
{
  const sb = sandbox({
    'joern-parse': 'prev=""; for a in "$@"; do [ "$prev" = "--output-dir" ] && /bin/mkdir -p "$a"; prev="$a"; done',
    'joern-query': 'printf "%s\\n" "$@" >> "$HOME/jq.log"; echo "[]"',
  });
  fs.mkdirSync(path.join(sb.root, 'src'));
  const evil = sb.run('cpg.sh', ['src', 'reachable', 'x"); sys.exit(1); ("']);
  const log1 = fs.existsSync(path.join(sb.root, 'jq.log')) ? fs.readFileSync(path.join(sb.root, 'jq.log'), 'utf8') : '';
  ok(!/sys\.exit/.test(log1) && /not a plain function name/.test(evil.stderr), 'reachable with a quote-bearing target → refused, joern-query never sees it');
  sb.run('cpg.sh', ['src', 'reachable', 'exec']);
  const log2 = fs.existsSync(path.join(sb.root, 'jq.log')) ? fs.readFileSync(path.join(sb.root, 'jq.log'), 'utf8') : '';
  ok(/cpg\.call\.name\("exec"\)/.test(log2), 'a plain function name still reaches joern-query');
  sb.done();
}

// ── container.sh: no image named → no guessing from `docker images` ─
console.log('container.sh image selection');
{
  const sb = sandbox({
    docker: 'printf "%s\\n" "$*" >> "$HOME/docker.log"; [ "$1" = images ] && echo "unrelated/app:latest"; exit 0',
    trivy: 'printf "%s\\n" "$*" >> "$HOME/trivy.log"; echo "{\\"Results\\":[]}"',
  });
  fs.mkdirSync(path.join(sb.root, 'app'));
  const r = sb.run('container.sh', ['app']);
  const dockerLog = fs.existsSync(path.join(sb.root, 'docker.log')) ? fs.readFileSync(path.join(sb.root, 'docker.log'), 'utf8') : '';
  const trivyLog = fs.existsSync(path.join(sb.root, 'trivy.log')) ? fs.readFileSync(path.join(sb.root, 'trivy.log'), 'utf8') : '';
  ok(!/^images/m.test(dockerLog) && !/unrelated\/app/.test(trivyLog), 'no image argument → docker images is never consulted and no unrelated image is scanned');
  ok(/no image named/.test(r.stderr), 'no image argument → stderr says the image scan was skipped');
  sb.run('container.sh', ['app', 'mine:1']);
  const trivyLog2 = fs.existsSync(path.join(sb.root, 'trivy.log')) ? fs.readFileSync(path.join(sb.root, 'trivy.log'), 'utf8') : '';
  ok(/mine:1/.test(trivyLog2), 'an explicit image is still scanned');
  sb.done();
}

// ── supply-chain fixtures sit where supplychain.sh looks (.github/workflows) ─
console.log('supply-chain fixtures');
{
  for (const d of ['should-flag', 'should-not-flag']) {
    ok(fs.existsSync(path.join(PLUGIN, 'fixtures/supply-chain', d, '.github/workflows/deploy.yml')), `fixtures/supply-chain/${d} keeps its workflow under .github/workflows`);
  }
}

console.log(failed === 0 ? '\n✓ ALL TOOL TESTS PASSED' : `\n✗ ${failed} tool test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
