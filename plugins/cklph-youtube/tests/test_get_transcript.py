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
                self.assertEqual(cmd[1:3], ["-m", "venv"])
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


if __name__ == "__main__":
    unittest.main()
