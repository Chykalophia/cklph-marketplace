#!/usr/bin/env bash
# feed-status.sh — checks the age of each security tool's vulnerability DB and tool version.
# Used by the feed-refresh skill to warn when CVE data is stale. Emits JSON lines. Exits 0 ALWAYS.
# Usage: feed-status.sh
# Output schema per line: { tool, dbAge, lastUpdated, upToDate, currentVersion, latestVersion }
set -uo pipefail

# ── Trivy DB age ─────────────────────────────────────────────────────────────
if command -v trivy >/dev/null 2>&1; then
  CUR_VER=$(trivy --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
  # trivy's cache: $TRIVY_CACHE_DIR, else the OS user cache dir (~/Library/Caches on macOS,
  # $XDG_CACHE_HOME or ~/.cache elsewhere); the DB metadata sits in <cache>/db.
  DB_DIR=""
  for d in "${TRIVY_CACHE_DIR:-}" "${XDG_CACHE_HOME:-}/trivy" "$HOME/Library/Caches/trivy" "$HOME/.cache/trivy"; do
    case "$d" in ""|/trivy) continue ;; esac
    if [ -f "$d/db/metadata.json" ]; then DB_DIR="$d/db"; break; fi
  done
  DB_AGE="unknown"
  if [ -n "$DB_DIR" ]; then
    DB_AGE=$(node -e '
      let m={}; try{m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));}catch{}
      // age = time since this DB was fetched/built; NextUpdate is a FUTURE time, never an age
      const upd = m.DownloadedAt || m.UpdatedAt || 0;
      if (upd) { const age=Math.round((Date.now()-new Date(upd).getTime())/3600000); process.stdout.write(String(age)); }
      else process.stdout.write("unknown");
    ' "$DB_DIR/metadata.json" 2>/dev/null || echo "unknown")
  fi
  node -e '
    process.stdout.write(JSON.stringify({
      tool: "trivy", dbAge: process.argv[1], lastUpdated: "", upToDate: process.argv[1] !== "unknown" && parseInt(process.argv[1]) < 24,
      currentVersion: process.argv[2], latestVersion: ""
    }) + "\n");' "$DB_AGE" "$CUR_VER" || true
fi

# ── Grype DB age ─────────────────────────────────────────────────────────────
if command -v grype >/dev/null 2>&1; then
  CUR_VER=$(grype version 2>/dev/null | grep -iE '^version' | awk '{print $NF}' || echo "unknown")
  DB_AGE="unknown"
  DB_DIR=""
  for d in "${GRYPE_DB_CACHE_DIR:-}" "${XDG_CACHE_HOME:-}/grype/db" "$HOME/Library/Caches/grype/db" "$HOME/.cache/grype/db"; do
    case "$d" in ""|/grype/db) continue ;; esac
    if [ -d "$d" ]; then DB_DIR="$d"; break; fi
  done
  if [ -n "$DB_DIR" ]; then
    DB_AGE=$(node -e '
      const fs=require("fs"), path=require("path");
      let newest=0;
      try{ for(const f of fs.readdirSync(process.argv[1])){ const st=fs.statSync(path.join(process.argv[1],f)); if(st.mtimeMs>newest) newest=st.mtimeMs; } }catch{}
      if(newest){ const age=Math.round((Date.now()-newest)/3600000); process.stdout.write(String(age)); }
      else process.stdout.write("unknown");
    ' "$DB_DIR" 2>/dev/null || echo "unknown")
  fi
  node -e '
    process.stdout.write(JSON.stringify({
      tool: "grype", dbAge: process.argv[1], lastUpdated: "", upToDate: process.argv[1] !== "unknown" && parseInt(process.argv[1]) < 24,
      currentVersion: process.argv[2], latestVersion: ""
    }) + "\n");' "$DB_AGE" "$CUR_VER" || true
fi

# ── Semgrep version ──────────────────────────────────────────────────────────
if command -v semgrep >/dev/null 2>&1; then
  CUR_VER=$(semgrep --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
  node -e '
    process.stdout.write(JSON.stringify({
      tool: "semgrep", dbAge: "n/a", lastUpdated: "", upToDate: true,
      currentVersion: process.argv[1], latestVersion: ""
    }) + "\n");' "$CUR_VER" || true
fi

# ── OSV-Scanner version ──────────────────────────────────────────────────────
if command -v osv-scanner >/dev/null 2>&1; then
  CUR_VER=$(osv-scanner --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
  node -e '
    process.stdout.write(JSON.stringify({
      tool: "osv-scanner", dbAge: "n/a (queries live API)", lastUpdated: "", upToDate: true,
      currentVersion: process.argv[1], latestVersion: ""
    }) + "\n");' "$CUR_VER" || true
fi

# ── Checkov / Kubescape / KICS versions ──────────────────────────────────────
for tool in checkov kubescape kics hadolint; do
  if command -v "$tool" >/dev/null 2>&1; then
    CUR_VER=$("$tool" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "unknown")
    node -e '
      process.stdout.write(JSON.stringify({
        tool: process.argv[1], dbAge: "n/a", lastUpdated: "", upToDate: true,
        currentVersion: process.argv[2], latestVersion: ""
      }) + "\n");' "$tool" "$CUR_VER" || true
  fi
done

exit 0
