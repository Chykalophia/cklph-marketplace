#!/usr/bin/env bash
# k8s.sh — Kubernetes manifest scanning recall for the k8s lens.
# Wraps Kubescape, kube-bench, kube-hunter. Emits JSON lines. Degrades gracefully. Exits 0 ALWAYS.
# Usage: k8s.sh <root>
# Output schema per line: { tool, rule, severity, file, resource, namespace, rationale }
set -uo pipefail
TARGET="${1:-.}"
cd "$TARGET" 2>/dev/null || true

# Find K8s manifest files (yaml with k8s-ish resources, Helm templates, kustomize)
find_k8s_files() {
  find "$TARGET" \
    \( -name node_modules -o -name .git -o -name vendor \) -prune \
    -o -type f \( -name '*.yaml' -o -name '*.yml' \) -print 2>/dev/null \
    | while IFS= read -r f; do
      if grep -qE '^(kind|apiVersion):' "$f" 2>/dev/null; then printf '%s\n' "$f"; fi
    done
}

K8S_DIR=""
K8S_FILES=$(find_k8s_files | head -50)
if [ -n "$K8S_FILES" ]; then
  K8S_DIR="$(mktemp -d)"
  printf '%s\n' "$K8S_FILES" | while IFS= read -r f; do cp "$f" "$K8S_DIR/" 2>/dev/null || true; done
fi

# ── Kubescape (comprehensive K8s security) ───────────────────────────────────
if command -v kubescape >/dev/null 2>&1 && [ -n "$K8S_DIR" ]; then
  REPORT="$(mktemp).json"
  kubescape scan framework nsa "$K8S_DIR" --format json --output "$REPORT" --quiet >/dev/null 2>&1 || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const res of (r.results || []))
        for (const ac of (res.assessmentTests || []))
          for (const ar of (ac.testResults || []))
            if (ar.status && /fail/i.test(ar.status.status))
              process.stdout.write(JSON.stringify({
                tool: "kubescape", rule: ac.testName || "k8s",
                severity: (ac.severity||"medium").toLowerCase(),
                file: res.objectMetadata?.file || "", resource: res.objectMetadata?.name || "",
                namespace: res.objectMetadata?.namespace || "",
                rationale: ac.testDescription || "K8s security finding — judge real cluster risk"
              }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
fi

# ── kube-bench (CIS Kubernetes Benchmark — for running clusters) ─────────────
if command -v kube-bench >/dev/null 2>&1; then
  REPORT="$(mktemp).json"
  kube-bench --format json --output "$REPORT" run >/dev/null 2>&1 || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const ctrl of (r.Controls || []))
        for (const test of (ctrl.tests || []))
          for (const res of (test.results || []))
            if (/fail/i.test(res.status))
              process.stdout.write(JSON.stringify({
                tool: "kube-bench", rule: test.test_number || "cis-k8s",
                severity: "medium", file: "", resource: ctrl.node_type || "",
                namespace: "",
                rationale: res.test_desc || "CIS Kubernetes Benchmark failure"
              }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
fi

# ── kube-hunter (active recon simulation — read-only mode) ───────────────────
if command -v kube-hunter >/dev/null 2>&1; then
  kube-hunter scan --report json 2>/dev/null | node -e '
    let raw=""; process.stdin.on("data",d=>raw+=d); process.stdin.on("end",()=>{
      let arr=[]; try{arr=JSON.parse(raw);}catch{}
      for (const v of arr)
        process.stdout.write(JSON.stringify({
          tool: "kube-hunter", rule: v.vulnerability || "k8s-recon",
          severity: (v.severity||"medium").toLowerCase(),
          file: "", resource: v.location || "", namespace: "",
          rationale: v.description || "K8s recon finding — verify cluster exposure"
        }) + "\n");
    });' || true
fi

# cleanup
[ -n "$K8S_DIR" ] && rm -rf "$K8S_DIR" 2>/dev/null || true

if ! command -v kubescape >/dev/null 2>&1 && ! command -v kube-bench >/dev/null 2>&1; then
  echo "tool not installed: kubescape ('brew install kubescape') or kube-bench. Reviewer should fall back to grepping for privileged: true, hostPath, cluster-admin, missing networkPolicy." >&2
fi
exit 0
