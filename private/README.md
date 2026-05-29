# `private/` — your private overlay (gitignored)

Everything in this folder **except this README** is gitignored — drop your personal, internal, or
client-specific skills, references, and notes here and they'll never be committed or pushed.

## What goes here
- Private notes / context (e.g. `context.md`) — internal project names, infra, client specifics.
- Private reference files your own skills load.

## Private SKILLS that must actually LOAD
Gitignored files here are **not** in the marketplace clone, so a private *skill* placed here won't load
when cklph-os is installed from GitHub. For private skills that must load alongside the public OS, put
them in **`~/.claude/skills/`** — user-level, loaded by Claude Code regardless of install method, and
never in any repo. Keep private *knowledge* in **`~/.claude/memory/GLOBAL.md`**.

The public cklph-os is the shareable core; your private layer stays yours.
