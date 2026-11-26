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
if ! TARGET="$(cd -- "$ARG" 2>/dev/null && pwd)"; then
  echo "secrets.sh: target not found: $ARG — nothing scanned." >&2
  exit 0
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cklph-secrets.XXXXXX")" || { echo "secrets.sh: mktemp failed — nothing scanned." >&2; exit 0; }
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Runs one gitleaks pass and prints its findings as JSON lines. $1 = report path, $2 = pass name,
# $3 = "history" to tag findings with their commit, the rest = gitleaks arguments.
gitleaks_pass() {
  local report="$1" name="$2" mode="$3"; shift 3
  # Exit 0 = no leaks, 1 = leaks found (the default --exit-code); anything else is a failure.
  gitleaks "$@" --no-banner --redact --report-format json --report-path "$report" >/dev/null 2> "$report.err"
  local rc=$?
  if [ "$rc" -gt 1 ] || [ ! -s "$report" ]; then
    echo "secrets.sh: gitleaks failed (exit $rc, $name pass, report $([ -s "$report" ] && echo present || echo missing)): $(grep -v '^[[:space:]]*$' "$report.err" | tail -n 3 | head -c 300) — zero gitleaks $name findings means that pass did not run, not that there are no secrets." >&2
  elif command -v node >/dev/null 2>&1; then
    node -e '
      let a;
      try { a = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("secrets.sh: gitleaks " + process.argv[2] + " report is not valid JSON (" + e.message + ") — those findings NOT collected.\n"); process.exit(0); }
      if (!Array.isArray(a)) { process.stderr.write("secrets.sh: gitleaks " + process.argv[2] + " report is not a JSON array — those findings NOT collected.\n"); process.exit(0); }
      const history = process.argv[3] === "history";
      for (const f of a) process.stdout.write(JSON.stringify({
        tool: "gitleaks", rule: f.RuleID || "secret", severity: "critical",
        file: f.File, line: f.StartLine, secretType: f.Description,
        ...(history ? { history: true, commit: f.Commit } : {}),
        rationale: history
          ? "Candidate secret in git history: still live if it was never rotated, even if the file no longer holds it"
          : "Candidate hardcoded secret — verify real credential vs test fixture / placeholder"
      }) + "\n");' "$report" "$name" "$mode"
  else
    echo "secrets.sh: node not found — cannot parse the gitleaks $name report; those findings NOT collected." >&2
  fi
}

if command -v gitleaks >/dev/null 2>&1; then
  # Files under TARGET only (--no-git). Without it gitleaks walks the whole repo's history, so every
  # unit would report every other unit's secrets.
  gitleaks_pass "$WORK/gitleaks.json" files files detect --source "$TARGET" --no-git
  # History, limited to TARGET's own path: a secret committed and later deleted is still live.
  # --show-prefix is TARGET relative to the repo root even through a symlinked path (/var -> /private/var).
  if TOP="$(git -C "$TARGET" rev-parse --show-toplevel 2>/dev/null)"; then
    REL="$(git -C "$TARGET" rev-parse --show-prefix 2>/dev/null)"; REL="${REL%/}"
    gitleaks_pass "$WORK/gitleaks-history.json" history history detect --source "$TOP" --log-opts="-- ${REL:-.}"
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
  else
    echo "secrets.sh: node not found — cannot parse detect-secrets output; detect-secrets findings NOT collected." >&2
  fi
  exit 0
fi

echo "tool not installed: gitleaks ('brew install gitleaks') or detect-secrets ('pip install detect-secrets'). Reviewer should fall back to grepping for high-entropy strings / known key prefixes." >&2
exit 0
