# Regression Watch thresholds & the confirmation engine

The point of these settings is to make Regression Watch trustworthy. Too loose and it misses breakage; too tight and it cries wolf. Tune per site.

## Retries (anti-flake)
- `retries` (default 3): every non-pass check is re-tested this many times. A finding is **confirmed** only if it fails in all runs. Mixed results → **quarantined** (logged, never alerted).
- Raise to 5 for noisy/slow sites. Never set to 1 — that defeats the whole anti-flake design.

## Visual tolerance
- `visual.tolerancePct` (default 1.0): % of changed pixels (after masking) above which VR1 is a regression.
- Typical: 0.5–1.0 for stable marketing pages, 2–3 for content-heavy or animated pages.
- A confirmed real change (e.g., hero swap) lands well above this (the fixture demo shows ~29%).

## Masking dynamic regions (the false-alarm killer)
- `visual.masks`: array of CSS selectors for regions that legitimately change every load — timestamps, carousels, A/B slots, live counters, cookie banners, personalized blocks.
- Regression Watch resolves each selector's bounding box at probe time and blacks it out in both images before diffing. Mask the dynamic; keep watching everything around it.
- If VR1 keeps flapping, the fix is almost always "add a mask," not "raise tolerance."

## Severity → action
- Critical/High confirmed → alert.
- Medium → alert if you opt in; otherwise report-only.
- Low / "changed (FYI)" → report-only, never alerts.

## Baseline hygiene
- Capture baseline only from a known-good state.
- Roll the baseline forward on every intentional, accepted change, or you'll get repeat alerts for a change you already approved.
- Keep one baseline dir per site (`baselines/<client>/`).
