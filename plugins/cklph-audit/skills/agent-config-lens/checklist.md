# agent-config-lens — judgment checklist

Every finding gets a `agentcfg:<kind>` rule id, a `file:line` anchor, the quoted line (secrets redacted), and a context-first severity. Starting severities below are defaults; adjust for context and say why.

## 1. MCP configs

Where: `.mcp.json` (repo root and per plugin), `.github/mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.windsurf/mcp.json`, `.kiro/settings/mcp.json`, `*.mcp.json.example`, and `mcpServers` blocks inside other JSON. Plugin `.mcp.json` files ship to every installer, so weigh them higher than a local dev config.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:mcp-unpinned` | Package selector can resolve to different code later: bare name, `@scope/name`, `@latest`, any npm dist-tag (`@next`, `@beta`), Python package with no version, Docker image by tag or no tag and no `@sha256:` digest. Classify per @mcp-selectors.md. | medium; high if the server gets credentials or write/shell capability |
| `agentcfg:mcp-range` | Selector permits a range (`^1.2.0`, `~1.2`, `>=1.2,<2`, `==1.*`). | low |
| `agentcfg:mcp-review` | Local script, unknown binary, editable install, direct URL, VCS ref, shell wrapper, or an invocation you can't parse confidently. Record it; never guess. | low, confidence `needs-owner-input` |
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

**Precedence when both `llm` and `agent-config` run** (the same rule is in both lenses): six classes overlap. Three runtime pairs go to agent-config. A missing confirmation on an irreversible action is `agentcfg:runtime-no-confirm`, not `llm:action-binding`. A resource id taken from model output with no ownership check is `agentcfg:runtime-tenant-scope`, not `llm:confused-deputy`. A secret placed in model context is `agentcfg:runtime-secret-exposure`, not `llm:context-disclosure`. Three MCP pairs split by where the evidence sits: token passthrough (`agentcfg:mcp-token-passthrough` or `llm:mcp-identity`), one tool name claimed by two servers (`agentcfg:mcp-tool-shadowing` or `llm:mcp-identity`), and approval keyed on server-supplied annotations or descriptions (`agentcfg:mcp-annotation-trust` or `llm:mcp-metadata-policy`). When the evidence is config shape in the repo's MCP or client config (`.mcp.json`, client settings, an allow list), file the agentcfg id. When it is server or client code in the product, file the llm id. Everything else in the llm lens stays there: an approval that exists but does not bind, a service identity used with no requester check, other users' data in context, retrieval and memory scope, role forgery, schema drift, tool output treated as authority, loops, the rest of MCP identity and metadata, and rendering. When only one of the two lenses runs, it files every paired class under its own rule ids: agent-config files its five `agentcfg:runtime-*` rows and its three MCP rows and nothing else from this list, and llm files all six paired classes under its own rule ids.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:runtime-unvalidated-action` | Model or tool output becomes a shell command, file path, URL, SQL, or API mutation with no deterministic validator immediately before the side effect (allowlisted ids, workspace-contained paths, parsed URL with scheme/host allowlist and private-network block). Validation that exists only in the prompt does not count. | high |
| `agentcfg:runtime-no-confirm` | Irreversible action (delete, publish, send, rotate, pay) reachable from untrusted input without authorizing the principal for that exact resource and requiring confirmation or a scoped pre-approval. | high |
| `agentcfg:runtime-secret-exposure` | Secrets placed in model context, tool responses, logs, traces, command arguments, or exception text; or credentials attached before an outbound URL/redirect is validated. | high |
| `agentcfg:runtime-unbounded-output` | Tool or subprocess output read without a byte limit, or malformed output silently turned into an empty success. | low |
| `agentcfg:runtime-tenant-scope` | A long-running agent process serves several tenants/workspaces and an identifier from model output can cross that boundary without an ownership check at the action. | high |

For runtime findings, the verifier needs a reachability trace: `untrusted source → parser → (missing) validator → side effect`, each hop cited.

