# vuln-intel-ext

Sidecar MCP server extending [cve-mcp](https://github.com/badchars/cve-mcp) with diff-since-last-scan, dependency snapshots, feed status, and WordPress vulnerability lookup.

## Tools

| Tool | Description |
|---|---|
| `save_dependency_snapshot` | Save a named dependency list so `diff_since` can track what's new for your specific dependencies. |
| `diff_since` | Query OSV.dev for all your dependencies and return only what's NEW, MODIFIED, or WITHDRAWN since a given timestamp. A failed OSV lookup is returned as an error, never as a clean result. |
| `feed_status` | Check OSV API reachability and last scan freshness. |
| `wp_scan` | WordPress core/plugin/theme vulnerability lookup via WPScan API (successful results cached 24h). Core takes the WordPress `version`; plugins and themes take the slug as `name`. Requires `WPSCAN_TOKEN`. |

## Setup

On first use, the wrapper script (`scripts/start.sh`) automatically runs `npm ci --omit=dev` (exactly the committed lockfile, runtime dependencies only) to fetch the native `better-sqlite3` dependency. This requires Node.js `20.x || 22.x || 23.x || 24.x || 25.x || 26.x` (exactly the range the locked `better-sqlite3` declares; Node 21 and 27+ are not supported) and a C compiler (present by default on macOS/Linux).

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `WPSCAN_TOKEN` | No | WPScan API token for WordPress lookups. Get one at [wpscan.com/api](https://wpscan.com/api/). |
| `VULN_INTEL_DB_PATH` | No | Custom SQLite path. Defaults to `~/.vuln-intel-ext/snapshot.db`. |

## Development

```bash
npm ci
npm test   # tsc, then node:test against dist/ with fetch mocked
```

`dist/` is committed (the plugin runs it without a build step), so rebuild and commit it with any `src/` change.

## Relationship to cve-mcp

Run both plugins together. Use `cve-mcp` for CVE details, EPSS scores, KEV checks, exploit search. Use `vuln-intel-ext` for "what changed since my last scan" diffs and WordPress lookups.

## Data Sources

- **[OSV.dev](https://osv.dev)** — 30+ ecosystems, no API key, no rate limits. Powers `diff_since`.
- **[WPScan](https://wpscan.com)** — WordPress vulnerability database. Powers `wp_scan`.

## License

MIT
