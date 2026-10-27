#!/usr/bin/env bash
# iac.sh — Infrastructure-as-Code misconfiguration recall for the IaC lens.
# Wraps Checkov, KICS, tfsec, Trivy config scanning. Emits JSON lines on stdout.
# Degrades gracefully. Exits 0 ALWAYS.
# A scanner that fails, or whose output cannot be parsed, is reported on stderr: zero findings
# on stdout then means "did not scan", never "clean".
# Usage: iac.sh <root>
# Output schema per line: { tool, rule, severity, file, resource, rationale }
set -uo pipefail
ARG="${1:-.}"
# Resolve the target ONCE to an absolute path, so a relative root is not re-resolved after cd.
if ! TARGET="$(cd -- "$ARG" 2>/dev/null && pwd)"; then
  echo "iac.sh: target not found: $ARG — nothing scanned." >&2
  exit 0
fi
cd "$TARGET" || exit 0

# Every parser below is a node program: without node no scanner output can be read, so say so
# rather than let zero findings read as clean.
if ! command -v node >/dev/null 2>&1; then
  echo "iac.sh: node not found — scanner output cannot be parsed; NO findings collected (this is not a clean scan)." >&2
  exit 0
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cklph-iac.XXXXXX")" || { echo "iac.sh: mktemp failed — nothing scanned." >&2; exit 0; }
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

no_output() {
  echo "iac.sh: $1 failed (exit $2, no output): $(head -c 300 "$3") — zero $1 findings means the scan did not run, not that the IaC is clean." >&2
}

# ── Checkov (broad IaC — Terraform, CFN, Dockerfile, Helm, K8s, ARM) ─────────
if command -v checkov >/dev/null 2>&1; then
  REPORT="$WORK/checkov.json"
  checkov -d "$TARGET" -o json --quiet > "$REPORT" 2> "$WORK/checkov.err"
  RC=$?
  if [ ! -s "$REPORT" ]; then no_output checkov "$RC" "$WORK/checkov.err"
  else
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("iac.sh: checkov output is not valid JSON (" + e.message + ") — checkov findings NOT collected.\n"); process.exit(0); }
      // one framework → an object; several → an array of per-framework objects
      for (const rep of (Array.isArray(r) ? r : [r]))
        for (const f of ((rep && rep.results) || {}).failed_checks || [])
          process.stdout.write(JSON.stringify({
            tool: "checkov", rule: f.check_id || "iac",
            severity: (f.severity||"medium").toLowerCase(),
            file: f.file_path || "", resource: f.resource || "",
            rationale: f.check_name || "IaC misconfiguration — judge real exposure (prod vs dev, public vs private)"
          }) + "\n");' "$REPORT"
  fi
fi

# ── KICS (multi-framework IaC) ───────────────────────────────────────────────
if command -v kics >/dev/null 2>&1; then
  # --output-path is a directory; KICS writes results.json into it
  kics scan -p "$TARGET" --report-formats json --output-path "$WORK/kics" --silent >/dev/null 2> "$WORK/kics.err"
  RC=$?
  REPORT="$WORK/kics/results.json"
  if [ ! -s "$REPORT" ]; then no_output kics "$RC" "$WORK/kics.err"
  else
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("iac.sh: kics output is not valid JSON (" + e.message + ") — kics findings NOT collected.\n"); process.exit(0); }
      for (const q of ((r.queries||[])))
        for (const f of (q.files||[]))
          process.stdout.write(JSON.stringify({
            tool: "kics", rule: q.query_id || "iac",
            severity: (q.severity||"medium").toLowerCase(),
            file: f.file_name || "", resource: "",
            rationale: q.query_name || "IaC misconfiguration — judge real exposure"
          }) + "\n");' "$REPORT"
  fi
fi

# ── tfsec (Terraform-specific) ───────────────────────────────────────────────
if command -v tfsec >/dev/null 2>&1; then
  REPORT="$WORK/tfsec.json"
  tfsec "$TARGET" --format json --quiet > "$REPORT" 2> "$WORK/tfsec.err"
  RC=$?
  if [ ! -s "$REPORT" ]; then no_output tfsec "$RC" "$WORK/tfsec.err"
  else
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("iac.sh: tfsec output is not valid JSON (" + e.message + ") — tfsec findings NOT collected.\n"); process.exit(0); }
      for (const res of (r.results||[]))
        process.stdout.write(JSON.stringify({
          tool: "tfsec", rule: res.rule_id || "iac",
          severity: (res.severity||"medium").toLowerCase(),
          file: (res.location && res.location.filename) || "", resource: res.resource || "",
          rationale: res.description || "Terraform misconfiguration — judge real exposure"
        }) + "\n");' "$REPORT"
  fi
fi

# ── Trivy config (folds IaC into the trivy ecosystem) ────────────────────────
if command -v trivy >/dev/null 2>&1; then
  REPORT="$WORK/trivy-config.json"
  trivy config --quiet --format json "$TARGET" > "$REPORT" 2> "$WORK/trivy.err"
  RC=$?
  if [ ! -s "$REPORT" ]; then no_output "trivy config" "$RC" "$WORK/trivy.err"
  else
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("iac.sh: trivy config output is not valid JSON (" + e.message + ") — trivy findings NOT collected.\n"); process.exit(0); }
      for (const res of (r.Results || []))
        for (const m of (res.Misconfigurations || []))
          process.stdout.write(JSON.stringify({
            tool: "trivy-config", rule: m.ID || "iac",
            severity: (m.Severity||"medium").toLowerCase(),
            file: res.Target || "", resource: "",
            rationale: m.Title || "IaC misconfiguration — judge real exposure"
          }) + "\n");' "$REPORT"
  fi
fi

if ! command -v checkov >/dev/null 2>&1 && ! command -v kics >/dev/null 2>&1 && ! command -v tfsec >/dev/null 2>&1 && ! command -v trivy >/dev/null 2>&1; then
  echo "tool not installed: checkov ('pip install checkov'), kics, tfsec ('brew install tfsec') or trivy. Reviewer should fall back to grepping for public resources, open SGs, IAM over-privilege." >&2
fi
exit 0
