"""Offline tests for skills/transcript/scripts/get_transcript.py (no network, no pip, no YouTube).

Run: bash plugins/cklph-youtube/tests/get_transcript.test.sh
"""
import importlib.util, os, sys, tempfile, unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "skills", "transcript", "scripts", "get_transcript.py")
spec = importlib.util.spec_from_file_location("get_transcript", SCRIPT)
gt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gt)


class ExtractId(unittest.TestCase):
    def test_forms(self):
        vid = "dQw4w9WgXcQ"
        for s in [vid, f"https://www.youtube.com/watch?v={vid}", f"https://youtu.be/{vid}",
                  f"https://www.youtube.com/shorts/{vid}", f"https://www.youtube.com/watch?list=x&v={vid}&t=3",
                  f"https://www.youtube.com/embed/{vid}", f"  {vid}\n"]:
            self.assertEqual(gt.extract_id(s), vid, s)

    def test_rejects_garbage(self):
        with self.assertRaises(SystemExit):
            gt.extract_id("https://example.com/not-a-video")


class Parsing(unittest.TestCase):
    def test_vtt_dedupes_rolling_lines_and_strips_tags(self):
        vtt = ("WEBVTT\nKind: captions\nLanguage: en\n\n"
               "00:00:01.000 --> 00:00:03.000\n<c>hello</c> world\n\n"
               "00:00:03.000 --> 00:00:05.000\nhello world\nsecond line\n\n"
               "01:02:03.500 --> 01:02:05.000\nlate\n")
        with tempfile.NamedTemporaryFile("w", suffix=".vtt", delete=False) as f:
            f.write(vtt)
        try:
            segs = gt.parse_vtt(f.name)
        finally:
            os.unlink(f.name)
        self.assertEqual(segs, [(1, "hello world"), (3, "second line"), (3723, "late")])

    def test_vtt_keeps_a_line_that_genuinely_recurs(self):
        cues = ["Yeah.", "one", "two", "three", "four", "Yeah."]
        vtt = "WEBVTT\n\n" + "".join(f"00:00:{i:02d}.000 --> 00:00:{i+1:02d}.000\n{c}\n\n" for i, c in enumerate(cues))
        with tempfile.NamedTemporaryFile("w", suffix=".vtt", delete=False) as f:
            f.write(vtt)
        try:
            texts = [t for _, t in gt.parse_vtt(f.name)]
        finally:
            os.unlink(f.name)
        self.assertEqual(texts, cues)

    def test_vtt_drops_cue_ids_keeps_numeric_captions_and_unescapes(self):
        vtt = ("WEBVTT\nKind: captions\n\n"
               "1\n00:00:01.000 --> 00:00:02.000\nThe year was\n\n"
               "2\n00:00:02.000 --> 00:00:03.000\n2024\n\n"
               "intro-cue\n00:00:03.000 --> 00:00:04.000\nTom &amp; Jerry&#39;s\n")
        with tempfile.NamedTemporaryFile("w", suffix=".vtt", delete=False) as f:
            f.write(vtt)
        try:
            texts = [t for _, t in gt.parse_vtt(f.name)]
        finally:
            os.unlink(f.name)
        self.assertEqual(texts, ["The year was", "2024", "Tom & Jerry's"])

    def test_pick_vtt_follows_lang_order(self):
        v = "dQw4w9WgXcQ"
        en, es, orig = f"/t/{v}.en.vtt", f"/t/{v}.es.vtt", f"/t/{v}.en-orig.vtt"
        self.assertEqual(gt.pick_vtt([en, es], ["es", "en"]), es)
        self.assertEqual(gt.pick_vtt([orig, en], ["en"]), en)
        self.assertEqual(gt.pick_vtt([orig], ["en"]), orig)
        self.assertEqual(gt.pick_vtt([es], ["fr"]), es)

    def test_fmt(self):
        segs = [(5, "a"), (3723, "b")]
        self.assertEqual(gt.fmt(segs, False), "a b")
        self.assertEqual(gt.fmt(segs, True), "[00:05] a\n[1:02:03] b")


