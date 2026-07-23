#!/usr/bin/env bash
# git-hotspots.sh — git-history churn × complexity analysis for riskScore enrichment (T3.1).
# A snapshot audit structurally cannot see temporal instability; this tool reveals which
# files are churned most + which have high complexity + co-change partners. Emits JSON lines.
# Exits 0 ALWAYS. Usage: git-hotspots.sh <root> [months]
set -uo pipefail
ROOT="${1:-.}"
MONTHS="${2:-3}"
cd "$ROOT" 2>/dev/null || true

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "not a git repo — git-history hotspots unavailable" >&2
  exit 0
fi

SINCE_DATE="$(date -v-${MONTHS}m +%Y-%m-%d 2>/dev/null || date -d "$MONTHS months ago" +%Y-%m-%d 2>/dev/null || echo "1970-01-01")"

# ── Churn: files changed most in the last N months ───────────────────────────
git log --since="$SINCE_DATE" --name-only --format="" 2>/dev/null \
  | grep -vE '^\s*$' \
  | sort | uniq -c | sort -rn | head -30 \
  | while IFS= read -r line; do
    COUNT=$(echo "$line" | awk '{print $1}')
    FILE=$(echo "$line" | awk '{print $2}')
    [ -z "$FILE" ] && continue
    # complexity proxy: line count (fallback if no cloc)
    LINES=$(wc -l < "$FILE" 2>/dev/null || echo 0)
    node -e '
      process.stdout.write(JSON.stringify({
        tool: "git-churn", rule: "hotspot:churn",
        severity: parseInt(process.argv[1]) > 10 ? "high" : parseInt(process.argv[1]) > 5 ? "medium" : "low",
        file: process.argv[2], churn: parseInt(process.argv[1]), complexity: parseInt(process.argv[3]),
        rationale: "High-churn file — touched " + process.argv[1] + " times in the last " + process.argv[4] + " months; audit deeper"
      }) + "\n");' "$COUNT" "$FILE" "$LINES" "$MONTHS" || true
  done

# ── Temporal coupling: files that frequently change together ─────────────────
git log --since="$SINCE_DATE" --name-only --format="COMMIT:%H" 2>/dev/null \
  | node -e '
    const lines = require("fs").readFileSync(0,"utf8").split("\n");
    const pairs = {}; const commits = []; let cur = [];
    for (const l of lines) {
      if (l.startsWith("COMMIT:")) { if(cur.length) commits.push(cur); cur = []; }
      else if (l.trim()) cur.push(l.trim());
    }
    if (cur.length) commits.push(cur);
    for (const c of commits)
      for (let i=0;i<c.length;i++)
        for (let j=i+1;j<c.length;j++) {
          const k = [c[i],c[j]].sort().join("||");
          pairs[k] = (pairs[k]||0)+1;
        }
    const top = Object.entries(pairs).filter(([,v])=>v>=3).sort((a,b)=>b[1]-a[1]).slice(0,15);
    for (const [pair, count] of top)
      process.stdout.write(JSON.stringify({
        tool: "git-coupling", rule: "hotspot:co-change",
        severity: count >= 5 ? "medium" : "low",
        file: pair.split("||")[0], coChangedWith: pair.split("||")[1], churn: count,
        rationale: "Co-change: these files changed together " + count + " times — changing one without the other may be a risk"
      }) + "\n");' || true

exit 0
