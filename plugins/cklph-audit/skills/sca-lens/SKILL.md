---
name: sca-lens
description: The software-composition-analysis lens — known CVEs in direct + transitive dependencies, abandoned/malicious packages, license risk, SBOM generation. Wraps Trivy/Grype/Syft/OSV-Scanner for recall; the reviewer judges reachability. Optionally enriches with cve-mcp and vuln-intel-ext MCP tools when available. Loaded by audit-reviewer when auditing a unit through the SCA lens.
---

# sca-lens — dependency vulnerability judgment over a recall tool

You are the **judgment layer** of a three-layer pipeline. Do not hunt by reading lockfiles alone, and do not present guesses as facts. The pipeline is:

1. **Deterministic tool → recall.** Run the lens tool first; it enumerates vulnerable packages exhaustively. You reason over its output instead of trying to find every dep by eye.
2. **You (reviewer LLM) → judgment.** Decide which CVEs are real risks here (is the vulnerable function actually called?), the upgrade path, transitive depth, and whether a dep is abandoned/malicious.
3. **Verifier → precision.** A separate `audit-verifier` then tries to **refute** every finding you emit (default-to-refuted). Recall comes from the tool, never from the verifier.

This lens is **gated by the fixture precision/recall test** (`fixtures/sca/should-flag` for recall, `should-not-flag` for precision; suggested recall ≥ 0.8, precision ≥ 0.7 after verify). It does not ship degraded.

## TOOL

- **Run `${CLAUDE_PLUGIN_ROOT}/tools/sca.sh`** on the unit's globs (or the repo root for a dep-wide pass). This is your recall pass — it wraps Trivy, Grype, Syft, and OSV-Scanner and emits JSON lines: `{ tool, rule, severity, package, version, fixedVersion, cve, rationale }`.
- The tool is near-exhaustive for known CVEs; your job is **reachability judgment** — is the vulnerable function actually called in this codebase? A CVE in a dep that's never imported is low; the same CVE in a hot-path import is critical.
- For **abandoned/malicious/typosquat** detection: review the Syft SBOM output for packages with no recent updates, suspicious names (typosquats of popular packages), or packages from unverified publishers.

## MCP VULNERABILITY INTELLIGENCE ENRICHMENT (optional — auto-detect)

If the **cve-mcp** and/or **vuln-intel-ext** MCP servers are configured and available, USE THEM to enrich your SCA findings beyond what the local CLI tools provide. This is a pure enhancement layer — if the MCP tools are NOT available, proceed normally with just the local tools. Never fail or block because MCP tools are missing.

### Detection

Attempt to call one of the tools below. If it succeeds, MCP enrichment is available. If it errors or the tool is not found, skip the entire MCP enrichment section and proceed with local-tool-only results.

### Step 1 — Save dependency snapshot (vuln-intel-ext)

If `save_dependency_snapshot` is available, call it with the full dependency list from the Syft SBOM / lockfile. This registers your deps so `diff_since` can track deltas on future audits.

```
save_dependency_snapshot({ packages: [{ name, version, ecosystem }, ...], label: "audit-<date>" })
```

### Step 2 — Delta scan (vuln-intel-ext)

If `diff_since` is available, call it to find CVEs that are NEW or MODIFIED since the last audit. Use the last audit timestamp (from baseline or `feed_status`). This catches vulnerabilities that the local tool DBs may not have yet.

```
diff_since({ since: "<last-audit-ISO-timestamp>", packages: [...] })
```

- `newVulnerabilities` → these are CVEs published since the last scan — add them to your candidate list.
- `modifiedVulnerabilities` → severity may have changed — re-evaluate.
- `withdrawnAdvisories` → if a finding you were going to report has been withdrawn, drop it and note the withdrawal.

### Step 3 — Deep enrichment (cve-mcp)

For each confirmed CVE candidate from either the local tools OR `diff_since`, call cve-mcp tools for **exploitability intelligence** that local scanners don't provide:

- **`cve_enrich({ cveId })`** — parallel enrichment from 8 sources: NVD (CVSS, CWE, CPE), EPSS (exploitation probability), CISA KEV (exploited-in-the-wild), Nuclei (detection template exists?), Metasploit (exploit module exists?), AttackerKB (community exploitability assessment).
- **`cve_prioritize({ cves: [...] })`** — risk-score ranking: `CVSS × EPSS × KEV-multiplier × Exploit-multiplier`. Use this to SEVERITY-CALIBRATE your findings — a CVE in CISA KEV with a Metasploit module and EPSS > 80% should be CRITICAL regardless of CVSS alone.
- **`osv_query({ package, version, ecosystem })`** — if you need to confirm the affected version range or find the fixed version (more reliable than local tool data for transitive deps).
- **`exploit_search({ cveId })`** — check if public PoC exploit code exists on GitHub.

### Step 4 — WordPress (vuln-intel-ext, optional)

If the project contains WordPress (core, plugins, or themes) and `wp_scan` is available:

```
wp_scan({ type: "plugin", name: "elementor", version: "3.15.0" })
```

WordPress is the one ecosystem OSV doesn't cover. This is the only way to get WP vuln data into the audit.

### How MCP enrichment changes your findings

| MCP data | Effect on your SCA finding |
|---|---|
| CISA KEV listed | Severity → CRITICAL (actively exploited in the wild) |
| EPSS > 70% | Bump severity one level (high exploitation probability) |
| Metasploit module exists | Add `confidence: confirmed` + note "weaponized" |
| Nuclei template exists | Add note "detection template available" |
| diff_since new vuln | Add to candidates even if local tool DB missed it |
| Advisory withdrawn | Drop the finding, note "withdrawn per OSV" |
| cve_prioritize rank #1 | Flag as top remediation priority in the finding |

**Do NOT downgrade or skip local-tool findings** — MCP enrichment is additive. A CVE not in KEV can still be critical based on reachability.

## Checklist (the judgment layer)

Judge each candidate against these. Map every finding to a **CWE** and/or **CVE** id.

- **Known CVEs (direct deps)** — is the vulnerable version pinned? Is the vulnerable function/method called in the codebase? Is there a fixed version available? (CWE-* per CVE, `sca:direct-cve`.)
- **Known CVEs (transitive deps)** — trace the transitive chain; is the vulnerable transitive dep actually loaded? Can it be deduped/overridden? (`sca:transitive`.)
- **Abandoned packages** — no commits/releases in 12+ months, no maintainer response to issues. Risk = unpatched vulns accumulate. (`sca:abandoned`.)
- **Malicious/typosquat** — package name that closely resembles a popular package but is from a different publisher. (`sca:malicious-pkg`.)
- **License risk** — GPL/AGPL in a commercial project, or incompatible licenses. (`sca:license`. LOW severity unless it blocks a release.)
- **Reachability** — the most important judgment: a CVE in `lodash@4.17.20` where `merge` is called is critical; the same CVE where only `deburr` is called (not the vulnerable function) is low. Trace the actual imports and usage.

## Compose with the repo's own rules

Before judging, **load the repo's dependency rules**: `CLAUDE.md` / `AGENTS.md` for pinned-version policies, allowed licenses, or package allowlists. These encode project-specific musts.

- **On conflict, prefer the repo's rule** over the generic lens.
- Treat **documented/accepted exceptions** (in the baseline or repo learnings) as **non-findings**.
- When you flag something the repo's own rule already names, cite that rule id alongside the CVE.
- **Rulebook compliance:** return a ruleCheck for **every** rule handed (`violation` | `verified-safe` | `not-applicable`); `verified-safe`/`not-applicable` need a one-line citation/reason.