class Venv(unittest.TestCase):
    """Dependencies must land in the private venv, never the system or a project venv."""

    def setUp(self):
        self.env = mock.patch.dict(os.environ, {}, clear=False)
        self.env.start()
        os.environ.pop("CKLPH_YT_NO_VENV", None)

    def tearDown(self):
        self.env.stop()

    def test_inside_our_venv_does_not_reexec(self):
        with mock.patch.object(gt.sys, "prefix", gt.VENV), mock.patch.object(gt.os, "execv") as ex:
            gt.ensure_venv()
        ex.assert_not_called()

    def test_from_a_project_venv_reexecs_into_ours(self):
        with tempfile.TemporaryDirectory() as d:
            venv = os.path.join(d, "venv"); py = os.path.join(venv, "bin", "python")
            os.makedirs(os.path.dirname(py)); open(py, "w").close()
            with mock.patch.object(gt, "VENV", venv), \
                 mock.patch.object(gt.sys, "prefix", "/some/project/.venv"), \
                 mock.patch.object(gt.sys, "base_prefix", "/usr"), \
                 mock.patch.object(gt.os, "execv") as ex:
                gt.ensure_venv()
        ex.assert_called_once()
        self.assertEqual(ex.call_args[0][0], py)

    def test_creates_venv_on_first_run(self):
        with tempfile.TemporaryDirectory() as d:
            venv = os.path.join(d, "venv"); py = os.path.join(venv, "bin", "python")

            def fake_run(cmd, **kw):
                self.assertEqual(cmd, [sys.executable, "-m", "venv", venv])
                os.makedirs(os.path.dirname(py)); open(py, "w").close()
                return mock.Mock(returncode=0)

            with mock.patch.object(gt, "VENV", venv), mock.patch.object(gt.sys, "prefix", "/usr"), \
                 mock.patch.object(gt.subprocess, "run", side_effect=fake_run), \
                 mock.patch.object(gt.os, "execv") as ex:
                gt.ensure_venv()
        self.assertEqual(ex.call_args[0][0], py)

    def test_falls_back_when_venv_cannot_be_created(self):
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(gt, "VENV", os.path.join(d, "venv")), \
                 mock.patch.object(gt.sys, "prefix", "/usr"), \
                 mock.patch.object(gt.subprocess, "run", return_value=mock.Mock(returncode=1)), \
                 mock.patch.object(gt.os, "execv") as ex:
                gt.ensure_venv()
        ex.assert_not_called()
        self.assertEqual(os.environ.get("CKLPH_YT_NO_VENV"), "1")

    def test_break_system_packages_only_outside_a_venv(self):
        for prefix, base, want in [("/v", "/usr", False), ("/usr", "/usr", True)]:
            with mock.patch.object(gt.sys, "prefix", prefix), mock.patch.object(gt.sys, "base_prefix", base), \
                 mock.patch.object(gt.subprocess, "run") as run:
                gt.pip_install("yt-dlp")
            self.assertEqual("--break-system-packages" in run.call_args[0][0], want, prefix)

    def test_ytdlp_runs_as_a_module_of_this_python(self):
        with mock.patch.object(gt, "pip_install"), \
             mock.patch.object(gt.subprocess, "run", return_value=mock.Mock(returncode=1, stderr="There are no subtitles", stdout="")) as run:
            self.assertEqual(gt.via_ytdlp("dQw4w9WgXcQ", ["en"]), gt.NO_CAPTIONS)
        self.assertEqual(run.call_args[0][0][:3], [sys.executable, "-m", "yt_dlp"])


