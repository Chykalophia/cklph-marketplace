"""Tests for the plugin's deterministic scripts. Run: python3 -m unittest discover -s tests -v"""
import contextlib
import io
import math
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for sub in ("skills/experiment-design/scripts", "skills/voc-research/scripts",
            "skills/report-information-design/scripts", "skills/ecommerce-cro-audit/scripts"):
    sys.path.insert(0, os.path.join(ROOT, sub))

import _stats  # noqa: E402
import agreement  # noqa: E402
import capture_pages  # noqa: E402  (imports Playwright only inside main)
import check_citations  # noqa: E402
import power  # noqa: E402
import readout  # noqa: E402
import srm_check  # noqa: E402
import test_log  # noqa: E402


def quiet(fn, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*a, **k)


def rejects(fn, argv):
    """True if the CLI exits with an argparse error instead of a traceback."""
    with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
        try:
            fn(argv)
        except SystemExit as e:
            return e.code != 0
    return False


class InputValidationTests(unittest.TestCase):
    def test_power_rejects_bad_inputs(self):
        self.assertTrue(rejects(power.main, ["size", "--baseline", "0.03", "--mde", "0.1", "--variants", "0"]))
        self.assertTrue(rejects(power.main, ["size", "--baseline", "0.03", "--mde", "0.1", "--power", "1"]))
        self.assertTrue(rejects(power.main, ["size", "--baseline", "0.03", "--mde", "0.1", "--cuped-r", "1"]))

    def test_readout_rejects_impossible_counts(self):
        self.assertTrue(rejects(readout.main, ["--control", "0", "0", "--variant", "100", "5"]))
        self.assertTrue(rejects(readout.main, ["--control", "100", "150", "--variant", "100", "5"]))

    def test_srm_rejects_zero_weight(self):
        with self.assertRaises(ValueError):
            srm_check.srm([100, 100], [0, 1])
        self.assertTrue(rejects(srm_check.main, ["0", "0"]))

    def test_agreement_rejects_blank_and_missing(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.csv")
            with open(p, "w") as f:
                f.write("id,human,ai\n1,cost,\n")
            self.assertTrue(rejects(agreement.main, [p]))
            self.assertTrue(rejects(agreement.main, [p, "--b", "nope"]))

    def test_citations_rejects_bad_claims_and_missing_report(self):
        with tempfile.TemporaryDirectory() as d:
            rep = os.path.join(d, "r.md")
            with open(rep, "w") as f:
                f.write("no links here")
            claims = os.path.join(d, "c.csv")
            with open(claims, "w") as f:
                f.write("url,expect\nhttps://example.org/,\n")
            self.assertTrue(rejects(check_citations.main, [rep, "--claims", claims]))
            self.assertTrue(rejects(check_citations.main, [os.path.join(d, "missing.html")]))

    def test_test_log_skips_malformed_rows(self):
        with tempfile.TemporaryDirectory() as d:
            log = os.path.join(d, "log.csv")
            quiet(test_log.main, ["--log", log, "init"])
            with open(log, "a") as f:
                f.write("T1,,pdp,Trust,h,,,win,0.05,,,,\nT2,,pdp,Trust,h,,,maybe,,,,,\nT3,,pdp,Trust,h,,,win,abc,,,,\n")
            g = test_log.rates(test_log.read(log), "lever")["Trust"]
            self.assertEqual((g["n"], g["win"]), (1, 1))
            quiet(test_log.main, ["--log", log, "summary"])


class ReviewRoundTwoTests(unittest.TestCase):
    def test_guardrail_applies_only_to_its_variant(self):
        base = ["--control", "50000", "1000", "--variant", "50000", "1200", "--variant", "50000", "1210"]
        out = quiet(readout.main, base + ["--guardrail", "aov@2,1000,500,1210,450,0.02", "--json"])
        self.assertEqual([v["decision"] for v in out["variants"]], ["SHIP", "DO NOT SHIP (guardrail)"])
        self.assertTrue(rejects(readout.main, base + ["--guardrail", "aov,1000,500,1210,450,0.02"]))
        self.assertTrue(rejects(readout.main, base + ["--guardrail", "aov@3,1000,500,1210,450,0.02"]))

    def test_guardrail_rejects_unknown_direction(self):
        self.assertTrue(rejects(readout.main, ["--control", "100", "5", "--variant", "100", "6",
                                               "--guardrail", "ret,100,5,100,6,0.1,lowr"]))

    def test_far_tail_p_value_not_zero(self):
        self.assertGreater(_stats.two_sided_p(12), 0)

    def test_kappa_undefined_without_variation(self):
        k, _ = agreement.kappa(["a", "a"], ["a", "a"])
        self.assertTrue(math.isnan(k))

    def test_multilabel_strips_spaces(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.csv")
            with open(p, "w") as f:
                f.write('id,human,ai\n1,"cost; fit","cost;fit"\n2,trust,trust\n3,fit,fit\n')
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                agreement.main([p])
            self.assertIn("kappa 1.00", out.getvalue())
            self.assertNotIn("| fit | 1", out.getvalue())

    def test_footnote_gaps_from_displayed_numbers(self):
        text = '<a href="#s-a">1</a><a href="#s-c">3</a><li id="s-a"></li><li id="s-c"></li>'
        self.assertEqual(check_citations.footnote_integrity(text)["numbering_gaps"], [2])


class ReviewRoundThreeTests(unittest.TestCase):
    def test_power_rejects_bad_metric_inputs(self):
        self.assertTrue(rejects(power.main, ["size", "--baseline", "1.5", "--mde", "0.1"]))
        self.assertTrue(rejects(power.main, ["size", "--baseline", "0.9", "--mde", "0.2"]))
        self.assertTrue(rejects(power.main, ["size", "--mean", "0", "--sd", "5", "--mde", "0.1"]))

    def test_srm_rejects_nan_and_bad_threshold(self):
        with self.assertRaises(ValueError):
            srm_check.srm([100, 100], [float("nan"), 1])
        with self.assertRaises(ValueError):
            srm_check.srm([100, 100], threshold=-1)

    def test_test_log_srm_fail_and_padding(self):
        with tempfile.TemporaryDirectory() as d:
            log = os.path.join(d, "log.csv")
            quiet(test_log.main, ["--log", log, "init"])
            with open(log, "a") as f:
                f.write("T1,,pdp,Trust,h,,, win ,0.02,,,,\nT2,,pdp,Trust,h,,,win,0.04,,,false,\n"
                        "T3,,pdp,Trust,h,,,win,0.06,,,,\n")
            g = test_log.rates(test_log.read(log), "lever")["Trust"]
            self.assertEqual((g["n"], g["win"]), (2, 2))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                test_log.main(["--log", log, "summary"])
            self.assertIn("Win rate 2/2", out.getvalue())
            self.assertIn("Median winning lift 4.0%", out.getvalue())

    def test_urls_keep_balanced_parentheses(self):
        text = "[a](https://x.io/a_(b)) and https://en.wikipedia.org/wiki/Clarke_(river)."
        self.assertEqual(check_citations.extract_urls(text),
                         ["https://x.io/a_(b)", "https://en.wikipedia.org/wiki/Clarke_(river)"])

    def test_footnote_problems_fail_the_run(self):
        with tempfile.TemporaryDirectory() as d:
            rep = os.path.join(d, "r.html")
            with open(rep, "w") as f:
                f.write('<p><a href="#s-1">1</a></p>')
            self.assertTrue(rejects(check_citations.main, [rep]))

    def test_mean_guardrail(self):
        out = quiet(readout.main, ["--type", "mean", "--control", "48210", "2.41", "19.8",
                                   "--variant", "48530", "2.55", "20.4",
                                   "--guardrail", "rpv,mean,48210,2.41,19.8,48530,2.30,19.1,0.03", "--json"])
        self.assertEqual(out["variants"][0]["decision"], "DO NOT SHIP (guardrail)")



class ReviewRoundFourTests(unittest.TestCase):
    def test_guardrails_use_adjusted_alpha(self):
        seen = []
        orig = readout.guardrail_check

        def spy(spec, alpha):
            seen.append(alpha)
            return orig(spec, alpha)
        readout.guardrail_check = spy
        try:
            quiet(readout.main, ["--control", "50000", "1000", "--variant", "50000", "1100",
                                 "--variant", "50000", "1050", "--guardrail", "aov@1,1000,500,1000,500,0.05",
                                 "--json"])
        finally:
            readout.guardrail_check = orig
        self.assertEqual(seen, [0.025])

    def test_guardrail_rejects_unevaluable_inputs(self):
        base = ["--control", "50000", "1000", "--variant", "50000", "1200", "--guardrail"]
        self.assertTrue(rejects(readout.main, base + ["refunds,50000,0,50000,3,0.1,lower"]))
        self.assertTrue(rejects(readout.main, base + ["delta,mean,100,-5,1,100,-4.5,1,0.03"]))
        self.assertTrue(rejects(readout.main, ["--control", "50000", "0", "--variant", "50000", "40"]))
        self.assertTrue(rejects(readout.main, ["--type", "mean", "--control", "100", "0", "1",
                                               "--variant", "100", "1", "1"]))

    def test_constant_codes_are_unscorable_not_weak(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "s.csv")
            with open(path, "w") as f:
                f.write("id,human,ai\n1,price,price\n2,price,price\n3,price,price\n")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                agreement.main([path])
            self.assertIn("(overall)", out.getvalue().split("Not scorable")[1])
            self.assertNotIn("Below", out.getvalue())

def run_cli(fn, argv):
    """Exit code and stdout of a CLI run (0 when it returns normally)."""
    out = io.StringIO()
    with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(out):
        try:
            fn(argv)
        except SystemExit as e:
            return (e.code if isinstance(e.code, int) else 1), out.getvalue()
    return 0, out.getvalue()


def write(path, text):
    with open(path, "w") as f:
        f.write(text)
    return path


class ReviewRoundFiveTests(unittest.TestCase):
    """Findings from the automated review of PR #55."""

    def test_power_rejects_non_finite_and_empty_windows(self):
        self.assertTrue(rejects(power.main, ["size", "--mean", "inf", "--sd", "5", "--mde", "0.1"]))
        self.assertTrue(rejects(power.main, ["size", "--baseline", "0.03", "--mde", "0.1",
                                             "--daily-visitors", "nan"]))
        self.assertTrue(rejects(power.main, ["mde", "--baseline", "0.03", "--daily-visitors", "1000",
                                             "--max-days", "nan"]))
        self.assertTrue(rejects(power.main, ["mde", "--baseline", "0.03", "--daily-visitors", "1000",
                                             "--max-days", "0"]))

    def test_readout_rejects_bad_alpha_counts_sd_mde_and_weights(self):
        ok = ["--control", "50000", "1000", "--variant", "50000", "1200"]
        self.assertTrue(rejects(readout.main, ok + ["--alpha", "0"]))
        self.assertTrue(rejects(readout.main, ok + ["--alpha", "1.5"]))
        self.assertTrue(rejects(readout.main, ok + ["--mde", "-0.1"]))
        self.assertTrue(rejects(readout.main, ok + ["--weights", "50", "nan"]))
        self.assertTrue(rejects(readout.main, ok + ["--weights", "50", "25", "25"]))
        self.assertTrue(rejects(readout.main, ["--control", "50000.6", "1000", "--variant", "50000", "1200"]))
        mean = ["--type", "mean", "--control", "48210", "2.41", "19.8", "--variant", "48530", "2.55"]
        self.assertTrue(rejects(readout.main, mean + ["-20.4"]))
        self.assertTrue(rejects(readout.main, ["--type", "mean", "--control", "100", "2.0", "0",
                                               "--variant", "100", "3.0", "0"]))

    def test_readout_always_reports_run_length(self):
        argv = ["--control", "50000", "1000", "--variant", "50000", "1200", "--days", "21"]
        code, text = run_cli(readout.main, argv)
        self.assertEqual(code, 0)
        self.assertIn("Run length: 21 days", text)
        self.assertNotIn("prefer whole weeks", text)
        self.assertEqual(quiet(readout.main, argv + ["--json"])["days"], 21)

    def test_srm_rejects_non_finite_counts_and_overflowing_weights(self):
        with self.assertRaises(ValueError):
            srm_check.srm([float("nan"), 100])
        with self.assertRaises(ValueError):
            srm_check.srm([100, 100], [1e308, 1e308])

    def test_test_log_handles_empty_file_nan_lift_and_missing_column(self):
        with tempfile.TemporaryDirectory() as d:
            log = write(os.path.join(d, "log.csv"), "")
            quiet(test_log.main, ["--log", log, "add", "--id", "T1", "--page", "pdp", "--lever", "Trust",
                                  "--hypothesis", "h", "--outcome", "win", "--rel-lift", "0.04"])
            rows = test_log.read(log)
            self.assertEqual([r["id"] for r in rows], ["T1"])
            with self.assertRaises(SystemExit):
                quiet(test_log.main, ["--log", log, "add", "--id", "T2", "--page", "pdp", "--lever", "Trust",
                                      "--hypothesis", "h", "--outcome", "win", "--rel-lift", "nan"])
            self.assertFalse(test_log.usable({"outcome": "win", "rel_lift": "inf"}))
            short = write(os.path.join(d, "short.csv"), "id,lever,outcome\nT1,Trust,win\n")
            code, text = run_cli(test_log.main, ["--log", short, "summary"])
            self.assertEqual(code, 0)
            self.assertIn("Win rate 1/1", text)

    def test_agreement_rejects_bad_threshold_same_column_and_separator_cells(self):
        with tempfile.TemporaryDirectory() as d:
            good = write(os.path.join(d, "g.csv"), "id,human,ai\n1,cost,cost\n2,fit,fit\n")
            self.assertTrue(rejects(agreement.main, [good, "--min-kappa", "nan"]))
            self.assertTrue(rejects(agreement.main, [good, "--a", "ai", "--b", "ai"]))
            seps = write(os.path.join(d, "s.csv"), "id,human,ai\n1,;,;\n2,cost;fit,cost;fit\n3,fit,cost\n")
            self.assertTrue(rejects(agreement.main, [seps]))
            named = write(os.path.join(d, "n.csv"), "id,coder1,coder2\n1,cost,cost\n2,fit,fit\n")
            _, text = run_cli(agreement.main, [named, "--a", "coder1", "--b", "coder2"])
            self.assertIn("| code | coder1 count | coder2 count |", text)

    def citation_run(self, claims_text, pages, extra=()):
        """Run the checker on a link-free report with a fake fetch serving `pages` (url -> (status, body))."""
        orig = check_citations.fetch

        def fake(url, timeout=20, want_body=False):
            status, body = pages[url]
            return {"status": status, "final_url": url, "body": body if want_body else ""}
        check_citations.fetch = fake
        try:
            with tempfile.TemporaryDirectory() as d:
                rep = write(os.path.join(d, "r.md"), "no links here")
                claims = write(os.path.join(d, "c.csv"), "url,expect\n" + claims_text)
                return run_cli(check_citations.main, [rep, "--claims", claims, *extra])
        finally:
            check_citations.fetch = orig

    def test_claims_match_whole_figures_only(self):
        page = {"https://a.example/": (200, "<p>Published in 2024. Rate 10.8%. Abandonment is 70.22.</p>")}
        self.assertEqual(self.citation_run("https://a.example/,2\n", page)[0], 1)
        self.assertEqual(self.citation_run("https://a.example/,0.8%\n", page)[0], 1)
        self.assertEqual(self.citation_run("https://a.example/,70.22\nhttps://a.example/,10.8%\n", page)[0], 0)

    def test_dead_claim_source_fails_the_run(self):
        code, text = self.citation_run("https://dead.example/,5\n", {"https://dead.example/": (404, "")})
        self.assertEqual(code, 1)
        self.assertIn("DEAD source", text)
        self.assertEqual(self.citation_run("https://b.example/,5\n", {"https://b.example/": (403, "")})[0], 0)

    def test_citation_cli_rejects_bad_claim_urls_and_workers(self):
        self.assertEqual(self.citation_run("notaurl,5\n", {})[0], 2)
        self.assertEqual(self.citation_run("file:///etc/hosts,5\n", {})[0], 2)
        page = {"https://a.example/": (200, "5")}
        self.assertEqual(self.citation_run("https://a.example/,5\n", page, ["--workers", "0"])[0], 2)
        self.assertEqual(check_citations.fetch("http://[bad")["status"], None)

    def test_footnotes_numeric_slug_and_reused_numbers(self):
        slug = '<sup><a href="#s-2024">1</a></sup><li id="s-2024"></li>'
        f = check_citations.footnote_integrity(slug)
        self.assertEqual((f["numbering_gaps"], f["numbers_used_for_several_sources"]), ([], []))
        dup = ('<a href="#s-a">1</a><a href="#s-b">1</a><a href="#s-a">1</a>'
               '<li id="s-a"></li><li id="s-b"></li>')
        self.assertEqual(check_citations.footnote_integrity(dup)["numbers_used_for_several_sources"], [1])

    def test_capture_args_accept_viewport_first_and_gate_schemes(self):
        a = capture_pages.parse_args(["--viewports", "mobile", "https://store.example/p"])
        self.assertEqual((a.viewports, a.urls), (["mobile"], ["https://store.example/p"]))
        a = capture_pages.parse_args(["--out", "x", "--", "https://store.example/p", "http://127.0.0.1:9292/"])
        self.assertEqual(a.viewports, ["desktop", "mobile"])
        self.assertTrue(rejects(capture_pages.parse_args, ["file:///etc/passwd"]))
        self.assertTrue(rejects(capture_pages.parse_args, ["javascript:alert(1)"]))
        self.assertTrue(rejects(capture_pages.parse_args, ["store.example/p"]))
        self.assertTrue(rejects(capture_pages.parse_args, ["--viewports", "tablet", "https://store.example/p"]))
        self.assertEqual(capture_pages.parse_args(["--allow-file", "file:///tmp/pdp.html"]).urls,
                         ["file:///tmp/pdp.html"])


class StatsTests(unittest.TestCase):
    def test_chi2_matches_tables(self):
        self.assertAlmostEqual(_stats.chi2_sf(3.841, 1), 0.05, places=3)
        self.assertAlmostEqual(_stats.chi2_sf(5.991, 2), 0.05, places=3)
        self.assertAlmostEqual(_stats.chi2_sf(11.07, 5), 0.05, places=3)

    def test_retrodesign_matches_gelman_carlin(self):
        # Gelman & Carlin 2014 example: true effect 2, se 8.1 -> power ~0.06, Type S ~24%, exaggeration ~9.5-9.7
        d = _stats.retrodesign(2, 8.1)
        self.assertAlmostEqual(d["power"], 0.06, delta=0.01)
        self.assertAlmostEqual(d["type_s"], 0.24, delta=0.02)
        self.assertTrue(9.0 < d["exaggeration"] < 10.2)


class PowerTests(unittest.TestCase):
    def test_conversion_sample_size(self):
        # 2.5% baseline, +10% relative, 80% power, alpha 0.05: ~64k per arm (cf. Evan Miller's calculator)
        n = power.n_per_arm_prop(0.025, 0.10, 0.05, 0.8)
        self.assertTrue(63000 < n < 65500, n)

    def test_cuped_reduces_sample(self):
        full = power.n_per_arm_mean(2.4, 18.5, 0.05, 0.05, 0.8)
        cuped = power.n_per_arm_mean(2.4, 18.5, 0.05, 0.05, 0.8, var_mult=0.75)
        self.assertAlmostEqual(cuped / full, 0.75, places=2)

    def test_mde_mode_inverts_size_mode(self):
        out = quiet(power.main, ["mde", "--baseline", "0.025", "--daily-visitors", "4000", "--max-days", "28", "--json"])
        m = out["detectable_mde_relative"]
        n = power.n_per_arm_prop(0.025, m, 0.05, 0.8)
        self.assertLessEqual(n, out["n_per_arm_available"])

    def test_variants_adjust_alpha(self):
        out = quiet(power.main, ["size", "--baseline", "0.03", "--mde", "0.1", "--variants", "3", "--json"])
        self.assertAlmostEqual(out["alpha_per_comparison"], 0.05 / 3)


class SrmTests(unittest.TestCase):
    def test_flags_mismatch(self):
        self.assertTrue(srm_check.srm([50211, 49123])["srm"])

    def test_passes_even_split(self):
        self.assertFalse(srm_check.srm([50000, 50100])["srm"])

    def test_weighted_split(self):
        self.assertFalse(srm_check.srm([20000, 80000], [20, 80])["srm"])


class ReadoutTests(unittest.TestCase):
    def test_clear_win_ships(self):
        out = quiet(readout.main, ["--control", "50000", "1000", "--variant", "50000", "1200", "--json"])
        v = out["variants"][0]
        self.assertEqual(v["decision"], "SHIP")
        self.assertTrue(v["rel_ci"][0] > 0)

    def test_srm_blocks_decision(self):
        out = quiet(readout.main, ["--control", "52000", "1000", "--variant", "48000", "1200", "--json"])
        self.assertEqual(out["variants"][0]["decision"], "DO NOT READ (SRM)")

    def test_guardrail_failure_blocks_ship(self):
        out = quiet(readout.main, ["--control", "50000", "1000", "--variant", "50000", "1200",
                                   "--guardrail", "aov,1000,500,1200,450,0.02", "--json"])
        self.assertEqual(out["variants"][0]["decision"], "DO NOT SHIP (guardrail)")

    def test_inconclusive(self):
        out = quiet(readout.main, ["--control", "48210", "1205", "--variant", "48530", "1302", "--json"])
        self.assertEqual(out["variants"][0]["decision"], "INCONCLUSIVE")

    def test_rel_ci_contains_estimate(self):
        r = readout.compare_prop(48210, 1205, 48530, 1302, 0.05)
        self.assertTrue(r["rel_ci"][0] < r["rel_lift"] < r["rel_ci"][1])


class TestLogTests(unittest.TestCase):
    def test_round_trip_and_prior(self):
        with tempfile.TemporaryDirectory() as d:
            log = os.path.join(d, "log.csv")
            base = ["--log", log, "add", "--page", "pdp", "--hypothesis", "h, with comma"]
            quiet(test_log.main, base + ["--id", "T1", "--lever", "Trust", "--outcome", "win"])
            quiet(test_log.main, base + ["--id", "T2", "--lever", "Trust", "--outcome", "flat"])
            quiet(test_log.main, base + ["--id", "T3", "--lever", "Trust", "--outcome", "invalid"])
            rows = test_log.read(log)
            self.assertEqual(len(rows), 3)
            self.assertEqual(rows[0]["hypothesis"], "h, with comma")
            g = test_log.rates(rows, "lever")["Trust"]
            self.assertEqual((g["n"], g["win"]), (2, 1))
            self.assertAlmostEqual(test_log.prior(1, 2), 2 / 7)


class AgreementTests(unittest.TestCase):
    def test_kappa_known_value(self):
        a = ["cost", "fit", "fit", "trust", "cost", "other", "fit", "trust"]
        b = ["cost", "fit", "quality", "trust", "cost", "fit", "fit", "trust"]
        k, po = agreement.kappa(a, b)
        self.assertAlmostEqual(po, 0.75)
        self.assertAlmostEqual(k, (0.75 - 17 / 64) / (1 - 17 / 64), places=6)

    def test_perfect_agreement(self):
        k, _ = agreement.kappa(["a", "b"], ["a", "b"])
        self.assertAlmostEqual(k, 1.0)


class CitationTests(unittest.TestCase):
    def test_extract_and_dedupe(self):
        text = 'a <a href="https://x.org/a">x</a> https://x.org/a. and (https://y.org/b) https://fonts.googleapis.com/css'
        self.assertEqual(check_citations.extract_urls(text), ["https://x.org/a", "https://y.org/b"])

    def test_footnote_integrity(self):
        text = '<a href="#s-1">1</a><a href="#s-4">4</a><li id="s-1"></li><li id="s-3"></li>'
        f = check_citations.footnote_integrity(text)
        self.assertEqual(f["refs_without_entry"], ["s-4"])
        self.assertEqual(f["entries_never_cited"], ["s-3"])
        self.assertEqual(f["numbering_gaps"], [2])

    def test_classify(self):
        self.assertEqual(check_citations.classify({"status": 200}), "ok")
        self.assertEqual(check_citations.classify({"status": 404}), "dead")
        self.assertTrue(check_citations.classify({"status": 403}).startswith("blocked"))
        self.assertEqual(check_citations.classify({"status": None}), "error")


if __name__ == "__main__":
    unittest.main()
