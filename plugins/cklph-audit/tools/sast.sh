#!/usr/bin/env bash
# sast.sh — static-analysis recall for the security lens. Wraps Semgrep (with the
# security-audit + owasp-top-ten + language rulesets) and optionally CodeQL.
# Emits JSON lines on stdout. Degrades gracefully. Exits 0 ALWAYS.
# Usage: sast.sh <root> [language]
#   <language>: optional — ts|js|py|go|java|php|rb|rs (passed to semgrep as --lang)
# Output schema per line: { tool, rule, severity, file, line, cwe, snippet, rationale }
set -uo pipefail
TARGET="${1:-.}"
LANG="${2:-}"
cd "$TARGET" 2>/dev/null || true

# ── Semgrep ──────────────────────────────────────────────────────────────────
if command -v semgrep >/dev/null 2>&1; then
  RULESETS="p/security-audit p/owasp-top-ten p/javascript p/typescript p/python p/golang"
  ARGS="--json --quiet --disable-version-check"
  if [ -n "$LANG" ]; then ARGS="$ARGS --lang $LANG"; fi
  REPORT="$(mktemp).json"
  semgrep $ARGS --config p/security-audit --config p/owasp-top-ten "$TARGET" > "$REPORT" 2>/dev/null || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const res of (r.results || [])) {
        const m = (res.extra.metadata || {});
        const cwe = Array.isArray(m.cwe) ? m.cwe.join(",") : (m.cwe || "");
        const sev = (m.impact || res.extra.severity || "medium").toLowerCase();
        const snippet = (res.extra.lines || "").trim().substring(0, 300);
        process.stdout.write(JSON.stringify({
          tool: "semgrep", rule: res.check_id || "semgrep",
          severity: sev, file: res.path || "", line: res.start ? res.start.line : 0,
          cwe, snippet,
          rationale: "Semgrep candidate — verify the sink is reachable with attacker-controlled input"
        }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
else
  echo "tool not installed: semgrep ('brew install semgrep'). Reviewer should fall back to grepping for injection/authz patterns." >&2
fi

# ── CodeQL (optional, heavier — only if a database exists) ───────────────────
if [ -n "${CODEQL_DATABASE:-}" ] && command -v codeql >/dev/null 2>&1; then
  REPORT="$(mktemp).json"
  codeql database analyze "$CODEQL_DATABASE" --format=json --output="$REPORT" \
    --search-path="$CODEQL_HOME/codeql-repo/javascript/ql/src" \
    --search-path="$CODEQL_HOME/codeql-repo/python/ql/src" 2>/dev/null || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const res of (r.results || []))
        process.stdout.write(JSON.stringify({
          tool: "codeql", rule: res.ruleId || "codeql",
          severity: (res.rule.securitySeverity||"medium").toLowerCase(),
          file: res.ruleId, line: res.startLine || 0,
          cwe: res.rule.tags ? res.rule.tags.join(",") : "",
          snippet: res.message.text || "",
          rationale: "CodeQL candidate — verify reachability with attacker input"
        }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
fi
exit 0
