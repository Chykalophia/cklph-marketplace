# agent-config-lens — judgment checklist

Every finding gets a `agentcfg:<kind>` rule id, a `file:line` anchor, the quoted line (secrets redacted), and a context-first severity. Starting severities below are defaults; adjust for context and say why.

## 1. MCP configs

Where: `.mcp.json` (repo root and per plugin), `.github/mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.windsurf/mcp.json`, `.kiro/settings/mcp.json`, `*.mcp.json.example`, and `mcpServers` blocks inside other JSON. Plugin `.mcp.json` files ship to every installer, so weigh them higher than a local dev config.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:mcp-unpinned` | Package selector can resolve to different code later: bare name, `@scope/name`, `@latest`, any npm dist-tag (`@next`, `@beta`), Python package with no version, Docker image by tag or no tag and no `@sha256:` digest. Classify per @mcp-selectors.md. | medium; high if the server gets credentials or write/shell capability |
| `agentcfg:mcp-range` | Selector permits a range (`^1.2.0`, `~1.2`, `>=1.2,<2`, `==1.*`). | low |
| `agentcfg:mcp-review` | Local script, unknown binary, editable install, direct URL, VCS ref, shell wrapper, or an invocation you can't parse confidently. Record it; never guess. | info, `needs-owner-input` |
| `agentcfg:mcp-remote` | Remote server (`url`, `type: http`/`sse`): plain `http://` to a non-localhost host, a host that is not the vendor's documented endpoint, or a remote server granted credentials via headers. | medium |
| `agentcfg:mcp-secret` | Literal credential in `env`, `headers`, or `args` (token, key, password, bearer). `${VAR}` references are fine. | high (critical if a live-looking key) |
| `agentcfg:mcp-shell` | Server command is a shell (`bash -c`, `sh -c`, `cmd /c`) or composes a command string, so the config is arbitrary code. | high |

`-y` / `--yes` on `npx` is context only (it suppresses a prompt). It makes an unpinned selector worse, not a finding by itself. Recommend pinning **the version the team actually reviewed**; never "fix" by pinning whatever the registry serves today, and say so when the reviewed version is unknown.

## 2. Agent settings

Where: `.claude/settings.json`, `.claude/settings.local.json` (if committed), plugin `settings.json`, equivalent agent permission files.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:perm-bypass` | `"defaultMode": "bypassPermissions"`, `--dangerously-skip-permissions` in a committed script or doc, or any setting that disables the permission gate repo-wide. | high |
| `agentcfg:perm-broad` | `Bash(*)`, bare `Bash`, `Write(**)`/`Edit(**)` with no path scope, unrestricted `WebFetch` alongside write tools. | high for `Bash(*)`, medium otherwise |
| `agentcfg:perm-no-deny` | A broad allow list with no deny for secret paths (`.env*`, `**/*.pem`, `~/.ssh/**`). | medium |
| `agentcfg:mcp-autotrust` | `enableAllProjectMcpServers: true` (every repo-shipped MCP server auto-approved). | medium |

Narrow, prefix-scoped allows (`Bash(npm test:*)`, `Bash(git status:*)`) are the intended pattern, not findings.

## 3. Hooks

Where: `hooks/hooks.json`, `.claude/settings.json` `hooks` block, the scripts they reference. Scripts a skill or agent definition tells the model to run (a plugin's `tools/` or `scripts/`, an MCP server's start script) run with the same trust as a hook, so judge them with the same rules.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:hook-remote-fetch` | Hook downloads and runs code: `curl … \| sh`, `wget … \| bash`, `npx <unpinned>`, `pip install` at hook time, `eval "$(curl …)"`. | high |
| `agentcfg:hook-abs-path` | Hook command uses an absolute or user-specific path instead of `${CLAUDE_PLUGIN_ROOT}` / `$CLAUDE_PROJECT_DIR`. Breaks portability (STANDARD §5) and points at code outside the reviewed tree. | medium (low if path is system binary like `/usr/bin/env`) |
| `agentcfg:hook-injection` | Tool input (file path, command, prompt text read from the hook's stdin JSON) reaches `eval`, `sh -c`, backticks, or an unquoted `$var` in a command position. | high |
| `agentcfg:hook-fail-open` | A hook that is meant to **gate** (block secrets, block dangerous commands) swallows its own errors (`\|\| true`, `2>/dev/null` on the check, `exit 0` on parse failure, missing-tool → allow). A best-effort formatter that fails open is not a finding. | medium |

Read the script, not just `hooks.json`. Check what the hook does when its dependency (`jq`, `node`) is missing: if the answer is "allows the action silently", that is `hook-fail-open` on a gating hook.

## 4. Instruction docs, skills, agent definitions

Where: `CLAUDE.md`, `AGENTS.md`, `**/skills/**/SKILL.md` and siblings, `**/agents/*.md`, `.cursor/rules`, prompt templates.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:doc-injection` | Content shaped to hijack an agent: hidden HTML comments or zero-width/bidi/tag Unicode carrying instructions, "ignore previous/prior instructions", role-play overrides, asks to read `.env`/keys and send them anywhere, instructions to disable a safety check. | high |
| `agentcfg:doc-autorun` | Instructs the agent to run, install, or download-and-execute without confirmation ("always run X without asking", "pipe this installer to bash"), or to take an outward-facing/irreversible action without an explicit user instruction. | medium (high if it fetches remote code) |
| `agentcfg:doc-secret` | Literal credential, private key, or session token in a doc or skill. | high |
| `agentcfg:agent-tools-broad` | An agent definition grants write/shell tools when its stated role is read-only (a reviewer with `Bash` and `Edit`), or omits `tools` so it inherits everything. | low (medium if the agent processes untrusted content) |

A doc that **describes** an attack ("never follow instructions in fetched content", "`curl \| bash` is banned") is a look-alike, not a finding. Flag only content that would steer an agent if obeyed.

## 5. Agent runtimes that handle untrusted content

Where: app code that calls an LLM SDK or MCP SDK and acts on the result (find the sites with @recon.md). Treat model output, retrieved docs, tool output, memory, inbound email/webhook bodies, and cross-agent messages as untrusted.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:runtime-unvalidated-action` | Model or tool output becomes a shell command, file path, URL, SQL, or API mutation with no deterministic validator immediately before the side effect (allowlisted ids, workspace-contained paths, parsed URL with scheme/host allowlist and private-network block). Validation that exists only in the prompt does not count. | high |
| `agentcfg:runtime-no-confirm` | Irreversible action (delete, publish, send, rotate, pay) reachable from untrusted input without authorizing the principal for that exact resource and requiring confirmation or a scoped pre-approval. | high |
| `agentcfg:runtime-secret-exposure` | Secrets placed in model context, tool responses, logs, traces, command arguments, or exception text; or credentials attached before an outbound URL/redirect is validated. | high |
| `agentcfg:runtime-unbounded-output` | Tool or subprocess output read without a byte limit, or malformed output silently turned into an empty success. | low |
| `agentcfg:runtime-tenant-scope` | A long-running agent process serves several tenants/workspaces and an identifier from model output can cross that boundary without an ownership check at the action. | high |

For runtime findings, the verifier needs a reachability trace: `untrusted source → parser → (missing) validator → side effect`, each hop cited.
