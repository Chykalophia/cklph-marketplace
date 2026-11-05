# cklph-youtube

Get a YouTube video's transcript when YouTube is blocking you, which from cloud IPs is most of the time.

| Skill | Trigger |
|---|---|
| `transcript` | Any YouTube link (youtube.com, youtu.be, shorts) where the user wants the transcript, a summary, key points, or "what does this video say". |

## How it works

`skills/transcript/scripts/get_transcript.py` gets title and channel via oEmbed, then tries five methods in order and stops at the first that works: `youtube-transcript-api`, the same through a proxy (if `YT_PROXY_HTTPS` or `YT_PROXY_HTTP` is set), the watch page's caption tracks, `yt-dlp` across six player clients, and `yt-dlp` through a proxy. It writes `transcript-<video-id>.txt` (or `--out FILE`), prints one JSON line (`ok`, `no_captions`, or `blocked_or_failed`) and logs every attempt to stderr. When everything is blocked, the skill falls back to a scraping connector, a browser on the user's own machine, or asking the user to paste the transcript.

**Dependencies** (`youtube-transcript-api`, `yt-dlp`) install into a private virtualenv at `~/.cache/cklph-youtube/venv` (`$XDG_CACHE_HOME` respected; override with `CKLPH_YT_VENV`), not into the system Python or whatever venv you happen to be in. The one exception: where a venv can't be created at all (some cloud sandboxes), it installs into the Python that ran it, with `--break-system-packages` when that Python isn't a venv, and says so on stderr. They're upgraded on each run because YouTube breaks old `yt-dlp` versions often. Needs Python 3.9+ with the `venv` module.

## Tests

`bash plugins/cklph-youtube/tests/get_transcript.test.sh`: offline, no network. Covers video-ID parsing, VTT parsing and formatting, and where dependencies get installed.

## Composes with

- **cro-research-reporting**: use transcripts as sourced input to research.
