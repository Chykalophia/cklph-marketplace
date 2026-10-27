---
name: security-hardening
description: Security review checklist. Pull in during review or before shipping when changes touch user input, auth/authz, secrets, file/DB/network I/O, or external APIs.
---

# security-hardening — checklist

- **Input** — validate/escape at every boundary; parameterized queries (no string-built SQL); guard
  against injection (shell / SQL / XSS / path traversal).
- **AuthZ** — every mutation checks the actor; no IDOR; least privilege; correct client/role
  (e.g. service-role only after an admin check, never in a normal request path).
- **Secrets** — none in code, logs, or error messages; sourced from env / secret store; never echoed.
- **Data** — no sensitive data / PII in logs; safe defaults; correct encryption at rest/in transit.
- **Deps & headers** — no known-vuln dependencies; security headers where relevant.

Report findings by severity with `file:line` + fix (feeds the reviewer's security axis).

## Destructive commands (enforced on the CLI, a rule everywhere)
On the CLI, `hooks/destructive-command-gate.sh` blocks these Bash commands before they run. It needs
`jq` or `python3` to read the tool payload; with neither installed it fails open with a warning, so
there the rule is advisory like everywhere else. On
Desktop, web and Cowork no hook runs, so the rule is yours to apply: **don't run them without the
user's explicit OK for that exact command**, and offer the safer form first.

The hook header (`hooks/destructive-command-gate.sh`) owns this list; this table and the
`AGENTS.md` template mirror it, and the gate's test suite fails if either drops a rule. On the
CLI the gate also sees through wrappers (`sudo`, `env`, `timeout`…) and command strings
(`bash -c`, `eval`, `env -S`), and blocks nesting deeper than 3 levels it cannot read.

| Don't | Do instead |
|---|---|
| `rm -r` / `rm -rf` on `/`, `~`, `$HOME`, `.`, `..`, `*`, `/*`, `.*` (takes `.git`) or the repo root | name the exact directory (`rm -rf ./dist`) |
| `git push --force` / `-f` / `+branch` | `git fetch`, then `git push --force-with-lease` |
| `git push --mirror` / `--prune` | push the specific branch; delete a remote branch by name |
| `git reset --hard` | `git stash push -m "..."` first, or `git reset --keep` |
| `git checkout .` / `git restore .` | `git restore <path>`, or stash |
| `git clean -f` (any forced clean) | `git clean -n` dry run, then delete named paths |
| `git … --no-verify`, `git commit -n` | fix what the hook reports; if the hook is broken, say so |
| `DROP TABLE` / `DROP DATABASE` / `DROP SCHEMA` / `TRUNCATE` via a SQL client; `wp db drop` / `wp db reset` | a reviewed migration, a backup first, or a local database |
| `docker system prune` / `docker volume prune` (podman too) | remove the specific image or container; volumes hold data |
| `chmod 777`, or anything world-writable (`666`, `1777`, `a+rwx`, `a=rwx`, `o+w`) | `755` / `644`, or grant the one user or group |
| `npm publish` (or pnpm/yarn/bun) | `--dry-run` or `npm pack`, then hand the real publish to the user |
| `supabase db reset --linked` / `--db-url` / `--project-ref` | plain `supabase db reset` (local), or a migration + `supabase db push` |

**Escape hatch:** when the user has said yes to that exact command, prefix it with
`CKLPH_ALLOW_DESTRUCTIVE=1 ` (for example `CKLPH_ALLOW_DESTRUCTIVE=1 git push --force origin feat/x`).
It exempts the **whole Bash call**, so everything chained after it (`&&`, `;`, `|`) is exempt too:
never chain other commands onto it. It shows in the transcript, and exporting the variable does nothing. Never
add the prefix on your own judgment. The gate is a guard rail, not a sandbox: scripts, aliases, SQL
files and `$(...)` get past it (the hook header lists what it misses), so the rule still applies to them.
