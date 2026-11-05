#!/usr/bin/env python3
"""
Fetch a YouTube transcript with an automatic fallback chain.

Usage:
  python3 get_transcript.py <url-or-id> [--lang en,es] [--out FILE] [--timestamps]
  --out defaults to transcript-<video-id>.txt in the current directory, so transcripts of
  different videos never overwrite each other.

Fallback order (stops at first success):
  1. youtube-transcript-api (current 1.x instance API)
  2. youtube-transcript-api via proxy (only if YT_PROXY_HTTPS or YT_PROXY_HTTP is set)
  3. Watch-page scrape -> captionTracks -> timedtext XML
  4. yt-dlp auto/manual subtitles (system CA certs, several player clients,
     cookies if YT_COOKIES_FILE set)
  5. yt-dlp via proxy (only if YT_PROXY_HTTPS or YT_PROXY_HTTP is set)

If all fail from the sandbox (cloud IPs get blocked often), the SKILL.md lists
non-script fallbacks: scraping connectors, browser automation on the user's
own machine, then asking the user to paste.

Exit codes: 0 = success, 2 = no captions exist, 3 = all methods blocked/failed.
Every attempt is logged to stderr so the caller can report what was tried.

Dependencies (youtube-transcript-api, yt-dlp) go into a private virtualenv at
$XDG_CACHE_HOME/cklph-youtube/venv (default ~/.cache/cklph-youtube/venv), never into
the system Python. Override the location with CKLPH_YT_VENV. Only if a venv can't be
created (some sandboxes) does it fall back to installing into the running Python.
"""
import argparse, json, os, re, shutil, subprocess, sys, glob, tempfile, urllib.request

def proxy_url():
    """One proxy for both schemes: HTTPS wins, HTTP alone is enough."""
    return os.environ.get("YT_PROXY_HTTPS") or os.environ.get("YT_PROXY_HTTP")

