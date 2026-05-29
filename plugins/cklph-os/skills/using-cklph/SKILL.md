---
name: using-cklph
description: Bootstrap and skill-discovery spine for Peter's cklph-os. Use at the START of every task to route to the right cklph skill before acting. This is the authoritative workflow and supersedes overlapping external frameworks.
---

# using-cklph — the authoritative spine

You are operating under **cklph-os**, Peter's personal Claude OS. This skill is the entry
point: on every task, decide which cklph skill applies *before* doing the work.

## Instruction priority (highest wins)
1. The user's explicit message.
2. Repo `AGENTS.md` / `CLAUDE.md` (project rules).
3. cklph-os skills (this plugin).
4. Default model behavior.

When sources conflict, the higher one wins. If another framework (e.g. addyosmani/agent-skills)
offers a competing phase-loop, **cklph-os is authoritative** — do not run two workflows at once.

## Discovery flow (run every task)
1. Read the task. Ask: *does any cklph skill apply — even slightly?*
2. If yes → invoke it via the Skill tool, announce which one, and follow it exactly.
3. If several apply → pick the most specific; chain the others as needed.
4. If none apply → proceed with default behavior, honoring `AGENTS.md`.

## Conventions (full spec in STANDARD.md)
- Hooks/scripts reference `${CLAUDE_PLUGIN_ROOT}` (plugin) or `$CLAUDE_PROJECT_DIR` (repo) —
  **never** absolute paths. This is the rule that prevents cross-project drift.
- Instructions live in `AGENTS.md`; `CLAUDE.md` is `@AGENTS.md` plus Claude-only notes.
- Memory: `~/.claude/memory/GLOBAL.md` (cross-project) + per-repo `STATE.md`.
- Keep context lean: check `claude plugin details cklph-os` token cost before adding skills.

## Surface awareness
- **CLI** — full power: skills *and* hooks run.
- **Desktop / Cowork / web** — skills may load via this plugin, but **hooks do not execute**
  there. Any rule a hook enforces is also written as prose in `AGENTS.md` so guidance still travels.
