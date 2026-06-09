# cklph-wp

Drive a remote WordPress site from Claude Code via **wp-cli over SSH** — the foundation layer for
`cklph-elementor` and `cklph-figma-to-wp`, and useful on its own for any WordPress work.

## What this is

The connection + data layer, distilled from real client work on managed hosts (Flywheel / WP Engine).
It encodes the things that actually bite you: SSH gateway slugs, multiplexing to dodge rate limits,
the restricted shell (no `&&`, no `scp`), `/tmp` not being shared across backends, REST-hidden `_*`
meta, and `wp_slash()` semantics.

## What's inside (v0.2.0)

| Skill | Trigger |
|---|---|
| `wp-connect` | First wiring a WP site, SSH/wp-cli failures, before any live read/write. References `hosting-gotchas.md`. |
| `wp-data` | Reading/writing posts, meta (incl. protected `_*`), options, terms, users, media; seeding content. |
| `site-profile` | Start of work on a site; learning a new fact/quirk. Builds a per-project knowledge base (`.cklph-wp/site-profile.md`). |
| `version-docs` | Before writing PHP/JS/hook/widget code — match the *installed* versions via the installed source + version-pinned docs. |

**Script:** `scripts/cwp` — env-driven wp-cli wrapper (`CKLPH_WP_HOST` = an `~/.ssh/config` alias).
**Secure by default: no shared SSH socket** — a fresh connection per command, so nothing persists for
another same-user process to ride. Opt into bounded multiplexing for speed on a trusted machine with
`CKLPH_WP_MUX=1` (idle-close `CKLPH_WP_PERSIST` 90s, hard cap `CKLPH_WP_MAXLIFE` 600s w/ auto-rotate +
watchdog; `cwp down` when done). Commands: `up`/`status`/`down` (connection), `wp` (passthrough),
`env`, `profile`, `meta-read`, `meta-write` (protected-safe), `eval`, `put`, `shell`.

## Setup

1. Add a multiplexed SSH alias to `~/.ssh/config` (see `wp-connect`).
2. `export CKLPH_WP_HOST=my-wp` (or create `./.cklph-wp` in the project).
3. `cwp env` to confirm.

## Composes with

- **cklph-elementor** — builds on `cwp meta-read`/`meta-write` to read/write `_elementor_data`.
- **cklph-figma-to-wp** — the orchestrator that writes generated layouts in.

Not a replacement for wp-cli — a reliable, gotcha-aware harness around it.
