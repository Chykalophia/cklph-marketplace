#!/usr/bin/env bash
# layering.sh — layering violations + circular deps for the architecture lens.
# Runs dependency-cruiser (depcruise) with JSON output. Emits JSON lines. Degrades gracefully.
set -uo pipefail
TARGET="${1:-.}"

if ! command -v npx >/dev/null 2>&1; then
  echo "tool not installed: npx (Node.js) — needed for dependency-cruiser." >&2
  exit 0
fi

DC_JSON="$(npx --no-install depcruise --output-type json "$TARGET" 2>/dev/null)"
if [ -n "$DC_JSON" ] && command -v node >/dev/null 2>&1; then
  node -e '
    let r = {}; try { r = JSON.parse(require("fs").readFileSync(0,"utf8")); } catch {}
    for (const mod of (r.modules || [])) {
      for (const dep of (mod.dependencies || [])) {
        for (const v of (dep.rules || [])) {
          process.stdout.write(JSON.stringify({
            tool: "dependency-cruiser",
            rule: v.name, severity: v.severity === "error" ? "high" : "medium",
            file: mod.source, dependsOn: dep.resolved,
            circular: !!dep.circular,
            rationale: "Layering/circular-dep violation per the repo depcruise ruleset — confirm the coupling is actually wrong here"
          }) + "\n");
        }
      }
    }' <<<"$DC_JSON"
else
  echo "tool not installed: dependency-cruiser — run 'npm i -D dependency-cruiser' and 'npx depcruise --init' to create .dependency-cruiser.js (declare your UI→service→repo layer rules there)." >&2
fi
exit 0
