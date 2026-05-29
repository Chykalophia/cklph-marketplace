---
name: verify
description: The VERIFY phase of the cklph-os flow — prove it works. Run build/type-check/tests and walk the spec's acceptance criteria. Use after review, before ship.
---

# verify — does it actually work?

1. Run the project's checks (type-check, build, test suite — per `AGENTS.md`). Capture real output.
2. Run **each task's executable acceptance command** and walk the spec's **acceptance criteria** one by
   one — confirm each is met with captured evidence, not "looks right."
3. Anything failing → emit a **structured gap list** (`@gaps-format.md`): diagnose the **root cause**
   (reproduce it first), route each `fix_task` back to `build` as a gaps-only wave, then re-verify.

Do **not** claim done on "looks right" — there must be evidence (passing output, observed behavior).
For UI, exercise the feature, don't just type-check. End with `## VERIFIED` or `## GAPS FOUND`. Hands off to `ship` only when verified.
