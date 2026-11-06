#!/usr/bin/env python3
"""Colour parsing and WCAG contrast maths.

Shared by ``brand-tokens.py`` and ``lint-a11y.py``. No third-party deps —
this has to run in CI on a bare Python 3.11.
"""

from __future__ import annotations

import re
from typing import Iterable

__all__ = [
    "parse_color",
    "relative_luminance",
    "contrast_ratio",
    "flatten",
    "required_ratio",
    "passes",
]

_HEX_RE = re.compile(r"^#([0-9a-fA-F]{3,8})$")
_RGB_RE = re.compile(
    r"^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$",
    re.IGNORECASE,
)

# Role taxonomy drives the threshold. Getting this wrong in either direction
# is costly: too strict and the linter cries wolf until someone disables it;
# too loose and it certifies unreadable output.
#
#   TEXT_ROLES     4.5:1  - SC 1.4.3. Diagram text is always "small" text:
#                           the 3:1 large-text allowance starts at 24px
#                           regular / 18.66px bold, which no label reaches.
#   BORDER_ROLES   3.0:1  - SC 1.4.11. A border that carries meaning (a node
#                           boundary, an axis) is a graphical object.
#   DECORATIVE     exempt - SC 1.4.11 explicitly exempts decoration. A hairline
#                           section separator conveys nothing on its own.
#   RAMP_ROLES     n/a    - sequential and diverging steps are *fills*, judged
#                           on monotonic luminance and step-to-step separation
#                           (see check_ramp), not against paper. Demanding 3:1
#                           from the pale end of a ramp would ban every
#                           sequential scale ever designed.
TEXT_ROLES = {
    "ink", "ink-2", "muted", "soft", "accent", "link",
    "cat-1", "cat-2", "cat-3", "cat-4", "cat-5",
}
BORDER_ROLES = {"rule-solid"}
DECORATIVE_ROLES = {"rule", "paper", "paper-2", "accent-tint"}
RAMP_PREFIXES = ("seq-", "div-")
NONTEXT_ROLES = BORDER_ROLES


def parse_color(value: str) -> tuple[float, float, float, float]:
    """Parse ``#rgb``/``#rrggbb``/``#rrggbbaa``/``rgb()``/``rgba()``.

    Returns ``(r, g, b, a)`` with channels in 0-255 and alpha in 0-1.
    Raises ``ValueError`` on anything else so callers fail loudly rather than
    silently linting a token they could not read.
    """
    value = value.strip()

    m = _HEX_RE.match(value)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        elif len(h) == 4:
            h = "".join(c * 2 for c in h)
        if len(h) == 6:
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)
        if len(h) == 8:
            return (
                int(h[0:2], 16),
                int(h[2:4], 16),
                int(h[4:6], 16),
                int(h[6:8], 16) / 255.0,
            )
        raise ValueError(f"unsupported hex length: {value}")

    m = _RGB_RE.match(value)
    if m:
        r, g, b = (float(m.group(i)) for i in (1, 2, 3))
        a = float(m.group(4)) if m.group(4) is not None else 1.0
        return (r, g, b, a)

    raise ValueError(f"cannot parse colour: {value!r}")


