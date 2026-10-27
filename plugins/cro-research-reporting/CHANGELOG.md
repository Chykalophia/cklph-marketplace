# Changelog

All notable changes to `cro-research-reporting` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.3.2] — 2026-10-27

### Fixed
- **Attribution:** the README said MIT-licensed repos were "adapted with attribution", but the
  plugin shipped no notice. Added `NOTICE.md` crediting coreyhaines31/marketingskills,
  wshobson/agents, stanford-oval/storm, langchain-ai/open_deep_research and Shopify/theme-tools,
  with the MIT license text, and listing the sources used only as influences.
- **Skill descriptions:** all six skills used "This skill should be used…" descriptions of 446–584
  characters. Each is now a "Use when…, before…" trigger under 300 characters, as STANDARD.md §5
  requires. The full trigger-phrase lists moved into each skill's body.
- **Version drift:** removed the per-skill `metadata.version` stamps (0.2.0/0.3.0) and the README's
  "Version 0.3.0" footer; `plugin.json` and this CHANGELOG own the version.
- Adapted from: coreyhaines31/marketingskills, wshobson/agents, stanford-oval/storm,
  langchain-ai/open_deep_research, Shopify/theme-tools (all MIT; notices in `NOTICE.md`).

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
