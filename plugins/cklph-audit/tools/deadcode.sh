#!/usr/bin/env bash
# deadcode.sh — unused exports / dead code for the architecture lens.
# Tries knip, then ts-prune. Emits JSON lines on stdout. Degrades gracefully.
set -uo pipefail
TARGET="${1:-.}"

if ! command -v npx >/dev/null 2>&1; then
  echo "tool not installed: npx (Node.js) — needed for knip/ts-prune." >&2
  exit 0
fi

KNIP_JSON="$(npx --no-install knip --reporter json 2>/dev/null)"
if [ -n "$KNIP_JSON" ] && command -v node >/dev/null 2>&1; then
  node -e '
    let r = {}; try { r = JSON.parse(require("fs").readFileSync(0,"utf8")); } catch {}
    for (const issue of (r.issues || [])) {
      for (const ex of (issue.exports || [])) {
        process.stdout.write(JSON.stringify({
          tool: "knip", rule: "dead-export", severity: "low",
          file: issue.file, line: ex.line || null, symbol: ex.name,
          rationale: "Unused export — reviewer must confirm it is not referenced dynamically / via a string key"
        }) + "\n");
      }
    }' <<<"$KNIP_JSON"
  exit 0
fi

# Fallback: ts-prune (plain text "file:line - symbol").
TSPRUNE="$(npx --no-install ts-prune 2>/dev/null)"
if [ -n "$TSPRUNE" ] && command -v node >/dev/null 2>&1; then
  node -e '
    for (const ln of require("fs").readFileSync(0,"utf8").split("\n")) {
      const m = ln.match(/^(.+?):(\d+)\s+-\s+(.+)$/);
      if (m) process.stdout.write(JSON.stringify({
        tool: "ts-prune", rule: "dead-export", severity: "low",
        file: m[1], line: Number(m[2]), symbol: m[3],
        rationale: "Possibly-unused export — confirm not dynamically referenced"
      }) + "\n");
    }' <<<"$TSPRUNE"
  exit 0
fi

echo "tool not installed: knip or ts-prune — run 'npm i -D knip' (preferred) or 'npx ts-prune'." >&2
exit 0
