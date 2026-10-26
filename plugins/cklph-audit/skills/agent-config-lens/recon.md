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

# Secrets anywhere in the layer (report redacted)
rg -n --hidden -g '**/*mcp*.json' -g '**/settings*.json' -g '*.md' -e 'sk-[A-Za-z0-9]{16,}' -e 'ghp_[A-Za-z0-9]{20,}' -e 'xox[bp]-' -e 'AKIA[0-9A-Z]{16}' -e 'BEGIN [A-Z ]*PRIVATE KEY'

# Agent runtimes (LLM / MCP SDK call sites that may act on untrusted content)
rg -l -t ts -t js -t py -e '@anthropic-ai/sdk' -e '@modelcontextprotocol/sdk' -e "from ['\"]ai['\"]" -e '\bopenai\b' -e 'anthropic'
```

Safe-control candidates worth recording: hooks that use `${CLAUDE_PLUGIN_ROOT}`; MCP selectors pinned to an exact version or digest; settings with a deny list for secret paths; runtime code that validates paths/URLs immediately before the side effect.
