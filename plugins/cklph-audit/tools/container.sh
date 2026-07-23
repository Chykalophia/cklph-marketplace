#!/usr/bin/env bash
# container.sh — OCI image + Dockerfile scanning recall for the container lens.
# Wraps Trivy image scan, Grype, dive (layer inspection). Falls back to hadolint
# for static Dockerfile linting if no image is built. Emits JSON lines. Exits 0 ALWAYS.
# Usage: container.sh <root> [image-name]
#   <image-name>: optional built image to scan; if absent, scans Dockerfiles statically
# Output schema per line: { tool, rule, severity, image, layer, package, cve, rationale }
set -uo pipefail
TARGET="${1:-.}"
IMAGE="${2:-}"
cd "$TARGET" 2>/dev/null || true

# ── If an image is provided (or auto-detected from docker images) ────────────
SCAN_IMAGE="$IMAGE"
if [ -z "$SCAN_IMAGE" ]; then
  # try to auto-detect from docker images (local builds)
  SCAN_IMAGE="$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -iv '<none>' | head -1 || true)"
fi

if [ -n "$SCAN_IMAGE" ]; then
  # Trivy image scan
  if command -v trivy >/dev/null 2>&1; then
    REPORT="$(mktemp).json"
    trivy image --quiet --format json "$SCAN_IMAGE" > "$REPORT" 2>/dev/null || true
    if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
      node -e '
        let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
        for (const res of (r.Results || []))
          for (const v of (res.Vulnerabilities || []))
            process.stdout.write(JSON.stringify({
              tool: "trivy-image", rule: v.VulnerabilityID || "vuln",
              severity: (v.Severity||"medium").toLowerCase(),
              image: process.argv[2], layer: res.Target || "",
              package: v.PkgName, cve: v.VulnerabilityID || "",
              rationale: "Image vuln — judge reachability (is the vulnerable lib loaded at runtime?)"
            }) + "\n");' "$REPORT" "$SCAN_IMAGE"
      # also check for misconfigs (secrets, root user, etc.)
      node -e '
        let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
        for (const res of (r.Results || []))
          for (const m of (res.Misconfigurations || []))
            process.stdout.write(JSON.stringify({
              tool: "trivy-image", rule: m.ID || "container-misconfig",
              severity: (m.Severity||"medium").toLowerCase(),
              image: process.argv[2], layer: res.Target || "", package: "", cve: "",
              rationale: m.Title || "Container misconfiguration"
            }) + "\n");' "$REPORT" "$SCAN_IMAGE"
    fi
    rm -f "$REPORT" 2>/dev/null || true
  fi

  # Grype image scan
  if command -v grype >/dev/null 2>&1; then
    REPORT="$(mktemp).json"
    grype "$SCAN_IMAGE" -o json --quiet > "$REPORT" 2>/dev/null || true
    if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
      node -e '
        let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
        for (const m of (r.matches || []))
          process.stdout.write(JSON.stringify({
            tool: "grype-image", rule: m.vulnerability.id || "vuln",
            severity: (m.vulnerability.severity||"medium").toLowerCase(),
            image: process.argv[2], layer: "", package: m.artifact.name,
            cve: m.vulnerability.id || "",
            rationale: "Image vuln match — judge reachability"
          }) + "\n");' "$REPORT" "$SCAN_IMAGE"
    fi
    rm -f "$REPORT" 2>/dev/null || true
  fi

  # dive — layer inspection (secrets in layers, unnecessary files)
  if command -v dive >/dev/null 2>&1; then
    dive "$SCAN_IMAGE" --json 2>/dev/null | node -e '
      let raw=""; process.stdin.on("data",d=>raw+=d); process.stdin.on("end",()=>{
        let r={}; try{r=JSON.parse(raw);}catch{}
        for (const layer of (r.layer||[]))
          for (const f of (layer.layers?.[0]?.filesThatDidNotChangeInAnyOtherLayer||[]))
            if (/secret|key|token|\.env|credential/i.test(f.name))
              process.stdout.write(JSON.stringify({
                tool: "dive", rule: "container:secret-layer",
                severity: "high", image: "", layer: layer.index?.toString()||"",
                package: "", cve: "", rationale: "Potential secret in container layer: " + f.name
              }) + "\n");
      });' || true
  fi
fi

# ── Static Dockerfile linting fallback (hadolint) ────────────────────────────
if command -v hadolint >/dev/null 2>&1; then
  find "$TARGET" -maxdepth 3 -iname 'Dockerfile*' -print 2>/dev/null | while IFS= read -r F; do
    [ -f "$F" ] || continue
    hadolint -f json "$F" 2>/dev/null | node -e '
      let raw=""; process.stdin.on("data",d=>raw+=d); process.stdin.on("end",()=>{
        let arr=[]; try{arr=JSON.parse(raw);}catch{}
        for (const f of arr)
          process.stdout.write(JSON.stringify({
            tool: "hadolint", rule: f.code || "dockerfile-lint",
            severity: (f.level||"medium").toLowerCase(),
            image: "", layer: "", package: "", cve: "",
            rationale: f.message || "Dockerfile lint finding"
          }) + "\n");
      });' || true
  done
fi

if ! command -v trivy >/dev/null 2>&1 && ! command -v grype >/dev/null 2>&1 && ! command -v hadolint >/dev/null 2>&1; then
  echo "tool not installed: trivy, grype, or hadolint ('brew install hadolint'). Reviewer should fall back to reading Dockerfiles for root user, no healthcheck, unpinned base images." >&2
fi
exit 0