class YtdlpWiring(unittest.TestCase):
    def test_returns_the_first_requested_language_not_the_alphabetically_first(self):
        vid = "dQw4w9WgXcQ"

        def fake_run(args, **kw):
            out = args[args.index("-o") + 1]          # "<tmp>/%(id)s.%(ext)s"
            tmp = os.path.dirname(out)
            for lang, text in [("en", "hello"), ("es", "hola")]:
                with open(os.path.join(tmp, f"{vid}.{lang}.vtt"), "w") as f:
                    f.write(f"WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n{text}\n")
            return mock.Mock(returncode=0, stderr="", stdout="")

        with mock.patch.object(gt, "pip_install"), mock.patch.object(gt.subprocess, "run", side_effect=fake_run):
            segs = gt.via_ytdlp(vid, ["es", "en"])
        self.assertEqual(segs, [(1, "hola")])

    def test_a_bot_check_moves_on_to_the_next_player_client(self):
        vid, calls = "dQw4w9WgXcQ", []

        def fake_run(args, **kw):
            calls.append(args)
            if len(calls) == 1:
                return mock.Mock(returncode=1, stdout="", stderr="ERROR: Sign in to confirm you're not a bot")
            tmp = os.path.dirname(args[args.index("-o") + 1])
            with open(os.path.join(tmp, f"{vid}.en.vtt"), "w") as f:
                f.write("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello\n")
            return mock.Mock(returncode=0, stdout="", stderr="")

        with mock.patch.object(gt, "pip_install"), mock.patch.object(gt.subprocess, "run", side_effect=fake_run):
            self.assertEqual(gt.via_ytdlp(vid, ["en"]), [(1, "hello")])
        self.assertEqual(len(calls), 2)

    def test_bot_check_on_every_client_is_reported_as_a_bot_check(self):
        bot = mock.Mock(returncode=1, stdout="", stderr="ERROR: Sign in to confirm you're not a bot")
        with mock.patch.object(gt, "pip_install"), mock.patch.object(gt.subprocess, "run", return_value=bot) as run:
            with self.assertRaisesRegex(RuntimeError, "bot check"):
                gt.via_ytdlp("dQw4w9WgXcQ", ["en"])
        self.assertEqual(run.call_count, 6)


class Housekeeping(unittest.TestCase):
    def test_ytdlp_temp_dir_is_removed_even_on_failure(self):
        d = tempfile.mkdtemp()
        with mock.patch.object(gt.tempfile, "mkdtemp", return_value=d), \
             mock.patch.object(gt, "_ytdlp_into", side_effect=RuntimeError("blocked")):
            with self.assertRaises(RuntimeError):
                gt.via_ytdlp("dQw4w9WgXcQ", ["en"])
        self.assertFalse(os.path.exists(d))

    def test_http_only_proxy_enables_the_proxy_methods(self):
        with mock.patch.dict(os.environ, {"YT_PROXY_HTTP": "http://p:1"}, clear=False):
            os.environ.pop("YT_PROXY_HTTPS", None)
            self.assertEqual(gt.proxy_url(), "http://p:1")
            with mock.patch.object(gt, "pip_install"), \
                 mock.patch.object(gt.subprocess, "run", return_value=mock.Mock(returncode=1, stderr="There are no subtitles", stdout="")) as run:
                gt.via_ytdlp("dQw4w9WgXcQ", ["en"], proxy=True)
        args = run.call_args[0][0]
        self.assertEqual(args[args.index("--proxy") + 1], "http://p:1")

    def test_default_output_is_per_video_and_reported(self):
        vid = "dQw4w9WgXcQ"
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as d:
            os.chdir(d)
            try:
                out = io_capture(lambda: self._run_main(vid))
                expected = os.path.abspath(f"transcript-{vid}.txt")
            finally:
                os.chdir(cwd)
            self.assertEqual(out["out"], expected)
            with open(expected, encoding="utf-8") as f:
                self.assertEqual(f.read(), "hi")

    @staticmethod
    def _run_main(vid):
        with mock.patch.object(gt.sys, "argv", ["get_transcript.py", vid]), \
             mock.patch.object(gt, "ensure_venv"), mock.patch.object(gt, "metadata", return_value={}), \
             mock.patch.object(gt, "via_api", return_value=[(0, "hi")]):
            return gt.main()


def io_capture(fn):
    import contextlib, io, json
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        assert fn() == 0
    return json.loads(buf.getvalue())


if __name__ == "__main__":
    unittest.main()
