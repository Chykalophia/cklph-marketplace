# agent-config-lens — trigger tests

Run with the cklph-os authoring runner (`run-trigger-tests.sh <plugin-dir> cklph-audit:agent-config-lens <this file>`). Near-misses belong to sibling cklph-audit lenses.

- fire: Review the .mcp.json in this repo, are any of the MCP servers pulling unpinned packages like npx -y something@latest?
- fire: Audit our .claude/settings.json and hooks for risky permissions like bypassPermissions or hooks that curl and run remote scripts.
- fire: Check our CLAUDE.md, AGENTS.md and skills folder for prompt-injection-shaped instructions or hardcoded secrets before I approve this agent config PR.
- miss: Audit my Supabase RLS policies and API routes for authorization gaps.
- miss: Are any of our GitHub Actions workflows using pull_request_target with secrets or unpinned third-party actions?
