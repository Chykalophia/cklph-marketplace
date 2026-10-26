# MCP selector classification (static)

Classify the **direct** reference each MCP server will run. Parse; never execute.

## Isolate the selector

- **npm runners** (`npx`, `npm exec`, `pnpm dlx`, `yarn dlx`, `bunx`, `bun x`): the first non-flag argument is the package, unless a package-valued flag is present. `npx --package foo bar` selects `foo` (`bar` is the executable). Review every `--package` / `-p` value.
- **Docker** (`docker run`, `docker container run`): skip options and their values (`-e X=Y`, `-v a:b`, `--name n`); the first remaining token is the image; anything after is the in-container command. An explicit `image` field counts too.
- **Python** (`uvx`, `uv tool run`, `pipx run`): `--from SPEC` / `--from=SPEC` (uv) and `--spec SPEC` (pipx) select the package; otherwise the first non-flag token. Review `--with` values separately when the syntax is clear.
- **Anything else** (local script, unknown binary, `node ./server.js`, shell wrapper): `REVIEW`.

If option boundaries or selector syntax are ambiguous, return `REVIEW`. Never omit a configured server and never guess.

## Classes

| Selector | Class | Rule id |
|---|---|---|
| `pkg@1.2.3`, `@scope/pkg@1.2.3` | SAFE (direct selector only) | none |
| `pkg`, `@scope/pkg` (no version) | MUTABLE | `agentcfg:mcp-unpinned` |
| `pkg@latest`, `pkg@next`, `pkg@beta`, any dist-tag | MUTABLE | `agentcfg:mcp-unpinned` |
| `pkg@^1.2.0`, `pkg@~1.2.0`, wildcard, inequality | RANGE | `agentcfg:mcp-range` |
| Docker `image@sha256:<64 hex>` (with or without a tag) | SAFE | none |
| Docker `image:tag` or `image` with no digest (version-looking tags included) | MUTABLE | `agentcfg:mcp-unpinned` |
| Python `pkg==1.2.3`, `uvx pkg@1.2.3` | SAFE | none |
| Python bare `pkg`, `uvx pkg@latest` | MUTABLE | `agentcfg:mcp-unpinned` |
| Python `>=`, `~=`, `==1.*` | RANGE | `agentcfg:mcp-range` |
| Editable, direct URL, VCS ref, local path, shell wrapper, unknown | REVIEW | `agentcfg:mcp-review` |

`SAFE` covers the direct selector or digest only. It does not establish package integrity, provenance, transitive reproducibility, safe authorization, prompt-injection resistance, or runtime isolation.

## Report row

| Config | Server | Reference | Class | Why | Next step |
|---|---|---|---|---|---|
| `.mcp.json:6` | browser | `example-browser-mcp@latest` | MUTABLE | `@latest` can resolve to new code with no config diff | Pin the version the team reviewed; update deliberately |