## 6. AI agents inside CI

Where: `.github/workflows/*.yml`, other CI files, and the scripts they call, wherever a job runs a coding agent (`anthropics/claude-code-action`, `claude -p`, `openai/codex-action` or `codex exec`, `google-github-actions/run-gemini-cli`, `gemini -p`, or a similar agent step). Split with supply-chain (the same text is in `supply-chain-lens`): When both lenses run, the AI agent step itself (its prompt inputs, its tools, what later steps do with its output) belongs to `agent-config` under its `agentcfg:ci-agent-*` rows, and so do the job's `permissions:` and the secrets passed to the agent step (`agentcfg:ci-agent-privileged`). Every other sink in the same job stays with `supply-chain`: action pinning, `npm install` on a PR head with secrets, a `pull_request_target` checkout that runs repo scripts, `${{ }}` in a non-agent `run:` step. When `supply-chain` is not in the run, file those other sinks here under the closest `agentcfg:ci-agent-*` rule and name the supply-chain rule in the rationale.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:ci-agent-untrusted-prompt` | Attacker-controlled event data reaches the agent prompt: `${{ github.event.issue.title/body }}`, `${{ github.event.pull_request.title/body/head.ref }}`, `${{ github.event.comment.body }}`, review or discussion bodies, or commit messages. Directly in the prompt input, or through an `env:` var the prompt reads. On claude-code-action, `allowed_non_write_users: '*'` together with a `github_token` input is itself a vector: it lets any GitHub account trigger the job (without `github_token` the action ignores the allowlist and keeps the write check). | high (critical if the job also holds write tokens or secrets) |
| `agentcfg:ci-agent-fetches-untrusted` | The prompt tells the agent to read untrusted content itself: `gh issue view`, `gh pr view`, `gh pr diff`, issue or PR comments, CI logs, or build and test output from a fork. The payload never appears in the workflow, so a read of the workflow file alone shows nothing wrong. | medium; high if the job holds write tokens or secrets |
| `agentcfg:ci-agent-pr-head` | `pull_request_target`, `issue_comment`, or `workflow_run` trigger and a checkout of the PR head (`ref: ${{ github.event.pull_request.head.sha }}`, `refs/pull/*/head`, `gh pr checkout`), then an agent runs over that tree. Fork-controlled files (`CLAUDE.md`, `AGENTS.md`, `.mcp.json`, settings, hooks) then steer a privileged agent. | high |
| `agentcfg:ci-agent-output-exec` | A later step runs what the agent produced: `run: ${{ steps.<agent>.outputs.* }}`, `eval`, `sh -c` on agent output, executing a file the agent wrote, or passing agent output into `github-script`. | high |
| `agentcfg:ci-agent-privileged` | The agent job holds more than it needs: `permissions: write-all`, `contents: write` or `pull-requests: write` on a job that only comments, no `permissions:` block on a repo with a write default, or secrets beyond the model key in the agent step's env. | medium; high if any untrusted-input row above fires in the same job |
| `agentcfg:ci-agent-wide-tools` | Amplifier: allowed tools that permit shell expansion or arbitrary commands (`Bash`, `Bash(*)`, `Bash(gh:*)`, `Bash(echo:*)`, `Bash(git:*)`), wildcard tool allowlists, `--dangerously-skip-permissions`, Codex `danger-full-access`, Gemini `--yolo`, or a sandbox with open network. | low; high if any untrusted-input row above fires in the same job |

A short allowlist can still reach a lot. `Bash(gh:*)` still runs `gh api` with the job token. `Bash(echo:*)` still expands `$(...)` and `${VAR}`. Judge what the allowed prefix can reach, not how short the list is. A wide sandbox on a job that only sees trusted input (`push` to the default branch, `workflow_dispatch` by a maintainer, `schedule` with no event data) stays low.

