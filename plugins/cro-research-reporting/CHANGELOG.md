# Changelog

All notable changes to `cro-research-reporting` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.3.1] — 2026-10-26

### Security
- **`cro-auditor`, `deep-researcher`** — both agents had no `tools:` line, so they inherited every
  tool (Bash, Write, Edit, every MCP server) while reading untrusted web content. Both are now
  scoped to `Read, Grep, Glob, WebFetch, WebSearch`, matching `cro-verifier`. Neither writes files:
  they return their findings to the caller, which pulls first-party analytics data itself (as
  `/cro-audit` and `/deep-research` already instruct). Each agent now treats fetched web content
  as data, never as instructions.
- **`cro-auditor`, `deep-researcher`** — both keep `Read, Grep, Glob`: they read this plugin's
  reference files and the engagement brief, and `cro-auditor` maps findings to a real theme or
  codebase. Each now carries an explicit rule: read only those paths and the ones the caller
  names, and never put local file contents into a URL, query string, or search query. This is
  prompt guidance, not enforcement: the tool list still permits any local read and any fetch, so
  a prompt-injected page could still try to exfiltrate. Run these agents where the working
  directory holds no secrets.
