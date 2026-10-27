<div align="center">

# 🧩 cklph-marketplace

### Peter's personal **Claude Code marketplace** — composable plugins for dev workflow, framework opinions, WordPress/design pipelines, auditing, and CRO.

[![Tests](https://github.com/Chykalophia/cklph-marketplace/actions/workflows/test.yml/badge.svg)](https://github.com/Chykalophia/cklph-marketplace/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Claude Code marketplace](https://img.shields.io/badge/Claude_Code-marketplace-d97757)

*Built by [Chykalophia](https://chykalophia.com) · maintained by [@PiotrKrzyzek](https://github.com/PiotrKrzyzek)*

</div>

---

> [!NOTE]
> **TL;DR** — One repo, one marketplace (`cklph`), plugins that layer on each other:
> a dev-workflow spine, opinionated Next.js + Supabase patterns, and more listed in
> `.claude-plugin/marketplace.json`. Install only what you need.

---

## 🧩 The core plugins

| Plugin | What it does | When you want it |
| --- | --- | --- |
| **`cklph-os`** | Dev-workflow spine — phase loop (`refine → spec → plan → build → review → verify → ship`, plus `survey` run by hand for scope gaps), three adversarial agents (`cklph-implementer` / `cklph-reviewer` / `red-team`), daily-rhythm primitives (`triage` · `decide` · `daily-frame` · `weekly-review`), self-improvement loop (`learn`), skill hygiene (`stocktake` + a local usage log), and quality-gate hooks, including a destructive-command gate. | **Always.** This is the core. |
| **`cklph-nextjs`** | Opinionated Next.js + Supabase patterns layered on top of the official `vercel:*` skills — layered `lib/` architecture, mutation security checklist, data-layer abstraction rules, 12 review pitfalls, full stack coverage. | If you work in Next.js + Supabase repos. |

---

## 🚀 Quick start

**Add the marketplace once:**

```bash
/plugin marketplace add Chykalophia/cklph-marketplace
```

**Install only what you want:**

```bash
/plugin install cklph-os@cklph            # the dev spine — always
/plugin install cklph-nextjs@cklph        # only if you work in Next.js + Supabase
```

Restart your CLI after install so the skills load.

> [!TIP]
> **Claude Desktop** — add the marketplace under **Settings → Plugins**, point at this repo, then install. Skills, commands, and agents load there. **Hooks are CLI-only.**

---

## 🧠 Where to begin — the `start-here` skill

`cklph-os` ships a **`start-here`** skill that runs at the start of every task. It sets instruction priority, routes you to the right skill before you act, and applies context-discipline rules (trust tiers · A/B/C confusion stop-templates · marker hygiene). **If you read one skill before using anything else, read this one.**

---

## 🔧 The build flow (`cklph-os`)

Seven composable phases — run one standalone, or chain them with the orchestrator.

| Phase | Command | Does |
| --- | --- | --- |
| refine | `/cklph-os:refine` | sharpen a vague idea *(optional)* |
| spec | `/cklph-os:spec` | requirements + acceptance criteria |
| plan | `/cklph-os:plan` | decompose into a wave task-graph |
| build | `/cklph-os:build` | execute via sub-agent waves |
| review | `/cklph-os:review` | adversarial review (standard or red-team intensity) |
| verify | `/cklph-os:verify` | run checks + walk acceptance criteria |
| ship | `/cklph-os:ship` | open a PR |

> [!TIP]
> **`/cklph-os:flow <goal>`** runs the whole loop and asks your mode first:
> **full-agentic** · **partial** · **interactive**.

`survey` (gap-fill across users / devices / edges / cross-cutting concerns) is not a `flow` phase:
invoke the `cklph-os:survey` skill yourself between `refine` and `spec` when the scope has gaps.

---

## 🛡️ Quality-gate hooks (CLI only)

- **`pre-commit-gate`** — TypeScript + ESLint + Semgrep on every `git commit`. Skips merge commits and bulk stages (>500 files). Lints `SKILL.md` descriptions for the YAML colon-space trap. Configurable warning budget via `CKLPH_ESLINT_MAX_WARNINGS`.
- **`nextjs-quality-check`** — App Router patterns and `'use client'` discipline on Next.js file edits.
- **`security-check`** — advisory secret scanning on every edit (gitleaks + bandit if installed).
- **`destructive-command-gate`** — blocks Bash calls that destroy work or data (`rm -rf` on a root, force push, `git reset --hard`, DROP/TRUNCATE through a SQL client, `docker system prune` and more) and names the safer form. User-approved bypass: the `CKLPH_ALLOW_DESTRUCTIVE=1 ` prefix, which exempts the whole Bash call.
- **`skill-usage-log`** — logs skill invocations locally to `~/.claude/cklph-usage/skills.jsonl` for `stocktake`. Nothing leaves the machine.

---

## 🖥️ Surface support (honest)

| Layer  | CLI | Desktop / Cowork           | Web                   |
| ------ | :-: | -------------------------- | --------------------- |
| Skills | ✅  | ✅ *(via marketplace UI)*  | repo-committed only   |
| Hooks  | ✅  | ❌ *(CLI-only)*            | ❌                    |
| MCP    | ✅  | ✅ *(claude_desktop_config)* | connectors          |

> [!TIP]
> **Using another AI tool?** Cursor, Warp, VS Code/Copilot, Windsurf, Cline/Roo, and even chat-only AIs can run cklph — host the `claude` CLI in their terminal, or port the skills into their native rules/commands. Step-by-step per tool → **[Using cklph outside Claude Code](./docs/using-with-other-tools.md)**.

---

## 🗂️ Repository layout

```text
cklph-marketplace/
├── .claude-plugin/marketplace.json   # registers every plugin
├── plugins/
│   ├── cklph-os/                     # dev workflow spine
│   │   ├── .claude-plugin/plugin.json
│   │   ├── skills/                   # start-here + flow + phases + support + daily-rhythm + learn
│   │   ├── agents/                   # cklph-implementer · cklph-reviewer · red-team
│   │   ├── commands/                 # /cklph-os:flow + per-phase commands
│   │   ├── CHANGELOG.md              # cklph-os version history
│   │   └── hooks/                    # pre-commit-gate · nextjs-quality-check · security-check · destructive-command-gate · skill-usage-log
│   ├── cklph-nextjs/                 # Next.js + Supabase house style (17 skills)
│   └── …                             # one directory per plugin in marketplace.json
├── templates/                        # AGENTS.md · CLAUDE.md · STATE.md starters
├── test/                             # bats tests for the hooks
├── STANDARD.md                       # the spec everything follows
└── CHANGELOG.md                      # marketplace-level events only (each plugin has plugins/<name>/CHANGELOG.md)
```

Each plugin has its own `plugin.json`, `README.md`, and `CHANGELOG.md` inside its `plugins/<name>/` directory.

---

## 🎯 Principles

1. **Lean** — thin spine, depth in lazy refs.
2. **Boring wins** — pick the obvious, transparent option.
3. **DRY** — extract at 3+ duplicates.
4. **Spine, not walled garden** — compose with installed specialists.
5. **Evidence over vibes** — verify > looks-right.

📖 Full design → **[STANDARD.md](./STANDARD.md)**

---

## 🧪 Testing

```bash
bats test/
```

CI runs the suite on every push (see the badge up top).

---

## 📄 License

[MIT](./LICENSE) © 2026 [Chykalophia](https://chykalophia.com)
