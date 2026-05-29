# cklph-os — Standard & Conventions

> The single specification every part of this Claude setup follows. If a skill, command,
> agent, hook, or instruction file doesn't match this doc, fix it or fix this doc — never
> leave them out of sync.
>
> Status: **v0.1** · Owner: Peter Krzyzek (Chykalophia) · Repo: `Chykalophia/cklph-os`

---

## 1. Why this exists

Reusable Claude behavior copy-pasted per repo **always drifts** (the `<another-repo>/.claude/hooks/...`
hardcoded-path breakage is the canonical symptom). This standard makes reusable behavior live in
**one versioned place**, referenced — never copied — and defines a format so everything is
discoverable, portable, and boring to maintain.

**Principles**
1. **One source of truth per concern.** Shared behavior in the plugin; shared rules in `AGENTS.md`.
2. **Reference, never hardcode.** Paths use `${CLAUDE_PLUGIN_ROOT}` or `$CLAUDE_PROJECT_DIR`. Absolute paths are banned.
3. **Portable core, powerful edges.** What's committed in a repo works the widest; CLI-only features (hooks) are bonuses, not load-bearing.
4. **Boring wins.** Plain files, git-tracked, transparent. No infra we won't maintain.
5. **Discoverable.** A bootstrap meta-skill routes every task to the right skill.

---

## 2. Architecture — three layers

### Layer 1 — Portable Core (committed in EVERY repo)
The only things guaranteed wherever a surface reads the repo.
- `AGENTS.md` — **source of truth for instructions** (cross-tool standard).
- `CLAUDE.md` — one line: `@AGENTS.md`, plus Claude-only notes.
- `.claude/skills/` — **project-specific** skills only (not reusable ones).
- `STATE.md` — per-repo working state (active work, decisions, blockers).

### Layer 2 — Shared Behavior Plugin (`cklph-os`, installed once per machine)
The reusable engine. Distributed via a personal marketplace; updated in one place.
- Cross-project skills, agents, commands, and the quality-gate hooks.
- Referenced by `${CLAUDE_PLUGIN_ROOT}` so nothing is ever hardcoded per repo.

### Layer 3 — User / Machine (`~/.claude`, CLI-only)
- Slim global `CLAUDE.md` (a pointer, not a rulebook).
- `~/.claude/memory/GLOBAL.md` — cross-project brain.
- `~/.claude.json` — MCP servers.
- **Private overrides** — personal / internal / client skills go in `~/.claude/skills/` (user-level, loaded
  alongside the plugin, never in any repo); private knowledge in `~/.claude/memory/GLOBAL.md`; repo-local
  private notes/refs in `private/` (gitignored). The public OS stays shareable; your specifics stay yours.

---

## 3. Surface support matrix (honest)

| Capability | CLI | Code Web | Cowork | Desktop |
|---|---|---|---|---|
| Reads `~/.claude/*` (user CLAUDE.md, skills, hooks) | ✅ | ❌ | ❌ | ❌ |
| Reads repo `CLAUDE.md` / `AGENTS.md` | ✅ | 🟡 unverified | ❌ | ❌ |
| Reads repo `.claude/skills/` | ✅ | 🟡 unverified | 🟡 unverified | ❌ |
| Hooks execute | ✅ | ❌ | ❌ | ❌ |
| CLI-installed plugins/skills (`claude plugin install`) | ✅ | ❓ untested | ❌ confirmed | ❌ confirmed (2026-05-29) |
| MCP config source | `~/.claude.json` | connectors | `claude_desktop_config.json` | `claude_desktop_config.json` |

**Design rule:** treat **CLI + committed repo files** as guaranteed. Web/Cowork repo-discovery is
undocumented → **verify empirically before depending on it**. Because **hooks are CLI-only**, every
rule a hook enforces must *also* be written as prose in `AGENTS.md` (which travels as guidance).

**Empirical finding (2026-05-29):** the `cklph-probe` skill, installed via `claude plugin install`
(user scope, `~/.claude`), loads on the **CLI** but **NOT in Claude Desktop** — Desktop is a separate
app that reads only `claude_desktop_config.json` (MCP) + its own connectors, never `~/.claude`.
**Conclusion: the plugin IS a cross-surface vehicle — but installs are per-surface, not auto-synced.**
The CLI probe failed in Desktop only because the marketplace was registered via a **local path**
(CLI-scoped). Channels that reach Desktop/Cowork:
- **Desktop plugins UI** → add the **GitHub-hosted** marketplace, install `cklph-os` there. Plugin
  **skills/commands/agents load; hooks do NOT** (CLI-only). *(Expected path — verify after publishing.)*
- **MCP servers** via `claude_desktop_config.json`.
- Individual **skills via claude.ai → Settings → Skills** (manual upload).

Plan: publish cklph-os **public on GitHub** → add as a marketplace in Desktop's UI → install. The local-path
marketplace stays CLI-only by nature. Cowork likely matches Desktop; web (reads repo files) untested.

---

## 4. Directory layout

