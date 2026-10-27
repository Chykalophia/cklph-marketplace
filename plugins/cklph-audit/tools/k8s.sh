#!/usr/bin/env bash
# k8s.sh — Kubernetes manifest scanning recall for the k8s lens.
# Wraps Kubescape, kube-bench, kube-hunter. Emits JSON lines. Degrades gracefully. Exits 0 ALWAYS.
# Usage: k8s.sh <root>
# Output schema per line: { tool, rule, severity, file, resource, namespace, rationale }
set -uo pipefail
ARG="${1:-.}"
# Resolve the target ONCE to an absolute path, so a relative root is not re-resolved after cd.
if ! TARGET="$(cd -- "$ARG" 2>/dev/null && pwd)"; then
  echo "k8s.sh: target not found: $ARG — nothing scanned." >&2
  exit 0
fi
cd "$TARGET" || exit 0

# Every parser below is a node program: without node no scanner output can be read, so say so
# rather than let zero findings read as clean.
if ! command -v node >/dev/null 2>&1; then
  echo "k8s.sh: node not found — scanner output cannot be parsed; NO findings collected (this is not a clean scan)." >&2
  exit 0
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cklph-k8s.XXXXXX")" || { echo "k8s.sh: mktemp failed — nothing scanned." >&2; exit 0; }
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

no_output() {
  echo "k8s.sh: $1 failed (exit $2, no output): $(head -c 300 "$3") — zero $1 findings means the scan did not run, not that the manifests are clean." >&2
}

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
  K8S_DIR="$WORK/manifests"
  if mkdir "$K8S_DIR"; then
    printf '%s\n' "$K8S_FILES" | while IFS= read -r f; do cp "$f" "$K8S_DIR/" 2>/dev/null || true; done
  else
    K8S_DIR=""
    echo "k8s.sh: could not stage the manifests in $WORK — kubescape not run; zero kubescape findings means nothing was scanned." >&2
  fi
fi

# ── Kubescape (comprehensive K8s security) ───────────────────────────────────
if command -v kubescape >/dev/null 2>&1 && [ -n "$K8S_DIR" ]; then
  REPORT="$WORK/kubescape.json"
  kubescape scan framework nsa "$K8S_DIR" --format json --output "$REPORT" --quiet >/dev/null 2> "$WORK/kubescape.err"
  RC=$?
  if [ ! -s "$REPORT" ]; then no_output kubescape "$RC" "$WORK/kubescape.err"
  else
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("k8s.sh: kubescape output is not valid JSON (" + e.message + ") — kubescape findings NOT collected.\n"); process.exit(0); }
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
fi

# ── kube-bench (CIS Kubernetes Benchmark — for running clusters) ─────────────
if command -v kube-bench >/dev/null 2>&1; then
  REPORT="$WORK/kube-bench.json"
  kube-bench --json --outputfile "$REPORT" run >/dev/null 2> "$WORK/kube-bench.err"
  RC=$?
  if [ ! -s "$REPORT" ]; then no_output kube-bench "$RC" "$WORK/kube-bench.err"
  else
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("k8s.sh: kube-bench output is not valid JSON (" + e.message + ") — kube-bench findings NOT collected.\n"); process.exit(0); }
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
fi

# ── kube-hunter (active recon simulation — read-only mode) ───────────────────
if command -v kube-hunter >/dev/null 2>&1; then
  kube-hunter scan --report json 2>/dev/null | node -e '
    let raw=""; process.stdin.on("data",d=>raw+=d); process.stdin.on("end",()=>{
      let arr=[]; try{arr=JSON.parse(raw);}catch(e){process.stderr.write("k8s.sh: kube-hunter output is not valid JSON ("+e.message+") — kube-hunter findings NOT collected.\n");}
      for (const v of (Array.isArray(arr) ? arr : (arr.vulnerabilities || [])))
        process.stdout.write(JSON.stringify({
          tool: "kube-hunter", rule: v.vulnerability || "k8s-recon",
          severity: (v.severity||"medium").toLowerCase(),
          file: "", resource: v.location || "", namespace: "",
          rationale: v.description || "K8s recon finding — verify cluster exposure"
        }) + "\n");
    });' || true
fi

if [ -z "$K8S_FILES" ]; then
  echo "k8s.sh: no Kubernetes manifests (YAML with kind:/apiVersion:) under $TARGET — kubescape not run." >&2
fi

if ! command -v kubescape >/dev/null 2>&1 && ! command -v kube-bench >/dev/null 2>&1; then
  echo "tool not installed: kubescape ('brew install kubescape') or kube-bench. Reviewer should fall back to grepping for privileged: true, hostPath, cluster-admin, missing networkPolicy." >&2
fi
exit 0
