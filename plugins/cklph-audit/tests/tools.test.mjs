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
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// ── 15b. await.sh: monorepo root and the typed fallback lint ─────────────────
{
  // A monorepo root has no tsconfig of its own: tsc must still run in the package below it.
  const sb = sandbox({ npx: 'echo "$PWD $*" >> "$HOME/npx.log"; exit 0' });
  const app = path.join(sb.root, 'apps', 'web');
  fs.mkdirSync(path.join(app, 'src'), { recursive: true });
  fs.writeFileSync(path.join(app, 'tsconfig.json'), '{}');
  fs.writeFileSync(path.join(app, 'src', 'a.ts'), 'export const a = 1\n');
  fs.mkdirSync(path.join(sb.root, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(sb.root, 'node_modules', 'x', 'tsconfig.json'), '{}');
  sb.run('await.sh', ['.']);
  const log = fs.readFileSync(path.join(sb.root, 'npx.log'), 'utf8').split('\n');
  ok(log.some(l => l.startsWith(fs.realpathSync(app) + ' ') && /tsc --noEmit/.test(l)), 'repo root without a tsconfig → tsc runs in apps/web below it');
  ok(!log.some(l => /node_modules/.test(l.split(' ')[0]) && /tsc/.test(l)), 'tsconfigs inside node_modules are not treated as projects');
  sb.done();
}
{
  // The repo config leaves no-floating-promises off: a typed lint runs with the project's
  // own typescript-eslint, and its hits come back as findings.
  const HIT = JSON.stringify([{ filePath: '/x/src/a.ts', messages: [
    { ruleId: '@typescript-eslint/no-floating-promises', line: 4, message: 'Promises must be awaited' },
    { ruleId: '@typescript-eslint/no-misused-promises', line: 9, message: 'Promise-returning function provided to attribute' },
    { ruleId: 'react-hooks/exhaustive-deps', line: 2, message: 'Definition for rule was not found' }] }]);
  const npx = (enabled) => [
    'echo "$PWD $*" >> "$HOME/npx.log"',
    `case "$*" in *--print-config*) echo '{"rules":{${enabled ? '"@typescript-eslint/no-floating-promises":["error"]' : ''}}}';; *" -c "*) cfg=""; prev=""; for a in "$@"; do [ "$prev" = "-c" ] && cfg="$a"; prev="$a"; done; cp "$cfg" "$HOME/used.config.mjs"; cat <<'EOF'\n${HIT}\nEOF\n;; esac`,
    'exit 0',
  ].join('\n');
  const mk = (enabled) => {
    const sb = sandbox({ npx: npx(enabled) });
    fs.mkdirSync(path.join(sb.root, 'src'));
    fs.writeFileSync(path.join(sb.root, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(sb.root, 'src', 'a.ts'), 'export const a = 1\n');
    const tse = path.join(sb.root, 'node_modules', 'typescript-eslint');
    fs.mkdirSync(tse, { recursive: true });
    fs.writeFileSync(path.join(tse, 'package.json'), '{"name":"typescript-eslint","main":"index.js"}');
    fs.writeFileSync(path.join(tse, 'index.js'), 'module.exports = {}\n');
    return sb;
  };
  const sb = mk(false);
  const r = sb.run('await.sh', ['src']);
  const out = lines(r.stdout);
  ok(out.length === 2 && out.every(f => f.tool === 'eslint-typed') && out[0].severity === 'high' && out[1].severity === 'medium',
    `rule off in repo config → typed fallback reports floating (high) + misused (medium), drops other rules (${out.map(f => f.rule).join(',')})`);
  const cfg = fs.existsSync(path.join(sb.root, 'used.config.mjs')) ? fs.readFileSync(path.join(sb.root, 'used.config.mjs'), 'utf8') : '';
  ok(/node_modules\/typescript-eslint\/index\.js/.test(cfg) && /no-floating-promises": "error"/.test(cfg), 'fallback config imports the project\'s own typescript-eslint and enables the rule');
  ok(/typed fallback lint/.test(r.stderr), 'stderr says the fallback ran');
  ok(!/command not found|syntax error/.test(r.stderr), `no stray shell errors while building the fallback (${(r.stderr.match(/.*(command not found|syntax error).*/) || [''])[0].slice(0, 80)})`);
  sb.done();
  const sb2 = mk(true);
  const r2 = sb2.run('await.sh', ['src']);
  ok(!lines(r2.stdout).some(f => f.tool === 'eslint-typed') && !fs.existsSync(path.join(sb2.root, 'used.config.mjs')), 'rule already on in repo config → no fallback run');
  sb2.done();

  // Split packages: @typescript-eslint/parser + @typescript-eslint/eslint-plugin, no unified one.
  const sb3 = mk(false);
  fs.rmSync(path.join(sb3.root, 'node_modules', 'typescript-eslint'), { recursive: true });
  for (const n of ['parser', 'eslint-plugin']) {
    const d = path.join(sb3.root, 'node_modules', '@typescript-eslint', n);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), `{"name":"@typescript-eslint/${n}","main":"index.js"}`);
    fs.writeFileSync(path.join(d, 'index.js'), 'module.exports = {}\n');
  }
  const r3 = sb3.run('await.sh', ['src']);
  const cfg3 = fs.existsSync(path.join(sb3.root, 'used.config.mjs')) ? fs.readFileSync(path.join(sb3.root, 'used.config.mjs'), 'utf8') : '';
  ok(lines(r3.stdout).length === 2 && /@typescript-eslint\/parser\/index\.js/.test(cfg3) && /@typescript-eslint\/eslint-plugin\/index\.js/.test(cfg3),
    'split parser + plugin packages → typed fallback still runs');
  sb3.done();

  // A target that resolves to nothing never walks up to / and type-checks unrelated projects.
  const sb4 = sandbox({ npx: 'echo "$PWD $*" >> "$HOME/npx.log"; exit 0' });
  const r4 = sb4.run('await.sh', ['/no/such/dir/a.ts']);
  const log4 = fs.existsSync(path.join(sb4.root, 'npx.log')) ? fs.readFileSync(path.join(sb4.root, 'npx.log'), 'utf8') : '';
  ok(/does not resolve/.test(r4.stderr) && !/tsc/.test(log4), 'nonexistent absolute target → nothing checked, no tsc from /');
  const r5 = sb4.run('await.sh', ['.'], { env: { AWAIT_MAX_PROJECTS: 'foo' } });
  ok(/not a whole number/.test(r5.stderr) && !/integer expression/.test(r5.stderr), 'AWAIT_MAX_PROJECTS=foo → warned and defaulted, no shell error');
  sb4.done();
}

// ── 15c. sast.sh: automatic CodeQL build, cached and scoped to the target ───
console.log('sast.sh codeql auto');
{
  const SARIF = JSON.stringify({ runs: [{ tool: { driver: { rules: [] }, extensions: [{ rules: [{ id: 'js/xss', properties: { 'security-severity': '6.1', tags: ['external/cwe/cwe-079'] } }] }] },
    results: [
      { ruleId: 'js/xss', level: 'error', message: { text: 'in scope' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/a.js' }, region: { startLine: 3 } } }] },
      { ruleId: 'js/xss', level: 'error', message: { text: 'out of scope' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'other/b.js' }, region: { startLine: 7 } } }] }] }] });
  const sb = sandbox({ semgrep: 'echo \'{"results":[],"errors":[]}\'',
    codeql: [
      'echo "$1 $2" >> "$HOME/codeql.log"',
      'if [ "$2" = "create" ]; then mkdir -p "$3"; exit 0; fi',
      `out=""; for a in "$@"; do case "$a" in --output=*) out="\${a#--output=}";; esac; done\ncat > "$out" <<'EOF'\n${SARIF}\nEOF`,
    ].join('\n') });
  for (const d of ['src', 'other']) { fs.mkdirSync(path.join(sb.root, d)); fs.writeFileSync(path.join(sb.root, d, d === 'src' ? 'a.js' : 'b.js'), 'x\n'); }
  const git = (...a) => spawnSync('git', a, { cwd: sb.root, env: { PATH: '/usr/bin:/bin', HOME: sb.root, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  git('init', '-q'); git('add', 'src', 'other'); git('commit', '-qm', 'init');
  const first = sb.run('sast.sh', ['src']);
  const cq = lines(first.stdout).filter(f => f.tool === 'codeql');
  ok(cq.length === 1 && cq[0].file === 'src/a.js' && cq[0].severity === 'medium' && /cwe-079/.test(cq[0].cwe),
    `no CODEQL_DATABASE → database built, results limited to the target, severity from extension rules (${JSON.stringify(cq)})`);
  sb.run('sast.sh', ['src']);
  const creates = fs.readFileSync(path.join(sb.root, 'codeql.log'), 'utf8').split('\n').filter(l => / create$/.test(l)).length;
  ok(creates === 1, `a second call on the same commit reuses the cached database (${creates} create)`);
  const off = sb.run('sast.sh', ['src'], { env: { CODEQL_AUTO: '0' } });
  ok(!lines(off.stdout).some(f => f.tool === 'codeql'), 'CODEQL_AUTO=0 → no codeql pass');
  sb.done();
  const sb2 = sandbox({ semgrep: 'echo \'{"results":[],"errors":[]}\'' });
  ok(/tool not installed: codeql/.test(sb2.run('sast.sh', ['.']).stderr), 'codeql missing → stderr says no dataflow pass ran');
  sb2.done();

  // A reviewer killed mid-build must not leave the lock behind (it would block the others).
  const sb3 = sandbox({ semgrep: 'echo \'{"results":[],"errors":[]}\'', codeql: 'sleep 2; exit 1' });
  fs.mkdirSync(path.join(sb3.root, 'src')); fs.writeFileSync(path.join(sb3.root, 'src', 'a.js'), 'x\n');
  const g3 = (...a) => spawnSync('git', a, { cwd: sb3.root, env: { PATH: '/usr/bin:/bin', HOME: sb3.root, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  g3('init', '-q'); g3('add', 'src'); g3('commit', '-qm', 'init');
  const tTerm = Date.now();
  spawnSync('/bin/bash', ['-c', `bash "${path.join(TOOLS, 'sast.sh')}" src & p=$!; sleep 1; kill -TERM $p; wait $p`], {
    cwd: sb3.root, encoding: 'utf8', timeout: 90000, env: { PATH: `${sb3.bin}:/usr/bin:/bin`, HOME: sb3.root, TMPDIR: sb3.tmp } });
  const termMs = Date.now() - tTerm;
  ok(termMs < 20000, `an interrupted run releases its output pipes at once; the lock heartbeat doesn't hold them open (${termMs}ms)`);
  const cacheDir = path.join(sb3.root, '.cache', 'cklph-audit', 'codeql');
  const locks = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).filter(n => n.endsWith('.lock')) : [];
  ok(fs.existsSync(cacheDir) && locks.length === 0, `TERM during the build → lock released (${locks.join(',') || 'none left'})`);
  sb3.done();

  // No JS/TS or Python under the target → no cache directory is created at all.
  const sb4 = sandbox({ semgrep: 'echo \'{"results":[],"errors":[]}\'', codeql: 'echo "$@" >> "$HOME/codeql.log"; exit 0' });
  fs.mkdirSync(path.join(sb4.root, 'docs')); fs.writeFileSync(path.join(sb4.root, 'docs', 'a.md'), '# x\n');
  const g4 = (...a) => spawnSync('git', a, { cwd: sb4.root, env: { PATH: '/usr/bin:/bin', HOME: sb4.root, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  g4('init', '-q'); g4('add', 'docs'); g4('commit', '-qm', 'init');
  const r4 = sb4.run('sast.sh', ['docs']);
  ok(/auto mode skipped/.test(r4.stderr) && !fs.existsSync(path.join(sb4.root, 'codeql.log')),
    'no supported sources → codeql skipped, nothing built');
  sb4.done();

  // Partial SARIF (analyze exits non-zero) is used for this call but never cached; an untracked
  // source file counts for language detection; a symlinked path to the target still scopes.
  const SARIF2 = JSON.stringify({ runs: [{ tool: { driver: { rules: [] } }, results: [
    { ruleId: 'js/x', level: 'warning', message: { text: 'hit' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/new.js' }, region: { startLine: 1 } } }] },
    { ruleId: 'js/x', level: 'warning', message: { text: 'elsewhere' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'other/z.js' }, region: { startLine: 1 } } }] }] }] });
  const sb5 = sandbox({ semgrep: 'echo \'{"results":[],"errors":[]}\'',
    codeql: [
      'echo "$1 $2" >> "$HOME/codeql.log"',
      'if [ "$2" = "create" ]; then mkdir -p "$3"; exit 0; fi',
      `out=""; for a in "$@"; do case "$a" in --output=*) out="\${a#--output=}";; esac; done\ncat > "$out" <<'EOF'\n${SARIF2}\nEOF\nexit 3`,
    ].join('\n') });
  fs.mkdirSync(path.join(sb5.root, 'src')); fs.writeFileSync(path.join(sb5.root, 'README.md'), 'x\n');
  const g5 = (...a) => spawnSync('git', a, { cwd: sb5.root, env: { PATH: '/usr/bin:/bin', HOME: sb5.root, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  g5('init', '-q'); g5('add', 'README.md'); g5('commit', '-qm', 'init');
  fs.writeFileSync(path.join(sb5.root, 'src', 'new.js'), 'x\n'); // untracked
  const link = path.join(sb5.tmp, 'linked');
  fs.symlinkSync(sb5.root, link);
  const p1 = sb5.run('sast.sh', [path.join(link, 'src')]);
  const got = lines(p1.stdout).filter(f => f.tool === 'codeql');
  ok(got.length === 1 && got[0].file === 'src/new.js', `untracked source detected; target reached through a symlink still scopes results (${got.map(f => f.file).join(',')})`);
  ok(/may be incomplete/.test(p1.stderr), 'non-zero analyze with SARIF → stderr says results may be incomplete');
  sb5.run('sast.sh', ['src']);
  const creates5 = fs.readFileSync(path.join(sb5.root, 'codeql.log'), 'utf8').split('\n').filter(l => / create$/.test(l)).length;
  ok(creates5 === 2, `partial SARIF is never cached, so the next call rebuilds (${creates5} creates)`);
  sb5.done();

  // An unwritable cache location fails fast instead of waiting out the lock timeout.
  const sb6c = sandbox({ semgrep: 'echo \'{"results":[],"errors":[]}\'', codeql: 'echo "$@" >> "$HOME/codeql.log"; exit 0' });
  fs.mkdirSync(path.join(sb6c.root, 'src')); fs.writeFileSync(path.join(sb6c.root, 'src', 'a.js'), 'x\n');
  const g6 = (...a) => spawnSync('git', a, { cwd: sb6c.root, env: { PATH: '/usr/bin:/bin', HOME: sb6c.root, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  g6('init', '-q'); g6('add', 'src'); g6('commit', '-qm', 'init');
  const ro = path.join(sb6c.root, 'ro'); fs.mkdirSync(ro, { mode: 0o500 });
  const t0 = Date.now();
  const r6 = sb6c.run('sast.sh', ['src'], { env: { CKLPH_CODEQL_CACHE: path.join(ro, 'cache') } });
  ok(/not writable/.test(r6.stderr) && Date.now() - t0 < 15000, `unwritable cache → reported at once (${Date.now() - t0}ms)`);
  fs.chmodSync(ro, 0o700);
  sb6c.done();
}
{
  // Paths with a space, $, a double quote, a backslash and a backtick still produce a config that parses.
  const sb = sandbox({ npx: [
    'case "$*" in *--print-config*) echo \'{"rules":{}}\';; *" -c "*) cfg=""; prev=""; for a in "$@"; do [ "$prev" = "-c" ] && cfg="$a"; prev="$a"; done; cp "$cfg" "$HOME/used.config.mjs"; echo "[]";; esac',
    'exit 0'].join('\n') });
  const proj = path.join(sb.root, 'my $proj "q" \\ `x`');
  fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'tsconfig.json'), '{}');
  fs.writeFileSync(path.join(proj, 'src', 'a.ts'), 'export const a = 1\n');
  const tse = path.join(proj, 'node_modules', 'typescript-eslint');
  fs.mkdirSync(tse, { recursive: true });
  fs.writeFileSync(path.join(tse, 'package.json'), '{"name":"typescript-eslint","main":"index.js"}');
  fs.writeFileSync(path.join(tse, 'index.js'), 'module.exports = {}\n');
  sb.run('await.sh', ['src'], { cwd: proj });
  const used = path.join(sb.root, 'used.config.mjs');
  const check = fs.existsSync(used) ? spawnSync(process.execPath, ['--check', used], { encoding: 'utf8' }) : { status: 1, stderr: 'no config written' };
  const cfg = fs.existsSync(used) ? fs.readFileSync(used, 'utf8') : '';
  ok(check.status === 0 && cfg.includes(JSON.stringify(fs.realpathSync(proj))), `special characters in the project path → generated config still parses (${check.stderr.split('\n')[0]})`);
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
  ok(/no image named and hadolint not installed — NOTHING scanned/.test(r.stderr), 'no image and no hadolint → stderr says nothing was scanned, not that Dockerfiles were linted');
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

// ── ambiguity.sh: CLI + contract (SPEC-v4-ambiguity.md §3, AC-001..AC-007, AC-013, AC-014, AC-016, AC-017) ─
console.log('ambiguity.sh: CLI + contract');
{
  const AMB = path.join(TOOLS, 'ambiguity');
  const { docClass, DOC_CLASS_RULES, RULE_IDS } = await import(pathToFileURL(path.join(AMB, 'common.mjs')).href);
  const { runContractCheck } = await import(pathToFileURL(path.join(PLUGIN, 'tests/lib/contract-check.mjs')).href);
  const { parseProseDefault, parseExcludeDefault, parseLensHints } = await import(pathToFileURL(path.join(PLUGIN, 'tests/lib/engine-source.mjs')).href);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const put = (root, files) => {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
  };
  // a sandbox whose scan root is <sandbox>/r (keeps bin/ and tmp/ out of the walk)
  const tree = (files, opts) => { const sb = sandbox({}, opts); sb.r = path.join(sb.root, 'r'); fs.mkdirSync(sb.r); put(sb.r, files); return sb; };
  const amb = (sb, args, opts) => {
    const r = sb.run('ambiguity.sh', args, opts);
    let out = null;
    try { out = JSON.parse(r.stdout); } catch { /* asserted by robust() */ }
    return { ...r, out };
  };
  const robust = (r, label) => ok(r.status === 0 && Array.isArray(r.out), `${label}: exit 0 and stdout is one JSON array`);
  // stderr summary line → { key: value } (parsed, never substring-matched)
  const summary = (stderr, mode) => {
    const l = stderr.split('\n').find(x => x.startsWith(`ambiguity.sh ${mode}: `) && /=/.test(x));
    if (!l) return null;
    return Object.fromEntries([...l.slice(`ambiguity.sh ${mode}: `.length).matchAll(/(\w+)=(\[[^\]]*\]|\S+)/g)].map(m => [m[1], m[2]]));
  };
  const keys = (out) => (out ?? []).map(x => `${x.line}@${x.value}@${x.via}`).sort();

  // AC-002 inputs. The row below is VERBATIM from `git show 2602aff:plugins/cklph-audit/skills/agent-config-lens/checklist.md`
  // line 13 (CI checks out depth 1, so the test embeds it instead of calling git).
  const PRE_ROW = '| `agentcfg:mcp-review` | Local script, unknown binary, editable install, direct URL, VCS ref, shell wrapper, or an invocation you can\'t parse confidently. Record it; never guess. | info, `needs-owner-input` |';
  const POST_ROW = '| `agentcfg:mcp-review` | Local script, unknown binary, editable install, direct URL, VCS ref, shell wrapper, or an invocation you can\'t parse confidently. Record it; never guess. | low, confidence `needs-owner-input` |';
  const ENGINE = [
    'const REVIEW_SCHEMA = {',
    "  severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },",
    "  confidence: { type: 'string', enum: ['confirmed', 'likely', 'needs-owner-input'] },",
    '}', ''].join('\n');
  const PLUGIN_JSON = '{ "name": "x" }\n';
  const checklist = (row) => [
    '## 1. MCP configs',
    '| Rule id | What | Default |',
    '|---|---|---|',
    '| `agentcfg:mcp-unpinned` | Package selector can resolve to different code later: bare name, `@latest`. | medium; high if the server gets credentials or write/shell capability |',
    '| `agentcfg:mcp-range` | Selector permits a range (`^1.2.0`, `~1.2`, `>=1.2,<2`, `==1.*`). | low |',
    row,
    '| `agentcfg:mcp-remote` | Remote server (`url`, `type: http`/`sse`). | medium |',
    '| `agentcfg:mcp-shell` | Server command is a shell (`bash -c`, `sh -c`). | high |',
    '| `agentcfg:mcp-secret` | Literal credential in `env`, `headers`, or `args`. | high (critical if a live-looking key) |',
    ''].join('\n');
  const ac002 = (row, extra = {}) => tree({ '.claude-plugin/plugin.json': PLUGIN_JSON, 'workflows/engine.js': ENGINE, 'skills/x/checklist.md': checklist(row), ...extra });

  // AC-002 + AC-001 (contract summary). Kills: header-only / near-field detection (0 records: `info`
  // never sits next to the word severity), every-token-in-cell (2: also `needs-owner-input`), off-by-one line.
  {
    const sb = ac002(PRE_ROW);
    const r = amb(sb, ['contract', sb.r]);
    robust(r, 'AC-002 pre-fix');
    const rec = r.out?.[0] ?? {};
    ok(r.out?.length === 1 && rec.file === 'skills/x/checklist.md' && rec.line === 6 && rec.field === 'severity' && rec.value === 'info'
      && rec.via === 'table-inferred' && rec.schema === 'workflows/engine.js:2' && rec.kind === 'contract-mismatch' && rec.rule === 'ambiguity:contract-mismatch',
      `AC-002 verbatim 2602aff row → exactly 1 record at line 6, severity=info via table-inferred (${JSON.stringify(r.out)})`);
    ok(same(rec.allowed, ['critical', 'high', 'medium', 'low']) && same(rec.alsoValidFor, []) && rec.inFence === false,
      `AC-002 record carries allowed, empty alsoValidFor, inFence:false (${JSON.stringify(rec.allowed)})`);
    // AC-001: the summary line is parsed into key=value fields (kills a summary that drifts from §3.3)
    const s = summary(r.stderr, 'contract');
    ok(s && s.enums === '2' && s.fields === '[confidence,severity]' && s.docs === '1' && s.emitted === '1',
      `AC-001 contract summary parses to enums=2 fields=[confidence,severity] docs=1 emitted=1 (${JSON.stringify(s)})`);
    sb.done();
    const post = ac002(POST_ROW);
    const p = amb(post, ['contract', post.r]);
    robust(p, 'AC-002 post-fix');
    ok(same(p.out, []) && summary(p.stderr, 'contract')?.emitted === '0', `AC-002 post-fix row (low, confidence \`needs-owner-input\`) → [] (${p.stdout.trim()})`);
    post.done();
  }

  // D2 lead token: never a token followed by `:`, `/` or `.`. Kills a lead-token regex without the
  // follow-set (`CWE-89/x`, `agentcfg:x`, `wontfix/x`, `docs.x` would read as values). Six severities
  // keep the column bound even when the four junk cells are (wrongly) counted as lead tokens.
  {
    const table = ['| Rule | Default |', '|---|---|', '| a | high |', '| b | medium |', '| c | low |', '| d | CWE-89/CWE-564 |', '| e | agentcfg:mcp-x |',
      '| f | wontfix/maybe |', '| g | docs.example |', '| h | high |', '| i | medium |', '| j | low |', ''].join('\n');
    const sb = tree({ '.claude-plugin/plugin.json': PLUGIN_JSON, 'workflows/engine.js': ENGINE, 'skills/x/t.md': table });
    const r = amb(sb, ['contract', sb.r]);
    robust(r, 'D2 lead token');
    ok(same(r.out, []), `D2 cells led by CWE-89 / agentcfg:x / wontfix/ / docs. are not values (${keys(r.out).join(', ')})`);
    sb.done();
  }

  // AC-001 (CLI shape for the other modes; their summary lines are asserted by the prose/code section):
  // kills a wrapper that only handles contract or prints nothing for a mode.
  {
    const sb = ac002(PRE_ROW);
    for (const mode of ['prose', 'code']) robust(amb(sb, [mode, sb.r]), `AC-001 ${mode} mode`);
    sb.done();
  }

  // AC-003: inline forms and the D21 vocabulary anchor. Kills: the prefix form missing (no line 2),
  // accepting unquoted words (line 7 `from`), not scanning fences (no line 4), treating `/` lists as
  // invalid, and an implementation without the anchor (the second run would emit severity records).
  {
    const INLINE = [
      'Severities are `critical`, `high`, `medium` or `low`.',
      'Record these at severity `info`.',
      '```json',
      '{ "severity": "info" }',
      '```',
      '`confidence` ("confirmed" | "probable" | "needs-owner-input")',
      'Pick severity from consequence of the wrong reading.',
      '`severity` ∈ critical/high/medium/low',
      'Bash(git status:*)',
      'Set severity to `info` when unsure.',
    ];
    const sb = tree({ '.claude-plugin/plugin.json': PLUGIN_JSON, 'workflows/engine.js': ENGINE, 'skills/x/inline.md': INLINE.join('\n') + '\n' });
    const r = amb(sb, ['contract', sb.r]);
    robust(r, 'AC-003');
    ok(same(keys(r.out), ['10@info@inline-connector', '2@info@inline-connector', '4@info@inline-assign', '6@probable@inline-list']),
      `AC-003 {line@value@via} is exactly 2/4/6/10 (${keys(r.out).join(', ')})`);
    ok(r.out?.find(x => x.line === 4)?.inFence === true && r.out?.find(x => x.line === 2)?.inFence === false, 'AC-003 the line-4 record has inFence:true (line 2 false)');
    fs.writeFileSync(path.join(sb.r, 'skills/x/inline.md'), INLINE.slice(1).join('\n') + '\n');
    const r2 = amb(sb, ['contract', sb.r]);
    robust(r2, 'AC-003 anchor removed');
    ok(same(keys(r2.out), ['5@probable@inline-list']), `AC-003 line 1 deleted → only 5@probable (severity loses its anchor) (${keys(r2.out).join(', ')})`);
    sb.done();
  }

  // AC-004: no schema → [] and the loud NOT-run line. Kills a run that reports a clean contract
  // (an `enums=0 ... emitted=0` summary) when nothing could be checked.
  {
    const sb = tree({ 'docs/a.md': '{ "severity": "info" }\n' });
    const r = amb(sb, ['contract', sb.r]);
    robust(r, 'AC-004');
    ok(same(r.out, []) && /no schema enums found .* NOT run/.test(r.stderr) && summary(r.stderr, 'contract') === null,
      `AC-004 no schema → [] + "no schema enums found … NOT run", no summary line (${r.stderr.trim()})`);
    sb.done();
  }

  // AC-005: package-root linking + basename mention. Kills: linking every enum in the repo to every
  // doc (first run non-empty), and ignoring a basename mention (second run empty).
  {
    const DOC = 'Severities are `low` or `high`. Set severity to `info`.\n';
    const sb = tree({ 'pkgA/package.json': '{}\n', 'pkgA/engine.js': ENGINE, 'pkgB/package.json': '{}\n', 'pkgB/doc.md': DOC });
    const r = amb(sb, ['contract', sb.r]);
    robust(r, 'AC-005 unlinked');
    ok(same(r.out, []), `AC-005 schema in pkgA, doc in pkgB → [] (${r.stdout.trim()})`);
    fs.writeFileSync(path.join(sb.r, 'pkgB/doc.md'), 'See engine.js. ' + DOC);
    const r2 = amb(sb, ['contract', sb.r]);
    robust(r2, 'AC-005 linked by basename');
    ok(r2.out?.length === 1 && r2.out[0].file === 'pkgB/doc.md' && r2.out[0].schema === 'pkgA/engine.js:2',
      `AC-005 "See engine.js" links pkgA's schema → 1 record (${JSON.stringify(r2.out)})`);
    sb.done();
  }

  // AC-006: union of same-named enums and alsoValidFor. Kills: first-enum-only (refuted would fire),
  // a different field's enum rescuing a value (likely/info would vanish), no anchor (status-noanchor
  // fires), GENERIC field names in alsoValidFor (`level` would join logLevel).
  {
    const sb = tree({
      '.claude-plugin/plugin.json': PLUGIN_JSON,
      'workflows/engine.js': [
        'const A = {',
        "  severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },",
        "  confidence: { type: 'string', enum: ['confirmed', 'likely'] },",
        "  status: { type: 'string', enum: ['patched', 'met'] },",
        "  logLevel: { type: 'string', enum: ['info', 'debug'] },",
        "  level: { type: 'string', enum: ['info', 'warn'] },",
        '}',
        'const B = {',
        "  confidence: { type: 'string', enum: ['confirmed-exploitable', 'likely', 'refuted'] },",
        '}', ''].join('\n'),
      'docs/union.md': 'Use `confirmed` or `likely`; set confidence: "refuted" when disproved.\n',
      'docs/status.md': 'Per engine.js, render the `likely` status.\n',
      'docs/status-noanchor.md': 'Render the `likely` status.\n',
      'docs/log.md': 'Use `severity: "info"`; severities are `low` or `high`.\n',
    });
    const r = amb(sb, ['contract', sb.r]);
    robust(r, 'AC-006');
    const by = f => (r.out ?? []).filter(x => x.file === f);
    ok(by('docs/union.md').length === 0, `AC-006 confidence: "refuted" is allowed by the union of both confidence enums (${JSON.stringify(by('docs/union.md'))})`);
    const st = by('docs/status.md');
    ok(st.length === 1 && st[0].field === 'status' && st[0].value === 'likely' && same(st[0].alsoValidFor, ['confidence']),
      `AC-006 "Per engine.js, render the \`likely\` status." → status=likely, alsoValidFor [confidence] (${JSON.stringify(st)})`);
    ok(by('docs/status-noanchor.md').length === 0, 'AC-006 same doc without "Per engine.js, " → [] (no anchor)');
    const lg = by('docs/log.md');
    ok(lg.length === 1 && lg[0].field === 'severity' && lg[0].value === 'info' && same(lg[0].alsoValidFor, ['logLevel']),
      `AC-006 logLevel enum does not rescue severity "info"; alsoValidFor is [logLevel], never GENERIC \`level\` (${JSON.stringify(lg)})`);
    sb.done();
  }

  // AC-007: same-file const enum (H5). Kills a harvest without H5 (enums=0 → NOT run, no record).
  {
    const sb = tree({
      '.claude-plugin/plugin.json': PLUGIN_JSON,
      'workflows/engine.js': "const HINTS = ['a', 'b', 'c']\nconst RULEBOOK = {\n  lensHint: { type: 'string', enum: HINTS },\n}\n",
      'docs/hints.md': '| lensHint |\n|---|\n| a |\n| zzz |\n',
    });
    const r = amb(sb, ['contract', sb.r]);
    robust(r, 'AC-007');
    ok(r.out?.length === 1 && r.out[0].field === 'lensHint' && r.out[0].value === 'zzz' && r.out[0].line === 4 && r.out[0].schema === 'workflows/engine.js:3',
      `AC-007 enum: HINTS (const array) → one lensHint record for zzz (${JSON.stringify(r.out)})`);
    sb.done();
  }

  // AC-013: determinism. Kills readdir-order or localeCompare-dependent output.
  {
    const files = { '.claude-plugin/plugin.json': PLUGIN_JSON, 'workflows/engine.js': ENGINE, 'skills/x/checklist.md': checklist(PRE_ROW), 'skills/B/other.md': checklist(PRE_ROW), 'skills/a/more.md': checklist(PRE_ROW) };
    const a = tree(files);
    const b = tree({});
    for (const [rel, body] of Object.entries(files).reverse()) put(b.r, { [rel]: body });
    const ra = amb(a, ['contract', a.r]), rb = amb(b, ['contract', b.r]);
    ok(ra.out?.length === 3 && ra.stdout === rb.stdout, `AC-013 forward vs reverse creation order → byte-identical stdout (${ra.out?.map(x => x.file).join(',')})`);
    ok(same(ra.out?.map(x => x.file), ['skills/B/other.md', 'skills/a/more.md', 'skills/x/checklist.md']), 'AC-013 records sorted by file in code-point order (B < a)');
    a.done(); b.done();
  }

  // AC-014: robustness. Every case: exit 0 and parseable JSON.
  {
    const sb = ac002(PRE_ROW);
    const miss = amb(sb, ['contract', path.join(sb.root, 'nope')]);
    robust(miss, 'AC-014 missing root');
    ok(same(miss.out, []) && /root not found/.test(miss.stderr), 'AC-014 missing root → [] + "root not found"');
    const bogus = amb(sb, ['bogus', sb.r]);
    robust(bogus, 'AC-014 bogus mode');
    ok(same(bogus.out, []) && /unknown mode 'bogus'/.test(bogus.stderr), "AC-014 mode bogus → [] + \"unknown mode 'bogus'\"");
    const none = amb(sb, [], {});
    robust(none, 'AC-014 no mode');
    ok(/unknown mode '' \(code\|prose\|contract\), NOTHING scanned/.test(none.stderr), 'AC-014 missing mode → unknown mode line');
    // CRLF copy (kills line counting that treats \r\n as two breaks, and \r leaking into values)
    put(sb.r, { 'skills/x/checklist.md': checklist(PRE_ROW).replace(/\n/g, '\r\n') });
    const crlf = amb(sb, ['contract', sb.r]);
    robust(crlf, 'AC-014 CRLF');
    ok(crlf.out?.length === 1 && crlf.out[0].line === 6 && crlf.out[0].value === 'info' && !/\r/.test(crlf.stdout), `AC-014 CRLF copy of AC-002 → line 6 (${JSON.stringify(crlf.out?.map(x => x.line))})`);
    // --exclude drops the doc (kills an exclude that is parsed but never applied)
    const ex = amb(sb, ['contract', sb.r, '--exclude', 'skills/**']);
    robust(ex, 'AC-014 --exclude');
    ok(same(ex.out, []) && summary(ex.stderr, 'contract')?.docs === '0', `AC-014 --exclude 'skills/**' → [] and docs=0 (${ex.stderr.trim()})`);
    // a quote and a tab in the file name (kills hand-built JSON)
    const weird = 'skills/we"ird\tname.md';
    put(sb.r, { [weird]: checklist(PRE_ROW) });
    const w = amb(sb, ['contract', sb.r]);
    robust(w, 'AC-014 weird file name');
    ok((w.out ?? []).some(x => x.file === weird && x.line === 6), 'AC-014 doc named we"ird<TAB>name.md → valid JSON whose file round-trips');
    sb.done();
    const nn = tree({ 'docs/a.md': 'x\n' }, { noNode: true });
    const r1 = amb(nn, ['contract', nn.r]);
    robust(r1, 'AC-014 no node');
    ok(same(r1.out, []) && /node not found, NOTHING scanned/.test(r1.stderr), 'AC-014 no node on PATH → [] + "node not found, NOTHING scanned"');
    nn.done();
    const fake = sandbox({ node: 'exit 3' }, { noNode: true });
    const r2 = amb(fake, ['contract', fake.root]);
    robust(r2, 'AC-014 helper exits 3');
    ok(same(r2.out, []) && /helper failed \(exit 3\), NOTHING scanned/.test(r2.stderr), 'AC-014 helper exits 3 with no output → [] + "helper failed (exit 3)"');
    fake.done();
  }

  // main.mjs: the AMBIGUITY_MAX cap is loud and emitted= counts what was kept. Kills a silent
  // truncation (omissions.sh's head -n 500) and an emitted= that counts pre-cap records.
  {
    const sb = ac002(PRE_ROW, { 'skills/y/checklist.md': checklist(PRE_ROW), 'skills/z/checklist.md': checklist(PRE_ROW) });
    const r = amb(sb, ['contract', sb.r], { env: { AMBIGUITY_MAX: '2' } });
    robust(r, 'cap');
    ok(r.out?.length === 2 && /3 record\(s\), truncated to 2/.test(r.stderr) && summary(r.stderr, 'contract')?.emitted === '2',
      `AMBIGUITY_MAX=2 over 3 records → 2 kept, loud truncation line, emitted=2 (${r.stderr.trim().split('\n').join(' | ')})`);
    sb.done();
  }

  // Skips: CHANGELOG/LICENSE docs and fixtures/**/*.example.* are not scanned, but a run rooted AT the
  // case dir still sees the .example file. Kills a walk without the skips, and a skip that ignores the root.
  {
    const sb = ac002(PRE_ROW, {
      'CHANGELOG.md': checklist(PRE_ROW), 'LICENSE.md': checklist(PRE_ROW),
      'fixtures/case/.claude-plugin/plugin.json': PLUGIN_JSON, 'fixtures/case/workflows/engine.js': ENGINE,
      'fixtures/case/skills/x/checklist.example.md': checklist(PRE_ROW),
    });
    const r = amb(sb, ['contract', sb.r]);
    robust(r, 'skips');
    ok(same(r.out?.map(x => x.file), ['skills/x/checklist.md']) && summary(r.stderr, 'contract')?.docs === '1',
      `CHANGELOG.md, LICENSE.md and fixtures/**/*.example.md are skipped (${r.out?.map(x => x.file).join(',')})`);
    const c = amb(sb, ['contract', path.join(sb.r, 'fixtures/case')]);
    ok(same(c.out?.map(x => `${x.file}:${x.line}`), ['skills/x/checklist.example.md:6']), 'rooted at the case dir, the .example doc is scanned');
    sb.done();
  }

  // Dynamic import (D23): a broken prose.mjs cannot break a contract run. Kills a static import of
  // every mode module in main.mjs.
  {
    const sb = ac002(PRE_ROW);
    const copy = path.join(sb.root, 'toolcopy');
    fs.mkdirSync(path.join(copy, 'ambiguity'), { recursive: true });
    fs.copyFileSync(path.join(TOOLS, 'ambiguity.sh'), path.join(copy, 'ambiguity.sh'));
    for (const f of fs.readdirSync(AMB)) fs.copyFileSync(path.join(AMB, f), path.join(copy, 'ambiguity', f));
    fs.writeFileSync(path.join(copy, 'ambiguity', 'prose.mjs'), 'export function scanProse( {\n');
    fs.writeFileSync(path.join(copy, 'ambiguity', 'code.mjs'), "throw new Error('half-edited');\n");
    const r = spawnSync('/bin/bash', [path.join(copy, 'ambiguity.sh'), 'contract', sb.r], { encoding: 'utf8' });
    let out = null; try { out = JSON.parse(r.stdout); } catch { /* asserted */ }
    ok(r.status === 0 && out?.length === 1 && out[0].line === 6, `a syntax error in prose.mjs and a throwing code.mjs leave contract mode working (${r.stderr.trim()})`);
    const p = spawnSync('/bin/bash', [path.join(copy, 'ambiguity.sh'), 'prose', sb.r], { encoding: 'utf8' });
    ok(p.status === 0 && p.stdout.trim() === '[]' && /helper failed \(exit 1\), NOTHING scanned/.test(p.stderr), 'the broken mode itself fails loud: [] + helper failed (exit 1)');
    sb.done();
  }

  // AC-016: docClass and the rule matrix (pure). Kills: substring matching (`myagents/x.md`), a
  // leading-`/` requirement (`agents/a.md`), policy checked after instruction (`skills/SECURITY.md`).
  {
    const want = {
      instruction: ['agents/a.md', 'plugins/p/skills/x/checklist.md', 'skills/triage/triage.example.md', '.claude/rules/r.md', 'commands/run.md', 'SKILL.md'],
      policy: ['SECURITY.md', 'docs/SECURITY.md', 'SECURITY.example.md', 'CONTRIBUTING.md', 'skills/SECURITY.md'],
      reference: ['release.example.md', 'myagents/x.md', 'README.md', 'docs/agents.md'],
    };
    const wrong = Object.entries(want).flatMap(([cls, fs_]) => fs_.filter(f => docClass(f) !== cls).map(f => `${f}→${docClass(f)} (want ${cls})`));
    ok(wrong.length === 0, `AC-016 docClass over the path table (${wrong.join('; ') || 'all match'})`);
    ok(same(DOC_CLASS_RULES, {
      policy: ['scope-clause', 'contradiction', 'unit', 'vague-conditional'],
      instruction: ['contract-mismatch', 'contradiction', 'vague-conditional', 'unit', 'overloaded-term', 'scope-clause'],
      reference: ['contract-mismatch', 'unit', 'contradiction'],
    }), 'AC-016 DOC_CLASS_RULES equals the §2.1 matrix');
    // the 9 rows of §1 (`ambiguity:unit` is both a prose and a code row)
    const SPEC_ROWS = ['contract-mismatch', 'scope-clause', 'vague-conditional', 'unit', 'contradiction', 'overloaded-term', 'unit', 'falsy-default', 'sentinel'].map(r => `ambiguity:${r}`);
    ok(same([...new Set(RULE_IDS)].sort(), [...new Set(SPEC_ROWS)].sort()) && RULE_IDS.length === new Set(RULE_IDS).size, `AC-016 RULE_IDS is set-equal to the §1 rule ids (${RULE_IDS.length} distinct)`);
  }

  // AC-017: the fail-closed check and the engine-source parsers. Kills: a check that only filters
  // stdout (passes the no-schema and helper-failed cases), a parser that silently returns {} / [].
  {
    const pre = ac002(PRE_ROW);
    const a = runContractCheck({ root: pre.r, minDocs: 1 });
    ok(!a.ok && a.offenders.length === 1 && a.offenders[0].line === 6, `AC-017 pre-fix sandbox → !ok with exactly one offender (${a.problems.join(' | ')})`);
    pre.done();
    const noSchema = tree({ 'docs/a.md': '{ "severity": "info" }\n' });
    const b = runContractCheck({ root: noSchema.r, minDocs: 1 });
    ok(!b.ok && b.problems.some(p => /enums/.test(p)), `AC-017 no-schema sandbox → !ok naming enums (${b.problems.join(' | ')})`);
    noSchema.done();
    const post = ac002(POST_ROW);
    const c = runContractCheck({ root: post.r, minDocs: 5 });
    ok(!c.ok && c.problems.some(p => /docs/.test(p)) && c.offenders.length === 0, `AC-017 minDocs 5 over 1 doc → !ok naming docs (${c.problems.join(' | ')})`);
    // the fake prints a VALID summary too, so only the helper-failed rule can catch it
    const fakeTool = path.join(post.root, 'fake-ambiguity.sh');
    fs.writeFileSync(fakeTool, "#!/bin/bash\necho '[]'\necho 'ambiguity.sh contract: enums=2 fields=[a,b] docs=5 emitted=0' >&2\necho 'ambiguity.sh: helper failed (exit 3), NOTHING scanned' >&2\n", { mode: 0o755 });
    const d = runContractCheck({ root: post.r, minDocs: 1, tool: fakeTool });
    ok(!d.ok && d.problems.some(p => /helper failed/.test(p)), `AC-017 fake tool printing [] + helper failed → !ok naming helper failed (${d.problems.join(' | ')})`);
    // one fake per rule, each breaking exactly that rule, so the named problem is the only thing that
    // can fail it. Kills: dropping the missing-summary rule (a bare `[]` passed), the not-JSON rule,
    // the enums=0 summary branch, the could-not-run rule, first-summary-wins (a forged early line),
    // and ignoring skipped / truncated lines (a doc or a record silently left out).
    const fake = (name, out, err) => {
      const f = path.join(post.root, `${name}.sh`);
      fs.writeFileSync(f, `#!/bin/bash\nprintf '%s\\n' ${JSON.stringify(out)}\n${err.map(l => `printf '%s\\n' ${JSON.stringify(l)} >&2`).join('\n')}\n`, { mode: 0o755 });
      return runContractCheck({ root: post.r, minDocs: 1, tool: f });
    };
    const GOOD = 'ambiguity.sh contract: enums=2 fields=[a,b] docs=3 emitted=0';
    const only = (res, re) => !res.ok && res.problems.length === 1 && re.test(res.problems[0]);
    const g0 = fake('good', '[]', [GOOD]);
    ok(g0.ok, `AC-017 control: a fake with [] + a valid summary → ok (${g0.problems.join(' | ') || 'no problems'})`);
    const g1 = fake('nosum', '[]', []);
    ok(only(g1, /no `ambiguity\.sh contract:/), `AC-017 [] with no stderr → !ok naming the missing summary line (${g1.problems.join(' | ')})`);
    const g2 = fake('notjson', 'not json', [GOOD]);
    ok(only(g2, /stdout is not a JSON array/), `AC-017 non-JSON stdout + valid summary → !ok naming it (${g2.problems.join(' | ')})`);
    const g3 = fake('enums0', '[]', ['ambiguity.sh contract: enums=0 fields=[] docs=3 emitted=0']);
    ok(only(g3, /enums=0/), `AC-017 summary with enums=0 and no NOT-run line → !ok naming enums=0 (${g3.problems.join(' | ')})`);
    const g4 = runContractCheck({ root: post.r, minDocs: 1, tool: path.join(post.root, 'does-not-exist.sh') });
    ok(!g4.ok && g4.problems.some(p => /could not run/.test(p)), `AC-017 a tool path that does not exist → !ok naming could not run (${g4.problems.join(' | ')})`);
    const g5 = fake('forged', '[]', ['ambiguity.sh contract: enums=2 fields=[a,b] docs=40 emitted=0', 'ambiguity.sh contract: enums=2 fields=[a,b] docs=1 emitted=0']);
    const g5b = runContractCheck({ root: post.r, minDocs: 5, tool: path.join(post.root, 'forged.sh') });
    ok(!g5.ok && g5.problems.some(p => /more than one/.test(p)) && g5b.summary.docs === 1 && g5b.problems.some(p => /docs=1 is below/.test(p)),
      `AC-017 two summary lines → !ok, and the LAST one is the summary (${g5b.problems.join(' | ')})`);
    const g6 = fake('skipped', '[]', ['ambiguity.sh: skipped docs/x.md: not valid UTF-8', GOOD]);
    ok(only(g6, /skipped docs\/x\.md/), `AC-017 a skipped doc → !ok naming it (${g6.problems.join(' | ')})`);
    const g7 = fake('trunc', '[]', ['ambiguity.sh: 900 record(s), truncated to 500', GOOD]);
    ok(only(g7, /truncated to 500/), `AC-017 a truncated record list → !ok naming it (${g7.problems.join(' | ')})`);
    const g8 = fake('pruned', '[]', ['ambiguity.sh: pruned dist/ (generated output)', GOOD]);
    ok(g8.ok, `AC-017 a pruned generated-output dir is not a failure (${g8.problems.join(' | ') || 'no problems'})`);
    const e = runContractCheck({ root: post.r, minDocs: 1 });
    ok(e.ok && e.summary.enums === 2 && e.summary.docs === 1, `AC-017 post-fix sandbox → ok (${e.problems.join(' | ') || 'no problems'})`);
    const cli = spawnSync(process.execPath, [path.join(PLUGIN, 'tests/lib/contract-check.mjs'), '--root', post.r, '--min-docs', '1'], { encoding: 'utf8' });
    ok(cli.status === 0 && /^contract-check OK: enums=2 docs=1 emitted=0$/m.test(cli.stdout), `AC-017 CLI ok line + exit 0 (${cli.stdout.trim()})`);
    const cliBad = spawnSync(process.execPath, [path.join(PLUGIN, 'tests/lib/contract-check.mjs'), '--root', post.r, '--min-docs', '9'], { encoding: 'utf8' });
    ok(cliBad.status === 1 && /docs=1/.test(cliBad.stdout), 'AC-017 CLI exits 1 and prints the problem');
    post.done();

    const POLICY = ['**/SECURITY.md', '**/CONTRIBUTING.md', '**/CODE_OF_CONDUCT.md', '**/PRIVACY*.md', '**/SUPPORT.md', '**/GOVERNANCE.md', 'README.md'];
    const INSTR = ['**/.claude/**/*.md', '**/skills/**/*.md', '**/agents/*.md', '**/commands/*.md', '**/.cursor/rules/**', '**/.github/copilot-instructions.md', '**/CLAUDE.md', '**/AGENTS.md'];
    const EXCL = ['**/CHANGELOG*.md', '**/HISTORY.md', '**/LICENSE*', '**/NOTICE*.md', '**/fixtures/**', '**/node_modules/**', '**/vendor/**'];
    const HINTS = ['security', 'correctness', 'architecture', 'docs-drift', 'sca', 'iac', 'container', 'k8s', 'supply-chain', 'compliance', 'concurrency', 'state-machine', 'economic', 'omission', 'agent-config', 'ambiguity', 'any'];
    const q = a_ => a_.map(s => `'${s}'`).join(',');
    const SRC = [
      `const LENS_HINTS = [${q(HINTS)}]`,
      'const scopeGlobs = gs => scopePath ? gs.map(g => `${scopePath}/${g}`) : gs',
      'const AMBIGUITY_PROSE_DEFAULT = {',
      `  policy: [${q(POLICY)}],`,
      `  instructions: [${q(INSTR)}],`,
      '}',
      `const AMBIGUITY_EXCLUDE_DEFAULT = [${q(EXCL)}]`,
      'const ambCfg = config.ambiguity ?? {}', ''].join('\n');
    ok(same(parseProseDefault(SRC), { policy: POLICY, instructions: INSTR }), 'AC-017 parseProseDefault returns the exact policy + instructions arrays');
    ok(same(parseExcludeDefault(SRC), EXCL), 'AC-017 parseExcludeDefault returns the exact exclude array');
    ok(same(parseLensHints(SRC), HINTS), 'AC-017 parseLensHints returns the exact LENS_HINTS array');
    const throws = fn => { try { fn(); return false; } catch { return true; } };
    const BARE = 'const config = {}\n';
    ok(throws(() => parseProseDefault(BARE)) && throws(() => parseExcludeDefault(BARE)) && throws(() => parseLensHints(BARE)),
      'AC-017 every parser throws on a source without its literal');
    ok(throws(() => parseLensHints("const LENS_HINTS = ['a', B]")) && throws(() => parseProseDefault('const AMBIGUITY_PROSE_DEFAULT = {\n  policy: [\'a\'],\n}')),
      'AC-017 parsers throw on an unparseable literal (non-string element, missing instructions)');
  }
}

// ── ambiguity.sh: prose + code (SPEC-v4-ambiguity.md §3.4, §3.6, AC-001 prose/code lines, AC-008..AC-012, AC-015) ─
console.log('ambiguity.sh: prose + code');
{
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const put = (root, files) => {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
  };
  // a sandbox whose scan root is <sandbox>/r (keeps bin/ and tmp/ out of the walk)
  const tree = (files) => { const sb = sandbox({}); sb.r = path.join(sb.root, 'r'); fs.mkdirSync(sb.r); put(sb.r, files); return sb; };
  const amb = (sb, args, opts) => {
    const r = sb.run('ambiguity.sh', args, opts);
    let out = null;
    try { out = JSON.parse(r.stdout); } catch { /* asserted by robust() */ }
    return { ...r, out };
  };
  const robust = (r, label) => ok(r.status === 0 && Array.isArray(r.out), `${label}: exit 0 and stdout is one JSON array`);
  // stderr summary line → { key: value } (parsed, never substring-matched)
  const summary = (stderr, mode) => {
    const l = stderr.split('\n').find(x => x.startsWith(`ambiguity.sh ${mode}: `) && /=/.test(x));
    if (!l) return null;
    return Object.fromEntries([...l.slice(`ambiguity.sh ${mode}: `.length).matchAll(/(\w+)=(\[[^\]]*\]|\S+)/g)].map(m => [m[1], m[2]]));
  };
  const kl = (out) => (out ?? []).map(x => `${x.kind}@${x.line}`).sort();
  // one run of `ambiguity.sh <mode> <root>` over a fresh tree
  const scan = (mode, files, opts) => { const sb = tree(files); const r = amb(sb, [mode, sb.r], opts); sb.done(); return r; };

  // AC-008 + AC-001 (code summary). Kills: no `??` distinction (L2), no comment strip (L12), any
  // loose-match detector (L7), no documented-sentinel exemption (L10 flags), a window that looks at
  // lines below (L9 exempted by L10's comment), no call-option skip (L6), a unit test on the name's
  // prefix instead of its ending (L5). L3, L11 and L13 are exempt for other reasons (non-numeric
  // default, `list` is no limit name, "disables" documents the sentinel), so the string mask and the
  // indexOf exemption are pinned by the "guards only the guard can save" case below.
  const AC008 = [
    'config.retries || 3',
    'config.retries ?? 3',
    "user.name || 'anonymous'",
    'export const CACHE_TTL = 3600;',
    'export const CACHE_TTL_SECONDS = 3600;',
    'await page.goto(url, { timeout: 30000 });',
    "if (origin.startsWith('https://example.com')) allow();",
    'if (ALLOWED_ORIGINS.includes(origin)) allow();',
    'const maxRetries = -1;',
    'const maxRetries2 = -1; // -1 means unlimited',
    'if (list.indexOf(x) === -1) add(x);',
    '// const timeout = 30',
    "log('maxRounds: 0 disables it');",
  ];
  {
    const r = scan('code', { 'src/a.ts': AC008.join('\n') + '\n' });
    robust(r, 'AC-008');
    ok(same(kl(r.out), ['falsy-default@1', 'sentinel@9', 'unit@4']), `AC-008 kind@line is exactly falsy-default@1, unit@4, sentinel@9 (${kl(r.out).join(', ')})`);
    const u = r.out?.find(x => x.kind === 'unit') ?? {};
    ok(u.file === 'src/a.ts' && u.rule === 'ambiguity:unit' && u.detail === 'CACHE_TTL' && u.signal === 'export const CACHE_TTL = 3600;',
      `AC-008 unit record carries rule, detail = the name, trimmed code signal (${JSON.stringify(u)})`);
    ok(r.out?.find(x => x.kind === 'falsy-default')?.rule === 'ambiguity:falsy-default' && r.out?.find(x => x.kind === 'sentinel')?.rule === 'ambiguity:sentinel',
      'AC-008 falsy-default and sentinel records carry their ambiguity: rule ids');
    // AC-001: the code summary line parsed into key=value (kills a summary that drifts from §3.3)
    const s = summary(r.stderr, 'code');
    ok(s && s.files === '1' && s.skippedTests === '0' && s.emitted === '3', `AC-001 code summary parses to files=1 skippedTests=0 emitted=3 (${JSON.stringify(s)})`);
    // the documented-sentinel window is line i and line i-1 ONLY. b: the comment above exempts;
    // c: a comment below never exempts; d: a comment two lines up never exempts.
    const w = scan('code', {
      'src/b.ts': '// -1 means unlimited\nconst maxRetries = -1;\n',
      'src/c.ts': 'const maxRetries = -1;\n// -1 means unlimited\n',
      'src/d.ts': '// -1 means unlimited\n\nconst maxRetries = -1;\n',
    });
    ok(same((w.out ?? []).map(x => `${x.file}:${x.kind}@${x.line}`), ['src/c.ts:sentinel@1', 'src/d.ts:sentinel@3']),
      `AC-008 sentinel window: line above exempts, line below and two lines up never do (${(w.out ?? []).map(x => `${x.file}:${x.kind}@${x.line}`).join(', ')})`);
  }

  // AC-009: test paths and globs. Kills: no test-path skip, a skippedTests count that never moves,
  // an AMBIGUITY_INCLUDE_TESTS that is ignored, and bash-case globbing (`src/**/*.ts` misses `src/a.ts`).
  {
    const files = { 'tests/a.test.ts': `${AC008[0]}\n` };
    const d = scan('code', files);
    robust(d, 'AC-009 default');
    const ds = summary(d.stderr, 'code');
    ok(same(d.out, []) && ds?.skippedTests === '1' && ds?.files === '0', `AC-009 tests/a.test.ts skipped: [] and skippedTests=1 (${JSON.stringify(ds)})`);
    const inc = scan('code', files, { env: { AMBIGUITY_INCLUDE_TESTS: '1' } });
    ok(same(kl(inc.out), ['falsy-default@1']) && inc.out?.[0]?.file === 'tests/a.test.ts' && summary(inc.stderr, 'code')?.skippedTests === '0',
      `AC-009 AMBIGUITY_INCLUDE_TESTS=1 → one record (${kl(inc.out).join(', ')})`);
    const sb = tree({ 'src/a.ts': `${AC008[0]}\n`, 'lib/b.ts': `${AC008[0]}\n` });
    const g = amb(sb, ['code', sb.r, 'src/**/*.ts']);
    ok(same((g.out ?? []).map(x => `${x.file}@${x.line}`), ['src/a.ts@1']), `AC-009 glob src/**/*.ts → only src/a.ts (${(g.out ?? []).map(x => x.file).join(', ')})`);
    sb.done();
  }

  // AC-010 + AC-001 (prose summary). Kills: line-by-line scanning (no join: the line-7 signal lacks
  // line 8), no fence skip (line 14 normative / normative=1), a naive unit regex (line 3 "3 business
  // days"), flagging every "should" (line 17), a heading stack that never pops (lines 17-18 tagged
  // scope), headings as units (line 5 or 11), each sentence reporting its unit's first line (unit@17).
  {
    const SEC = [
      '# Security',
      '',
      'We reply within 3 business days.',
      '',
      '## Out of scope',
      '',
      '- Issues in the hosting provider, database or email service you run Acme on, and findings that need',
      '  access an admin already has.',
      '- Missing rate limits.',
      '',
      '## Notes',
      '',
      '```',
      'You MUST NOT run this.',
      '```',
      '',
      'This should take about a minute.',
      'Retry after 30.',
    ];
    const r = scan('prose', { 'SECURITY.md': SEC.join('\n') + '\n' });
    robust(r, 'AC-010 SECURITY.md');
    ok(same(kl(r.out), ['scope@7', 'scope@9', 'unit@18']), `AC-010 record set is exactly scope@7, scope@9, unit@18 (${kl(r.out).join(', ')})`);
    const s7 = r.out?.find(x => x.kind === 'scope' && x.line === 7) ?? {};
    ok(s7.docClass === 'policy' && s7.heading === 'Out of scope' && s7.rule === 'ambiguity:scope-clause'
      && /^Issues in the hosting provider/.test(s7.signal ?? '') && (s7.signal ?? '').includes('admin already has.'),
      `AC-010 scope@7: policy, heading "Out of scope", signal joins lines 7-8 (${JSON.stringify(s7.signal)})`);
    ok(r.out?.find(x => x.line === 9)?.heading === 'Out of scope', 'AC-010 scope@9 has heading "Out of scope"');
    const u = r.out?.find(x => x.kind === 'unit') ?? {};
    ok(u.rule === 'ambiguity:unit' && u.signal === 'Retry after 30.' && Array.isArray(u.terms) && u.terms.includes('after'),
      `AC-010 unit@18 is its own sentence with terms (${JSON.stringify(u)})`);
    // AC-001: the prose summary line parsed into key=value. 5 sentences: L3, L7-8, L9, L17, L18.
    const s = summary(r.stderr, 'prose');
    ok(s && s.files === '1' && s.sentences === '5' && s.normative === '0' && s.emitted === '3',
      `AC-001 prose summary parses to files=1 sentences=5 normative=0 emitted=3 (${JSON.stringify(s)})`);
    const CFG = ['| Key | Meaning | Default |', '|---|---|---|', '| verify.maxWait | How long a voter may run. | 300 |',
      '| verify.voters | Voters. | 3 |', '| verify.maxWaitMs | Same, explicit. | 300000 |'];
    const c = scan('prose', { 'docs/config.md': CFG.join('\n') + '\n' });
    ok(same(kl(c.out), ['unit@3']) && c.out?.[0]?.docClass === 'reference',
      `AC-010 docs/config.md → exactly unit@3, docClass reference (kills a table detector that ignores the name test) (${kl(c.out).join(', ')})`);
  }

  // AC-011: sentence split, vague-conditional, docClass via common.docClass. Kills: no abbreviation
  // protection (splits inside `e.g.`; `a.b` never splits, code-span masking is pinned by the "guards
  // only the guard can save" case below), flagging every conditional
  // ("If the build fails" has no vague term), a `/agents/` substring docClass (root-level agents/x.md
  // would be `reference`), and the unless-scope form applied outside policy docs.
  {
    const r = scan('prose', { 'notes.md': 'Use `a.b` here, e.g. in tests. Merge the PR if the checks are mostly green.\n\nIf the build fails, stop.\n' });
    robust(r, 'AC-011');
    ok(same(kl(r.out), ['vague-conditional@1']) && /^Merge the PR/.test(r.out?.[0]?.signal ?? '') && r.out?.[0]?.rule === 'ambiguity:vague-conditional',
      `AC-011 exactly one vague-conditional@1 whose signal starts "Merge the PR" (${JSON.stringify(r.out)})`);
    ok(summary(r.stderr, 'prose')?.sentences === '3', `AC-011 3 sentences: no split inside \`a.b\` or e.g. (${JSON.stringify(summary(r.stderr, 'prose'))})`);
    // abbreviation protection with a capitalised next word, and code spans restored in the signal
    const eg = scan('prose', { 'notes.md': 'Pick `semgrep.yml`, e.g. Semgrep, when relevant.\n' });
    ok(same(kl(eg.out), ['vague-conditional@1']) && eg.out?.[0]?.signal === 'Pick `semgrep.yml`, e.g. Semgrep, when relevant.',
      `AC-011 "e.g. Semgrep" is not a sentence break; signal restores the code span (${JSON.stringify(eg.out?.[0]?.signal)})`);
    const a = scan('prose', { 'agents/x.md': 'Stop unless the build is mostly green.\n' });
    ok(a.out?.length === 1 && a.out[0].kind === 'vague-conditional' && a.out[0].docClass === 'instruction' && a.out[0].file === 'agents/x.md',
      `AC-011 root-level agents/x.md → exactly one vague-conditional, docClass instruction, no scope (${JSON.stringify(a.out)})`);
  }

  // AC-012: denominator honesty. Kills: N counting only sentences with no other kind (normative=2),
  // all-sites mode suppressing normative on the overlapping scope sentence (2 records), all-sites mode
  // dropping the scope record, normative records leaking into a default run.
  {
    const files = { 'CONTRIBUTING.md': ['# Contributing', '', 'You must sign your commits.', '', 'Never force-push to main.', '',
      'You must not report issues that are out of scope.', '', 'Thanks for helping.', ''].join('\n') };
    const d = scan('prose', files);
    robust(d, 'AC-012 default');
    ok(summary(d.stderr, 'prose')?.normative === '3' && same(kl(d.out), ['scope@7']),
      `AC-012 default: normative=3, zero normative records, exactly one scope record (${kl(d.out).join(', ')}; ${JSON.stringify(summary(d.stderr, 'prose'))})`);
    const all = scan('prose', files, { env: { AMBIGUITY_ALL_SITES: '1' } });
    ok(same(kl(all.out), ['normative@3', 'normative@5', 'normative@7', 'scope@7']),
      `AC-012 AMBIGUITY_ALL_SITES=1: 3 normative records (one on the scope line) + the scope record (${kl(all.out).join(', ')})`);
    ok(same(all.out?.find(x => x.kind === 'scope'), d.out?.find(x => x.kind === 'scope')) && all.out?.find(x => x.kind === 'normative')?.rule === 'ambiguity:site',
      'AC-012 the scope record is identical in both runs; normative records use rule ambiguity:site');
  }

  // AC-015: cap. Kills a silent `head -n 500` (no truncation line) and an uncapped run (600 records).
  {
    const r = scan('code', { 'src/many.ts': Array(600).fill('retries || 3').join('\n') + '\n' }, { env: { AMBIGUITY_MAX: '500' } });
    robust(r, 'AC-015');
    ok(r.out?.length === 500 && r.out.every(x => x.kind === 'falsy-default') && r.out[499].line === 500,
      `AC-015 600 records capped to the first 500 (got ${r.out?.length})`);
    ok(/600 record\(s\), truncated to 500/.test(r.stderr) && summary(r.stderr, 'code')?.emitted === '500',
      `AC-015 stderr says "600 record(s), truncated to 500" and emitted=500 (${JSON.stringify(summary(r.stderr, 'code'))})`);
  }
}

// ── ambiguity.sh: review-round fixes and teeth (SPEC-v4-ambiguity.md §15, 2026-11-02) ─
// Each case names the broken implementation it kills. Fix cases fail on the pre-review tool; teeth
// cases pin guards that a mutation could remove with the suite green.
console.log('ambiguity.sh: review-round fixes and teeth');
{
  const { sortRecords, docClass } = await import(pathToFileURL(path.join(TOOLS, 'ambiguity', 'common.mjs')).href);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const put = (root, files) => {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
  };
  const tree = (files) => { const sb = sandbox({}); sb.r = path.join(sb.root, 'r'); fs.mkdirSync(sb.r); put(sb.r, files); return sb; };
  const amb = (sb, args, opts) => {
    const r = sb.run('ambiguity.sh', args, opts);
    let out = null;
    try { out = JSON.parse(r.stdout); } catch { /* asserted below */ }
    return { ...r, out };
  };
  const summary = (stderr, mode) => {
    const l = stderr.split('\n').find(x => x.startsWith(`ambiguity.sh ${mode}: `) && /=/.test(x));
    if (!l) return null;
    return Object.fromEntries([...l.slice(`ambiguity.sh ${mode}: `.length).matchAll(/(\w+)=(\[[^\]]*\]|\S+)/g)].map(m => [m[1], m[2]]));
  };
  const scan = (mode, files, extra = [], opts) => { const sb = tree(files); const r = amb(sb, [mode, sb.r, ...extra], opts); sb.done(); return r; };
  const kfl = (out) => (out ?? []).map(x => `${x.kind}@${x.file}:${x.line}`).sort();
  const keys = (out) => (out ?? []).map(x => `${x.line}@${x.field}@${x.value}@${x.via}`).sort();
  const SCHEMA = [
    'const REVIEW_SCHEMA = {',
    "  severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },",
    "  confidence: { type: 'string', enum: ['confirmed', 'likely', 'needs-owner-input'] },",
    '}', ''].join('\n');
  const VAGUE = 'Merge the PR if the checks are mostly green.\n';
  const table = (header, rows) => [`| Rule | ${header} |`, '|---|---|', ...rows.map((v, i) => `| r${i} | ${v} |`)].join('\n') + '\n';

  // D23 isolation. Kills prose.mjs importing a sibling mode module (a syntax error in code.mjs broke
  // every prose run as `helper failed`).
  {
    const sb = tree({ 'docs/a.md': VAGUE, 'src/a.ts': 'const x = cfg.retries || 3;\n', 'engine.js': SCHEMA });
    const copy = path.join(sb.root, 'toolcopy');
    fs.mkdirSync(path.join(copy, 'ambiguity'), { recursive: true });
    fs.copyFileSync(path.join(TOOLS, 'ambiguity.sh'), path.join(copy, 'ambiguity.sh'));
    for (const f of fs.readdirSync(path.join(TOOLS, 'ambiguity'))) fs.copyFileSync(path.join(TOOLS, 'ambiguity', f), path.join(copy, 'ambiguity', f));
    const pristine = Object.fromEntries(['code', 'prose', 'contract'].map(m => [m, fs.readFileSync(path.join(copy, 'ambiguity', `${m}.mjs`), 'utf8')]));
    for (const mode of ['prose', 'code', 'contract']) {
      for (const m of Object.keys(pristine)) fs.writeFileSync(path.join(copy, 'ambiguity', `${m}.mjs`), m === mode ? pristine[m] : 'export const broken = ;\n');
      const r = spawnSync('/bin/bash', [path.join(copy, 'ambiguity.sh'), mode, sb.r], { encoding: 'utf8', env: { PATH: process.env.PATH } });
      ok(!/helper failed|internal error/.test(r.stderr) && summary(r.stderr, mode) !== null,
        `D23 ${mode} runs while every sibling mode module is a syntax error (${r.stderr.trim().split('\n').pop()})`);
    }
    sb.done();
  }

  // Generated-dir pruning. Kills pruning `build`/`dist` at any depth (skills/build/SKILL.md, a real
  // instruction doc in cklph-os, vanished with a clean files=0) and pruning without saying so.
  {
    const r = scan('prose', { 'skills/build/SKILL.md': VAGUE, 'build/out.md': VAGUE, 'pkg/dist/x.md': VAGUE });
    ok(same(kfl(r.out), ['vague-conditional@skills/build/SKILL.md:1']) && summary(r.stderr, 'prose')?.files === '1',
      `prune: skills/build/SKILL.md is scanned; build/ and pkg/dist/ are not (${kfl(r.out).join(', ')}; ${JSON.stringify(summary(r.stderr, 'prose'))})`);
    ok(/^ambiguity\.sh: pruned build\/ /m.test(r.stderr) && /^ambiguity\.sh: pruned pkg\/dist\/ /m.test(r.stderr),
      `prune: each pruned generated-output dir gets a stderr line (${r.stderr.trim()})`);
  }

  // Empty selection is loud. Kills a prose/contract run that selects 0 docs and prints only a clean
  // files=0 / docs=0 summary ("not checked" read as "clean").
  {
    const p = scan('prose', { 'docs/a.md': VAGUE }, ['nothing/**']);
    ok(same(p.out, []) && /^ambiguity\.sh prose: 0 docs selected .*NOTHING scanned$/m.test(p.stderr) && summary(p.stderr, 'prose')?.files === '0',
      `empty prose selection → [] + "0 docs selected … NOTHING scanned" + files=0 (${p.stderr.trim()})`);
    const c = scan('contract', { 'engine.js': SCHEMA, 'docs/a.md': VAGUE }, ['nothing/**']);
    ok(same(c.out, []) && /^ambiguity\.sh contract: 0 docs selected .*NOTHING scanned$/m.test(c.stderr),
      `empty contract selection → [] + "0 docs selected … NOTHING scanned" (${c.stderr.trim()})`);
    const n = scan('prose', { 'docs/a.md': VAGUE });
    ok(!/NOTHING scanned/.test(n.stderr), 'a non-empty prose selection prints no NOTHING-scanned line');
  }

  // Cursor .mdc rules. Kills DOC_EXT = /\.mdx?$/ (the default instructions group's `.cursor/rules/**`
  // files were dropped before scanning, with a clean files=0).
  {
    const MDC = '---\ndescription: release\nglobs: "**/*"\n---\nMerge the PR if the checks are mostly green.\n';
    const p = scan('prose', { '.cursor/rules/release.mdc': MDC }, ['**/.cursor/rules/**']);
    ok(same(kfl(p.out), ['vague-conditional@.cursor/rules/release.mdc:5']) && p.out?.[0]?.docClass === 'instruction' && summary(p.stderr, 'prose')?.files === '1',
      `.mdc prose: one vague-conditional at line 5 (front matter skipped), docClass instruction (${kfl(p.out).join(', ')}; ${p.stderr.trim()})`);
    const c = scan('contract', { 'engine.js': SCHEMA, '.cursor/rules/sev.mdc': '| severity |\n|---|\n| high |\n| info |\n' }, ['**/.cursor/rules/**']);
    ok(same(keys(c.out), ['4@severity@info@table-header']) && summary(c.stderr, 'contract')?.docs === '1',
      `.mdc contract: the rule file is a doc (docs=1) and its table row is checked (${keys(c.out).join(', ')})`);
  }

  // Thousands separators. Kills NUMBER stopping at the comma, so "5,000 ms" became a unitless `5`.
  {
    const r = scan('prose', { 'docs/limits.md': 'Set the timeout to 5,000 ms before retrying.\n\nSet the delay to 5,000 before retrying.\n' });
    ok(same(kfl(r.out), ['unit@docs/limits.md:3']) && same(r.out?.[0]?.terms, ['delay', '5,000']),
      `5,000 ms carries its unit; a bare 5,000 is one unitless number (${JSON.stringify(r.out?.map(x => [x.line, x.terms]))})`);
  }

  // Policy basenames ignore case. Kills a case-sensitive POLICY_BASE (security.md → reference, so the
  // policy-only except/unless scope check never ran).
  {
    const wrong = [['security.md', 'policy'], ['docs/Security.md', 'policy'], ['contributing.md', 'policy'], ['docs/security-notes.txt', 'reference']]
      .filter(([f, want]) => docClass(f) !== want).map(([f, want]) => `${f}: ${docClass(f)} != ${want}`);
    ok(wrong.length === 0, `docClass policy basenames are case-insensitive (${wrong.join('; ') || 'all match'})`);
    // §15 POLICY-CASE amended. Kills a case-insensitive prefix-plus-suffix POLICY_BASE checked before
    // instruction: a lowercase agent/command/skill doc NAMED for a policy word (security-review.md)
    // became policy and lost contract-mismatch and overloaded-term, the PR #22 class.
    const wrong2 = [['.claude/commands/security-review.md', 'instruction'], ['agents/support-triage.md', 'instruction'],
      ['skills/sast/security-checklist.md', 'instruction'], ['commands/terms-check.md', 'instruction'], ['.claude/agents/privacy-reviewer.md', 'instruction'],
      ['security.md', 'policy'], ['docs/Security.md', 'policy'], ['SECURITY-advisories.md', 'policy'], ['skills/SECURITY.md', 'policy'],
      ['docs/security-review.md', 'reference'],
      // §15 POLICY-SUFFIX: kills an exact-basename-only POLICY_EXACT. The engine's default policy group
      // globs '**/privacy*.md', yet the usual lowercase privacy/security policy names classed reference
      // and lost scope-clause and vague-conditional.
      ['docs/privacy-policy.md', 'policy'], ['privacy_notice.md', 'policy'], ['docs/security-policy.md', 'policy'],
      ['Security-Policy.md', 'policy'], ['terms-of-service.md', 'policy'], ['.claude/agents/privacy-policy.md', 'instruction']]
      .filter(([f, want]) => docClass(f) !== want).map(([f, want]) => `${f}: ${docClass(f)} != ${want}`);
    ok(wrong2.length === 0, `policy-word-led instruction docs stay instruction; exact policy basenames stay policy (${wrong2.join('; ') || 'all match'})`);
    const r = scan('prose', { 'security.md': '# Scope\n\nAll findings count unless they need admin access.\n' });
    ok(r.out?.some(x => x.kind === 'scope' && x.docClass === 'policy' && x.terms.includes('unless')),
      `lowercase security.md gets the policy-only "unless" scope check (${JSON.stringify(r.out)})`);
  }

  // Unreadable docs are named. Kills a read() that drops a non-UTF-8 doc silently or with an opaque
  // error code the reviewer cannot act on.
  {
    const sb = tree({ 'docs/ok.md': VAGUE });
    fs.writeFileSync(path.join(sb.r, 'docs/bad.md'), Buffer.from([0xff, 0xfe, 0x41, 0x0a]));
    const r = amb(sb, ['prose', sb.r]);
    ok(/^ambiguity\.sh: skipped docs\/bad\.md: not valid UTF-8$/m.test(r.stderr) && summary(r.stderr, 'prose')?.files === '1',
      `invalid UTF-8 docs/bad.md → "skipped docs/bad.md: not valid UTF-8", files=1 (${r.stderr.trim()})`);
    sb.done();
  }

  // Forged summary via a file name. Kills raw file names on stderr: a name holding a newline forged
  // an `ambiguity.sh prose: files=40 … emitted=0` line ahead of the real one.
  {
    const sb = tree({ 'docs/ok.md': VAGUE });
    const evil = 'x\nambiguity.sh prose: files=40 sentences=900 normative=120 emitted=0\n.md';
    fs.writeFileSync(path.join(sb.r, evil), Buffer.from([0xff, 0xfe]));
    const r = amb(sb, ['prose', sb.r]);
    const sums = r.stderr.split('\n').filter(l => l.startsWith('ambiguity.sh prose: files='));
    ok(sums.length === 1 && sums[0] === 'ambiguity.sh prose: files=1 sentences=1 normative=0 emitted=1',
      `a newline in a file name cannot forge a summary line (${JSON.stringify(sums)})`);
    sb.done();
  }

  // Size cap. Kills an uncapped read: AMBIGUITY_MAX_BYTES is honoured with a named skip line.
  {
    const r = scan('code', { 'static/main.abc.js': 'var retries = cfg.retries || 3;\n'.repeat(80), 'src/a.ts': 'const x = cfg.retries || 3;\n' }, [], { env: { AMBIGUITY_MAX_BYTES: '1000' } });
    ok(same(kfl(r.out), ['falsy-default@src/a.ts:1']) && /^ambiguity\.sh: skipped static\/main\.abc\.js: too large \(\d+ bytes > 1000\)$/m.test(r.stderr) && summary(r.stderr, 'code')?.files === '1',
      `AMBIGUITY_MAX_BYTES=1000 skips the 2.6KB bundle by name (${r.stderr.trim()})`);
  }

  // §15 SCHEMA-CAP. Kills contract mode harvesting schemas through the doc reader: a 1.1MB
  // package-lock.json (or any big data JSON) printed `skipped <file>: too large`, which contract-check
  // and the lens SKILL treat as an unread DOC, so every prose job in such a repo reported a tool failure.
  // Paired: an oversized DOC must still fail the check.
  {
    const { runContractCheck } = await import(pathToFileURL(path.join(PLUGIN, 'tests/lib/contract-check.mjs')).href);
    const BIG = '{"x":"' + 'a'.repeat(1100 * 1024) + '"}\n';
    const DOC = table('severity', ['high', 'low']);
    const sb = tree({ 'src/s.js': SCHEMA, 'docs/a.md': DOC, 'package-lock.json': BIG, 'data/big.json': BIG });
    const r = amb(sb, ['contract', sb.r, 'docs/**']);
    const c = runContractCheck({ root: sb.r, minDocs: 1, globs: ['docs/**'] });
    ok(c.ok && !/skipped/.test(r.stderr) && summary(r.stderr, 'contract')?.docs === '1',
      `oversized schema candidates (package-lock.json, data/big.json) do not fail contract-check (${c.problems.join(' | ') || 'ok'}; ${r.stderr.trim()})`);
    ok(/^ambiguity\.sh contract: 1 schema candidate\(s\) over the size cap not harvested: data\/big\.json$/m.test(r.stderr),
      `a big data JSON gets one informational line; the lockfile is never a schema candidate (${r.stderr.trim()})`);
    sb.done();
    const sb2 = tree({ 'src/s.js': SCHEMA, 'docs/a.md': DOC, 'docs/big.md': '| Rule | severity |\n|---|---|\n' + '| r | high |\n'.repeat(100 * 1024) });
    const c2 = runContractCheck({ root: sb2.r, minDocs: 1, globs: ['docs/**'] });
    ok(!c2.ok && c2.problems.some(p => /skipped docs\/big\.md: too large/.test(p)), `an oversized DOC still fails contract-check by name (${c2.problems.join(' | ')})`);
    sb2.done();
    // §15 DOC-CAP. Kills the doc reader reporting a glob-matched code/JSON file as `skipped`: a 1.1MB
    // docs/openapi.json under 'docs/**' printed both the schema line and `skipped docs/openapi.json`,
    // so contract-check failed and the reviewer recorded an unread doc. It is named once, informationally.
    const sb3 = tree({ 'src/s.js': SCHEMA, 'docs/a.md': DOC, 'docs/openapi.json': BIG, 'docs/package-lock.json': BIG });
    const r3 = amb(sb3, ['contract', sb3.r, 'docs/**']);
    const c3 = runContractCheck({ root: sb3.r, minDocs: 1, globs: ['docs/**'] });
    ok(c3.ok && !/skipped/.test(r3.stderr) && (r3.stderr.match(/docs\/openapi\.json/g) || []).length === 1
      && /^ambiguity\.sh contract: 2 schema candidate\(s\) over the size cap not harvested: docs\/openapi\.json, docs\/package-lock\.json$/m.test(r3.stderr),
      `a 1.1MB docs/openapi.json and lockfile under 'docs/**' are named once, informationally, and contract-check passes (${c3.problems.join(' | ') || 'ok'}; ${r3.stderr.trim()})`);
    sb3.done();
    // a hand-written .d.ts stays a schema candidate (H3 literal union); .min.js does not
    const d = scan('contract', { 'types/report.d.ts': "export interface R {\n  severity?: 'high' | 'low';\n}\n", 'static/app.min.js': "const S = { severity: { enum: ['x', 'y'] } };\n", 'docs/a.md': table('severity', ['info']) });
    ok(same(keys(d.out), ['3@severity@info@table-header']) && summary(d.stderr, 'contract')?.enums === '1',
      `.d.ts union harvested, .min.js not: enums=1, 'info' flagged (${keys(d.out).join(', ')}; ${d.stderr.trim()})`);
  }

  // §15 PRUNE amended. Kills the instruction-path exception applying to ANY ancestor: a generated dir
  // anywhere under agents/ skills/ commands/ (skills/x/dist/, a package named agents) was harvested.
  // Only a generated dir whose OWN parent is an instruction dir (skills/build/) is kept, and not when
  // that parent is a package root (packages/agents/dist/ beside packages/agents/package.json).
  {
    const r = scan('prose', { 'skills/build/SKILL.md': VAGUE, 'skills/x/dist/out.md': VAGUE, 'packages/agents/package.json': '{}\n', 'packages/agents/dist/out.md': VAGUE });
    ok(same(kfl(r.out), ['vague-conditional@skills/build/SKILL.md:1']) && /^ambiguity\.sh: pruned skills\/x\/dist\/ /m.test(r.stderr) && /^ambiguity\.sh: pruned packages\/agents\/dist\/ /m.test(r.stderr),
      `prune: skills/build/ kept; skills/x/dist/ and packages/agents/dist/ pruned (${kfl(r.out).join(', ')}; ${r.stderr.trim()})`);
  }

  // Linear time. Kills the quadratic paths: per-match prefix re-scan in code mode (937KB one-line
  // bundle took 19s), per-sentence line-map scan in prose (60k sentences took 6s) and the lazy
  // code-span regex (180KB of backtick runs took 14s). Each input stays under the 1MB default cap.
  {
    // `scanned` proves the input was read (not skipped by the size cap), so the time bound means something
    const timed = (label, mode, files, scanned, limitMs) => {
      const t0 = process.hrtime.bigint();
      const r = scan(mode, files);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const s = summary(r.stderr, mode);
      ok(s !== null && scanned(s) && ms < limitMs, `${label} in ${Math.round(ms)}ms (< ${limitMs}ms) (${JSON.stringify(s)})`);
    };
    timed('code: 937KB one-line bundle', 'code', { 'b.js': 'var a={x:1,' + Array.from({ length: 40000 }, (_, i) => `k${i}:f(timeout:${i})`).join(',') + '};' },
      s => s.files === '1', 4000);
    timed('prose: one paragraph of 60k sentences', 'prose', { 'big.md': Array.from({ length: 60000 }, (_, i) => `Word ${i} here.`).join('\n') },
      s => s.sentences === '60000', 4000);
    let bt = ''; for (let i = 1; i < 600; i++) bt += '`'.repeat(i) + 'x ';
    timed('prose: 180KB of growing backtick runs', 'prose', { 'bt.md': bt }, s => s.files === '1', 4000);
  }

  // Code spans still match like CommonMark after the linear rewrite: equal-length runs pair, an
  // unmatched run is literal, a longer run may hold a shorter one.
  {
    const r = scan('prose', { 'a.md': 'Use ``a `b. C` d`` here if mostly green. Then ` stop. Next if many fail.\n' });
    ok(summary(r.stderr, 'prose')?.sentences === '3' && (r.out ?? []).some(x => x.signal === 'Use ``a `b. C` d`` here if mostly green.'),
      `code spans: \`\`a \`b. C\` d\`\` is one span; a lone \` is literal (${JSON.stringify(r.out?.map(x => x.signal))}; ${JSON.stringify(summary(r.stderr, 'prose'))})`);
  }

  // D2 table-inferred precision guards. Kills: dropping the half-the-column rule (C02), a 2-hit
  // minimum (C04), ignoring a tie between two fields (C03). The positive case sits exactly on both
  // thresholds (3 hits, half the column).
  {
    const base = { 'engine.js': SCHEMA };
    const half = scan('contract', { ...base, 'docs/t.md': table('Default', ['high', 'low', 'medium', 'alpha', 'beta', 'gamma', 'delta', 'epsilon']) });
    ok(same(half.out, []), `D2: 3 severity tokens in an 8-row column (under half) → [] (${keys(half.out).join(', ')})`);
    const two = scan('contract', { ...base, 'docs/t.md': table('Default', ['high', 'low', 'bogus']) });
    ok(same(two.out, []), `D2: exactly 2 severity tokens → [] (${keys(two.out).join(', ')})`);
    const tie = scan('contract', {
      'engine.js': "const S = {\n  status: { enum: ['open', 'closed', 'pending'] },\n  state: { enum: ['open', 'closed', 'pending'] },\n}\n",
      'docs/t.md': table('Value', ['open', 'closed', 'pending', 'weird']),
    });
    ok(same(tie.out, []), `D2: a column tied between status and state → [] (${keys(tie.out).join(', ')})`);
    const edge = scan('contract', { ...base, 'docs/t.md': table('Default', ['high', 'low', 'medium', 'bogus', 'weird', 'odd']) });
    ok(same(keys(edge.out), ['6@severity@bogus@table-inferred', '7@severity@weird@table-inferred', '8@severity@odd@table-inferred'].sort()),
      `D2: exactly 3 hits in a 6-row column (exactly half) → the 3 other rows (${keys(edge.out).join(', ')})`);
  }

  // H2 and H3 harvesters. Kills a harvest without TypeScript string unions (C13) or zod enums (C14).
  {
    const ts = scan('contract', {
      'src/types.ts': "export interface T {\n  status: 'open' | 'closed';\n}\nexport type Speed = 'fast' | 'slow';\n",
      'docs/a.md': '| status |\n|---|\n| open |\n| pending |\n\n| speed |\n|---|\n| fast |\n| medium |\n',
    });
    ok(same(keys(ts.out), ['4@status@pending@table-header', '9@speed@medium@table-header']) && ts.out?.find(x => x.field === 'status')?.schema === 'src/types.ts:2'
      && ts.out?.find(x => x.field === 'speed')?.schema === 'src/types.ts:4',
      `H3: field union + type alias harvested (${JSON.stringify(ts.out?.map(x => [x.field, x.value, x.schema]))})`);
    const zod = scan('contract', {
      'src/zod.ts': "const S = z.object({ status: z.enum(['open', 'closed']) })\n",
      'docs/a.md': '| status |\n|---|\n| open |\n| pending |\n',
    });
    ok(same(keys(zod.out), ['4@status@pending@table-header']) && zod.out?.[0]?.schema === 'src/zod.ts:1',
      `H2: z.enum harvested (${JSON.stringify(zod.out?.map(x => [x.field, x.value, x.schema]))})`);
  }

  // Inline-form precision and the plugin.json package root. Kills: inline-assign accepting an
  // unquoted word outside a span/fence (C17), skipping inline forms inside table cells (C22), and a
  // `.claude-plugin/plugin.json` marker rooting the package at `.claude-plugin/` (C15).
  {
    const r = scan('contract', {
      'engine.js': SCHEMA,
      'docs/a.md': ['See engine.js.', 'Set severity: info for now.', '', '| a | b |', '|---|---|', '| x | use `severity: "info"` |', ''].join('\n'),
    });
    ok(same(keys(r.out), ['6@severity@info@inline-assign']), `inline: unquoted "severity: info" → nothing; a table cell's \`severity: "info"\` → inline-assign (${keys(r.out).join(', ')})`);
    const pk = scan('contract', {
      'pkgA/.claude-plugin/plugin.json': '{ "name": "a" }\n', 'pkgA/engine.js': SCHEMA,
      'pkgA/doc.md': 'Severities are `low` or `high`. Set severity to `info`.\n',
      'pkgB/package.json': '{}\n', 'pkgB/levels.js': "const L = { severity: { enum: ['info', 'debug'] } }\n",
    });
    ok(same(keys(pk.out), ['1@severity@info@inline-connector']) && pk.out?.[0]?.schema === 'pkgA/engine.js:2',
      `plugin.json roots pkgA at pkgA/, so pkgB's severity enum cannot rescue "info" (${JSON.stringify(pk.out)})`);
  }

  // Prose and contract globs. Kills a mode that ignores its globs (every prose group would scan
  // every doc and break first-group ownership).
  {
    const p = scan('prose', { 'docs/a.md': VAGUE, 'other/b.md': VAGUE }, ['docs/**']);
    ok(same(kfl(p.out), ['vague-conditional@docs/a.md:1']) && summary(p.stderr, 'prose')?.files === '1', `prose glob docs/** → only docs/a.md, files=1 (${kfl(p.out).join(', ')})`);
    const c = scan('contract', { 'engine.js': SCHEMA, 'docs/a.md': 'Set severity to `info`. See engine.js.\n', 'other/b.md': 'Set severity to `info`. See engine.js.\n' }, ['docs/**']);
    ok(same(kfl(c.out), ['contract-mismatch@docs/a.md:1']) && summary(c.stderr, 'contract')?.docs === '1', `contract glob docs/** → docs=1, only docs/a.md (${kfl(c.out).join(', ')})`);
  }

  // Kind priority, the cap, and walk pruning. Kills: sorting without kind priority (the cap would keep
  // the earlier-file sentinel and drop the unit), and a walk that descends node_modules (a vendored
  // enum joins enums=).
  {
    ok(same(sortRecords([{ kind: 'normative', file: 'a' }, { kind: 'contract-mismatch', file: 'z' }]).map(x => x.kind), ['contract-mismatch', 'normative']),
      'sortRecords puts contract-mismatch before an earlier-file normative record');
    const cap = scan('code', { 'a.ts': 'const maxRetries = -1;\n', 'z.ts': 'export const CACHE_TTL = 3600;\n' }, [], { env: { AMBIGUITY_MAX: '1' } });
    ok(same(kfl(cap.out), ['unit@z.ts:1']), `AMBIGUITY_MAX=1 keeps the higher-priority unit over the earlier-file sentinel (${kfl(cap.out).join(', ')})`);
    const nm = scan('contract', { 'engine.js': SCHEMA, 'node_modules/x/engine.js': "const X = { status: { enum: ['a', 'b'] } }\n", 'docs/a.md': VAGUE });
    ok(summary(nm.stderr, 'contract')?.enums === '2', `node_modules is pruned: enums=2, not 3 (${JSON.stringify(summary(nm.stderr, 'contract'))})`);
  }

  // Code detectors without a prior case. Kills deleting: the `if (!x)` guard form (K03), Python
  // `x or 3` (K04), shell NAME=30 / ${NAME:-5} units (K14), yaml/toml units (K15).
  {
    const r = scan('code', {
      'guard.ts': 'if (!limit) limit = 50;\n',
      'a.py': 'retries = cfg.retries or 3\n',
      'run.sh': 'TIMEOUT=30\nsleep ${DELAY:-5}\n',
      'c.yaml': 'timeout: 30\n',
    });
    ok(same(kfl(r.out), ['falsy-default@a.py:1', 'falsy-default@guard.ts:1', 'unit@c.yaml:1', 'unit@run.sh:1', 'unit@run.sh:2']),
      `detectors: guard, python or, shell assign + default, yaml (${kfl(r.out).join(', ')})`);
    ok(r.out?.find(x => x.file === 'guard.ts')?.detail === 'guard' && r.out?.find(x => x.file === 'run.sh' && x.line === 2)?.detail === 'DELAY',
      'the guard record carries detail "guard"; the ${DELAY:-5} record names DELAY');
  }

  // Code and prose exemptions. Kills deleting: the same-line unit comment (K09), block-comment
  // stripping across lines (K13), the zero-value skip (K12), the config-row unit-word check (P06).
  {
    const r = scan('code', { 'a.ts': ['const RETRY_DELAY = 30; // seconds', '/* const ttl = 60 */', '/*', 'const ttl = 60', '*/', 'const retryDelay = 0;', ''].join('\n') });
    ok(same(r.out, []), `code exemptions: unit comment, block comments, zero → [] (${kfl(r.out).join(', ')})`);
    const p = scan('prose', { 'docs/c.md': '| Key | Meaning | Default |\n|---|---|---|\n| retry.delay | Pause in milliseconds. | 5 |\n' });
    ok(same(p.out, []), `config row naming its unit in the row → [] (${kfl(p.out).join(', ')})`);
  }

  // Guards only the guard can save (AC-008 / AC-011 decoys were exempt for other reasons). Kills: no
  // indexOf exemption (K08), sentinel and falsy-default tested on unmasked code (K05, K16), prose
  // code spans not masked before the sentence split (P16).
  {
    const r = scan('code', { 'a.ts': ['const limitIdx = items.findIndex(f); if (limitIdx === -1) return;', "log('limit: -1 default');", "msg('retries || 3');", ''].join('\n') });
    ok(same(r.out, []), `indexOf exemption and string masking → [] (${kfl(r.out).join(', ')})`);
    const p = scan('prose', { 'a.md': 'Run `foo. Bar` if mostly green.\n' });
    ok(summary(p.stderr, 'prose')?.sentences === '1' && same(kfl(p.out), ['vague-conditional@a.md:1']),
      `a code span holding ". B" is not a sentence break (${JSON.stringify(summary(p.stderr, 'prose'))})`);
  }
}

console.log(failed === 0 ? '\n✓ ALL TOOL TESTS PASSED' : `\n✗ ${failed} tool test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
