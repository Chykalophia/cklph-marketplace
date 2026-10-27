---
name: feed-refresh
description: Periodic vulnerability-feed refresh skill. Updates local tool databases (Trivy, Grype), optionally checks for CVEs newer than those databases through the vuln-intel-ext MCP server (OSV), checks for new tool releases, and logs feed freshness status. The audit engine does NOT check feed age, so run this via /cklph-audit:refresh-feeds before an SCA or container audit.
---

# feed-refresh — keep vulnerability data current

A security audit is only as good as its vulnerability data. Stale CVE databases = missed vulnerabilities. This skill:

1. **Updates tool databases** (only those installed): `grype db update`; `trivy image --download-db-only` (check the tool's `--help` if either flag is rejected). Semgrep has no local DB to update (it fetches registry rules on every run), and OSV-Scanner queries the OSV API live by default, so neither needs an update step.
2. **Checks for newer CVEs (optional):** only when the `vuln-intel-ext` MCP server is available, its `diff_since` / `feed_status` tools query OSV for disclosures newer than the local databases (see the MCP sections below). Nothing here pulls NVD or GHSA feeds directly; without the MCP server this step is skipped, so say so.
3. **Checks for new tool releases:** compares installed versions of semgrep, trivy, grype, checkov, kubescape, kics, hadolint against latest available.
4. **Logs feed freshness:** when each DB was last updated, how many new CVEs since last check, which tools are out of date.

## How to run

```bash
/cklph-audit:refresh-feeds
```

The user runs this; nothing runs it automatically. The `feedRefresh` block in `audit.config.yaml` is not read by the audit engine yet.

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

There is none yet. The audit engine never calls `feed-status.sh` and does not read `feedRefresh.*`; every synthesized report says in its appendix that feed freshness was not checked (the engine's raw fallback report, written only when the synthesizer dies, has no appendix) (`RUN_META.feedFreshnessChecked: false`) and points here. Run this skill before an SCA or container audit, and treat findings from a DB older than you are comfortable with as possibly incomplete.

## Periodic research note

Beyond automated feed updates, the skill includes a standing instruction: **periodically (monthly or before major audits) research new vulnerability classes, emerging exploit techniques, and new CVE patterns that may not yet be covered by existing tool rulesets.** Check:
- NVD's "Recently Published CVEs" feed.
- GitHub Security Advisories.
- The semgrep registry for new rulesets.
- OWASP's latest Top 10 / API Top 10 updates.
- CISA's Known Exploited Vulnerabilities catalog.

If new vulnerability classes are discovered that existing lenses don't cover, flag them for lens extension (e.g. "new SSRF variant via redirect chains — consider adding a semgrep rule to sast.sh").
