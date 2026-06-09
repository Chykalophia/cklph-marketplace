# Changelog

All notable changes to `cklph-wp` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.3.0] — 2026-06-09

### Changed (security default)
- **No shared SSH socket is now the DEFAULT.** `cwp` opens a fresh connection per command and closes
  it — nothing persists for another same-user process to ride. Multiplexing is now **opt-in** via
  `CKLPH_WP_MUX=1` (still security-bounded: idle-close 90s, hard cap 600s w/ rotate, watchdog). The
  `CKLPH_WP_NOMUX` flag is gone (no-mux is the default; set `CKLPH_WP_MUX=1` for the old behavior).
  Trade-off: per-command connections are slower and can hit managed-host rate limits on bursts — set
  `CKLPH_WP_MUX=1` (e.g. in `./.cklph-wp`) on a trusted machine when you need throughput. Verified:
  default creates no socket; `CKLPH_WP_MUX=1` mode unaffected.
- `wp-connect` reframed around the secure default + the UID-is-the-boundary explanation.

## [0.2.2] — 2026-06-09

### Security
- **`CKLPH_WP_NOMUX=1` mode** — no shared control socket at all: every command opens its own
  connection and closes it, so nothing persists for another same-user process to ride. This is the
  only way to truly eliminate the shared-socket interception vector (a `ControlMaster` socket can't be
  locked to a single process — Unix sockets are UID-scoped only). `ControlMaster=no` overrides any mux
  in `~/.ssh/config`. Verified: creates no socket; regular mux mode unaffected.
- `wp-connect` documents the UID-boundary reality and the strongest local posture (NOMUX + `ssh-add -c`
  agent confirmation + `ssh-add -t` key expiry + not running untrusted code as your user).

## [0.2.1] — 2026-06-09

### Security
- **Bounded the multiplexed SSH master** — a long-lived authenticated control socket is a standing
  risk (same-user processes can ride it with no re-auth; a compromised machine = a live pipe to the
  host). Replaced the 4h persist with: idle-close `CKLPH_WP_PERSIST` (default **90s**), a hard
  lifetime cap `CKLPH_WP_MAXLIFE` (default **600s**) that **rotates** the connection (close + reopen
  with fresh auth) past the cap, and a **background watchdog** that force-closes the master at the cap
  even if `cwp` is never run again (then cleans up the socket).
- `cwp status` now reports connection **age** and time until rotate/close; `cwp down` closes and
  removes the socket + sidecar files. `wp-connect` documents the model and says to `cwp down` when done.
- Deterministic per-host control path so lifetime can be tracked. Verified live (watchdog force-closes
  after the cap with no activity; reopens cleanly).

## [0.2.0] — 2026-06-09

### Added
- **`site-profile` skill** — per-project knowledge base. Probe a site once into a committed
  `.cklph-wp/site-profile.md` (versions, plugins, post types, taxonomies, custom fields, data
  structures, quirks, which templates actually render), read it at task start, keep it updated.
  Includes `references/profile-template.md` and the ACF/custom-field probe pattern.
- **`version-docs` skill** — write code for the *installed* versions: read the installed source as
  ground truth (control names, hooks, signatures), pull version-pinned docs (Context7 / WebFetch),
  verify on the install. Don't code WP/Elementor/Woo/ACF APIs from memory.
- **`cwp profile`** command — emits the markdown baseline for the site profile.

### Changed
- **`cwp` enforces SSH multiplexing itself** — `ControlMaster=auto` + `ControlPersist=4h`
  (`CKLPH_WP_PERSIST`) + `ServerAliveInterval` on every call, so one connection stays open and you
  don't time out mid-task. No longer depends on the `~/.ssh/config` alias defining it.
- **New `cwp up` / `cwp status` / `cwp down`** — open / check / close the kept-open master.
- `wp-connect` updated: the SSH alias now only needs identity; multiplexing is enforced by the wrapper.

## [0.1.0] — 2026-06-09

### Added
- Initial release, distilled from Flywheel/WP Engine client work.
- `wp-connect` skill — multiplexed SSH alias, slug/agent troubleshooting, the `cwp` wrapper.
- `wp-connect/references/hosting-gotchas.md` — restricted shell (no `&&`/`scp`), `/tmp` not shared vs
  shared webroot, protected `_*` meta + `wp_slash`, `data:` URI stripping, CDN cache-busting.
- `wp-data` skill — inspect/create/update posts, protected/large/serialized meta via streamed write,
  seeding content (e.g. WooCommerce reviews) through a webroot-hosted PHP eval-file.
- `scripts/cwp` — env-driven (`CKLPH_WP_HOST`) wp-cli wrapper with protected-safe `meta-write`
  (base64 over stdin + `wp_slash`), `put` (webroot upload), `eval`, and raw passthrough.
