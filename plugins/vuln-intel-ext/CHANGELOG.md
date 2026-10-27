# Changelog

All notable changes to `vuln-intel-ext` are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## 1.0.3 — 2026-10-27

Theme: an error or an unparsed response was being reported as a clean result. Every such path
now returns an error, and no failure is cached or recorded as a negative result.

### Fixed
- **`diff_since` never reported NEW or WITHDRAWN advisories.** It read `published` and
  `withdrawn` from the OSV `querybatch` result, which carries only `id` and `modified`, so every
  hit landed in `modifiedVulnerabilities`. Dates now come from the full `/v1/vulns/<id>` records
  it already fetched.
- **`diff_since` reported a failed OSV lookup as clean.** The per-package `error` was set but
  never read, so a 4xx/5xx gave `newCount: 0` and saved a scan record that `feed_status` then
  showed as the last good scan. Now an HTTP error, a timeout (the batch fetch had none; 30s now),
  a body without a matching `results` array, or a failed advisory-record fetch returns an error
  listing `failedPackages` / `failedAdvisories`, and no scan is recorded. Paginated batch
  results (`next_page_token`) are followed instead of being silently truncated. Advisory
  records are fetched at most 10 at a time. `querySingle` (unused) also throws on failure.
- **`wp_scan` returned 0 vulnerabilities for every plugin and theme.** WPScan v3 keys the body
  by slug (`{"<slug>": {"vulnerabilities": [...]}}`); the code read a top-level
  `vulnerabilities`. It now reads the slug-keyed entry, and `cvss` (an object
  `{score, vector, severity}`) is reported as its numeric score.
- **`wp_scan` core lookups always 404'd, cached as clean.** The API wants the version with its
  dots removed (`/wordpresses/561` for 5.6.1), but the code requested `/wordpresses/<name>` and
  the docs said to pass `name: "wordpress"`. Core now requires `version`. A 404, an unexpected
  body or a missing token is an error and is never cached; requests time out after 15s. Cache
  entries written by earlier versions (possibly a cached 404) are ignored and refetched.
- **WPScan cache piled up rows for unversioned lookups.** The primary key includes the nullable
  `version`, and NULLs never collide, so `INSERT OR REPLACE` added a row each time and reads
  returned an arbitrary one. Writes now replace the row explicitly.
- **Severity.** GitHub's `MODERATE` rating was not recognised (now `MEDIUM`). The CVSS label was
  a substring-weighted approximation (`AC:H` matched as `C:H`); it is now the CVSS v3.0/3.1
  base score per the FIRST specification. Advisories with no usable rating (`UNKNOWN`, e.g.
  CVSS v4 only) are no longer dropped by the `severity` filter; they are kept and counted in
  `summary.unknownSeverityCount`.
- The MCP server reported version `1.0.0`; it now reads `.claude-plugin/plugin.json`.
- README said Node.js 18+, but the locked `better-sqlite3` supports Node 20.x and 22.x to 26.x.
  README and `package.json` `engines` now state exactly the range it declares,
  `20.x || 22.x || 23.x || 24.x || 25.x || 26.x`.
- Malformed OSV and WPScan responses are rejected at the parsing boundary instead of read as
  clean: a querybatch result that is not an object, a present `vulns` value that is not a list
  (an omitted or null `vulns` is a valid empty result), an advisory record with
  a missing/invalid `modified` or an invalid `published`/`withdrawn` date, a WPScan body without
  an entry for the requested slug/version, or a non-list `vulnerabilities` is an error. No scan
  is recorded (the dependency snapshot itself is still saved) and no WPScan error is cached. A CVSS 0.0 vector is `LOW` (not `UNKNOWN`), and withdrawn `UNKNOWN`
  advisories are counted in `unknownSeverityCount`.

### Added
- `npm test`: node:test suite (no new dependencies) that drives the registered tools with
  `fetch` mocked using recorded OSV and documented WPScan v3 response shapes.

## 1.0.2 — 2026-10-26

### Changed
- First-run install uses `npm ci --omit=dev` (exactly the committed lockfile, runtime
  dependencies only), with all npm output on stderr so it cannot corrupt the MCP channel.

## 1.0.1 — 2026-08-26

### Fixed
- `wp_scan` pointed at `api.wpscan.com`, a host with no A record, so every lookup failed with
  `ENOTFOUND`. It now uses `https://wpscan.com/api/v3`.

## 1.0.0 — 2026-07-23

Initial release: MCP server with `save_dependency_snapshot`, `diff_since`, `feed_status` and
`wp_scan`, backed by OSV.dev, WPScan and a local SQLite store.
