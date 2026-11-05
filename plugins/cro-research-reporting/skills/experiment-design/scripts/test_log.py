#!/usr/bin/env python3
"""Keep a per-client experiment log and learn from it.

The log is a CSV (default ./cro-test-log.csv, next to the engagement brief).
Every test goes in, winners and losers alike, so the client's own win rate per
lever can replace guesswork when prioritising the next round (Booking.com and
Conversion.com both run their programs off a log like this).

  python3 test_log.py init
  python3 test_log.py add --id T-014 --page pdp --lever Trust \
      --hypothesis "Reviews above the fold raise ATC" --evidence "analytics,survey" \
      --outcome win --rel-lift 0.042 --ci-low 0.008 --ci-high 0.077 --primary atc_rate
  python3 test_log.py summary
  python3 test_log.py prior --lever Trust     # win-rate prior for prioritisation

Levers follow Conversion.com's five: Cost, Trust, Usability, Comprehension,
Motivation (free text is accepted; keep it consistent).
Outcome is one of: win, loss, flat, invalid (e.g. SRM).
"""
import argparse
import csv
import os
import statistics
import sys
from collections import defaultdict
from datetime import date

FIELDS = ["id", "date_end", "page", "lever", "hypothesis", "evidence", "primary", "outcome",
          "rel_lift", "ci_low", "ci_high", "srm_pass", "notes"]
OUTCOMES = {"win", "loss", "flat", "invalid"}
VALID_OUTCOMES = OUTCOMES - {"invalid"}


def usable(row):
    """A row counts toward win rates only with a known outcome, no failed SRM check and a
    numeric (or blank) lift. Hand-edited logs can break these; such rows are treated like
    invalid tests."""
    if outcome(row) not in VALID_OUTCOMES:
        return False
    if (row.get("srm_pass") or "").strip().lower() in ("false", "no", "fail", "0"):
        return False
    if row.get("rel_lift"):
        try:
            float(row["rel_lift"])
        except ValueError:
            return False
    return True


def outcome(row):
    return (row.get("outcome") or "").strip().lower()


def read(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def cmd_init(a):
    if os.path.exists(a.log):
        print(f"{a.log} already exists; not overwriting.")
        return
    with open(a.log, "w", newline="") as f:
        csv.DictWriter(f, FIELDS).writeheader()
    print(f"Created {a.log}")


def cmd_add(a):
    if a.outcome not in OUTCOMES:
        sys.exit(f"--outcome must be one of {sorted(OUTCOMES)}")
    if not os.path.exists(a.log):
        cmd_init(a)
    row = {"id": a.id, "date_end": a.date_end or date.today().isoformat(), "page": a.page, "lever": a.lever,
           "hypothesis": a.hypothesis, "evidence": a.evidence, "primary": a.primary, "outcome": a.outcome,
           "rel_lift": a.rel_lift, "ci_low": a.ci_low, "ci_high": a.ci_high,
           "srm_pass": a.srm_pass, "notes": a.notes}
    with open(a.log, "a", newline="") as f:
        csv.DictWriter(f, FIELDS).writerow({k: ("" if v is None else v) for k, v in row.items()})
    print(f"Logged {a.id} ({a.outcome}) to {a.log}")


def rates(rows, key):
    g = defaultdict(lambda: {"n": 0, "win": 0, "loss": 0, "flat": 0})
    for r in rows:
        if not usable(r):
            continue
        k = r.get(key) or "(none)"
        g[k]["n"] += 1
        g[k][outcome(r)] += 1
    return g


def prior(wins, n, a=1, b=4):
    """Beta(a, b) prior shrinks small samples toward ~20% (a typical industry
    win rate, Kohavi et al.) so one lucky test doesn't dominate prioritisation."""
    return (wins + a) / (n + a + b)


def cmd_summary(a):
    rows = read(a.log)
    if not rows:
        sys.exit(f"No tests in {a.log}")
    valid = [r for r in rows if usable(r)]
    wins = sum(outcome(r) == "win" for r in valid)
    print(f"## Test log summary ({a.log})")
    print(f"- {len(rows)} tests logged, {len(rows) - len(valid)} invalid or unreadable (SRM, broken, malformed row)")
    if valid:
        print(f"- Win rate {wins}/{len(valid)} = {wins / len(valid):.0%} "
              f"(industry reference: roughly 10-33%)")
    lifts = [float(r["rel_lift"]) for r in valid if outcome(r) == "win" and r["rel_lift"]]
    if lifts:
        print(f"- Median winning lift {statistics.median(lifts):.1%} (expect post-launch lift to be smaller)")
    for key in ("lever", "page"):
        print(f"\n### By {key}")
        print(f"| {key} | tests | wins | losses | flat | shrunk win-rate prior |")
        print("|---|---|---|---|---|---|")
        for k, v in sorted(rates(rows, key).items(), key=lambda kv: -prior(kv[1]['win'], kv[1]['n'])):
            print(f"| {k} | {v['n']} | {v['win']} | {v['loss']} | {v['flat']} | {prior(v['win'], v['n']):.0%} |")


def cmd_prior(a):
    g = rates(read(a.log), "lever").get(a.lever, {"n": 0, "win": 0})
    p = prior(g["win"], g["n"])
    print(f"{a.lever}: {g['win']}/{g['n']} wins -> prior win probability {p:.0%}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--log", default="cro-test-log.csv")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init")
    s = sub.add_parser("add")
    for f in ("id", "page", "lever", "hypothesis", "outcome"):
        s.add_argument(f"--{f}", required=True)
    for f in ("evidence", "primary", "date-end", "srm-pass", "notes"):
        s.add_argument(f"--{f}")
    for f in ("rel-lift", "ci-low", "ci-high"):
        s.add_argument(f"--{f}", type=float)
    sub.add_parser("summary")
    p = sub.add_parser("prior")
    p.add_argument("--lever", required=True)
    a = ap.parse_args(argv)
    {"init": cmd_init, "add": cmd_add, "summary": cmd_summary, "prior": cmd_prior}[a.cmd](a)


if __name__ == "__main__":
    main()
