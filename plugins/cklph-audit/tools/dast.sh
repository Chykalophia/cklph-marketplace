#!/usr/bin/env bash
# dast.sh — dynamic application security testing helper for the DAST phase.
# Boots the app via Docker Compose (or local dev server), runs ZAP/Nuclei/ffuf,
# tears down. Emits JSON lines. Degrades gracefully. Exits 0 ALWAYS.
# Usage: dast.sh <root> [target-url]
#   <target-url>: if provided, scans that URL directly (no boot).
#                 if absent, tries docker-compose up then falls back to localhost:3000.
# Output schema per line: { tool, rule, severity, url, method, param, evidence }
set -uo pipefail
TARGET="${1:-.}"
URL="${2:-}"
cd "$TARGET" 2>/dev/null || true

COMPOSE_UP=false

# ── Boot the target (unless a URL was provided) ──────────────────────────────
if [ -z "$URL" ]; then
  if [ -f "$TARGET/docker-compose.yml" ] || [ -f "$TARGET/docker-compose.yaml" ]; then
    docker compose -f "$TARGET/docker-compose.yml" up -d --quiet-pull >/dev/null 2>&1 || \
      docker-compose -f "$TARGET/docker-compose.yml" up -d >/dev/null 2>&1 || true
    COMPOSE_UP=true
    # wait for healthcheck (max 60s)
    for i in $(seq 1 60); do
      URL=$(docker compose port 2>/dev/null | head -1 | awk '{print $3}' || true)
      [ -n "$URL" ] && break
      sleep 1
    done
    URL="${URL:-http://localhost:3000}"
  elif [ -f "$TARGET/package.json" ]; then
    # try to start a dev server in the background
    (cd "$TARGET" && npm run dev >/dev/null 2>&1 &) 2>/dev/null || true
    sleep 10
    URL="http://localhost:3000"
  else
    echo "no docker-compose or package.json found — provide a target URL as the second arg" >&2
    URL="http://localhost:3000"
  fi
fi

# ── ZAP baseline scan ────────────────────────────────────────────────────────
if command -v zap-cli >/dev/null 2>&1; then
  zap-cli quick-scan --scanner base -f json "$URL" 2>/dev/null | node -e '
    let raw=""; process.stdin.on("data",d=>raw+=d); process.stdin.on("end",()=>{
      let arr=[]; try{arr=JSON.parse(raw);}catch{}
      for (const a of arr)
        process.stdout.write(JSON.stringify({
          tool: "zap", rule: a.pluginid || "zap", severity: a.riskdesc?.toLowerCase() || "medium",
          url: a.url || "", method: a.method || "", param: a.param || "",
          evidence: a.msg || a.description || ""
        }) + "\n");
    });' || true
elif command -v docker >/dev/null 2>&1; then
  # ZAP via Docker (softwaresecurityproject/zap-stable)
  docker run --rm --network=host softwaresecurityproject/zap-stable:latest \
    zap-baseline.py -t "$URL" -J /dev/stdout 2>/dev/null | node -e '
      let raw=""; process.stdin.on("data",d=>raw+=d); process.stdin.on("end",()=>{
        let r={}; try{r=JSON.parse(raw);}catch{}
        for (const s of (r.site||[]))
          for (const a of (s.alerts||[]))
            process.stdout.write(JSON.stringify({
              tool: "zap", rule: a.pluginid || "zap", severity: a.riskcode?.toLowerCase() || "medium",
              url: a.instances?.[0]?.uri || "", method: a.instances?.[0]?.method || "",
              param: a.instances?.[0]?.param || "", evidence: a.desc || ""
            }) + "\n");
      });' || true
fi

# ── Nuclei (template-based scanning) ─────────────────────────────────────────
if command -v nuclei >/dev/null 2>&1; then
  nuclei -u "$URL" -json -silent 2>/dev/null | while IFS= read -r line; do
    [ -n "$line" ] || continue
    node -e '
      let r={}; try{r=JSON.parse(process.argv[1]);}catch{}
      process.stdout.write(JSON.stringify({
        tool: "nuclei", rule: r["template-id"] || "nuclei",
        severity: (r.info?.severity||"medium").toLowerCase(),
        url: r.matched-at || r.host || "", method: "", param: "",
        evidence: r.matcher-name || r["template-id"] || ""
      }) + "\n");' "$line" || true
  done
fi

# ── ffuf (content discovery — optional, quick) ───────────────────────────────
if command -v ffuf >/dev/null 2>&1; then
  # minimal common-paths discovery
  ffuf -u "$URL/FUZZ" -w /dev/stdin -mc 200,301,401,403 -s 2>/dev/null <<'PATHS' | \
    node -e 'let raw="";process.stdin.on("data",d=>raw+=d);process.stdin.on("end",()=>{
      for(const line of raw.trim().split("\n")){
        if(!line)continue; let r={};try{r=JSON.parse(line);}catch{continue;}
        process.stdout.write(JSON.stringify({
          tool:"ffuf",rule:"content-discovery",severity:"low",
          url:r.url||"",method:"GET",param:"",evidence:"Discovered: "+(r.input?.FUZZ||"")
        })+"\n");}})' || true
admin
.git
.env
backup
config
api
debug
graphql
wp-admin
phpinfo
PATHS
fi

# ── Teardown ─────────────────────────────────────────────────────────────────
if [ "$COMPOSE_UP" = true ]; then
  docker compose -f "$TARGET/docker-compose.yml" down --quiet >/dev/null 2>&1 || true
fi

if ! command -v zap-cli >/dev/null 2>&1 && ! command -v nuclei >/dev/null 2>&1 && ! command -v docker >/dev/null 2>&1; then
  echo "tool not installed: zap-cli, nuclei ('brew install nuclei'), or docker. DAST phase cannot run — skip or provide manual results." >&2
fi
exit 0
