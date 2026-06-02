# 🧰 Using cklph outside Claude Code

> [!NOTE]
> **TL;DR — there are two ways, and you pick per tool:**
>
> - **Path A — Host Claude Code.** Run the `claude` CLI inside your tool's terminal. **Everything works** — skills, commands, agents, hooks. Full power, zero porting.
> - **Path B — Port the content.** Copy the cklph markdown into your tool's own rules/commands. **The thinking works; the automation doesn't.** No sub-agent waves, no quality-gate hooks.
>
> This marketplace is **built for Claude Code** — that's where it's strongest. But the skills are just markdown, so most of the *method* travels. Below: the two paths explained once, then a short block per tool.

---

## ⚡ The 60-second version

Find your tool, pick a path.

| Your tool | Path A — host `claude` | Path B — native port lands at | What porting loses |
| --- | :-: | --- | --- |
| **Cursor** | ✅ terminal | `.cursor/skills/<name>/SKILL.md` *(skills drop in as-is!)* + `AGENTS.md` | hooks, sub-agent waves |
| **Warp** | ✅ it *is* a terminal | `AGENTS.md` / `WARP.md` in repo | hooks, sub-agent waves |
| **VS Code + Copilot** | ✅ terminal *(+ official extension)* | `AGENTS.md` or `.github/copilot-instructions.md` + `.github/prompts/` | hooks, sub-agent waves |
| **Windsurf** | ✅ terminal | `.windsurf/rules/` + `.windsurf/workflows/` | hooks, sub-agent waves, `AGENTS.md` |
| **Cline / Roo** | ✅ same VS Code terminal | `.clinerules/` · `.roo/rules/` *(both read `AGENTS.md`)* | hooks, sub-agent waves |
| **Any terminal** | ✅ always | — | — |
| **Chat-only AI** (claude.ai, ChatGPT, Gemini) | ❌ | paste a `SKILL.md` body into the chat / a Project | everything except the prose |

**Rule of thumb:** want the *real thing* → **Path A**. Want it inside your editor's own AI → **Path B**.

---

## Path A — Host Claude Code (full fidelity)

Claude Code is just a command-line program. Anything with a terminal can run it — and then you get **100% of cklph**, unchanged.

**Steps (any tool):**

1. Open your tool's built-in terminal.
2. Install the CLI (once):
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
3. Start it:
   ```bash
   claude
   ```
4. Add the marketplace + install the plugin (once):
   ```bash
   /plugin marketplace add Chykalophia/cklph-marketplace
   /plugin install cklph-os@cklph
   ```
5. Restart the CLI so skills load. Done — `/cklph-os:flow`, the agents, and the hooks all work.

> [!TIP]
> This is the **same experience you'd get in a standalone terminal**. Your editor just becomes the place you read code while Claude Code does the work. Nothing is lost.

---

## Path B — Port the content (native, lossy)

