# Changelog

Marketplace-level changes only: plugins added or removed, catalog and repo layout. Each plugin keeps
its own version history in `plugins/<name>/CHANGELOG.md` (cklph-os included).
Format: [Keep a Changelog](https://keepachangelog.com).

## 2026-10-27

### Changed
- Repo cleanup: cklph-os's version history moved from this file to
  `plugins/cklph-os/CHANGELOG.md`, like every other plugin. This file now records marketplace
  events only; the marketplace-level entries that history carried (repo rename, `cklph-nextjs`
  launch, marketplace manifest, `private/` overlay) moved here under their dates.
- Catalog: `marketplace.json` descriptions now copy each `plugin.json` verbatim (five had drifted);
  `plugin.json` owns them.
- README lists all eleven plugins, grouped, with what each pairs with; `cklph-os` gets its own
  README like every other plugin. STANDARD.md §4 describes the marketplace layout (it still showed
  the single-plugin repo) and the real install command.
- CI runs every plugin's tests, not just the cklph-os hooks: cwp, el-tools, the cklph-audit
  wrappers and engine, vuln-intel-ext (including a check that the committed `dist/` matches
  `src/`) and the regression-watch engine and self-test.
- `docs/ideas/cklph-os.md` is marked historical.
- Cleanup across the plugins touched in PRs #35–#40: see each affected plugin's CHANGELOG for 2026-10-27.

## 2026-10-26

### Removed
- Two private plugins moved out of the public marketplace.

## 2026-06-09

### Added
- `cklph-regression-watch`: on-demand site regression monitor (baseline a site, surface only
  confirmed regressions with evidence).

## 2026-06-01

### Changed
- The hosting **GitHub repo was renamed** from `Chykalophia/cklph-os` → `Chykalophia/cklph-marketplace`.
  Better reflects what it is — a marketplace hosting several plugins, not a single plugin named
  after its first child. GitHub provides a redirect from the old URL; existing marketplace
  registrations continue to work, but the canonical URL is now the new one.
- **README rewritten** to reflect the marketplace structure (one repo, several plugins) instead of
  the original "cklph-os is a plugin" framing.

## 2026-05-30

### Added
- **`cklph-nextjs` v0.1.0**: opinionated Next.js + Supabase patterns as a sibling plugin in the
  `cklph` marketplace, composing with `vercel:*` framework skills rather than replacing them.
  Install: `claude plugin install cklph-nextjs@cklph`. Its own version log is
  `plugins/cklph-nextjs/CHANGELOG.md`.

## 2026-05-29

### Added
- The `cklph` marketplace manifest (`.claude-plugin/marketplace.json`), with `cklph-os` as its
  first plugin.
- **Private overlay**: `private/` (gitignored except its README) for personal/internal/client skills,
  refs, and notes; documented the user-level private layer (`~/.claude/skills/`, `~/.claude/memory/GLOBAL.md`).

### Changed
- **Privacy:** scrubbed internal/client project names from docs (and history), generic placeholders now.
  The public repo is the shareable core.
