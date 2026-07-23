# /cklph-audit:refresh-feeds

Update all vulnerability databases and check tool versions before an audit.

```bash
/cklph-audit:refresh-feeds
```

Runs `feed-status.sh` to check the current state, then updates:
- `trivy db update`
- `grype db update`
- `semgrep --update`
- `osv-scanner --update`

Also checks NVD/GHSA/OSV.dev for recent disclosures and logs feed freshness. The audit engine warns in the report appendix if CVE databases are stale (older than `feedRefresh.maxAgeHours`, default 24h).

Run this before a major audit or on a schedule (e.g. weekly) to keep vulnerability data current.
