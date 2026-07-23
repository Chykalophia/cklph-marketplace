#!/usr/bin/env bash
# sca.sh — software-composition-analysis (dependency vulnerability) recall for the SCA lens.
# Wraps Trivy, Grype, Syft, OSV-Scanner. Emits JSON lines on stdout. Degrades gracefully —
# if a tool is missing it skips it; if ALL are missing it warns on stderr and the reviewer
# falls back to reasoning. Exits 0 ALWAYS.
# Usage: sca.sh <root> [ecosystem]
#   <ecosystem>: optional filter — npm|pip|gem|maven|composer|go|cargo|nuget
# Output schema per line: { tool, rule, severity, package, version, fixedVersion, cve, rationale }
set -uo pipefail
TARGET="${1:-.}"
ECO="${2:-}"
cd "$TARGET" 2>/dev/null || true

emit() { printf '%s\n' "$1"; }

# ── Trivy (vulns + SBOM) ─────────────────────────────────────────────────────
if command -v trivy >/dev/null 2>&1; then
  REPORT="$(mktemp).json"
  trivy fs --quiet --format json --scanners vuln "$TARGET" --output "$REPORT" >/dev/null 2>&1 || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const res of (r.Results || []))
        for (const v of (res.Vulnerabilities || []))
          process.stdout.write(JSON.stringify({
            tool: "trivy", rule: v.VulnerabilityID || "vuln",
            severity: (v.Severity||"medium").toLowerCase(),
            package: v.PkgName, version: v.InstalledVersion,
            fixedVersion: (v.FixedVersion||"").toString(),
            cve: v.VulnerabilityID || "", file: res.Target || "",
            rationale: "Vulnerable dependency — judge reachability (is the vulnerable function called?)"
          }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
fi

# ── Grype (vuln matching) ────────────────────────────────────────────────────
if command -v grype >/dev/null 2>&1; then
  REPORT="$(mktemp).json"
  grype dir:"$TARGET" -o json --quiet > "$REPORT" 2>/dev/null || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const m of (r.matches || []))
        process.stdout.write(JSON.stringify({
          tool: "grype", rule: m.vulnerability.id || "vuln",
          severity: (m.vulnerability.severity||"medium").toLowerCase(),
          package: m.artifact.name, version: m.artifact.version || "",
          fixedVersion: (m.vulnerability.fix&&m.vulnerability.fix.versions ? m.vulnerability.fix.versions.join(",") : ""),
          cve: m.vulnerability.id || "",
          rationale: "Grype match — verify the vulnerable code path is actually reachable"
        }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
fi

# ── OSV-Scanner (Google vuln DB) ─────────────────────────────────────────────
if command -v osv-scanner >/dev/null 2>&1; then
  REPORT="$(mktemp).json"
  osv-scanner scan --recursive --format json "$TARGET" > "$REPORT" 2>/dev/null || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const [pkg, entries] of Object.entries(r.results || {}))
        for (const e of (entries || []))
          process.stdout.write(JSON.stringify({
            tool: "osv-scanner", rule: e.id || "vuln",
            severity: (e.severity||"medium").toLowerCase(),
            package: pkg.split("@")[0] || pkg, version: pkg.split("@")[1] || "",
            fixedVersion: (e.fixed||"").toString(), cve: e.id || "",
            rationale: "OSV match — verify reachability of the vulnerable function"
          }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
fi

# ── Syft (SBOM generation — no vulns, but enumerates the dep surface) ─────────
if command -v syft >/dev/null 2>&1; then
  REPORT="$(mktemp).json"
  syft dir:"$TARGET" -o json --quiet > "$REPORT" 2>/dev/null || true
  if [ -s "$REPORT" ] && command -v node >/dev/null 2>&1; then
    node -e '
      let r = {}; try { r = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch {}
      for (const a of (r.artifacts || []))
        if (a.type && /lang|package/i.test(a.type))
          process.stdout.write(JSON.stringify({
            tool: "syft", rule: "sbom:dependency", severity: "low",
            package: a.name, version: a.version || "", fixedVersion: "", cve: "",
            rationale: "SBOM entry — review for abandoned/malicious/typosquat packages"
          }) + "\n");' "$REPORT"
  fi
  rm -f "$REPORT" 2>/dev/null || true
fi

# ── fallback warning ─────────────────────────────────────────────────────────
if ! command -v trivy >/dev/null 2>&1 && ! command -v grype >/dev/null 2>&1 && ! command -v osv-scanner >/dev/null 2>&1; then
  echo "tool not installed: trivy ('brew install trivy'), grype ('brew install grype'), or osv-scanner ('brew install osv-scanner'). Reviewer should fall back to reasoning over lockfile/manifest deps." >&2
fi
exit 0