If you'd rather drive your tool's **own** AI (Cursor's Agent, Copilot, Cascade…), you can copy the cklph *method* into that tool. You keep the playbook; you give up the machinery.

> [!WARNING]
> **What you always lose on Path B**, in every tool:
> - **Hooks** — the `pre-commit-gate`, `security-check`, and `nextjs-quality-check` gates are Claude-Code-only.
> - **Sub-agent waves** — the `flow` orchestrator and the `cklph-implementer` / `cklph-reviewer` / `red-team` agents don't exist outside Claude Code.
> - **Auto-routing** — `start-here` won't auto-pick a skill; you invoke things by hand.
>
> What you **keep**: the actual thinking — spec → plan → build → review → verify discipline, the design/security/debugging checklists, the daily-rhythm skills.

### The universal porting recipe

Every cklph skill is a `SKILL.md` file: a few lines of frontmatter, then markdown prose. Porting is the **same three moves everywhere**:

1. **Open** the skill you want, e.g. `plugins/cklph-os/skills/spec/SKILL.md`.
2. **Copy the body** (the markdown *under* the `---` frontmatter block).
3. **Paste it** into your tool's rule or command file (paths per tool below). Keep the `name` and `description` if the tool uses frontmatter; drop them if it doesn't.

> [!TIP]
> **Two shortcuts that do most of the work for free:**
> - **`AGENTS.md`** — a plain markdown instructions file in your repo root. **Cursor, Warp, Copilot/VS Code, Cline, and Roo all read it automatically.** Put your must-follow cklph rules here once and five tools obey them. *(Windsurf is the holdout — it uses `.windsurf/rules/` instead.)*
> - **`.agents/skills/`** — an emerging cross-tool skills folder. Drop a cklph skill directory here and tools like Cursor pick it up without per-tool setup.

---

## 🛠️ Per-tool blocks

Each tool, both paths, the exact path, and the one quirk worth knowing.

### Cursor

- **Path A:** open the terminal → follow [Path A](#path-a--host-claude-code-full-fidelity). Full fidelity.
- **Path B (native):** Cursor reads three things you can use:
  - **Skills** → `.cursor/skills/<name>/SKILL.md`. **cklph skills are already in this exact format** — copy a skill folder in almost as-is. Invoke with `/<skill-name>` or attach with `@`.
  - **Rules** → `.cursor/rules/*.mdc` (frontmatter: `description`, `globs`, `alwaysApply`; types: Always / Auto-Attached / Agent-Requested / Manual). Good for "always-on" cklph principles.
  - **`AGENTS.md`** in repo root — the simplest option; auto-applied.

> [!NOTE]
> **Quirk:** a plain `.md` in `.cursor/rules/` is **ignored** — rules must use the `.mdc` extension with frontmatter. Skills use `SKILL.md`; rules use `.mdc`. Don't mix them up.

### Warp

- **Path A:** Warp **is** a terminal — running `claude` is first-class. This is the recommended path; you lose nothing.
- **Path B (native):**
  - **Project rules** → put an **`AGENTS.md`** (or `WARP.md`) in your repo root. Warp's Agent Mode reads it automatically.
  - **Global rules** → Warp Drive → Personal → Rules (applies across all projects).

> [!NOTE]
> **Quirk:** Warp blurs the line — you can keep an `AGENTS.md` for its native agent *and* run `claude` in the same window. Many people do both.

### VS Code + GitHub Copilot

- **Path A:** use the integrated terminal, or install the **official Claude Code VS Code extension**. Full fidelity.
- **Path B (native):** Copilot reads several customization files:
  - **`AGENTS.md`** (and `CLAUDE.md`) — read as always-on instructions. Easiest port.
  - **`.github/copilot-instructions.md`** — repo-wide instructions.
  - **`*.instructions.md`** with an `applyTo` glob — scope rules to specific paths.
  - **Prompt files** → `.github/prompts/<name>.prompt.md`, invoked in chat as `/<name>` — the closest match to a cklph slash command.

> [!NOTE]
> **Quirk:** Copilot splits "standing context" (instructions files) from "on-demand actions" (prompt files). Map cklph *principles* → instructions; map cklph *phase commands* → prompt files.

### Windsurf

- **Path A:** Windsurf is a VS Code fork — use its terminal → [Path A](#path-a--host-claude-code-full-fidelity).
- **Path B (native):** Cascade reads:
  - **Rules** → `.windsurf/rules/*.md` (activation modes: Always On / Manual / Model-Decision / Glob). Use for cklph principles.
  - **Workflows** → `.windsurf/workflows/<name>.md`, invoked in Cascade as `/<name>`. **Manual-only** (Cascade never auto-runs them). Map cklph phase commands here.

> [!NOTE]
> **Quirk:** Windsurf is the one tool here that **doesn't pick up the shared `AGENTS.md` automatically** — give it its own `.windsurf/rules/` instead.

### Cline / Roo Code

Both are open-source agents running as VS Code extensions.

- **Path A:** they live in VS Code, which has a terminal — so you can run `claude` right next to them, fully independent. Full fidelity.
- **Path B (native):**
  - **Cline rules** → `.clinerules/` directory (it merges every `.md`/`.txt` inside). Also reads `AGENTS.md`.
  - **Roo rules** → `.roo/rules/` directory (fallback: a `.roorules` file). Also reads `AGENTS.md` (toggle: `roo-cline.useAgentRules`). Roo adds **Custom Modes** + **Slash Commands** for phase-style invocation.

> [!NOTE]
> **Quirk:** both honor `AGENTS.md`, so the [universal `AGENTS.md` trick](#the-universal-porting-recipe) covers the basics with zero tool-specific files.

---

## 🌐 Catch-all: any terminal

No special tool needed. On macOS Terminal, iTerm, Linux, WSL, or any SSH session: just [Path A](#path-a--host-claude-code-full-fidelity). If you can run `npm` and `claude`, you have the full marketplace.

## 💬 Catch-all: chat-only AI (claude.ai, ChatGPT, Gemini)

No terminal, no file access — but you can still borrow the *thinking*:

1. Open a cklph skill, e.g. `plugins/cklph-os/skills/spec/SKILL.md`.
2. Copy the markdown **body**.
3. Paste it into the chat as a system/Project instruction (ChatGPT **Projects**, Claude **Projects**, or Gemini **Gems** all keep it persistent), then describe your task.

> [!WARNING]
> This is the **lowest-fidelity** path: prose only. No file edits, no commands, no agents, no hooks. Good for using a single skill as a thinking framework — not for building.

---

## ✅ What ports and what doesn't (honest)

| cklph piece | Path A (host `claude`) | Path B (native port) |
| --- | :-: | :-: |
| Skills (the method/prose) | ✅ full | ✅ copy as rules/commands |
| Slash commands (`/flow`, `/spec`…) | ✅ full | 🟡 rebuild as prompt files / workflows |
| `start-here` auto-routing | ✅ full | ❌ invoke by hand |
| Sub-agent waves + `flow` orchestrator | ✅ full | ❌ not available |
| `cklph-implementer` / `reviewer` / `red-team` | ✅ full | ❌ not available |
| Quality-gate hooks | ✅ full | ❌ not available |
| `AGENTS.md` project rules | ✅ full | ✅ (except Windsurf) |

**Bottom line:** Path A is the marketplace as designed. Path B gives you the cklph *playbook* inside your editor's own AI — worth it if that's where you live, as long as you know the gates and agents stay behind in Claude Code.

---

*Questions or a tool we missed? Open an issue on [cklph-marketplace](https://github.com/Chykalophia/cklph-marketplace).*
