# cklph-wp

Drive a remote WordPress site from Claude Code via **wp-cli over SSH** — the foundation layer for
`cklph-elementor` and `cklph-figma-to-wp`, and useful on its own for any WordPress work.

## What this is

The connection + data layer, distilled from real client work on managed hosts (Flywheel / WP Engine).
It encodes the things that actually bite you: SSH gateway slugs, per-command connections by default
(opt-in bounded multiplexing for rate-limited bursts), remote-shell quoting, the restricted shell (no `&&`, no `scp`), `/tmp` not being shared across backends, REST-hidden `_*`
meta, and `wp_slash()` semantics.

## What's inside

| Skill | Trigger |
|---|---|
| `wp-connect` | First wiring a WP site, SSH/wp-cli failures, before any live read/write. References `hosting-gotchas.md`. |
| `wp-data` | Reading/writing posts, meta (incl. protected `_*`), options, terms, users, media; seeding content. |
| `site-profile` | Start of work on a site; learning a new fact/quirk. Builds a per-project knowledge base (`.cklph-wp.d/site-profile.md`). |
| `version-docs` | Before writing PHP/JS/hook/widget code — match the *installed* versions via the installed source + version-pinned docs. |

**Script:** `scripts/cwp` — env-driven wp-cli wrapper (`CKLPH_WP_HOST` = an `~/.ssh/config` alias).
**Secure by default: no shared SSH socket** — a fresh connection per command, so nothing persists for
another same-user process to ride. Opt into bounded multiplexing for speed on a trusted machine with
`CKLPH_WP_MUX=1`, exactly `1` (idle-close `CKLPH_WP_PERSIST` 90s, hard cap `CKLPH_WP_MAXLIFE` 600s w/ auto-rotate +
watchdog; `cwp down` when done). Commands: `up`/`status`/`down` (connection), `wp` (passthrough),
`env`, `profile`, `meta-read`, `meta-write` (protected-safe), `eval`, `put`, `shell`.

## Setup

1. Add an SSH alias to `~/.ssh/config` (identity only; `cwp` sets the connection-sharing options
   itself, see `wp-connect`).
2. `export CKLPH_WP_HOST=my-wp`, or put `CKLPH_WP_HOST=my-wp` (and any other `CKLPH_WP_*` vars) in a
   `./.cklph-wp` **file** in the project. Per-site notes go in the `./.cklph-wp.d/` directory.
3. `cwp env` to confirm.

### Running `cwp` (PATH)

Skills in this plugin call the script as `"${CLAUDE_PLUGIN_ROOT}/scripts/cwp"`. Skills in other plugins
(`cklph-elementor`, `cklph-figma-to-wp`) and your own shell call it as bare `cwp`, which needs it on
PATH. Do this once, using the directory where this plugin is installed:

```bash
export PATH="<cklph-wp plugin dir>/scripts:$PATH"   # e.g. in ~/.zshrc; or symlink scripts/cwp into ~/bin
```

Without it, call it by its absolute path, `<cklph-wp plugin dir>/scripts/cwp` (inside a cklph-wp
skill that is `"${CLAUDE_PLUGIN_ROOT}/scripts/cwp"`; `scripts/cwp` alone only works from the plugin dir). `cwp wp ...` quotes each argument for the remote
shell, so write `cwp wp post update 12 --post_title='Two Words'` exactly as you would locally.

## Composes with

- **cklph-elementor** — builds on `cwp meta-read`/`meta-write` to read/write `_elementor_data`.
- **cklph-figma-to-wp** — the orchestrator that writes generated layouts in.

Not a replacement for wp-cli — a reliable, gotcha-aware harness around it.
