<div align="center">

# 🧩 cklph-os

### A personal **Claude OS** — your skills, automations & conventions in one versioned plugin.

[![Tests](https://github.com/Chykalophia/cklph-os/actions/workflows/test.yml/badge.svg)](https://github.com/Chykalophia/cklph-os/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-d97757)

*Built by [Chykalophia](https://chykalophia.com) · maintained by [@PiotrKrzyzek](https://github.com/PiotrKrzyzek)*

</div>

---

> [!NOTE]
> **TL;DR** — cklph-os is a Claude Code **plugin** that carries your reusable **skills**, **quality-gate
> hooks**, and **conventions** across every repo and machine. Install once → the same Claude everywhere.

---

## 🧠 Why it exists

Reusable AI-assistant config copy-pasted from repo to repo **drifts**:

- hooks point at folders that no longer exist,
- rules fall out of sync,
- every project slowly diverges.

**cklph-os keeps that config in one versioned place — referenced, never copied.**

---

## ✨ What you get

| | |
| --- | --- |
| 🧭 **Bootstrap spine** | `using-cklph` routes each task to the right skill — one authoritative workflow. |
| 🛡️ **Quality-gate hooks** | Next.js checks, secret scanning, and a pre-commit gate (TypeScript + ESLint + Semgrep). |
| 🤖 **Agentic builds** | A 7-phase flow — `refine→spec→plan→build→review→verify→ship`, each a standalone `/cklph-os:<phase>` — plus a `/cklph-os:flow` orchestrator (full-agentic / partial / interactive) running `cklph-reviewer` + `cklph-implementer` sub-agent waves. **Self-correcting:** plan-check loop, verify→gap→rebuild, two-axis review. |
| 📐 **Conventions** | `AGENTS.md` as the single source, a thin `CLAUDE.md` `@import`, a global memory layer, templates. |

> [!IMPORTANT]
> Every hook is pathed via `${CLAUDE_PLUGIN_ROOT}` — **never an absolute path**. That single rule is
> what stops the cross-repo drift.

---

## 🚀 Quick start

**Claude Code (CLI)**

```bash
/plugin marketplace add Chykalophia/cklph-os
/plugin install cklph-os@cklph
```

**Claude Desktop**

> [!TIP]
> Add the marketplace under **Settings → Plugins** (point it at this repo), then install `cklph-os`.
> Hooks run on the **CLI only** — Desktop loads skills, commands & agents.

---

## 🔧 The build flow

Seven composable phases — run one standalone, or chain them with the orchestrator.

| Phase | Command | Does |
| --- | --- | --- |
| refine | `/cklph-os:refine` | sharpen a vague idea *(optional)* |
| spec | `/cklph-os:spec` | requirements + acceptance criteria |
| plan | `/cklph-os:plan` | decompose into a wave task-graph |
| build | `/cklph-os:build` | execute via sub-agent waves |
| review | `/cklph-os:review` | adversarial review |
| verify | `/cklph-os:verify` | run checks + acceptance |
| ship | `/cklph-os:ship` | open a PR |

> [!TIP]
> **`/cklph-os:flow <goal>`** runs the whole loop and asks your mode first:
> **full-agentic** (autonomous; stops only at hard gates) · **partial** (pause per phase) ·
> **interactive** (collaborate at each step).

## 🖥️ Surface support

Honest about where each layer actually works:

| Layer  | CLI | Desktop / Cowork           | Web                   |
| ------ | :-: | -------------------------- | --------------------- |
| Skills | ✅  | ✅ *(via marketplace UI)*  | repo-committed only   |
| Hooks  | ✅  | ❌ *(CLI-only)*            | ❌                    |
| MCP    | ✅  | ✅ *(claude_desktop_config)* | connectors          |

---

## 🗂️ What's inside

<details>
<summary><strong>Repository layout</strong> (click to expand)</summary>

```text
cklph-os/
├── plugins/cklph-os/
│   ├── .claude-plugin/plugin.json
│   ├── skills/                  # flow + phases (refine·spec·plan·build·review·verify·ship) + support (debugging·security-hardening·simplify·api-design) + using-cklph
│   ├── agents/                  # cklph-reviewer · cklph-implementer
│   ├── commands/                # /cklph-os:flow + /cklph-os:{refine,spec,plan,build,review,verify,ship}
│   └── hooks/                   # nextjs-quality-check · security-check · pre-commit-gate (+ hooks.json)
├── templates/                   # AGENTS.md · CLAUDE.md · STATE.md starters
├── test/                        # bats tests for the hooks
├── .claude-plugin/marketplace.json
└── STANDARD.md                  # the spec everything follows
```

</details>

---

## 🧱 How it's organized

Three layers, each with **one source of truth**:

1. **Portable core** — `AGENTS.md` (+ thin `CLAUDE.md`), committed per repo.
2. **Shared plugin** — this repo: skills, hooks, conventions, installed once per machine.
3. **User layer** — global memory + MCP servers on the CLI.

📖 Full design → **[STANDARD.md](./STANDARD.md)**

---

## 🎯 Principles

1. **One source of truth** per concern.
2. **Reference, never hardcode** — `${CLAUDE_PLUGIN_ROOT}` / `$CLAUDE_PROJECT_DIR`.
3. **Boring wins** — plain files, git-tracked, transparent.
4. **Measure before adding** — check `claude plugin details cklph-os` token cost.

---

## 🧪 Testing

```bash
bats test/
```

CI runs the suite on every push (see the badge up top).

---

## 📄 License

[MIT](./LICENSE) © 2026 [Chykalophia](https://chykalophia.com)
