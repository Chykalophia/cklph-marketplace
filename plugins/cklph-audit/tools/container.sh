#!/usr/bin/env bash
# container.sh — OCI image + Dockerfile scanning recall for the container lens.
# Wraps Trivy image scan, Grype, dive (layer inspection). Falls back to hadolint
# for static Dockerfile linting if no image is built. Emits JSON lines. Exits 0 ALWAYS.
# Usage: container.sh <root> [image-name]
#   <image-name>: optional built image to scan; if absent, scans Dockerfiles statically
# Output schema per line: { tool, rule, severity, image, layer, package, cve, rationale } (hadolint rows add file, line)
set -uo pipefail
ARG="${1:-.}"
IMAGE="${2:-}"
# Resolve the target ONCE to an absolute path, so a relative root is not re-resolved after cd.
if ! TARGET="$(cd -- "$ARG" 2>/dev/null && pwd)"; then
  echo "container.sh: target not found: $ARG — nothing scanned." >&2
  exit 0
fi
cd "$TARGET" || exit 0

# Every parser below is a node program: without node no scanner output can be read, so say so
# rather than let zero findings read as clean.
if ! command -v node >/dev/null 2>&1; then
  echo "container.sh: node not found — scanner output cannot be parsed; NO findings collected (this is not a clean scan)." >&2
  exit 0
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cklph-container.XXXXXX")" || { echo "container.sh: mktemp failed — nothing scanned." >&2; exit 0; }
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

no_output() {
  echo "container.sh: $1 failed (exit $2, no output): $(head -c 300 "$3") — zero $1 findings means the scan did not run, not that the image is clean." >&2
}
# rc_warn <tool> <exit-code> <stderr-file>: non-zero exit but a report was written — parse it, and
# say the scan may be partial (an empty report from a failed run is not a clean image).
rc_warn() {
  [ "$2" -eq 0 ] || echo "container.sh: $1 exited $2 but wrote a report: $(head -c 300 "$3") — its findings may be incomplete; zero $1 findings does not mean clean." >&2
}

# ── If an image is provided (or auto-detected from docker images) ────────────
SCAN_IMAGE="$IMAGE"
if [ -z "$SCAN_IMAGE" ]; then
  # try to auto-detect from docker images (local builds)
  SCAN_IMAGE="$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -iv '<none>' | head -1 || true)"
fi

if [ -n "$SCAN_IMAGE" ]; then
  # Trivy image scan
  if command -v trivy >/dev/null 2>&1; then
    REPORT="$WORK/trivy.json"
    trivy image --quiet --format json "$SCAN_IMAGE" > "$REPORT" 2> "$WORK/trivy.err"
    RC=$?
    if [ ! -s "$REPORT" ]; then no_output "trivy image" "$RC" "$WORK/trivy.err"
    else
      rc_warn "trivy image" "$RC" "$WORK/trivy.err"
      node -e '
        let r;
        try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
        catch (e) { process.stderr.write("container.sh: trivy image output is not valid JSON (" + e.message + ") — trivy findings NOT collected.\n"); process.exit(0); }
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
        let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch (e) { process.exit(0); }  // already reported above
        for (const res of (r.Results || []))
          for (const m of (res.Misconfigurations || []))
            process.stdout.write(JSON.stringify({
              tool: "trivy-image", rule: m.ID || "container-misconfig",
              severity: (m.Severity||"medium").toLowerCase(),
              image: process.argv[2], layer: res.Target || "", package: "", cve: "",
              rationale: m.Title || "Container misconfiguration"
            }) + "\n");' "$REPORT" "$SCAN_IMAGE"
    fi
  fi

  # Grype image scan
  if command -v grype >/dev/null 2>&1; then
    REPORT="$WORK/grype.json"
    grype "$SCAN_IMAGE" -o json --quiet > "$REPORT" 2> "$WORK/grype.err"
    RC=$?
    if [ ! -s "$REPORT" ]; then no_output grype "$RC" "$WORK/grype.err"
    else
      rc_warn grype "$RC" "$WORK/grype.err"
      node -e '
        let r;
        try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
        catch (e) { process.stderr.write("container.sh: grype output is not valid JSON (" + e.message + ") — grype findings NOT collected.\n"); process.exit(0); }
        for (const m of (r.matches || []))
          process.stdout.write(JSON.stringify({
            tool: "grype-image", rule: m.vulnerability.id || "vuln",
            severity: (m.vulnerability.severity||"medium").toLowerCase(),
            image: process.argv[2], layer: "", package: m.artifact.name,
            cve: m.vulnerability.id || "",
            rationale: "Image vuln match — judge reachability"
          }) + "\n");' "$REPORT" "$SCAN_IMAGE"
    fi
  fi

  # dive — layer inspection (secrets in layers, unnecessary files)
  if command -v dive >/dev/null 2>&1; then
    dive "$SCAN_IMAGE" --json 2>/dev/null | node -e '
      let raw=""; process.stdin.on("data",d=>raw+=d); process.stdin.on("end",()=>{
        let r={}; try{r=JSON.parse(raw);}catch(e){process.stderr.write("container.sh: dive output is not valid JSON ("+e.message+") — layer findings NOT collected.\n");}
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
        let arr;
        try { arr = JSON.parse(raw); }
        catch (e) { process.stderr.write("container.sh: hadolint output for " + process.argv[1] + " is not valid JSON (" + e.message + ") — its findings NOT collected.\n"); return; }
        // hadolint levels → the FINDINGS_SCHEMA words
        const sev = { error: "medium", warning: "low", info: "low", style: "low" };
        if (!Array.isArray(arr)) { process.stderr.write("container.sh: hadolint output for " + process.argv[1] + " is not an array (unexpected shape) — its findings NOT collected.\n"); return; }
        for (const f of arr)
          process.stdout.write(JSON.stringify({
            tool: "hadolint", rule: f.code || "dockerfile-lint",
            severity: sev[String(f.level || "").toLowerCase()] || "low",
            file: f.file || process.argv[1], line: f.line || 0,
            image: "", layer: "", package: "", cve: "",
            rationale: f.message || "Dockerfile lint finding"
          }) + "\n");
      });' "$F" || true
  done
fi

if ! command -v trivy >/dev/null 2>&1 && ! command -v grype >/dev/null 2>&1 && ! command -v hadolint >/dev/null 2>&1; then
  echo "tool not installed: trivy, grype, or hadolint ('brew install hadolint'). Reviewer should fall back to reading Dockerfiles for root user, no healthcheck, unpinned base images." >&2
fi
exit 0
