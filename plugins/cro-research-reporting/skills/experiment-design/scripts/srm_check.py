#!/usr/bin/env python3
"""Sample ratio mismatch (SRM) check.

An SRM means the traffic split you observed is not the split you configured.
It signals a broken assignment, redirect, bot filter or tracking join, and it
invalidates the test result. About 6% of A/B tests at Microsoft have one
(Fabijan et al., Microsoft ExP, 2020).

Examples:
  python3 srm_check.py 50211 49123                 # expects an even split
  python3 srm_check.py 50211 49123 --weights 50 50
  python3 srm_check.py 33500 33100 31900 --weights 1 1 1
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _stats import chi2_sf  # noqa: E402


def srm(counts, weights=None, threshold=0.001):
    if weights is None:
        weights = [1] * len(counts)
    if len(weights) != len(counts):
        raise ValueError("need one weight per arm")
    if not 0 < threshold < 1:
        raise ValueError("threshold must be between 0 and 1")
    if any(not math.isfinite(w) or w <= 0 for w in weights) or any(c < 0 for c in counts) or sum(counts) <= 0:
        raise ValueError("weights must be positive finite numbers and counts non-negative with a positive total")
    total, wsum = sum(counts), float(sum(weights))
    expected = [total * w / wsum for w in weights]
    stat = sum((o - e) ** 2 / e for o, e in zip(counts, expected))
    p = chi2_sf(stat, len(counts) - 1)
    return {"counts": counts, "expected": [round(e, 1) for e in expected],
            "observed_share": [round(c / total, 4) for c in counts],
            "chi2": round(stat, 3), "p_value": p, "threshold": threshold, "srm": p < threshold}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("counts", nargs="+", type=int, help="visitors (or users) per arm, control first")
    ap.add_argument("--weights", nargs="+", type=float, help="configured split, e.g. 50 50 (default even)")
    ap.add_argument("--threshold", type=float, default=0.001,
                    help="p-value below which to flag SRM (default 0.001, a common industry choice)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    if len(args.counts) < 2:
        ap.error("need at least two arms")
    try:
        r = srm(args.counts, args.weights, args.threshold)
    except ValueError as e:
        ap.error(str(e))
    if args.json:
        print(json.dumps(r, indent=2))
        return r
    print("## SRM check")
    print(f"- Observed: {r['counts']} | expected: {r['expected']}")
    print(f"- Chi-square {r['chi2']}, p = {r['p_value']:.2e}")
    if r["srm"]:
        print("- FAIL: sample ratio mismatch. Do not read the result. Check assignment, redirects, "
              "bot filtering, page-load timing differences and analytics joins first.")
    else:
        print("- Pass: split is consistent with the configuration.")
    return r


if __name__ == "__main__":
    main()
