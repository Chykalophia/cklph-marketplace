---
name: feed-refresh
description: Periodic vulnerability-feed refresh skill. Updates tool databases (Trivy, Grype, Semgrep, OSV-Scanner), pulls fresh CVE feeds (NVD, GHSA, OSV.dev), checks for new tool releases, and logs feed freshness status. The audit engine checks feed age at run start and warns if stale. Run manually via /cklph-audit:refresh-feeds or automatically before an audit.
---

# feed-refresh — keep vulnerability data current

A security audit is only as good as its vulnerability data. Stale CVE databases = missed vulnerabilities. This skill:

1. **Updates tool databases:** `trivy db update`, `grype db update`, `semgrep --update`, `osv-scanner --update`.
2. **Pulls fresh CVE feeds:** checks NVD, GitHub Security Advisories, OSV.dev for recent disclosures.
3. **Checks for new tool releases:** compares installed versions of semgrep, trivy, grype, checkov, kubescape, kics, hadolint against latest available.
4. **Logs feed freshness:** when each DB was last updated, how many new CVEs since last check, which tools are out of date.

## How to run

```bash
/cklph-audit:refresh-feeds
```

Or the audit engine runs this automatically at the start of an audit if `feedRefresh.autoRefresh: true` (default) and the feeds are older than `feedRefresh.maxAgeHours` (default 24).

## Tool

Run `${CLAUDE_PLUGIN_ROOT}/tools/feed-status.sh` to check the current state of all tool DBs and versions. It emits JSON lines: `{ tool, dbAge, lastUpdated, upToDate, currentVersion, latestVersion }`.

## MCP FEED STATUS (optional — auto-detect)

If the **vuln-intel-ext** MCP server is configured and available, call its `feed_status` tool IN ADDITION to the local `feed-status.sh`. This gives you live API reachability data (OSV ping latency) and last-scan history that the local bash tool can't provide.

```
feed_status()
```

Returns: `{ lastScan: { timestamp, since, newCount, ... } | null, sources: [{ source: "osv", reachable, latencyMs }], warnings: [...] }`

**If `feed_status` is not available** (MCP server not configured), proceed with `feed-status.sh` only — the local tool covers tool-DB age and version checks.

## MCP DELTA SCAN (optional — auto-detect)

If **vuln-intel-ext** is available, after refreshing local tool DBs, also run a `diff_since` to catch any CVEs published between the local DB's last update and now:

```
diff_since({ since: "<last-feed-refresh-timestamp>", packages: [...] })
```

This closes the gap between "local DB was updated 2 hours ago" and "a CVE was published 30 minutes ago." If new vulns are found, log them so the next audit run picks them up.

## Output (FEED_STATUS_SCHEMA)

```json
{
  "lastUpdated": "2026-07-23T10:00:00Z",
  "newCveCount": 142,
  "toolVersions": [
    { "tool": "trivy", "dbAge": 2, "upToDate": true, "currentVersion": "0.50.0", "latestVersion": "" },
    { "tool": "grype", "dbAge": 5, "upToDate": true, "currentVersion": "0.70.0", "latestVersion": "" }
  ],
  "warnings": ["semgrep is 2 versions behind latest — consider updating"]
}
```

## Integration with the audit engine

The audit engine calls `feed-status.sh` at run start. If any critical tool's DB is older than `feedRefresh.maxAgeHours`:
- The report appendix warns: "Security findings are based on a vulnerability database N hours old — re-run `/cklph-audit:refresh-feeds` for current data."
- SCA findings from a stale DB are labeled `confidence: likely` (not `confirmed`) since new CVEs may have been published since the DB was last updated.

## Periodic research note

Beyond automated feed updates, the skill includes a standing instruction: **periodically (monthly or before major audits) research new vulnerability classes, emerging exploit techniques, and new CVE patterns that may not yet be covered by existing tool rulesets.** Check:
- NVD's "Recently Published CVEs" feed.
- GitHub Security Advisories.
- The semgrep registry for new rulesets.
- OWASP's latest Top 10 / API Top 10 updates.
- CISA's Known Exploited Vulnerabilities catalog.

If new vulnerability classes are discovered that existing lenses don't cover, flag them for lens extension (e.g. "new SSRF variant via redirect chains — consider adding a semgrep rule to sast.sh").
