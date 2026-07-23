#!/usr/bin/env bash
# iac.sh — Infrastructure-as-Code misconfiguration recall for the IaC lens.
# Wraps Checkov, KICS, tfsec, Trivy config scanning. Emits JSON lines on stdout.
# Degrades gracefully. Exits 0 ALWAYS.
# Usage: iac.sh <root>
# Output schema per line: { tool, rule, severity, file, resource, rationale }
set -uo pipefail
TARGET="${1:-.}"
cd "$TARGET" 2>/dev/null || true

# ── Checkov (broad IaC — Terraform, CFN, Dockerfile, Helm, K8s, ARM) ─────────
if command -v checkov >/dev/null 2>&1; then
  REPORT="$(mktemp).json"
  checkov -d "$TARGET" -o json --quiet > "$REPORT" 2>/dev/null || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const f of (r.results || {}).failed_checks || [])
        process.stdout.write(JSON.stringify({
          tool: "checkov", rule: f.check_id || "iac",
          severity: (f.severity||"medium").toLowerCase(),
          file: f.file_path || "", resource: f.resource || "",
          rationale: f.check_name || "IaC misconfiguration — judge real exposure (prod vs dev, public vs private)"
        }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
fi

# ── KICS (multi-framework IaC) ───────────────────────────────────────────────
if command -v kics >/dev/null 2>&1; then
  REPORT="$(mktemp).json"
  kics scan -p "$TARGET" --format json --output "$REPORT" --silent >/dev/null 2>&1 || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const q of ((r.queries||[])))
        for (const f of (q.files||[]))
          process.stdout.write(JSON.stringify({
            tool: "kics", rule: q.query_id || "iac",
            severity: (q.severity||"medium").toLowerCase(),
            file: f.file_name || "", resource: "",
            rationale: q.query_name || "IaC misconfiguration — judge real exposure"
          }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
fi

# ── tfsec (Terraform-specific) ───────────────────────────────────────────────
if command -v tfsec >/dev/null 2>&1; then
  tfsec "$TARGET" --format json --quiet 2>/dev/null | node -e '
    let raw=""; process.stdin.on("data",d=>raw+=d); process.stdin.on("end",()=>{
      let r={}; try{r=JSON.parse(raw);}catch{}
      for (const res of (r.results||[]))
        process.stdout.write(JSON.stringify({
          tool: "tfsec", rule: res.rule_id || "iac",
          severity: (res.severity||"medium").toLowerCase(),
          file: res.location.filename || "", resource: res.resource || "",
          rationale: res.description || "Terraform misconfiguration — judge real exposure"
        }) + "\n");
    });' || true
fi

# ── Trivy config (folds IaC into the trivy ecosystem) ────────────────────────
if command -v trivy >/dev/null 2>&1; then
  REPORT="$(mktemp).json"
  trivy config --quiet --format json "$TARGET" > "$REPORT" 2>/dev/null || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const res of (r.Results || []))
        for (const m of (res.Misconfigurations || []))
          process.stdout.write(JSON.stringify({
            tool: "trivy-config", rule: m.ID || "iac",
            severity: (m.Severity||"medium").toLowerCase(),
            file: res.Target || "", resource: "",
            rationale: m.Title || "IaC misconfiguration — judge real exposure"
          }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
fi

if ! command -v checkov >/dev/null 2>&1 && ! command -v kics >/dev/null 2>&1 && ! command -v tfsec >/dev/null 2>&1; then
  echo "tool not installed: checkov ('pip install checkov'), kics, or tfsec ('brew install tfsec'). Reviewer should fall back to grepping for public resources, open SGs, IAM over-privilege." >&2
fi
exit 0
