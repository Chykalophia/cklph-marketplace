#!/usr/bin/env bash
# sast.sh — static-analysis recall for the security lens. Wraps Semgrep (with the
# security-audit + owasp-top-ten rulesets, plus a language ruleset when asked) and optionally CodeQL.
# Emits JSON lines on stdout. Degrades gracefully. Exits 0 ALWAYS.
# A scanner that fails, or whose output cannot be parsed, is reported on stderr: zero findings
# on stdout then means "did not scan", never "clean".
# Usage: sast.sh <root> [language]
#   <language>: optional — ts|js|py|go|java|php|rb|rs (adds that language's Semgrep ruleset)
# Output schema per line: { tool, rule, severity, file, line, cwe, snippet, rationale }
set -uo pipefail
ARG="${1:-.}"
SEMGREP_LANG="${2:-}"
# Resolve the target ONCE to an absolute path, so a relative root is not re-resolved after cd.
if ! TARGET="$(cd "$ARG" 2>/dev/null && pwd)"; then
  echo "sast.sh: target not found: $ARG — nothing scanned." >&2
  exit 0
fi
cd "$TARGET" || exit 0

# Private scratch dir (0700), removed on any exit.
WORK="$(mktemp -d "${TMPDIR:-/tmp}/cklph-sast.XXXXXX")" || { echo "sast.sh: mktemp failed — nothing scanned." >&2; exit 0; }
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ── Semgrep ──────────────────────────────────────────────────────────────────
if command -v semgrep >/dev/null 2>&1; then
  CONFIGS="--config p/security-audit --config p/owasp-top-ten"
  case "$SEMGREP_LANG" in
    "") ;;
    ts) CONFIGS="$CONFIGS --config p/typescript" ;;
    js) CONFIGS="$CONFIGS --config p/javascript" ;;
    py) CONFIGS="$CONFIGS --config p/python" ;;
    go) CONFIGS="$CONFIGS --config p/golang" ;;
    java) CONFIGS="$CONFIGS --config p/java" ;;
    php) CONFIGS="$CONFIGS --config p/php" ;;
    rb) CONFIGS="$CONFIGS --config p/ruby" ;;
    rs) CONFIGS="$CONFIGS --config p/rust" ;;
    *) echo "sast.sh: unknown language '$SEMGREP_LANG' (want ts|js|py|go|java|php|rb|rs) — using the default rulesets only." >&2 ;;
  esac
  REPORT="$WORK/semgrep.json"
  # shellcheck disable=SC2086  # CONFIGS is a list of flags
  semgrep --json --quiet --disable-version-check $CONFIGS "$TARGET" > "$REPORT" 2> "$WORK/semgrep.err"
  RC=$?
  if [ ! -s "$REPORT" ]; then
    echo "sast.sh: semgrep failed (exit $RC, no output): $(head -c 300 "$WORK/semgrep.err") — zero semgrep findings means the scan did not run, not that the code is clean." >&2
  elif command -v node >/dev/null 2>&1; then
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("sast.sh: semgrep output is not valid JSON (" + e.message + ") — semgrep findings NOT collected; zero findings means the scan failed, not that the code is clean.\n"); process.exit(0); }
      const errs = (r.errors || []).filter(e => e.level === "error");
      if (errs.length) process.stderr.write("sast.sh: semgrep reported " + errs.length + " error(s), first: " + String(errs[0].message || errs[0].type || "").slice(0, 300) + " — findings may be incomplete.\n");
      if (!Array.isArray(r.results)) { process.stderr.write("sast.sh: semgrep output has no results array — semgrep findings NOT collected.\n"); process.exit(0); }
      for (const res of r.results) {
        const extra = res.extra || {};
        const m = extra.metadata || {};
        const cwe = Array.isArray(m.cwe) ? m.cwe.join(",") : (m.cwe || "");
        const sev = String(m.impact || extra.severity || "medium").toLowerCase();
        const snippet = String(extra.lines || "").trim().substring(0, 300);
        process.stdout.write(JSON.stringify({
          tool: "semgrep", rule: res.check_id || "semgrep",
          severity: sev, file: res.path || "", line: res.start ? res.start.line : 0,
          cwe, snippet,
          rationale: "Semgrep candidate — verify the sink is reachable with attacker-controlled input"
        }) + "\n");
      }' "$REPORT"
  else
    echo "sast.sh: node not found — cannot parse semgrep output; semgrep findings NOT collected." >&2
  fi
else
  echo "tool not installed: semgrep ('brew install semgrep'). Reviewer should fall back to grepping for injection/authz patterns." >&2
fi

# ── CodeQL (optional, heavier — only if a database exists) ───────────────────
# CODEQL_DATABASE: an existing database. CODEQL_QUERIES: optional query pack/suite (e.g.
# codeql/javascript-queries); when unset, CodeQL picks the default suite for the database language.
# UNVERIFIED in this repo's tests (no CodeQL install): the SARIF parser is checked against a
# synthetic sample only.
if [ -n "${CODEQL_DATABASE:-}" ] && command -v codeql >/dev/null 2>&1; then
  REPORT="$WORK/codeql.sarif"
  # shellcheck disable=SC2086  # CODEQL_QUERIES may name several packs
  codeql database analyze "$CODEQL_DATABASE" ${CODEQL_QUERIES:-} --format=sarif-latest --output="$REPORT" \
    > /dev/null 2> "$WORK/codeql.err"
  RC=$?
  if [ ! -s "$REPORT" ]; then
    echo "sast.sh: codeql failed (exit $RC, no SARIF): $(head -c 300 "$WORK/codeql.err") — zero codeql findings means it did not run." >&2
  elif command -v node >/dev/null 2>&1; then
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("sast.sh: codeql SARIF is not valid JSON (" + e.message + ") — codeql findings NOT collected.\n"); process.exit(0); }
      const sevOf = (s) => { const n = parseFloat(s); if (isNaN(n)) return ""; return n >= 9 ? "critical" : n >= 7 ? "high" : n >= 4 ? "medium" : "low"; };
      const lvl = { error: "high", warning: "medium", note: "low" };
      for (const run of (r.runs || [])) {
        const rules = new Map();
        for (const ru of ((run.tool && run.tool.driver && run.tool.driver.rules) || [])) rules.set(ru.id, ru);
        for (const res of (run.results || [])) {
          const ru = rules.get(res.ruleId) || {};
          const props = ru.properties || {};
          const loc = (((res.locations || [])[0] || {}).physicalLocation) || {};
          process.stdout.write(JSON.stringify({
            tool: "codeql", rule: res.ruleId || "codeql",
            severity: sevOf(props["security-severity"]) || lvl[res.level] || "medium",
            file: (loc.artifactLocation && loc.artifactLocation.uri) || "",
            line: (loc.region && loc.region.startLine) || 0,
            cwe: (props.tags || []).filter(t => /cwe/i.test(t)).join(","),
            snippet: ((res.message && res.message.text) || "").substring(0, 300),
            rationale: "CodeQL candidate — verify reachability with attacker input"
          }) + "\n");
        }
      }' "$REPORT"
  fi
fi
exit 0
