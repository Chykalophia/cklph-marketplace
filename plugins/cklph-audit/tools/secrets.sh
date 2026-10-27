#!/usr/bin/env bash
# secrets.sh — hardcoded-secret detection for the security lens.
# Tries gitleaks, then detect-secrets. Emits JSON lines on stdout. Degrades gracefully. Exits 0 ALWAYS.
# A scanner that fails, or whose output cannot be parsed, is reported on stderr: zero findings
# on stdout then means "did not scan", never "clean".
# The scanner report is written with --redact into a private (0700) temp dir that is removed on
# exit, so found credentials are never left on disk. No secret value is ever printed.
# Usage: secrets.sh <root>
set -uo pipefail
ARG="${1:-.}"
if ! TARGET="$(cd "$ARG" 2>/dev/null && pwd)"; then
  echo "secrets.sh: target not found: $ARG — nothing scanned." >&2
  exit 0
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cklph-secrets.XXXXXX")" || { echo "secrets.sh: mktemp failed — nothing scanned." >&2; exit 0; }
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if command -v gitleaks >/dev/null 2>&1; then
  REPORT="$WORK/gitleaks.json"
  # Exit 0 = no leaks, 1 = leaks found (the default --exit-code); anything else is a failure.
  gitleaks detect --source "$TARGET" --no-banner --redact --report-format json --report-path "$REPORT" >/dev/null 2> "$WORK/gitleaks.err"
  RC=$?
  if [ "$RC" -gt 1 ] || [ ! -s "$REPORT" ]; then
    echo "secrets.sh: gitleaks failed (exit $RC, report $([ -s "$REPORT" ] && echo present || echo missing)): $(grep -v '^[[:space:]]*$' "$WORK/gitleaks.err" | tail -n 3 | head -c 300) — zero gitleaks findings means the scan did not run, not that there are no secrets." >&2
  elif command -v node >/dev/null 2>&1; then
    node -e '
      let a;
      try { a = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("secrets.sh: gitleaks report is not valid JSON (" + e.message + ") — gitleaks findings NOT collected.\n"); process.exit(0); }
      if (!Array.isArray(a)) { process.stderr.write("secrets.sh: gitleaks report is not a JSON array — gitleaks findings NOT collected.\n"); process.exit(0); }
      for (const f of a) process.stdout.write(JSON.stringify({
        tool: "gitleaks", rule: f.RuleID || "secret", severity: "critical",
        file: f.File, line: f.StartLine, secretType: f.Description,
        rationale: "Candidate hardcoded secret — verify real credential vs test fixture / placeholder"
      }) + "\n");' "$REPORT"
  else
    echo "secrets.sh: node not found — cannot parse the gitleaks report; gitleaks findings NOT collected." >&2
  fi
  exit 0
fi

if command -v detect-secrets >/dev/null 2>&1; then
  SCAN="$(detect-secrets scan "$TARGET" 2> "$WORK/ds.err")"
  RC=$?
  if [ "$RC" -ne 0 ] || [ -z "$SCAN" ]; then
    echo "secrets.sh: detect-secrets failed (exit $RC): $(head -c 300 "$WORK/ds.err") — zero findings means the scan did not run." >&2
  elif command -v node >/dev/null 2>&1; then
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(0, "utf8")); }
      catch (e) { process.stderr.write("secrets.sh: detect-secrets output is not valid JSON (" + e.message + ") — findings NOT collected.\n"); process.exit(0); }
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
