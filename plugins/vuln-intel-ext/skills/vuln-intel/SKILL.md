---
name: vuln-intel
description: Use this skill when the user asks to check for new vulnerabilities in their dependencies, scan WordPress for vulns, check vulnerability feed freshness, or do a "what changed since my last scan" diff. Provides 4 MCP tools — diff_since, save_dependency_snapshot, feed_status, wp_scan — powered by OSV.dev and WPScan. Pairs with cve-mcp for full CVE/EPSS/KEV/GHSA lookup.
---

# vuln-intel — Vulnerability Diff & WordPress Scan

This skill provides 4 MCP tools for tracking vulnerability changes in your dependencies over time. It is a **sidecar** to `cve-mcp` — use cve-mcp for one-off CVE lookups, EPSS scoring, KEV checks, and exploit search. Use **these tools** when you need to answer "what's NEW for MY deps since MY last scan?"

## Tools

### 1. `save_dependency_snapshot`

Save a named dependency list so `diff_since` can reuse it without re-passing all packages.

**When to use:** Before a recurring audit cycle. Save once from a lockfile, then call `diff_since` on a schedule.

**Input:**
- `packages` (required): Array of `{ name, version, ecosystem? }`. Ecosystem examples: `npm`, `PyPI`, `Go`, `crates.io`, `RubyGems`, `Maven`, `NuGet`, `Packagist`.
- `label` (optional): A name like `"production"` or `"staging"`.

**Example:**
```
save_dependency_snapshot({
  packages: [
    { name: "express", version: "4.17.0", ecosystem: "npm" },
    { name: "requests", version: "2.31.0", ecosystem: "PyPI" },
    { name: "lodash", version: "4.17.21", ecosystem: "npm" }
  ],
  label: "production"
})
```

### 2. `diff_since` (the key tool)

Find vulnerabilities that are **NEW**, **MODIFIED**, or **WITHDRAWN** for your dependencies since a given timestamp.

**When to use:** After a previous audit. Pass the timestamp of your last scan and get only the delta — no re-reporting of old findings.

**Input:**
- `since` (required): ISO 8601 timestamp (e.g. `"2025-01-01T00:00:00Z"`).
- `packages` (optional): Same format as `save_dependency_snapshot`. If omitted, uses the last saved snapshot.
- `severity` (optional): Minimum severity filter — `"low"`, `"medium"`, `"high"`, or `"critical"`.

**Output:**
- `newVulnerabilities`: Advisories published AFTER the `since` timestamp.
- `modifiedVulnerabilities`: Advisories that existed before but were updated (severity changed, new affected versions, etc.).
- `withdrawnAdvisories`: Advisory IDs that were retracted after the `since` timestamp.
- `summary`: Counts + `worstSeverity`.

**Example:**
```
diff_since({
  since: "2025-01-01T00:00:00Z",
  severity: "medium"
})
```

**How it works:** Queries OSV.dev batch API for all packages, enriches each result with full vulnerability records (summary, CVE aliases, severity), filters by `published`/`modified`/`withdrawn` dates vs your `since` timestamp. Results are saved to local SQLite for scan history.

### 3. `feed_status`

Check if the OSV API is reachable and when your last scan ran.

**When to use:** Before starting an audit. If OSV is unreachable or the last scan is stale (>30 days), warn the user.

**Output:**
- `lastScan`: Timestamp, counts, worst severity of your most recent `diff_since` call.
- `sources`: OSV reachability + latency.
- `warnings`: Staleness warnings.

### 4. `wp_scan`

Look up WordPress core, plugin, or theme vulnerabilities via the WPScan API.

**When to use:** When auditing a WordPress site. Check core version, installed plugins, and themes against the WPScan vulnerability database.

**Input:**
- `type` (required): `"core"`, `"plugin"`, or `"theme"`.
- `name` (required): E.g. `"wordpress"`, `"elementor"`, `"twentytwentyfour"`.
- `version` (optional): E.g. `"6.4.2"`.

**Requires:** `WPSCAN_TOKEN` environment variable. Get one at https://wpscan.com/api/. Without it, the tool returns an error pointing the user to get a token.

**Caching:** Results are cached in SQLite for 24 hours.

## Workflow

1. **First time:** Call `save_dependency_snapshot` with your full dependency list.
2. **Baseline scan:** Call `diff_since` with a timestamp far enough back to catch everything (e.g. `"2020-01-01T00:00:00Z"`). This establishes your initial vulnerability picture.
3. **On schedule (weekly/monthly):** Call `feed_status` to check freshness, then `diff_since` with the timestamp of your last scan. Only new/modified/withdrawn advisories come back.
4. **For WordPress sites:** Call `wp_scan` for each plugin, theme, and the core version.
5. **For detailed CVE info:** Use `cve-mcp` tools (`nvd_get`, `epss_score`, `kev_check`) to enrich any CVE IDs found by `diff_since`.

## Relationship to cve-mcp

| Need | Use |
|---|---|
| "What new CVEs hit my deps since my last scan?" | `diff_since` (this plugin) |
| "Give me full details on CVE-2024-29041" | `nvd_get` (cve-mcp) |
| "Is CVE-2024-29041 being exploited in the wild?" | `kev_check` (cve-mcp) |
| "What's the EPSS score for this CVE?" | `epss_score` (cve-mcp) |
| "Are there public exploits for this CVE?" | `exploit_search` (cve-mcp) |
| "Is my WordPress plugin vulnerable?" | `wp_scan` (this plugin) |
| "Is the vulnerability data fresh?" | `feed_status` (this plugin) |

## Data Sources

- **OSV.dev** — 30+ ecosystems (npm, PyPI, Go, Rust, RubyGems, Maven, NuGet, Packagist, Debian, Alpine, Ubuntu, and more). No API key. No rate limits. Powers `diff_since` and `save_dependency_snapshot`.
- **WPScan** — WordPress vulnerability database. Requires API token. Powers `wp_scan`.

## Storage

SQLite database at `~/.vuln-intel-ext/snapshot.db` (override with `VULN_INTEL_DB_PATH` env var). Stores:
- Dependency snapshots (named lists for reuse)
- Scan history (timestamped results of each `diff_since` call)
- WPScan cache (24-hour TTL)
