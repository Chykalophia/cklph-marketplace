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
