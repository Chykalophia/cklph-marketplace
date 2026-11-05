# Changelog

All notable changes to `cklph-youtube` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.1.0] — 2026-11-05

### Added
- `transcript`, ported from the claude.ai skill `youtube-transcript`.

### Changed (from the claude.ai version)
- Dependencies install into a private virtualenv instead of `pip install --break-system-packages` into whatever Python ran the script. On a Mac that meant Homebrew's Python; from a project's venv, that project's packages. The script now re-runs itself inside `~/.cache/cklph-youtube/venv`, and keeps the old install only as a fallback where a venv can't be created.
- `yt-dlp` runs as `python -m yt_dlp` from that venv, rather than relying on a `yt-dlp` on PATH.
- The VTT reader closes its file, and drops only rolling repeats: a line that genuinely recurs later
  ("Yeah.") is kept instead of silently lost.
- With several subtitle files, the first `--lang` wins (exact code before variants such as `en-orig`),
  not the alphabetically first file.
- Output goes to `transcript-<video-id>.txt` by default, so transcripts no longer overwrite each other;
  the output file is closed properly, and yt-dlp's temp folder is removed even when it fails.
- `YT_PROXY_HTTP` alone now enables the proxy methods (they needed `YT_PROXY_HTTPS`).
- Captions that are only a number ("2024") are kept; cue identifiers are recognised by the timing line
  under them. HTML entities (`&amp;`, `&#39;`) are decoded.
- A bot check on one yt-dlp player client moves on to the next instead of abandoning all six.
- The skill routes `no_captions` straight to the no-captions guidance, and reads `attempts` before
  treating exit 3 as a block.
- Offline tests in `tests/` (19), each fix included.
