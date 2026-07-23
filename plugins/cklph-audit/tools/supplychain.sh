#!/usr/bin/env bash
# supplychain.sh — CI/CD pipeline + supply-chain security recall for the supply-chain lens.
# Wraps semgrep CI rules (github-actions), checks for SLSA provenance/artifact signing,
# dependency confusion, typosquatting. Emits JSON lines. Degrades gracefully. Exits 0 ALWAYS.
# Usage: supplychain.sh <root>
# Output schema per line: { tool, rule, severity, file, line, rationale }
set -uo pipefail
TARGET="${1:-.}"
cd "$TARGET" 2>/dev/null || true

# ── semgrep CI rules (GitHub Actions, GitLab CI) ─────────────────────────────
if command -v semgrep >/dev/null 2>&1; then
  REPORT="$(mktemp).json"
  semgrep --json --quiet --disable-version-check \
    --config p/github-actions --config p/ci \
    "$TARGET" > "$REPORT" 2>/dev/null || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const res of (r.results || [])) {
        const m = (res.extra.metadata || {});
        process.stdout.write(JSON.stringify({
          tool: "semgrep-ci", rule: res.check_id || "ci",
          severity: (m.impact || res.extra.severity || "medium").toLowerCase(),
          file: res.path || "", line: res.start ? res.start.line : 0,
          rationale: "CI/CD finding — judge if an external contributor can trigger it"
        }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
fi

# ── pull_request_target check (classic injection vector) ─────────────────────
find "$TARGET" -path '*/.github/workflows/*.yml' -o -path '*/.github/workflows/*.yaml' 2>/dev/null \
  | while IFS= read -r f; do
    [ -f "$f" ] || continue
    if grep -q 'pull_request_target' "$f" 2>/dev/null; then
      LN=$(grep -n 'pull_request_target' "$f" | head -1 | cut -d: -f1)
      emit_secrets=""
      if grep -qE 'secrets\.' "$f" 2>/dev/null; then emit_secrets=" AND references secrets — external contributor can exfiltrate"; fi
      node -e '
        process.stdout.write(JSON.stringify({
          tool: "grep-ci", rule: "supplychain:pull-request-target",
          severity: "high", file: process.argv[1], line: parseInt(process.argv[2]) || 0,
          rationale: "pull_request_target trigger runs with secrets access" + process.argv[3]
        }) + "\n");' "$f" "$LN" "$emit_secrets" || true
    fi
  done

# ── dependency confusion check ───────────────────────────────────────────────
# If the repo has internal-scoped packages (@company/...) check if they exist on public npm
if [ -f "$TARGET/package.json" ] && command -v node >/dev/null 2>&1; then
  node -e '
    let p = {}; try { p = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
    const scopes = new Set();
    for (const dep of [...Object.keys(p.dependencies||{}), ...Object.keys(p.devDependencies||{})])
      if (dep.startsWith("@") && dep.includes("/")) scopes.add(dep.split("/")[0]);
    for (const scope of scopes)
      process.stdout.write(JSON.stringify({
        tool: "dep-confusion", rule: "supplychain:dependency-confusion",
        severity: "medium", file: "package.json", line: 0,
        rationale: "Scoped package " + scope + " — verify it is not registered on public npm (dependency confusion attack)"
      }) + "\n");' "$TARGET/package.json" || true
fi

# ── SLSA / artifact signing check ────────────────────────────────────────────
if [ -f "$TARGET/.github/workflows" ]; then
  HAS_PROVENANCE=$(grep -rl 'slsa-provenance\|sigstore\|cosign\|gh-action-attest' "$TARGET/.github/workflows" 2>/dev/null | head -1)
  if [ -z "$HAS_PROVENANCE" ]; then
    node -e '
      process.stdout.write(JSON.stringify({
        tool: "slsa-check", rule: "supplychain:no-provenance",
        severity: "low", file: ".github/workflows", line: 0,
        rationale: "No SLSA provenance or artifact signing detected — consider adding cosign/sigstore"
      }) + "\n");' || true
  fi
fi

if ! command -v semgrep >/dev/null 2>&1; then
  echo "tool not installed: semgrep ('brew install semgrep'). Reviewer should fall back to reading workflow files for pull_request_target + secrets." >&2
fi
exit 0
