#!/usr/bin/env bash
# secrets.sh — hardcoded-secret detection for the security lens.
# Tries gitleaks, then detect-secrets. Emits JSON lines on stdout. Degrades gracefully.
set -uo pipefail
TARGET="${1:-.}"

if command -v gitleaks >/dev/null 2>&1; then
  REPORT="$(mktemp).json"
  gitleaks detect --source "$TARGET" --no-banner --report-format json --report-path "$REPORT" >/dev/null 2>&1 || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let a = []; try { a = require(process.argv[1]); } catch {}
      for (const f of a) process.stdout.write(JSON.stringify({
        tool: "gitleaks", rule: f.RuleID || "secret", severity: "critical",
        file: f.File, line: f.StartLine, secretType: f.Description,
        rationale: "Candidate hardcoded secret — verify real credential vs test fixture / placeholder"
      }) + "\n");' "$REPORT"
  fi
  exit 0
fi

if command -v detect-secrets >/dev/null 2>&1; then
  SCAN="$(detect-secrets scan "$TARGET" 2>/dev/null)"
  if [ -n "$SCAN" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(0,"utf8")); } catch {}
      for (const [file, hits] of Object.entries(r.results || {}))
        for (const h of hits) process.stdout.write(JSON.stringify({
          tool: "detect-secrets", rule: h.type, severity: "critical",
          file, line: h.line_number,
          rationale: "Candidate secret — verify real credential vs fixture"
        }) + "\n");' <<<"$SCAN"
  fi
  exit 0
fi

echo "tool not installed: gitleaks ('brew install gitleaks') or detect-secrets ('pip install detect-secrets'). Reviewer should fall back to grepping for high-entropy strings / known key prefixes." >&2
exit 0