def flatten(
    fg: tuple[float, float, float, float],
    bg: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    """Composite a translucent foreground over an opaque background.

    Contrast ratios are only meaningful between opaque colours. A token like
    ``rgba(17,16,16,0.14)`` has to be resolved against the paper it sits on
    before it can be measured — otherwise every hairline in the system looks
    like it passes.
    """
    a = fg[3]
    return (
        fg[0] * a + bg[0] * (1 - a),
        fg[1] * a + bg[1] * (1 - a),
        fg[2] * a + bg[2] * (1 - a),
        1.0,
    )


def _channel(c: float) -> float:
    s = c / 255.0
    return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4


def relative_luminance(color: tuple[float, float, float, float]) -> float:
    """WCAG 2.x relative luminance."""
    r, g, b = (_channel(x) for x in color[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(fg: str, bg: str, base: str | None = None) -> float:
    """Contrast ratio between two colour strings, alpha-composited.

    ``base`` is what a translucent *background* resolves against — normally the
    page paper. It matters: ``accent-tint`` is a translucent wash, and
    compositing it against white when the diagram is in dark mode reports a
    failure that does not exist on screen.
    """
    bg_c = parse_color(bg)
    if bg_c[3] < 1.0:
        under = parse_color(base) if base else (255.0, 255.0, 255.0, 1.0)
        if under[3] < 1.0:
            under = flatten(under, (255.0, 255.0, 255.0, 1.0))
        bg_c = flatten(bg_c, under)
    fg_c = parse_color(fg)
    if fg_c[3] < 1.0:
        fg_c = flatten(fg_c, bg_c)

    l1, l2 = relative_luminance(fg_c), relative_luminance(bg_c)
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def is_exempt(role: str) -> bool:
    """True for roles the contrast rule does not apply to."""
    return role in DECORATIVE_ROLES or role.startswith(RAMP_PREFIXES)


def required_ratio(role: str) -> float:
    """Threshold for a semantic role. Meaningful borders 3:1, text 4.5:1."""
    return 3.0 if role in BORDER_ROLES else 4.5


def passes(fg: str, bg: str, role: str, base: str | None = None) -> tuple[bool, float, float]:
    """Return ``(ok, actual_ratio, required_ratio)`` for a role over a bg."""
    need = required_ratio(role)
    got = contrast_ratio(fg, bg, base=base)
    return (got + 1e-9 >= need, got, need)


def check_ramp(steps: list[tuple[str, str]], min_step_ratio: float = 1.25) -> list[str]:
    """Validate a sequential or diverging ramp.

    A ramp is judged on two things a reader actually depends on: that it is
    monotonic in luminance (so it survives greyscale and most colour-vision
    differences), and that adjacent steps are separated enough to be told
    apart.

    Separation is measured as a *contrast ratio* between adjacent steps rather
    than a raw luminance delta. Relative luminance is not perceptually uniform
    — it compresses hard at the dark end, so a fixed delta would wave through
    a pale ramp and reject a dark one that looks identically stepped.

    Diverging ramps are monotonic across the whole run by construction here
    (dark negative -> light middle -> dark positive fails monotonicity), so
    callers pass each half separately.
    """
    problems: list[str] = []
    lums = []
    for name, value in steps:
        try:
            c = parse_color(value)
        except ValueError as exc:
            problems.append(f"{name}: {exc}")
            continue
        if c[3] < 1.0:
            c = flatten(c, (255.0, 255.0, 255.0, 1.0))
        lums.append((name, relative_luminance(c)))

    if len(lums) < 2:
        return problems

    ascending = lums[-1][1] > lums[0][1]
    for (n1, l1), (n2, l2) in zip(lums, lums[1:]):
        if ascending and l2 <= l1:
            problems.append(f"ramp not monotonic at {n1} -> {n2}")
        elif not ascending and l2 >= l1:
            problems.append(f"ramp not monotonic at {n1} -> {n2}")
        step = (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
        if step < min_step_ratio:
            problems.append(
                f"ramp steps {n1} and {n2} are only {step:.2f}:1 apart, "
                f"need {min_step_ratio:.2f}:1 to be distinguishable"
            )
    return problems


def worst(pairs: Iterable[tuple[str, str, str]]) -> float:
    """Lowest ratio across ``(fg, bg, role)`` triples. Useful for summaries."""
    ratios = [contrast_ratio(f, b) for f, b, _ in pairs]
    return min(ratios) if ratios else float("inf")


if __name__ == "__main__":  # pragma: no cover - smoke check
    import sys

    if len(sys.argv) == 3:
        print(f"{contrast_ratio(sys.argv[1], sys.argv[2]):.2f}:1")
    else:
        print("usage: colorlib.py <foreground> <background>")
