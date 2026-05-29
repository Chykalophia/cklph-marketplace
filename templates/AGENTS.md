# AGENTS.md

> Source of truth for AI-agent instructions in this repo. Read by Claude (via `CLAUDE.md`'s
> `@AGENTS.md` import) and by other AGENTS.md-aware tools (Codex, Cursor, Gemini CLI, …).
> Keep rules HERE — never duplicate them into CLAUDE.md.

## Project
- **Name:** <project>
- **Stack:** <e.g. Next.js 16 + TypeScript + Supabase>
- **Branch rule:** never commit to `main`/`dev` directly — feature branch per task.

## Conventions
- <coding conventions, naming, directory structure, libraries to prefer/avoid>

## Quality gates
On the CLI these are enforced automatically by **cklph-os** hooks (TypeScript, ESLint, security
scan, pre-commit gate). On surfaces without hooks (Desktop / Cowork / web), apply them manually:
- Type-check and lint before considering work done.
- No hardcoded secrets.
- No absolute paths in configs/hooks — use `$CLAUDE_PROJECT_DIR` or `${CLAUDE_PLUGIN_ROOT}`.

## Do not
- <project-specific anti-patterns>