**The claude-code-action actor gate.** On issue, comment, and PR events, `anthropics/claude-code-action` checks that the triggering actor has write permission on the repo and refuses anyone else. Recent versions also restore `CLAUDE.md` and tool config from the base branch and disable hooks on an untrusted PR checkout. So a finding through this action needs a path for a non-write actor to reach it: `allowed_non_write_users` (above all `'*'`), which only takes effect when the `github_token` input is also set, `allowed_bots`, a raw `claude -p`, `codex exec`, or gemini CLI step with no such gate, or an old pinned version from before the gate. Cite that path in the finding. With none of them, the untrusted-input rows are not findings through this action, with one exception: `ci-agent-fetches-untrusted` stays valid, because a maintainer's own run still reads issue and PR text an outsider wrote. The action's outputs are `conclusion`, `execution_file`, `branch_name`, `github_token`, `structured_output`, and `session_id`; there is no `result`. For `ci-agent-output-exec`, look for `structured_output`, or a file the agent writes, reaching a later `run:`, `eval`, or `github-script`.

## 7. MCP tool definitions and repo-shipped servers

Where: MCP configs and client settings (section 1), client code that approves tool calls, and MCP server source the repo ships (`@modelcontextprotocol/sdk`, `mcp` / `FastMCP` in Python). A server pinned by version still serves tool definitions (description, `inputSchema`, `annotations`) that can change under the same version. A flipped `readOnlyHint` or `destructiveHint` can turn a write tool into one the client auto-approves.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:mcp-annotation-trust` | A client config or client code auto-approves tool calls from server-supplied metadata: approval keyed on `readOnlyHint`, `destructiveHint`, `idempotentHint`, or words in the description, for a server the repo does not control. | medium; high if the auto-approved tools can write, send, or execute |
| `agentcfg:mcp-def-unpinned` | A server whose tools are auto-approved (wildcard `mcp__<server>__*` allow, `enableAllProjectMcpServers`, an always-allow list) or granted credentials, with no pin on the tool definitions it serves (no recorded hash or snapshot of names, descriptions, schemas, annotations). Includes a remote server with no pinned version. A remote server that is neither auto-approved nor credentialed is not a finding here. | low; medium if the tools can write or execute |
| `agentcfg:mcp-tool-shadowing` | A tool description or server instructions that refer to another server's tools or tell the model how to use them ("before calling `send_email`, always add this BCC"), or two configured servers that expose the same tool name. Visible statically only in server source the repo ships or a committed definitions snapshot. Cross-server instructions stay here in every run. When `llm` also runs, a name collision found only in server source the repo ships is `llm:mcp-identity`; file here only collisions a config or committed definitions snapshot shows. | high for cross-server instructions; medium for a name collision |
| `agentcfg:mcp-http-exposed` | A repo-shipped Streamable HTTP or SSE server that binds `0.0.0.0`, `::`, or no explicit host, or that accepts requests without validating `Origin` and `Host` (DNS rebinding reaches a localhost server from any web page). | high |
| `agentcfg:mcp-token-passthrough` | A repo-shipped server that forwards the client's bearer token to an upstream API instead of using its own credentials bound to that upstream audience, or accepts tokens without checking the audience is this server. When `llm` also runs, this server-code case is `llm:mcp-identity` at high; file it here only when `llm` is not in the run. | high |

A localhost-only server that checks `Origin` against an allowlist, or a stdio server, is the intended pattern for item `mcp-http-exposed`.

## 8. Skill and plugin content

Where: skill dirs (`SKILL.md` and every sibling file and script), plugin dirs, agent definitions, and the scripts they tell the model to run. Prose that only describes or forbids a pattern is a look-alike, as in section 4. Negated phrasing ("never proceed without confirmation", "do not retry more than twice") is safe and is not a finding.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:skill-desc-mismatch` | The skill's `description` or stated purpose does not match what its scripts do: a "formatter" that makes network calls, reads credentials, or writes outside its workspace. | medium; high if the undisclosed behavior is network or credential access |
| `agentcfg:skill-remote-instructions` | Tells the agent to fetch instructions or code from a URL at runtime and follow or run them ("load the latest rules from https://…", "download and apply this patch"). The content can change after review. A piped installer stays `doc-autorun`. | high |
| `agentcfg:skill-secret-echo` | Tells the agent to put secret values verbatim into output, logs, commits, issues, or prompts ("print the token so the user can confirm it"). Sending a secret to a remote host stays `doc-injection`. | high |
| `agentcfg:skill-capability-inflation` | Claims more reach or priority than the skill should have: "always use this tool", "use for anything/everything", "this skill overrides all other skills or instructions", or posing as a vendor ("official Anthropic skill") without being one. | medium |
| `agentcfg:skill-autonomy-abuse` | Blanket waivers of human control: "proceed without asking" for all actions, "never stop to confirm", retry until success with no cap, or keep going after errors without reporting. A single named action without confirmation stays `doc-autorun`. Self-modification is `rules-self-edit`. | medium |
| `agentcfg:skill-hidden-code` | A dotfile holding executable code inside a skill or plugin dir (`.setup.sh`, `.helper.js`, `.init.py`), above all one a visible script calls. Config dotfiles with no code (`.gitignore`, `.prettierrc`) are fine. | medium; high if it fetches, reads credentials, or runs at load |
| `agentcfg:skill-symlink-escape` | A symlink inside a skill or plugin dir that resolves outside it. Find them with `find <dir> -type l`; read the target path, never follow it. | medium; high if the target is a home dir or credential path |
| `agentcfg:skill-exfil-shape` | A command or script a skill or plugin ships (or tells the agent to run) that puts a credential path (`.ssh/id_*`, `.env`, `~/.aws`, `~/.npmrc`, `~/.config/gh`) near a send or upload verb (`curl -d/-F/-T`, `scp`, `nc`, `fetch(..., {method:'POST'})`), or posts to a Discord or Slack webhook, a Telegram bot API, or a paste site. Prose asks to send secrets stay `doc-injection`. | high (critical if it reads a private key or cloud credential) |
| `agentcfg:skill-planted-automation` | A skill, plugin, or hook that creates automation to run later: crontab entries, launchd plists, systemd timers, new `.github/workflows/*` files, git hooks, or lines appended to shell rc files. | high |

