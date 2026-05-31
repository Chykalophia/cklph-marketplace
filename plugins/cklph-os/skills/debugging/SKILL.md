---
name: debugging
description: Systematic root-cause debugging. Use when a build or test fails, behavior is unexpected, or an implementer hits a blocker mid-wave. Reproduce, localize, fix the root cause, guard with a regression test.
---

# debugging — root cause, not symptom

1. **Preserve evidence** — capture the exact error / stack / repro steps before changing anything.
2. **Reproduce deterministically (Prove-It)** — write a failing test / curl / script that fails *every*
   time. **For bug fixes, write this BEFORE attempting the fix — it IS your regression guard, kept
   verbatim.** No repro = no fix yet.
3. **Localize** — bisect (`git bisect`, comment-out, binary-search the input). Form 2–3 **falsifiable**
   hypotheses and test the cheapest first. Tag temporary debug logs `[DEBUG-xxxx]` for one-grep cleanup.
4. **Fix the root cause** — if you're patching a symptom, you haven't found it yet.
5. **Guard** — the failing test from step 2 now passes; remove the debug logs. If you skipped the
   test-first move, add the regression test now and confirm it fails pre-fix, passes post-fix.

Feeds the `verify` → gap → `build` loop. End with `## ROOT CAUSE: <one line>` or `## STILL UNKNOWN`.
