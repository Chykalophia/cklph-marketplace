#!/usr/bin/env bash
# cpg.sh — code property graph reachability queries for the security lens (T3.2).
# Wraps Joern (if available) to answer "who calls this function?" / "can input reach this sink?"
# Falls back to a grep-based call-graph approximation. Emits JSON lines. Exits 0 ALWAYS.
# Usage: cpg.sh <root> <query-type> <target>
#   <query-type>: callers|reachable|sinks
#   <target>: function name or file:line (for callers) / sink pattern (for reachable/sinks)
# Output schema per line: { tool, query, file, line, snippet, rationale }
set -uo pipefail
ROOT="${1:-.}"
QUERY="${2:-callers}"
TARGET="${3:-}"
cd "$ROOT" 2>/dev/null || true

if [ -z "$TARGET" ]; then printf '[]\n'; exit 0; fi

# ── Joern (if installed and a CPG exists or can be built) ────────────────────
if command -v joern >/dev/null 2>&1; then
  CPG_DIR="${JOERN_CPG_DIR:-$ROOT/.cpg}"
  if [ ! -d "$CPG_DIR" ]; then
    joern-parse "$ROOT" --output-dir "$CPG_DIR" >/dev/null 2>&1 || true
  fi
  if [ -d "$CPG_DIR" ]; then
    case "$QUERY" in
      callers)
        joern-query --cpg "$CPG_DIR" "cpg.call.name(\"$TARGET\").method.l" --json 2>/dev/null \
          | node -e 'let raw="";process.stdin.on("data",d=>raw+=d);process.stdin.on("end",()=>{
            let arr=[];try{arr=JSON.parse(raw);}catch{}
            for(const r of arr) process.stdout.write(JSON.stringify({
              tool:"joern",query:"callers",file:r.filename||"",line:r.lineNumber||0,
              snippet:r.name||"",rationale:"Caller of "+process.argv[1]
            })+"\n");})' "$TARGET" || true
        ;;
      reachable)
        joern-query --cpg "$CPG_DIR" "def source = cpg.call.name(\"$TARGET\"); sink.reachableByFlows(source).p" --json 2>/dev/null \
          | node -e 'let raw="";process.stdin.on("data",d=>raw+=d);process.stdin.on("end",()=>{
            let arr=[];try{arr=JSON.parse(raw);}catch{}
            for(const r of arr) process.stdout.write(JSON.stringify({
              tool:"joern",query:"reachable",file:r.filename||"",line:r.lineNumber||0,
              snippet:r.code||"",rationale:"Reachable from "+process.argv[1]
            })+"\n");})' "$TARGET" || true
        ;;
    esac
    exit 0
  fi
fi

# ── Fallback: grep-based call-graph approximation ────────────────────────────
case "$QUERY" in
  callers)
    # find files that call/reference the target function
    find "$ROOT" \( -name node_modules -o -name .git -o -name dist -o -name build \) -prune \
      -o -type f \( -name '*.ts' -o -name '*.js' -o -name '*.py' -o -name '*.go' -o -name '*.rb' -o -name '*.php' \) -print 2>/dev/null \
      | while IFS= read -r f; do
        grep -nE "\\b${TARGET}\\b" "$f" 2>/dev/null | while IFS= read -r hit; do
          LN=$(echo "$hit" | cut -d: -f1)
          TXT=$(echo "$hit" | cut -d: -f2- | head -c 200)
          node -e 'process.stdout.write(JSON.stringify({
            tool:"grep-cpg",query:"callers",file:process.argv[1],line:parseInt(process.argv[2]),
            snippet:process.argv[3],rationale:"Approximate caller (grep) of "+process.argv[4]
          })+"\n");' "$f" "$LN" "$TXT" "$TARGET" || true
        done
      done
    ;;
  sinks)
    # find sinks matching the target pattern (e.g. eval, exec, innerHTML, dangerouslySetInnerHTML)
    find "$ROOT" \( -name node_modules -o -name .git \) -prune \
      -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) -print 2>/dev/null \
      | while IFS= read -r f; do
        grep -nE "${TARGET}" "$f" 2>/dev/null | while IFS= read -r hit; do
          LN=$(echo "$hit" | cut -d: -f1)
          TXT=$(echo "$hit" | cut -d: -f2- | head -c 200)
          node -e 'process.stdout.write(JSON.stringify({
            tool:"grep-cpg",query:"sinks",file:process.argv[1],line:parseInt(process.argv[2]),
            snippet:process.argv[3],rationale:"Potential sink matching "+process.argv[4]
          })+"\n");' "$f" "$LN" "$TXT" "$TARGET" || true
        done
      done
    ;;
esac

exit 0
