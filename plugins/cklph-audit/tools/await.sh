#!/usr/bin/env bash
# await.sh — floating-promise / missing-await detection for the correctness lens.
# Runs the repo's ESLint (no-floating-promises) + tsc. Emits JSON lines. Degrades gracefully.
set -uo pipefail
TARGET="${1:-.}"

if ! command -v npx >/dev/null 2>&1; then
  echo "tool not installed: npx (Node.js) — needed for eslint + tsc." >&2
  exit 0
fi

# ESLint JSON (relies on the repo configuring @typescript-eslint/no-floating-promises).
ESLINT_JSON="$(npx --no-install eslint --format json "$TARGET" 2>/dev/null)"
if [ -n "$ESLINT_JSON" ] && command -v node >/dev/null 2>&1; then
  node -e '
    let data = []; try { data = JSON.parse(require("fs").readFileSync(0,"utf8")); } catch {}
    for (const f of data) for (const m of (f.messages || [])) {
      if (/no-floating-promises|no-misused-promises|require-await/.test(m.ruleId || "")) {
        process.stdout.write(JSON.stringify({
          tool: "eslint", rule: m.ruleId, severity: "high",
          file: f.filePath, line: m.line, message: m.message,
          rationale: "Floating/misused promise — verify it is truly unawaited, not fire-and-forget by design"
        }) + "\n");
      }
    }' <<<"$ESLINT_JSON"
else
  echo "tool not installed (or rule off): eslint with @typescript-eslint/no-floating-promises. Enable it in the repo's eslint config + a tsconfig with strict + parserOptions.project." >&2
fi

# tsc is the exact backstop; surface that it ran (compile errors often hide await bugs).
if ! npx --no-install tsc --noEmit >/dev/null 2>&1; then
  echo "note: 'tsc --noEmit' reported errors — run it directly; type errors frequently mask missing awaits." >&2
fi
exit 0
