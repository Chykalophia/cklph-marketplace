#!/usr/bin/env bash
# dast.sh — dynamic application security testing helper for the DAST phase.
# Boots the app via Docker Compose (or local dev server), runs ZAP/Nuclei/ffuf,
# tears down. Emits JSON lines. Degrades gracefully. Exits 0 ALWAYS.
# Usage: dast.sh <root> [target-url]
#   <target-url>: if provided, scans that URL directly (no boot).
#                 if absent, tries docker-compose up then falls back to localhost:3000.
# Output schema per line: { tool, rule, severity, url, method, param, evidence }
set -uo pipefail
ARG="${1:-.}"
URL="${2:-}"
# Resolve the target ONCE to an absolute path, so a relative root is not re-resolved after cd.
if ! TARGET="$(cd "$ARG" 2>/dev/null && pwd)"; then
  echo "dast.sh: target not found: $ARG — nothing booted or scanned." >&2
  exit 0
fi
cd "$TARGET" || exit 0

COMPOSE_UP=false
COMPOSE_FILE=""
DEV_PID=""
for f in compose.yaml compose.yml docker-compose.yaml docker-compose.yml; do
  if [ -f "$TARGET/$f" ]; then COMPOSE_FILE="$TARGET/$f"; break; fi
done

# ── Boot the target (unless a URL was provided) ──────────────────────────────
if [ -z "$URL" ]; then
  if [ -n "$COMPOSE_FILE" ]; then
    docker compose -f "$COMPOSE_FILE" up -d --quiet-pull >/dev/null 2>&1 || \
      docker-compose -f "$COMPOSE_FILE" up -d >/dev/null 2>&1 || true
    COMPOSE_UP=true
    # wait for healthcheck (max 60s)
    for i in $(seq 1 60); do
      URL=$(docker compose port 2>/dev/null | head -1 | awk '{print $3}' || true)
      [ -n "$URL" ] && break
      sleep 1
    done
    URL="${URL:-http://localhost:3000}"
  elif [ -f "$TARGET/package.json" ]; then
    # Start a dev server in the background, in its own process group (set -m), so teardown can
    # stop npm AND the server it spawns with one group kill.
    set -m
    npm run dev >/dev/null 2>&1 &
    DEV_PID=$!
    set +m
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
  # ZAP via Docker (zaproxy/zap-stable). Same isolation as exploit-runner.sh: a throwaway
  # user-defined bridge network, never --network=host, so the scanner does not share the
  # host's network namespace. The target is reached through the host gateway, so a localhost
  # URL is rewritten to host.docker.internal. On Linux a target bound only to 127.0.0.1 is then
  # unreachable: bind it to 0.0.0.0 (or the bridge address).
  # LIMIT (documented, not enforced): a bridge network does not firewall egress. The scanner
  # can still reach the internet and any port the host exposes on the gateway interface (and,
  # on Docker Desktop, the host's loopback services). Scan only a disposable target.
  # LIMIT: the scanner sends Host: host.docker.internal. A dev server with a host allowlist
  # (Vite's server.allowedHosts, for one) answers that with a rejection page, and ZAP scans the
  # rejection page. Allow host.docker.internal there, or pass a URL the bridge reaches as-is.
  ZAP_URL="$URL"
  ZAP_URL="${ZAP_URL/:\/\/localhost/://host.docker.internal}"
  ZAP_URL="${ZAP_URL/:\/\/127.0.0.1/://host.docker.internal}"
  ZAP_NET="cklph-dast-$$-$RANDOM"
  # zap-baseline.py writes -J reports only under /zap/wrk, and refuses to run when it is not
  # mounted. The zap user (uid 1000) must be able to write there, so the mounted dir is
  # world-writable; it sits inside a private (0700) dir so no other local user can reach it.
  ZAP_TMP=$(mktemp -d 2>/dev/null) || ZAP_TMP=""
  ZAP_WRK="$ZAP_TMP/wrk"
  # Remove the container, network and report dir even if the scan is interrupted. Killing the
  # docker CLI does not stop the container, and the network cannot be removed while the
  # container is attached, so the container is named and removed first.
  trap 'docker rm -f "$ZAP_NET" >/dev/null 2>&1; docker network rm "$ZAP_NET" >/dev/null 2>&1; rm -rf "$ZAP_TMP"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  # An empty ZAP_TMP would make ZAP_WRK "/wrk": skip ZAP rather than write outside a temp dir.
  if [ -z "$ZAP_TMP" ] || ! mkdir "$ZAP_WRK" || ! chmod 777 "$ZAP_WRK"; then
    echo "could not create a temp dir for the ZAP report. ZAP skipped." >&2
  elif docker network create --driver bridge "$ZAP_NET" >/dev/null 2>&1; then
    # Exit codes: 0 pass, 1 FAIL alerts, 2 WARN alerts, 3 other failure. Run in the background
    # and wait, so a signal is handled at once instead of after the scan finishes.
    docker run --rm --name "$ZAP_NET" --network "$ZAP_NET" \
      --add-host=host.docker.internal:host-gateway \
      -v "$ZAP_WRK:/zap/wrk:rw" \
      zaproxy/zap-stable:latest \
      zap-baseline.py -t "$ZAP_URL" -J report.json >/dev/null 2>&1 &
    wait $!
    ZAP_RC=$?
    docker network rm "$ZAP_NET" >/dev/null 2>&1 || true
    if [ ! -s "$ZAP_WRK/report.json" ] || [ "$ZAP_RC" -gt 2 ]; then
      echo "ZAP scan failed (exit $ZAP_RC, report $([ -s "$ZAP_WRK/report.json" ] && echo present || echo missing)) against $ZAP_URL: zero ZAP findings means the scan did not run, not that the target is clean." >&2
    fi
    # riskcode is "0".."3"; map it to FINDINGS_SCHEMA's words. The schema has no "info", so
    # ZAP's informational alerts (0) become low. evidence is the alert name plus the matched
    # request/response string (or ZAP's per-instance note when there is none, e.g. a missing
    # header), not the generic rule description.
    [ -s "$ZAP_WRK/report.json" ] && node -e '
      let r={}; try{r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));}catch{}
      const sev={"3":"high","2":"medium","1":"low","0":"low"};
      for (const s of (r.site||[]))
        for (const a of (s.alerts||[])) {
          const i = a.instances?.[0] || {};
          const detail = i.evidence || i.otherinfo || a.otherinfo || "";
          process.stdout.write(JSON.stringify({
            tool: "zap", rule: a.pluginid || "zap", severity: sev[a.riskcode] || "medium",
            url: i.uri || "", method: i.method || "", param: i.param || "",
            evidence: (a.name || a.alert || "") + (detail ? ": " + detail : "")
          }) + "\n");
        }' "$ZAP_WRK/report.json" || true
  else
    echo "could not create an isolated docker network; refusing to fall back to host networking. ZAP skipped." >&2
  fi
  rm -rf "$ZAP_TMP"
  trap - EXIT INT TERM
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
        url: r["matched-at"] || r.host || "", method: "", param: "",
        evidence: r["matcher-name"] || r["template-id"] || ""
      }) + "\n");' "$line" || true
  done