VENV = os.environ.get("CKLPH_YT_VENV") or os.path.join(
    os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache"), "cklph-youtube", "venv")

def log(msg): print(f"[transcript] {msg}", file=sys.stderr, flush=True)

def in_venv(): return sys.prefix != sys.base_prefix

def ensure_venv():
    """Re-exec once inside the private venv, creating it on first use."""
    # Test for OUR venv, not any venv: run from inside a project's venv, it must not install into that one.
    if os.path.realpath(sys.prefix) == os.path.realpath(VENV) or os.environ.get("CKLPH_YT_NO_VENV"): return
    py = os.path.join(VENV, "bin", "python")
    if not os.path.exists(py):
        log(f"first run: creating {VENV}")
        r = subprocess.run([sys.executable, "-m", "venv", VENV], capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(py):
            log("could not create a venv; installing into the running Python instead")
            os.environ["CKLPH_YT_NO_VENV"] = "1"; return
    os.execv(py, [py, os.path.abspath(__file__)] + sys.argv[1:])

def extract_id(s):
    s = s.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", s): return s
    for pat in [r"youtu\.be/([A-Za-z0-9_-]{11})", r"[?&]v=([A-Za-z0-9_-]{11})",
                r"/(?:shorts|embed|live|v)/([A-Za-z0-9_-]{11})"]:
        m = re.search(pat, s)
        if m: return m.group(1)
    raise SystemExit(f"Could not parse a video ID from: {s}")

def pip_install(pkg):
    # -U every run keeps yt-dlp current; YouTube breaks old versions often. Harmless inside the private
    # venv. --break-system-packages only on the no-venv fallback, where the Python is a throwaway sandbox.
    cmd = [sys.executable, "-m", "pip", "install", "-q", "-U", pkg]
    if not in_venv(): cmd.append("--break-system-packages")
    subprocess.run(cmd, capture_output=True)

def metadata(vid):
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json"
        with urllib.request.urlopen(url, timeout=15) as r:
            d = json.load(r); return {"title": d.get("title"), "channel": d.get("author_name")}
    except Exception as e:
        log(f"oEmbed metadata failed ({e.__class__.__name__}); continuing"); return {}

def fmt(segs, timestamps):
    if not timestamps: return " ".join(t for _, t in segs if t)
    out = []
    for start, t in segs:
        m, s = divmod(int(start), 60); h, m = divmod(m, 60)
        out.append(f"[{h:d}:{m:02d}:{s:02d}] {t}" if h else f"[{m:02d}:{s:02d}] {t}")
    return "\n".join(out)

NO_CAPTIONS = "NO_CAPTIONS"

def via_api(vid, langs, proxy=False):
    pip_install("youtube-transcript-api")
    from youtube_transcript_api import YouTubeTranscriptApi
    kwargs = {}
    if proxy:
        from youtube_transcript_api.proxies import GenericProxyConfig
        kwargs["proxy_config"] = GenericProxyConfig(
            http_url=os.environ.get("YT_PROXY_HTTP") or proxy_url(), https_url=proxy_url())
    api = YouTubeTranscriptApi(**kwargs)
    try:
        fetched = api.fetch(vid, languages=langs)
    except Exception as e:
        name = e.__class__.__name__
        if name in ("TranscriptsDisabled",): return NO_CAPTIONS
        if name == "NoTranscriptFound":
            # try any available language, translated to first requested lang if possible
            tl = api.list(vid)
            t = next(iter(tl))
            try: t = t.translate(langs[0])
            except Exception: pass
            fetched = t.fetch()
        else:
            raise
    return [(s.start, s.text.replace("\n", " ")) for s in fetched]

def parse_vtt(path):
    segs, start = [], 0.0
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()
    for line in lines:
        line = line.strip()
        m = re.match(r"(\d+):(\d+):(\d+)\.\d+\s+-->", line) or re.match(r"(\d+):(\d+)\.\d+\s+-->", line)
        if m:
            g = [int(x) for x in m.groups()]
            start = g[0]*3600+g[1]*60+g[2] if len(g) == 3 else g[0]*60+g[1]; continue
        if not line or line.startswith(("WEBVTT", "Kind:", "Language:", "NOTE")) or line.isdigit(): continue
        text = re.sub(r"<[^>]+>", "", line).strip()
        # Auto-subs roll: each cue repeats the previous line or two. Drop only those near repeats, so a
        # line that genuinely recurs later ("Yeah.", a chorus) is kept.
        if text and text not in [t for _, t in segs[-3:]]:
            segs.append((start, text))
    return segs

def pick_vtt(files, langs):
    """The subtitle file for the first --lang that has one: exact code (en), then a variant (en-orig)."""
    def code(f):
        parts = os.path.basename(f).rsplit(".", 2)
        return parts[1] if len(parts) == 3 else ""
    files = sorted(files)
    for l in langs:
        for f in files:
            if code(f) == l: return f
        for f in files:
            if code(f).startswith(l + "-"): return f
    return files[0]

def via_ytdlp(vid, langs, proxy=False):
    tmp = tempfile.mkdtemp(prefix="cklph-yt-")
    try:
        return _ytdlp_into(tmp, vid, langs, proxy)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def _ytdlp_into(tmp, vid, langs, proxy):
    pip_install("yt-dlp")
    # Run as a module of THIS Python: the venv's yt-dlp is not on PATH.
    base = [sys.executable, "-m", "yt_dlp", "--skip-download", "--write-subs", "--write-auto-subs",
            "--sub-langs", ",".join(langs + [l + ".*" for l in langs]), "--sub-format", "vtt",
            "-o", f"{tmp}/%(id)s.%(ext)s", "--no-warnings",
            "--compat-options", "no-certifi"]  # use system CA store (sandbox egress proxies re-sign TLS)
    if os.environ.get("YT_COOKIES_FILE"): base += ["--cookies", os.environ["YT_COOKIES_FILE"]]
    if proxy: base += ["--proxy", proxy_url()]
    last_err = ""
    for client in ["default", "web", "android", "ios", "tv_embedded", "mweb"]:
        args = list(base)
        if client != "default": args += ["--extractor-args", f"youtube:player_client={client}"]
        r = subprocess.run(args + [f"https://www.youtube.com/watch?v={vid}"], capture_output=True, text=True)
        files = glob.glob(f"{tmp}/*.vtt")
        if files:
            log(f"yt-dlp succeeded with player_client={client}")
            return parse_vtt(pick_vtt(files, langs))
        last_err = (r.stderr or r.stdout).strip().splitlines()[-1:] or [""]
        last_err = last_err[0]
        if "sign in to confirm" in last_err.lower():
            raise RuntimeError("yt-dlp: YouTube bot check (needs YT_COOKIES_FILE or a different IP)")
        if "no subtitles" in last_err.lower() or "There are no subtitles" in (r.stdout or ""):
            return NO_CAPTIONS
        log(f"yt-dlp player_client={client} failed: {last_err[:160]}")
    raise RuntimeError(f"yt-dlp: all clients failed ({last_err[:160]})")

def via_watchpage(vid, langs):
    """Scrape captionTracks from the watch page and pull the timedtext XML directly."""
    import html as H
    req = urllib.request.Request(f"https://www.youtube.com/watch?v={vid}&hl=en",
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                 "(KHTML, like Gecko) Chrome/126 Safari/537.36", "Accept-Language": "en-US,en"})
    page = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    if "captionTracks" not in page:
        if "playabilityStatus" in page and '"captions"' not in page: return NO_CAPTIONS
        raise RuntimeError("watch page returned no captionTracks (likely bot wall)")
    tracks = json.loads(re.search(r'"captionTracks":(\[.*?\])', page).group(1))
    pick = next((t for l in langs for t in tracks if t.get("languageCode","").startswith(l)), tracks[0])
    xml = urllib.request.urlopen(pick["baseUrl"].replace("\\u0026", "&"), timeout=20).read().decode()
    return [(float(m.group(1)), H.unescape(re.sub(r"<[^>]+>", "", m.group(2))).replace("\n", " "))
            for m in re.finditer(r'<text start="([\d.]+)"[^>]*>(.*?)</text>', xml, re.S)]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--lang", default="en")
    ap.add_argument("--out", default=None); ap.add_argument("--timestamps", action="store_true")
    a = ap.parse_args()
    vid, langs = extract_id(a.video), [l.strip() for l in a.lang.split(",") if l.strip()]
    a.out = os.path.abspath(a.out or f"transcript-{vid}.txt")
    ensure_venv()
    meta = metadata(vid)
    log(f"video_id={vid} title={meta.get('title')!r} channel={meta.get('channel')!r}")

    has_proxy = bool(proxy_url())
    methods = [("youtube-transcript-api", lambda: via_api(vid, langs))]
    if has_proxy: methods.append(("youtube-transcript-api+proxy", lambda: via_api(vid, langs, True)))
    methods.append(("watch-page-timedtext", lambda: via_watchpage(vid, langs)))
    methods.append(("yt-dlp", lambda: via_ytdlp(vid, langs)))
    if has_proxy: methods.append(("yt-dlp+proxy", lambda: via_ytdlp(vid, langs, True)))

    no_caption_votes, tried = 0, []
    for name, fn in methods:
        log(f"trying {name}...")
        try:
            segs = fn()
        except Exception as e:
            tried.append(f"{name}: {e.__class__.__name__}: {str(e)[:200]}")
            log(f"{name} failed -> {tried[-1]}"); continue
        if segs == NO_CAPTIONS:
            no_caption_votes += 1; tried.append(f"{name}: video reports no captions"); log(tried[-1]); continue
        if not segs:
            tried.append(f"{name}: empty result"); continue
        text = fmt(segs, a.timestamps)
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(json.dumps({"status": "ok", "method": name, "video_id": vid, **meta,
                          "chars": len(text), "segments": len(segs), "out": a.out}))
        return 0

    status = "no_captions" if no_caption_votes and no_caption_votes == len(tried) else "blocked_or_failed"
    print(json.dumps({"status": status, "video_id": vid, **meta, "attempts": tried}))
    return 2 if status == "no_captions" else 3

if __name__ == "__main__":
    sys.exit(main())