### The repo (`cklph-os/`) — a marketplace that hosts the plugin
```
.claude-plugin/
  marketplace.json         # MARKETPLACE manifest (lists plugins) — repo root, this file only
plugins/
  cklph-os/                # the plugin itself
    .claude-plugin/
      plugin.json          # PLUGIN manifest (name/description/version/author) — this file only
    skills/<name>/SKILL.md  # required; supporting files beside it
    hooks/
      hooks.json           # all hooks, referenced via ${CLAUDE_PLUGIN_ROOT} (auto-discovered)
      *.sh                 # hook scripts
    agents/<name>.md        # optional — not in MVP
    commands/<name>.md      # optional, legacy — prefer skills
    .mcp.json               # optional — plugin-provided MCP servers
STANDARD.md                 # this file
templates/                  # AGENTS.md / CLAUDE.md / STATE.md starters
docs/ideas/                 # refinement artifacts
```

> Marketplace manifest and plugin manifest live at DIFFERENT levels: `marketplace.json` at the
> repo-root `.claude-plugin/`; `plugin.json` inside each `plugins/<name>/.claude-plugin/`.

### A consuming repo (e.g. a Next.js app)
```
AGENTS.md                  # source of truth
CLAUDE.md                  # `@AGENTS.md` + Claude-only notes
STATE.md                   # working state
.claude/
  skills/<name>/SKILL.md   # PROJECT-SPECIFIC skills only
  settings.local.json      # machine-local overrides (gitignored)
```

---

## 5. Format conventions

### Skills
- One **folder per skill**: `skills/<kebab-name>/SKILL.md`. Supporting files sit beside it.
- Frontmatter — minimal:
  ```yaml
  ---
  name: <kebab-name>
  description: <trigger-style>. Use when <situation>, before <action>.
  ---
  ```
  The `description` is a **trigger**, not a summary — it tells the model *when* to invoke.
- **Compose** by linking sibling files with `@relative/path.md` and by naming related skills in prose.
- Keep `SKILL.md` short; push detail into supporting files loaded on demand.

### Hooks
- Defined once in `hooks/hooks.json`.
- Commands reference scripts via **`${CLAUDE_PLUGIN_ROOT}/hooks/<script>.sh`** (plugin) or
  **`$CLAUDE_PROJECT_DIR/.claude/hooks/<script>.sh`** (repo-local).
- **Absolute paths are banned.** This is the rule that prevents the drift bug.

### Agents & commands
- Agents: `agents/<name>.md` with a clear role + tool scope.
- Commands: `commands/<name>.md`; prefer promoting to a skill unless it's a thin shortcut.

### Instructions (AGENTS.md + CLAUDE.md)
- All durable rules live in `AGENTS.md`.
- `CLAUDE.md` contains exactly: `@AGENTS.md` then any Claude-only additions.
- Never duplicate rules between the two.

### Memory
- `~/.claude/memory/GLOBAL.md` — cross-project facts, preferences, repo relationships, shared infra.
- `STATE.md` per repo — current work, decisions, blockers. Update before `/compact` or session end.

---

## 6. Naming
- Skills/commands/agents: `kebab-case`, domain- or phase-prefixed (`security-review`, `git-commit`).
- Plugin-provided skills/commands are namespaced on invocation: `/cklph-os:<name>`. **Don't repeat the namespace in the name** — use `build`, not `cklph-build` (→ `/cklph-os:build`).
- Hook scripts: `<purpose>-check.sh` / `<purpose>-gate.sh`.

---

## 7. Distribution & versioning
- `cklph-os` is published through a **personal marketplace** (`.claude-plugin/marketplace.json`).
- Install once per machine: `/plugin marketplace add <owner>/cklph-os` then `/plugin install`.
- Bump `version` in `plugin.json` on change; `/plugin` reload to update consumers.
- Consuming repos carry **no copies** of shared skills/hooks — only references and project-specific extras.

---

## 8. Bootstrap meta-skill
- `skills/using-cklph/SKILL.md` is the discovery entrypoint (superpowers-style): a short flowchart that,
  on each task, asks "does any skill apply?" → invoke it → announce → follow it.
- Sets instruction priority: **user message > repo AGENTS.md/CLAUDE.md > cklph skills > default behavior** (must match `using-cklph/SKILL.md`).

---

## 9. Roadmap
- **P0** Stop the bleeding: repoint hardcoded hooks. ✅ across active repos.
- **P1** This standard. ✅
- **P2** Build `cklph-os` plugin + marketplace; migrate hooks + bootstrap skill. ✅ MVP.
- **P3** AGENTS.md + CLAUDE.md `@import` across repos; slim global CLAUDE.md. ◐ core repos done; others pending.
- **P4** Memory layer: `GLOBAL.md` + `STATE.md`; capture working preferences. ✅ GLOBAL.md seeded + `@import`ed from global CLAUDE.md.
- **P5** Expand skills/agents/commands; cross-surface validation (CLI ✅, others pending); add tests. ◐ ongoing.
