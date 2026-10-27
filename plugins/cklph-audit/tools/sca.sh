#!/usr/bin/env bash
# sca.sh — software-composition-analysis (dependency vulnerability) recall for the SCA lens.
# Wraps Trivy, Grype, Syft, OSV-Scanner. Emits JSON lines on stdout. Degrades gracefully —
# if a tool is missing it skips it; if ALL are missing it warns on stderr and the reviewer
# falls back to reasoning. Exits 0 ALWAYS.
# A scanner that fails, or whose output cannot be parsed, is reported on stderr: zero findings
# on stdout then means "did not scan", never "clean".
# Usage: sca.sh <root> [ecosystem]
#   <ecosystem>: reserved (npm|pip|gem|maven|composer|go|cargo|nuget) — accepted but NOT applied
#                yet; every ecosystem found under <root> is scanned
# Output schema per line: { tool, rule, severity, package, version, fixedVersion, cve, rationale }
set -uo pipefail
ARG="${1:-.}"
ECO="${2:-}"
# Resolve the target ONCE to an absolute path, so a relative root is not re-resolved after cd.
if ! TARGET="$(cd "$ARG" 2>/dev/null && pwd)"; then
  echo "sca.sh: target not found: $ARG — nothing scanned." >&2
  exit 0
fi
cd "$TARGET" || exit 0

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cklph-sca.XXXXXX")" || { echo "sca.sh: mktemp failed — nothing scanned." >&2; exit 0; }
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# no_output <tool> <exit-code> <stderr-file>: a scanner wrote nothing — say so, never imply clean.
no_output() {
  echo "sca.sh: $1 failed (exit $2, no output): $(head -c 300 "$3") — zero $1 findings means the scan did not run, not that the dependencies are clean." >&2
}

# ── Trivy (vulns + SBOM) ─────────────────────────────────────────────────────
if command -v trivy >/dev/null 2>&1; then
  REPORT="$WORK/trivy.json"
  trivy fs --quiet --format json --scanners vuln "$TARGET" --output "$REPORT" >/dev/null 2> "$WORK/trivy.err"
  RC=$?
  if [ ! -s "$REPORT" ]; then no_output trivy "$RC" "$WORK/trivy.err"
  elif command -v node >/dev/null 2>&1; then
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("sca.sh: trivy output is not valid JSON (" + e.message + ") — trivy findings NOT collected.\n"); process.exit(0); }
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
fi

# ── Grype (vuln matching) ────────────────────────────────────────────────────
if command -v grype >/dev/null 2>&1; then
  REPORT="$WORK/grype.json"
  grype dir:"$TARGET" -o json --quiet > "$REPORT" 2> "$WORK/grype.err"
  RC=$?
  if [ ! -s "$REPORT" ]; then no_output grype "$RC" "$WORK/grype.err"
  elif command -v node >/dev/null 2>&1; then
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("sca.sh: grype output is not valid JSON (" + e.message + ") — grype findings NOT collected.\n"); process.exit(0); }
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
fi

# ── OSV-Scanner (Google vuln DB) ─────────────────────────────────────────────
# JSON shape: { results: [ { source: { path, type }, packages: [ { package: { name, version,
# ecosystem }, vulnerabilities: [ OSV entries ], groups: [ { ids, max_severity } ] } ] } ] }.
# Exit codes: 0 no vulns, 1 vulns found, 128 no package sources found, other = error.
# The top-level form (no `scan` subcommand) is accepted by both v1 and v2.
if command -v osv-scanner >/dev/null 2>&1; then
  REPORT="$WORK/osv.json"
  osv-scanner --format json --recursive "$TARGET" > "$REPORT" 2> "$WORK/osv.err"
  RC=$?
  if [ "$RC" -eq 128 ]; then
    echo "sca.sh: osv-scanner found no lockfile/manifest it can read under $TARGET — no OSV findings, nothing was scanned." >&2
  elif [ "$RC" -gt 1 ] || [ ! -s "$REPORT" ]; then no_output osv-scanner "$RC" "$WORK/osv.err"
  elif command -v node >/dev/null 2>&1; then
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("sca.sh: osv-scanner output is not valid JSON (" + e.message + ") — osv-scanner findings NOT collected.\n"); process.exit(0); }
      if (!Array.isArray(r.results)) { process.stderr.write("sca.sh: osv-scanner output has no results array (unexpected shape) — osv-scanner findings NOT collected.\n"); process.exit(0); }
      const cvss = (s) => { const n = parseFloat(s); if (isNaN(n)) return ""; return n >= 9 ? "critical" : n >= 7 ? "high" : n >= 4 ? "medium" : "low"; };
      const word = (s) => { s = String(s || "").toLowerCase(); return s === "moderate" ? "medium" : (["critical", "high", "medium", "low"].includes(s) ? s : ""); };
      for (const src of r.results)
        for (const p of (src.packages || [])) {
          const pkg = p.package || {};
          const groupSev = new Map();
          for (const g of (p.groups || [])) for (const id of (g.ids || [])) groupSev.set(id, g.max_severity);
          for (const v of (p.vulnerabilities || [])) {
            const fixed = [];
            for (const a of (v.affected || [])) {
              if (a.package && pkg.name && a.package.name !== pkg.name) continue;
              for (const rg of (a.ranges || [])) for (const ev of (rg.events || [])) if (ev.fixed) fixed.push(ev.fixed);
            }
            const cve = [v.id, ...(v.aliases || [])].find(x => /^CVE-/.test(x || "")) || v.id || "";
            process.stdout.write(JSON.stringify({
              tool: "osv-scanner", rule: v.id || "vuln",
              severity: cvss(groupSev.get(v.id)) || word(v.database_specific && v.database_specific.severity) || "medium",
              package: pkg.name || "", version: pkg.version || "",
              fixedVersion: [...new Set(fixed)].join(","), cve,
              file: (src.source && src.source.path) || "",
              rationale: "OSV match — verify reachability of the vulnerable function"
            }) + "\n");
          }
        }' "$REPORT"
  fi
fi

# ── Syft (SBOM generation — no vulns, but enumerates the dep surface) ─────────
if command -v syft >/dev/null 2>&1; then
  REPORT="$WORK/syft.json"
  syft dir:"$TARGET" -o json --quiet > "$REPORT" 2> "$WORK/syft.err"
  RC=$?
  if [ ! -s "$REPORT" ]; then no_output syft "$RC" "$WORK/syft.err"
  elif command -v node >/dev/null 2>&1; then
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("sca.sh: syft output is not valid JSON (" + e.message + ") — SBOM entries NOT collected.\n"); process.exit(0); }
      for (const a of (r.artifacts || []))
        if (a.type && /lang|package/i.test(a.type))
          process.stdout.write(JSON.stringify({
            tool: "syft", rule: "sbom:dependency", severity: "low",
            package: a.name, version: a.version || "", fixedVersion: "", cve: "",
            rationale: "SBOM entry — review for abandoned/malicious/typosquat packages"
          }) + "\n");' "$REPORT"
  fi
fi

# ── fallback warning ─────────────────────────────────────────────────────────
if ! command -v trivy >/dev/null 2>&1 && ! command -v grype >/dev/null 2>&1 && ! command -v osv-scanner >/dev/null 2>&1; then
  echo "tool not installed: trivy ('brew install trivy'), grype ('brew install grype'), or osv-scanner ('brew install osv-scanner'). Reviewer should fall back to reasoning over lockfile/manifest deps." >&2
fi
: "$ECO"   # reserved: the ecosystem filter is not applied yet — every ecosystem is scanned
exit 0
