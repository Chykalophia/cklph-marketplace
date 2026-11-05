#!/usr/bin/env python3
"""Sample size, duration and detectable effect for an A/B test.

Two modes:
  * size:  given a baseline and a relative MDE -> visitors per arm and days.
  * mde:   given the traffic you actually have and a max duration -> the
           smallest relative effect the test can reliably detect.

Works for conversion rates (--baseline 0.032) and for continuous metrics such
as revenue per visitor (--mean 2.40 --sd 18.5). --cuped-r applies CUPED
variance reduction (variance x (1 - r^2)) when the testing tool supports it.

Examples:
  python3 power.py size --baseline 0.025 --mde 0.10 --daily-visitors 4000
  python3 power.py mde  --baseline 0.025 --daily-visitors 4000 --max-days 28
  python3 power.py size --mean 2.4 --sd 18.5 --mde 0.05 --daily-visitors 9000 --cuped-r 0.5
"""
import argparse
import json
import math
import os
import sys
from statistics import NormalDist

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _stats import z_crit, pct  # noqa: E402


def n_per_arm_prop(p, mde_rel, alpha, power, two_sided=True, var_mult=1.0):
    p2 = p * (1 + mde_rel)
    if not 0 < p < 1 or not 0 < p2 < 1:
        raise ValueError("baseline and baseline*(1+mde) must both be between 0 and 1")
    za = z_crit(alpha, two_sided)
    zb = NormalDist().inv_cdf(power)
    pbar = (p + p2) / 2
    num = (za * math.sqrt(2 * pbar * (1 - pbar)) + zb * math.sqrt(p * (1 - p) + p2 * (1 - p2))) ** 2
    return math.ceil(var_mult * num / (p2 - p) ** 2)


def n_per_arm_mean(mean, sd, mde_rel, alpha, power, two_sided=True, var_mult=1.0):
    za = z_crit(alpha, two_sided)
    zb = NormalDist().inv_cdf(power)
    delta = mean * mde_rel
    return math.ceil(var_mult * 2 * (za + zb) ** 2 * sd ** 2 / delta ** 2)


def n_fn(args, var_mult):
    if args.baseline is not None:
        return lambda m: n_per_arm_prop(args.baseline, m, args.alpha_adj, args.power, not args.one_sided, var_mult)
    return lambda m: n_per_arm_mean(args.mean, args.sd, m, args.alpha_adj, args.power, not args.one_sided, var_mult)


