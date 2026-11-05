"""Shared statistics helpers for the experiment-design scripts.

Standard library only, so the scripts run anywhere Python 3.8+ runs
(Claude, Cowork, Claude Code, a client laptop) without installing numpy/scipy.
"""
import math
from statistics import NormalDist

_N = NormalDist()


def z_crit(alpha, two_sided=True):
    """Critical z for a significance level."""
    return _N.inv_cdf(1 - alpha / 2) if two_sided else _N.inv_cdf(1 - alpha)


def norm_cdf(x):
    return _N.cdf(x)


def two_sided_p(z):
    return math.erfc(abs(z) / math.sqrt(2))  # avoids 1 - cdf rounding to 0 in the far tail


# --- chi-square survival function (for SRM checks) -------------------------

def _gser(a, x):
    """Lower regularized gamma P(a, x) by series (x < a + 1)."""
    ap, total, delta = a, 1.0 / a, 1.0 / a
    for _ in range(10000):
        ap += 1
        delta *= x / ap
        total += delta
        if abs(delta) < abs(total) * 1e-15:
            break
    return total * math.exp(-x + a * math.log(x) - math.lgamma(a))


def _gcf(a, x):
    """Upper regularized gamma Q(a, x) by continued fraction (x >= a + 1)."""
    tiny = 1e-300
    b = x + 1 - a
    c = 1 / tiny
    d = 1 / b
    h = d
    for i in range(1, 10000):
        an = -i * (i - a)
        b += 2
        d = an * d + b
        d = tiny if abs(d) < tiny else d
        c = b + an / c
        c = tiny if abs(c) < tiny else c
        d = 1 / d
        delta = d * c
        h *= delta
        if abs(delta - 1) < 1e-15:
            break
    return math.exp(-x + a * math.log(x) - math.lgamma(a)) * h


def chi2_sf(stat, df):
    """P(X >= stat) for a chi-square distribution with df degrees of freedom."""
    if stat <= 0:
        return 1.0
    a, x = df / 2.0, stat / 2.0
    if x < a + 1:
        return 1.0 - _gser(a, x)
    return _gcf(a, x)


# --- design sensitivity (Gelman & Carlin 2014 "retrodesign") ---------------

def retrodesign(true_effect, se, alpha=0.05, grid=4000):
    """Power, Type S error rate and exaggeration ratio (Type M) for a test.

    true_effect: the effect you believe is real (e.g. the planned MDE), same
    units as se. Returns dict(power, type_s, exaggeration).
    """
    if se <= 0 or true_effect == 0:
        return {"power": float("nan"), "type_s": float("nan"), "exaggeration": float("nan")}
    zc = z_crit(alpha)
    lam = abs(true_effect) / se
    p_hi = 1 - norm_cdf(zc - lam)
    p_lo = norm_cdf(-zc - lam)
    power = p_hi + p_lo
    type_s = p_lo / power if power > 0 else float("nan")
    # E[|estimate| | significant] by numeric integration of the sampling density
    lo, hi = lam - 9, lam + 9
    step = (hi - lo) / grid
    num = 0.0
    for i in range(grid):
        z = lo + (i + 0.5) * step
        if abs(z) > zc:
            num += abs(z) * math.exp(-0.5 * (z - lam) ** 2) * step
    num /= math.sqrt(2 * math.pi)
    exaggeration = (num / power) / lam if power > 0 else float("nan")
    return {"power": power, "type_s": type_s, "exaggeration": exaggeration}


def pct(x, digits=2):
    return f"{x * 100:.{digits}f}%"
