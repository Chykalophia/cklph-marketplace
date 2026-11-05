# Changelog

All notable changes to `cklph-youtube` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.1.0] — 2026-11-05

### Added
- `transcript`, ported from the claude.ai skill `youtube-transcript`.

### Changed (from the claude.ai version)
- Dependencies install into a private virtualenv instead of `pip install --break-system-packages` into whatever Python ran the script. On a Mac that meant Homebrew's Python; from a project's venv, that project's packages. The script now re-runs itself inside `~/.cache/cklph-youtube/venv`, and keeps the old install only as a fallback where a venv can't be created.
- `yt-dlp` runs as `python -m yt_dlp` from that venv, rather than relying on a `yt-dlp` on PATH.
- The VTT reader closes its file.
- Offline tests in `tests/`.