def solve_mde(nfun, n_available):
    lo, hi = 1e-4, 5.0
    try:
        if nfun(hi) > n_available:
            return None
    except ValueError:
        hi = 0.99
    for _ in range(100):
        mid = (lo + hi) / 2
        try:
            need = nfun(mid)
        except ValueError:
            hi = mid
            continue
        if need > n_available:
            lo = mid
        else:
            hi = mid
    try:  # the clamped upper bound may itself be undetectable or outside the valid range
        return hi if nfun(hi) <= n_available else None
    except ValueError:
        return None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["size", "mde"])
    ap.add_argument("--baseline", type=float, help="baseline conversion rate, e.g. 0.025")
    ap.add_argument("--mean", type=float, help="baseline mean of a continuous metric (e.g. RPV)")
    ap.add_argument("--sd", type=float, help="standard deviation of the continuous metric")
    ap.add_argument("--mde", type=float, help="relative minimum detectable effect, e.g. 0.10 = +10%%")
    ap.add_argument("--alpha", type=float, default=0.05)
    ap.add_argument("--power", type=float, default=0.80)
    ap.add_argument("--one-sided", action="store_true", help="one-sided test (only if pre-registered)")
    ap.add_argument("--variants", type=int, default=1, help="number of treatment arms (Bonferroni-adjusts alpha)")
    ap.add_argument("--daily-visitors", type=float, help="eligible visitors per day entering the test, all arms")
    ap.add_argument("--max-days", type=float, default=28, help="mde mode: longest acceptable run")
    ap.add_argument("--cuped-r", type=float, default=0.0, help="correlation of metric with pre-period covariate")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    if (args.baseline is None) == (args.mean is None):
        ap.error("give exactly one of --baseline (conversion) or --mean/--sd (continuous)")
    if args.baseline is not None and not 0 < args.baseline < 1:
        ap.error("--baseline must be a rate between 0 and 1, e.g. 0.025")
    if args.mean is not None:
        if args.sd is None:
            ap.error("--mean needs --sd")
        if args.mean <= 0 or args.sd <= 0:
            ap.error("--mean and --sd must be positive (the MDE is relative to the mean)")
    if args.variants < 1:
        ap.error("--variants must be at least 1")
    if not 0 < args.alpha < 1 or not 0 < args.power < 1:
        ap.error("--alpha and --power must be between 0 and 1")
    if not 0 <= args.cuped_r < 1:
        ap.error("--cuped-r must be in [0, 1)")
    if args.mde is not None and args.mde <= 0:
        ap.error("--mde must be positive")
    if args.daily_visitors is not None and args.daily_visitors <= 0:
        ap.error("--daily-visitors must be positive")
    args.alpha_adj = args.alpha / args.variants
    var_mult = 1 - args.cuped_r ** 2
    arms = args.variants + 1
    nfun = n_fn(args, var_mult)
    out = {"alpha_per_comparison": args.alpha_adj, "power": args.power, "arms": arms,
           "cuped_variance_multiplier": round(var_mult, 4)}

    if args.mode == "size":
        if args.mde is None:
            ap.error("size mode needs --mde")
        try:
            n = nfun(args.mde)
        except ValueError as e:
            ap.error(str(e))
        out.update(mde_relative=args.mde, n_per_arm=n, n_total=n * arms)
        if args.daily_visitors:
            days = n * arms / args.daily_visitors
            out["days_needed"] = round(days, 1)
            out["days_recommended"] = max(14, 7 * math.ceil(days / 7))
    else:
        if not args.daily_visitors:
            ap.error("mde mode needs --daily-visitors")
        n_avail = int(args.daily_visitors * args.max_days / arms)
        m = solve_mde(nfun, n_avail)
        out.update(max_days=args.max_days, n_per_arm_available=n_avail, detectable_mde_relative=m)

    if args.json:
        print(json.dumps(out, indent=2))
        return out

    print("## Test sizing")
    print(f"- Arms: {arms} (alpha per comparison {args.alpha_adj:.4g}, power {args.power:.0%})")
    if var_mult < 1:
        print(f"- CUPED assumed: variance x{var_mult:.2f} (r = {args.cuped_r})")
    if args.mode == "size":
        print(f"- Relative MDE: {pct(args.mde, 1)}")
        print(f"- Visitors needed: {out['n_per_arm']:,} per arm, {out['n_total']:,} total")
        if "days_needed" in out:
            print(f"- Duration at {args.daily_visitors:,.0f}/day: {out['days_needed']} days "
                  f"-> run {out['days_recommended']} days (whole weeks, min 14)")
            if out["days_needed"] > 56:
                print("- WARNING: over 8 weeks. Cookie churn and seasonality make this unreliable. "
                      "See references/low-traffic.md.")
    else:
        m = out["detectable_mde_relative"]
        print(f"- Traffic in {args.max_days:g} days: {n_avail:,} per arm")
        if m is None:
            print("- Cannot detect any plausible effect in this window. Do not A/B test this; "
                  "see references/low-traffic.md.")
        else:
            print(f"- Smallest reliably detectable lift: {pct(m, 1)} relative")
            if m > 0.10:
                print("- In large test datasets most real effects are a few percent or less, so a test this "
                      "insensitive will usually end inconclusive. See references/low-traffic.md.")
    return out


if __name__ == "__main__":
    main()
