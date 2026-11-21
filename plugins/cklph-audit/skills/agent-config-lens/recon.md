# agent-config-lens — recon enumerations (recall)

Re-runnable, read-only. Run from the repo root; each command is a **denominator** (record it verbatim with its count) and its hits are **seeds**, not findings. `rg` honors `.gitignore`; `--hidden` is needed for dot-dirs. Add `-g '!**/fixtures/**'` when the repo ships labeled fixtures.

```bash
# Surface inventory
rg --files --hidden -g '**/.mcp.json' -g '**/mcp.json' -g '**/*.mcp.json.example'
rg --files --hidden -g '**/.claude/settings*.json' -g '**/.claude-plugin/*.json'
rg --files --hidden -g '**/hooks/hooks.json' -g '**/hooks/*.sh'
rg --files --hidden -g '**/CLAUDE.md' -g '**/AGENTS.md' -g '**/SKILL.md' -g '**/agents/*.md'

# MCP selectors and transports
rg -n --hidden -g '**/*mcp*.json' -e '"command"' -e '"args"' -e '"url"' -e '"type"'
rg -n --hidden -g '**/*mcp*.json' -e '@latest' -e '@next' -e '@beta' -e '"-y"' -e '"--yes"'
rg -n --hidden -g '**/*mcp*.json' -e '"(bash|sh|cmd)"' -e '"-c"'

# Settings
rg -n --hidden -g '**/settings*.json' -e 'bypassPermissions' -e '"Bash\(\*\)"' -e '"Bash"' -e 'enableAllProjectMcpServers'
rg -n --hidden -e 'dangerously-skip-permissions'

# Hooks
rg -n --hidden -g '**/hooks/**' -e 'curl[^|]*\|\s*(ba)?sh' -e 'wget[^|]*\|\s*(ba)?sh' -e 'eval' -e 'npx ' -e 'sh -c'
rg -n --hidden -g '**/hooks.json' -e '"command"'
rg -n --hidden -g '**/hooks/**' -e '\|\| true' -e '2>/dev/null' -e 'exit 0'

# Instruction docs, skills, agents
rg -n --hidden -g '*.md' -i -e 'ignore (all |any )?(previous|prior|above) instructions' -e 'disregard (the )?(system|previous)'
rg -n --hidden -g '*.md' -P '[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{2066}-\x{2069}\x{E0000}-\x{E007F}]'
rg -n --hidden -g '*.md' -e '<!--' -e 'without asking' -e 'without confirmation' -e 'curl[^|]*\|\s*(ba)?sh'
rg -n --hidden -g '**/agents/*.md' -e '^tools:'

# Secrets anywhere in the layer: location only. -o -r prints file:line:[REDACTED], never the match
rg -n -o -r '[REDACTED]' --hidden -g '**/*mcp*.json' -g '**/settings*.json' -g '*.md' -e 'sk-[A-Za-z0-9]{16,}' -e 'ghp_[A-Za-z0-9]{20,}' -e 'xox[bp]-' -e 'AKIA[0-9A-Z]{16}' -e 'BEGIN [A-Z ]*PRIVATE KEY'

# Agent runtimes (LLM / MCP SDK call sites that may act on untrusted content)
rg -l -t ts -t js -t py -e '@anthropic-ai/sdk' -e '@modelcontextprotocol/sdk' -e "from ['\"]ai['\"]" -e '\bopenai\b' -e 'anthropic'

# AI agents inside CI
rg -n --hidden -g '.github/workflows/*.y*ml' -e 'anthropics/claude-code-action' -e 'openai/codex' -e 'codex exec' -e 'google-github-actions/run-gemini-cli' -e 'claude -p' -e 'gemini -p'
rg -n --hidden -g '.github/workflows/*.y*ml' -e 'github\.event\.(issue|pull_request|comment|review|discussion)\.' -e 'github\.head_ref' -e 'gh (issue|pr) (view|diff)'
rg -n --hidden -g '.github/workflows/*.y*ml' -e 'pull_request_target' -e 'issue_comment' -e 'workflow_run' -e 'head\.sha' -e 'refs/pull/' -e 'gh pr checkout'
rg -n --hidden -g '.github/workflows/*.y*ml' -e 'steps\.[A-Za-z0-9_-]+\.outputs\.' -e 'allowed_tools' -e 'allowedTools' -e 'claude_args' -e 'danger-full-access' -e '--yolo' -e 'write-all' -e ': write'
rg -n --hidden -g '.github/workflows/*.y*ml' -e 'allowed_non_write_users' -e 'allowed_bots' -e 'structured_output' -e 'execution_file'

# MCP tool definitions and repo-shipped servers
rg -n -t ts -t js -t py -e 'readOnlyHint' -e 'destructiveHint' -e 'idempotentHint' -e 'autoApprove' -e 'alwaysAllow'
rg -n --hidden -g '**/settings*.json' -e 'mcp__[A-Za-z0-9_-]+__\*' -e '"mcp__[A-Za-z0-9_-]+"'
rg -n -t ts -t js -t py -e '\.tool\(' -e 'registerTool' -e '@mcp\.tool' -e 'StreamableHTTPServerTransport' -e 'SSEServerTransport'
rg -n -t ts -t js -t py -e '0\.0\.0\.0' -e "'::'" -e 'allowedOrigins' -e 'allowedHosts' -e 'enableDnsRebindingProtection' -e '[Oo]rigin'
rg -n -i -t ts -t js -t py -e 'authorization' -e 'bearer'

# Skill and plugin content
rg -n --hidden -g '**/skills/**' -g '**/plugins/**' -g '**/agents/*.md' -i -e 'proceed without (asking|confirm)' -e 'never (ask|stop) (for|to) confirm' -e 'until it succeeds' -e 'always use this' -e 'for (anything|everything)' -e 'overrides? (all|any) other' -e 'official (anthropic|openai|google)'
rg -n --hidden -g '**/skills/**' -g '**/plugins/**' -i -e 'fetch[^\n]{0,40}(instructions|rules)' -e 'follow (the )?instructions (at|from)' -e 'print (the )?(token|secret|key|password)'
rg -n --hidden -g '**/skills/**' -g '**/plugins/**' -e '\.ssh/id_' -e '\.env\b' -e '~/\.aws' -e 'discord(app)?\.com/api/webhooks' -e 'api\.telegram\.org/bot' -e 'hooks\.slack\.com' -e 'pastebin\.com'
rg -n --hidden -g '**/skills/**' -g '**/plugins/**' -g '**/hooks/**' -e 'crontab' -e 'launchctl' -e 'LaunchAgents' -e 'systemctl' -e '\.github/workflows/' -e '\.git/hooks' -e '\.(bash|zsh)rc' -e '\.profile'
rg --files --hidden -g '**/skills/**/.*' -g '**/plugins/**/.*' -g '!**/.gitignore'
find . -path ./node_modules -prune -o \( -path '*/skills/*' -o -path '*/plugins/*' \) -type l -print

# Rules files and agent ignore files (names only; never read an ignored secret file)
rg --files --hidden -g '**/CODEOWNERS' -g '**/.claudeignore' -g '**/.cursorignore' -g '**/.aiexclude' -g '**/.cursor/rules/**' -g '**/copilot-instructions.md'
rg -n --hidden -g '**/CODEOWNERS' -e 'CLAUDE\.md' -e 'AGENTS\.md' -e '\.claude' -e '\.cursor' -e 'skills'
rg -n --hidden -g '**/settings*.json' -e '"(Edit|Write)\((\.claude|CLAUDE\.md|AGENTS\.md|[^)]*skills|[^)]*hooks)' -e '"deny"'
rg -n --hidden -g '**/.gitignore' -e '\.env' -e '\.pem' -e 'credentials' -e '\.key'
rg --files --hidden --no-ignore -g '.env*' -g '*.pem' -g '!**/node_modules/**'
```

Safe-control candidates worth recording: hooks that use `${CLAUDE_PLUGIN_ROOT}`; MCP selectors pinned to an exact version or digest; settings with a deny list for secret paths; runtime code that validates paths/URLs immediately before the side effect; CI agent jobs on trusted triggers with `permissions: read` and event data passed as data, not prompt text; HTTP MCP servers bound to localhost with an `Origin` allowlist; a `CODEOWNERS` entry for agent rules files.

The workflow and skill-dir recalls reach files outside the default agent-config review globs. Pass their hits as seeds so the reviewer still reads them. Never run a workflow, an agent CLI, or a skill script to confirm a hit.
