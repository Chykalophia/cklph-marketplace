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
- Skill usage is logged locally for the weekly review; nothing leaves the machine.
- No destructive commands without the user's OK for that exact command: `rm -r` / `rm -rf` on `/`,
  `~`, `$HOME`, `.`, `..`, `*`, `/*`, `.*` or the repo root; `git push --force` / `-f` / `+branch` (use `--force-with-lease`) and
  `git push --mirror` / `--prune`; `git reset --hard`, `git checkout .`, `git restore .`, `git clean -f` (stash or
  `git clean -n` first); `git … --no-verify` and `git commit -n`; `DROP TABLE` / `DROP DATABASE` /
  `DROP SCHEMA` / `TRUNCATE` via a SQL client; `wp db drop` / `wp db reset`; `docker system prune` /
  `docker volume prune` (podman too); `chmod 777` or anything world-writable (`666`, `a+rwx`, `o+w`); `npm publish` / `pnpm publish` / `yarn publish` /
  `bun publish` (use `--dry-run`); `supabase db reset` against a remote project. On the CLI a hook blocks these; the
  user-approved bypass is the `CKLPH_ALLOW_DESTRUCTIVE=1 ` prefix, which exempts the whole Bash
  call, so never chain anything onto it. The hook also checks through `sudo`/`env`/`timeout` and
  `bash -c`/`eval` strings. This mirrors the cklph-os gate; keep them in step.

## Do not
- <project-specific anti-patterns>
