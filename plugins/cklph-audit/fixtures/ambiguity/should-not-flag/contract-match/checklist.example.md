<!-- -->
# MCP config checklist

Starting severities below are defaults; adjust for context and say why.

| Rule id | What | Default |
|---|---|---|
| `agentcfg:mcp-unpinned` | Package selector can resolve to different code later: bare name, `@scope/name`, `@latest`, any npm dist-tag (`@next`, `@beta`), Python package with no version, Docker image by tag or no tag and no `@sha256:` digest. | medium; high if the server gets credentials or write/shell capability |
| `agentcfg:mcp-range` | Selector permits a range (`^1.2.0`, `~1.2`, `>=1.2,<2`, `==1.*`). | low |
| `agentcfg:mcp-review` | Local script, unknown binary, editable install, direct URL, VCS ref, shell wrapper, or an invocation you can't parse confidently. Record it; never guess. | low, confidence `needs-owner-input` |
| `agentcfg:mcp-remote` | Remote server (`url`, `type: http`/`sse`): plain `http://` to a non-localhost host, a host that is not the vendor's documented endpoint, or a remote server granted credentials via headers. | medium |
| `agentcfg:mcp-shell` | Server command is a shell (`bash -c`, `sh -c`, `cmd /c`) or composes a command string, so the config is arbitrary code. | high |