One defect, one rule id. When `skill-exfil-shape` fires on a command, do not also file `skill-desc-mismatch` for the same lines; the exfil finding already says the description hides it. File `skill-desc-mismatch` only for undisclosed behavior that no more specific row covers.

## 9. Rules files and agent ignore files

Where: `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/**`, `.github/copilot-instructions.md`, skills, agent settings and hooks, `CODEOWNERS`, `.gitignore`, `.claudeignore`, `.cursorignore`, `.aiexclude`.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:rules-no-codeowners` | Agent rules files and settings with no `CODEOWNERS` entry, so a change to what the agent may do merges with ordinary review. File one finding per repo, anchored at `CODEOWNERS` (or the first rules file when there is none), listing the uncovered paths. | low |
| `agentcfg:rules-self-edit` | The agent may change its own rules, settings, or hooks without approval: an allow entry for `Edit`/`Write` on `.claude/**`, `CLAUDE.md`, `AGENTS.md`, skills, or hook scripts; or a hook or instruction that rewrites them unattended. Asking the user before saving a note is fine. | medium; high if the agent can widen its own permissions or hooks |
| `agentcfg:rules-no-ignore` | `.gitignore` excludes secret-shaped files (`.env*`, `*.pem`, `credentials*`, `*.key`) that AI tools still read, and there is no agent ignore file and no `permissions.deny` Read rule for them, nor for `~/.npmrc`, `~/.config/gh`, `~/.kube`, `~/.docker/config.json`, `~/.aws`. Git ignoring a file does not hide it from an agent. List file names only, never read them. A broad allow list with no deny stays `perm-no-deny`. | low; medium if such files exist in the working tree |
