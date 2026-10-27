#!/usr/bin/env bash
# deadcode.sh — unused exports / dead code for the architecture lens.
# Tries knip, then ts-prune. Emits JSON lines on stdout. Degrades gracefully. Exits 0 ALWAYS.
# Both tools analyse a whole package, so they run from the nearest directory at or above <root>
# that has a package.json, and only results for files under <root> are emitted. Emitted paths are
# relative to the caller's cwd (not the package root), so a nested package's findings point at
# the right file.
# Usage: deadcode.sh <root>
set -uo pipefail
ARG="${1:-.}"
if ! TARGET="$(cd -- "$ARG" 2>/dev/null && pwd)"; then
  echo "deadcode.sh: target not found: $ARG — nothing analysed." >&2
  exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "tool not installed: npx (Node.js) — needed for knip/ts-prune." >&2
  exit 0
fi

PKG="$TARGET"
while [ ! -f "$PKG/package.json" ] && [ "$PKG" != "/" ]; do PKG="$(dirname "$PKG")"; done
if [ ! -f "$PKG/package.json" ]; then
  echo "deadcode.sh: no package.json at or above $TARGET — knip/ts-prune need a package root; nothing analysed." >&2
  exit 0
fi
ORIG="$PWD"
cd "$PKG" || exit 0

KNIP_JSON="$(npx --no-install knip --reporter json 2>/dev/null)"
if [ -n "$KNIP_JSON" ] && command -v node >/dev/null 2>&1; then
  node -e '
    const path = require("path");
    const [pkg, target, orig] = [process.argv[1], process.argv[2], process.argv[3]];
    const inTarget = (f) => { const a = path.resolve(pkg, f || ""); return a === target || a.startsWith(target + path.sep); };
    const rel = (f) => path.relative(orig, path.resolve(pkg, f || "")) || ".";
    let r;
    try { r = JSON.parse(require("fs").readFileSync(0, "utf8")); }
    catch (e) { process.stderr.write("deadcode.sh: knip output is not valid JSON (" + e.message + ") — knip findings NOT collected.\n"); process.exit(0); }
    for (const issue of (r.issues || [])) {
      if (!inTarget(issue.file)) continue;
      for (const ex of (issue.exports || [])) {
        process.stdout.write(JSON.stringify({
          tool: "knip", rule: "dead-export", severity: "low",
          file: rel(issue.file), line: ex.line || null, symbol: ex.name,
          rationale: "Unused export — reviewer must confirm it is not referenced dynamically / via a string key"
        }) + "\n");
      }
    }' "$PKG" "$TARGET" "$ORIG" <<<"$KNIP_JSON"
  exit 0
fi

# Fallback: ts-prune (plain text "file:line - symbol").
TSPRUNE="$(npx --no-install ts-prune 2>/dev/null)"
if [ -n "$TSPRUNE" ] && command -v node >/dev/null 2>&1; then
  node -e '
    const path = require("path");
    const [pkg, target, orig] = [process.argv[1], process.argv[2], process.argv[3]];
    const inTarget = (f) => { const a = path.resolve(pkg, f || ""); return a === target || a.startsWith(target + path.sep); };
    const rel = (f) => path.relative(orig, path.resolve(pkg, f || "")) || ".";
    for (const ln of require("fs").readFileSync(0,"utf8").split("\n")) {
      const m = ln.match(/^(.+?):(\d+)\s+-\s+(.+)$/);
      if (m && inTarget(m[1])) process.stdout.write(JSON.stringify({
        tool: "ts-prune", rule: "dead-export", severity: "low",
        file: rel(m[1]), line: Number(m[2]), symbol: m[3],
        rationale: "Possibly-unused export — confirm not dynamically referenced"
      }) + "\n");
    }' "$PKG" "$TARGET" "$ORIG" <<<"$TSPRUNE"
  exit 0
fi

echo "tool not installed: knip or ts-prune — run 'npm i -D knip' (preferred) or 'npx ts-prune'." >&2
exit 0