fi

# ── ffuf (content discovery — optional, quick) ───────────────────────────────
if command -v ffuf >/dev/null 2>&1; then
  # minimal common-paths discovery. -json prints one JSON object per hit (plain -s prints bare
  # words, which the parser cannot read). The evidence uses url + status, not input.FUZZ, which
  # ffuf's -json stream may base64-encode.
  ffuf -u "$URL/FUZZ" -w /dev/stdin -mc 200,301,401,403 -json 2>/dev/null <<'PATHS' | \
    node -e 'let raw="";process.stdin.on("data",d=>raw+=d);process.stdin.on("end",()=>{
      let bad=0;
      for(const line of raw.split("\n")){
        if(!line.trim())continue; let r;try{r=JSON.parse(line);}catch{bad++;continue;}
        process.stdout.write(JSON.stringify({
          tool:"ffuf",rule:"content-discovery",severity:"low",
          url:r.url||"",method:"GET",param:"",evidence:"Discovered: "+(r.url||"")+(r.status?" (HTTP "+r.status+")":"")
        })+"\n");}
      if(bad) process.stderr.write("dast.sh: "+bad+" ffuf output line(s) were not JSON — those hits were NOT collected.\n");})' || true
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
  docker compose -f "$COMPOSE_FILE" down >/dev/null 2>&1 || \
    docker-compose -f "$COMPOSE_FILE" down >/dev/null 2>&1 || true
fi
if [ -n "$DEV_PID" ]; then
  # the dev server leads its own process group (set -m above): stop npm and its children
  kill -TERM -- "-$DEV_PID" 2>/dev/null || kill -TERM "$DEV_PID" 2>/dev/null || true
fi

if ! command -v zap-cli >/dev/null 2>&1 && ! command -v nuclei >/dev/null 2>&1 && ! command -v docker >/dev/null 2>&1; then
  echo "tool not installed: zap-cli, nuclei ('brew install nuclei'), or docker. DAST phase cannot run — skip or provide manual results." >&2
fi
exit 0
