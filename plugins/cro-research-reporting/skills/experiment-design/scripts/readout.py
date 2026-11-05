#!/usr/bin/env python3
"""A/B test readout: effect with confidence interval, SRM check, guardrails,
a Twyman's-law flag, a winner's-curse (exaggeration) estimate and a decision.

Decision rule (after Spotify's risk-aware rule, Schultzberg et al. 2024):
  SHIP          primary metric significantly better, every guardrail shown
                non-inferior, no SRM.
  DO NOT SHIP   primary significantly worse, or a guardrail fails, or SRM.
  INCONCLUSIVE  anything else. Not a loss; record the learning.

Conversion metric:
  python3 readout.py --control 48210 1205 --variant 48530 1302 --mde 0.08 --days 21
Continuous metric (n, mean, sd), e.g. revenue per visitor:
  python3 readout.py --type mean --control 48210 2.41 19.8 --variant 48530 2.55 20.4
Guardrail (name,ctrl_n,ctrl_conv,var_n,var_conv,margin[,lower]); "lower" means
lower is better (e.g. return rate). margin 0.02 = may not be worse by >2% relative:
  --guardrail "refund_rate,1205,61,1302,70,0.10,lower"
Continuous guardrail (e.g. revenue per visitor): name,mean,ctrl_n,ctrl_mean,ctrl_sd,
var_n,var_mean,var_sd,margin[,lower]:
  --guardrail "rpv,mean,48210,2.41,19.8,48530,2.30,19.1,0.03"
With several variants, each guardrail names the variant it measures (name@N,
N counting from 1), since its counts belong to one control/variant comparison:
  --guardrail "refund_rate@2,1205,61,1250,66,0.10,lower"
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _stats import z_crit, two_sided_p, retrodesign, pct  # noqa: E402
from srm_check import srm  # noqa: E402


def compare_prop(n1, x1, n2, x2, alpha):
    p1, p2 = x1 / n1, x2 / n2
    se = math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2)
    diff = p2 - p1
    z = diff / se if se else 0.0
    zc = z_crit(alpha)
    rel = diff / p1 if p1 else float("nan")
    if x1 > 0 and x2 > 0:
        se_log = math.sqrt((1 - p1) / (n1 * p1) + (1 - p2) / (n2 * p2))
        lr = math.log(p2 / p1)
        rel_ci = (math.exp(lr - zc * se_log) - 1, math.exp(lr + zc * se_log) - 1)
    else:
        rel_ci = (float("nan"), float("nan"))
    return {"control": p1, "variant": p2, "abs_diff": diff, "abs_ci": (diff - zc * se, diff + zc * se),
            "rel_lift": rel, "rel_ci": rel_ci, "p_value": two_sided_p(z), "se": se}


def compare_mean(n1, m1, s1, n2, m2, s2, alpha):
    se = math.sqrt(s1 ** 2 / n1 + s2 ** 2 / n2)
    diff = m2 - m1
    zc = z_crit(alpha)
    z = diff / se if se else 0.0
    rel = diff / m1 if m1 else float("nan")
    # delta-method CI for the ratio of means
    se_rel = math.sqrt((s2 ** 2 / n2) / m1 ** 2 + (m2 ** 2) * (s1 ** 2 / n1) / m1 ** 4) if m1 else float("nan")
    return {"control": m1, "variant": m2, "abs_diff": diff, "abs_ci": (diff - zc * se, diff + zc * se),
            "rel_lift": rel, "rel_ci": (rel - zc * se_rel, rel + zc * se_rel), "p_value": two_sided_p(z), "se": se}


def guardrail_check(spec, alpha):
    parts = [s.strip() for s in spec.split(",")]
    is_mean = len(parts) > 1 and parts[1].lower() == "mean"
    base = 9 if is_mean else 6
    if len(parts) not in (base, base + 1):
        raise ValueError(f"bad guardrail spec: {spec}")
    if len(parts) == base + 1 and parts[-1].lower() != "lower":
        raise ValueError(f"bad guardrail direction '{parts[-1]}' (only 'lower' is allowed): {spec}")
    try:
        if is_mean:
            n1, m1, s1, n2, m2, s2 = int(parts[2]), float(parts[3]), float(parts[4]), \
                int(parts[5]), float(parts[6]), float(parts[7])
            margin = float(parts[8])
            if n1 <= 0 or n2 <= 0 or m1 <= 0 or s1 < 0 or s2 < 0 or margin <= 0:
                raise ValueError
        else:
            n1, x1, n2, x2, margin = int(parts[1]), int(parts[2]), int(parts[3]), int(parts[4]), float(parts[5])
            if n1 <= 0 or n2 <= 0 or not 0 < x1 <= n1 or not 0 < x2 <= n2 or margin <= 0:
                raise ValueError
    except ValueError:
        raise ValueError(f"bad guardrail numbers (visitors > 0, at least one conversion in each arm since the "
                         f"relative interval is undefined at zero, or a positive control mean, sd >= 0, "
                         f"margin > 0): {spec}") from None
    name = parts[0]
    variant = 1
    if "@" in name:
        name, _, idx = name.rpartition("@")
        if not idx.isdigit() or int(idx) < 1:
            raise ValueError(f"bad guardrail variant '@{idx}': {spec}")
        variant = int(idx)
    lower_better = len(parts) == base + 1
    # one-sided non-inferiority at alpha: use a (1 - 2*alpha) two-sided interval bound
    r = compare_mean(n1, m1, s1, n2, m2, s2, 2 * alpha) if is_mean else compare_prop(n1, x1, n2, x2, 2 * alpha)
    lo, hi = r["rel_ci"]
    ok = (hi < margin) if lower_better else (lo > -margin)
    return {"name": name, "variant": variant, "rel_lift": r["rel_lift"], "rel_ci": r["rel_ci"], "margin": margin,
            "lower_is_better": lower_better, "non_inferior": ok}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--type", choices=["prop", "mean"], default="prop")
    ap.add_argument("--control", nargs="+", type=float, required=True)
    ap.add_argument("--variant", nargs="+", type=float, action="append", required=True,
                    help="repeat for multiple variants")
    ap.add_argument("--alpha", type=float, default=0.05)
    ap.add_argument("--weights", nargs="+", type=float, help="configured split for the SRM check")
    ap.add_argument("--mde", type=float, help="planned relative MDE (enables the exaggeration estimate)")
    ap.add_argument("--days", type=float, help="days the test ran")
    ap.add_argument("--guardrail", action="append", default=[])
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    want = 2 if args.type == "prop" else 3
    for arm in [args.control] + args.variant:
        if len(arm) != want:
            ap.error(f"--type {args.type} needs {want} numbers per arm")
        if arm[0] <= 0 or (args.type == "prop" and not 0 < arm[1] <= arm[0]):
            ap.error("each arm needs visitors > 0 and conversions between 1 and visitors "
                     "(the relative interval is undefined with zero events)")
    if args.type == "mean" and args.control[1] <= 0:
        ap.error("the control mean must be positive (relative lift is measured against it)")
    if args.weights and any(w <= 0 for w in args.weights):
        ap.error("--weights must all be positive")
    k = len(args.variant)
    alpha = args.alpha / k  # Bonferroni across variants

    counts = [int(args.control[0])] + [int(v[0]) for v in args.variant]
    srm_r = srm(counts, args.weights)
    try:
        guards = [guardrail_check(g, alpha) for g in args.guardrail]  # same Bonferroni alpha as the primary
    except ValueError as e:
        ap.error(str(e))
    if k > 1 and any("@" not in g.split(",")[0] for g in args.guardrail):
        ap.error("with several variants, name each guardrail's variant: --guardrail 'name@N,...'")
    if any(g["variant"] > k for g in guards):
        ap.error(f"a guardrail names a variant beyond the {k} given")

    results = []
    for i, v in enumerate(args.variant, 1):
        own = [g for g in guards if g["variant"] == i]
        if args.type == "prop":
            r = compare_prop(int(args.control[0]), int(args.control[1]), int(v[0]), int(v[1]), alpha)
            base = r["control"]
        else:
            r = compare_mean(int(args.control[0]), args.control[1], args.control[2], int(v[0]), v[1], v[2], alpha)
            base = r["control"]
        sig = r["p_value"] < alpha
        r["significant"] = sig
        if args.mde:
            r["design"] = retrodesign(args.mde * base, r["se"], alpha)
        r["twyman_flag"] = sig and abs(r["rel_lift"]) > 0.10
        if srm_r["srm"]:
            decision = "DO NOT READ (SRM)"
        elif sig and r["abs_diff"] < 0:
            decision = "DO NOT SHIP"
        elif any(not g["non_inferior"] for g in own):
            decision = "DO NOT SHIP (guardrail)"
        elif sig and r["abs_diff"] > 0:
            decision = "SHIP"
        else:
            decision = "INCONCLUSIVE"
        r["decision"] = decision
        results.append(r)

    out = {"alpha_per_comparison": alpha, "srm": srm_r, "guardrails": guards, "variants": results}
    if args.json:
        print(json.dumps(out, indent=2, default=lambda o: list(o) if isinstance(o, tuple) else str(o)))
        return out

    fmt = (lambda x: pct(x, 2)) if args.type == "prop" else (lambda x: f"{x:,.4g}")
    print("## Test readout")
    if args.days is not None and (args.days < 14 or args.days % 7):
        print(f"- Note: ran {args.days:g} days. Prefer whole weeks and at least 14 days to cover weekly cycles.")
    print(f"- SRM: {'FAIL' if srm_r['srm'] else 'pass'} (p = {srm_r['p_value']:.2e}, shares {srm_r['observed_share']})")
    for i, r in enumerate(results, 1):
        lo, hi = r["rel_ci"]
        print(f"\n### Variant {i}: {r['decision']}")
        print(f"- Control {fmt(r['control'])} vs variant {fmt(r['variant'])}")
        print(f"- Relative lift {pct(r['rel_lift'], 1)} ({(1 - alpha):.0%} CI {pct(lo, 1)} to {pct(hi, 1)}), "
              f"p = {r['p_value']:.4f}")
        if "design" in r:
            d = r["design"]
            print(f"- At the planned MDE ({pct(args.mde, 0)}): power {d['power']:.0%}, "
                  f"significant results overstate the true effect ~{d['exaggeration']:.1f}x on average, "
                  f"wrong-sign risk {d['type_s']:.1%}")
        if r["significant"] and r["abs_diff"] > 0:
            print("- Winner's curse: report the interval, not the point estimate, and expect the "
                  "realised lift after launch to be smaller.")
        if r["twyman_flag"]:
            print("- Twyman's law: a lift over 10% is unusual. Check tracking, bots, and whether the "
                  "variant broke something before trusting it.")
    if guards:
        print("\n### Guardrails")
        for g in guards:
            lo, hi = g["rel_ci"]
            word = "lower is better" if g["lower_is_better"] else "higher is better"
            tag = f" [variant {g['variant']}]" if k > 1 else ""
            print(f"- {g['name']}{tag} ({word}): {pct(g['rel_lift'], 1)} [{pct(lo, 1)}, {pct(hi, 1)}], "
                  f"margin {pct(g['margin'], 0)} -> {'non-inferior' if g['non_inferior'] else 'FAIL / not shown safe'}")
    return out


if __name__ == "__main__":
    main()
