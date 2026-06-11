#!/usr/bin/env bash
# dry.sh — clone / duplication detection for the architecture lens (DRY recall).
# Emits candidate-clone findings as JSON lines on stdout. Degrades gracefully.
set -uo pipefail
TARGET="${1:-.}"

if ! command -v npx >/dev/null 2>&1; then
  echo "tool not installed: npx (Node.js) — install Node, then 'npx jscpd' works on demand. Fallback: PMD-CPD (https://pmd.github.io/)." >&2
  exit 0
fi

OUT="$(mktemp -d)/jscpd"
if npx --no-install jscpd --silent --reporters json --output "$OUT" "$TARGET" >/dev/null 2>&1 \
   || npx jscpd --silent --reporters json --output "$OUT" "$TARGET" >/dev/null 2>&1; then
  REPORT="$OUT/jscpd-report.json"
  if [ -f "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      const r = require(process.argv[1]);
      for (const d of (r.duplicates || [])) {
        process.stdout.write(JSON.stringify({
          tool: "jscpd", rule: "DRY-clone", severity: "medium",
          file: d.firstFile?.name, line: d.firstFile?.start,
          dupFile: d.secondFile?.name, dupLine: d.secondFile?.start,
          tokens: d.tokens, fragment: (d.fragment || "").slice(0, 200),
          rationale: "Candidate clone — reviewer must judge duplicated KNOWLEDGE vs coincidental similarity"
        }) + "\n");
      }' "$REPORT"
  fi
else
  echo "tool not installed: jscpd — run 'npm i -D jscpd' (or 'npx jscpd <path>'). Fallback: PMD-CPD." >&2
fi
exit 0
