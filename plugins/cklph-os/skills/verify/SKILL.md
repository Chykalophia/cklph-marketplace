---
name: verify
description: The VERIFY phase of the cklph-os flow — prove it works. Run build/type-check/tests and walk the spec's acceptance criteria. Use after review, before ship.
---

# verify — does it actually work?

1. Run the project's checks (type-check, build, test suite — per `AGENTS.md`). Capture real output.
2. Run **each task's executable acceptance command** and walk the spec's **acceptance criteria** one by
   one — confirm each is met with captured evidence, not "looks right."
3. **Attack tests intact.** From the repo root run `"${CLAUDE_PLUGIN_ROOT}/scripts/attack-tests.sh" check <base>`
   (`<base>` per `flow` → Hand-offs). It fails if any locked test changed after its lock, was dropped
   from history, or doesn't pass under the command recorded at lock time, and on any unlock you
   weren't told to allow. A failure is a gap. It checks the test file only: helpers, fixtures and
   runner config the test relies on are covered by `review`, not by the script.
4. Anything failing → emit a **structured gap list** (`@gaps-format.md`): diagnose the **root cause**
   (reproduce it first; `debugging` owns that method, and `browser-debug` covers a UI or console
   failure in the running app), route each `fix_task` back to `build` as a gaps-only wave, then re-verify.
   Keep looping while each round closes real gaps; stop and escalate on churn or after 5 rounds
   (`../review/two-reviewer-gate.md`, Rounds).

5. **Evidence check on the claim itself.** Every "done", "fixed" or "works" in your report points at
   evidence from *this* session, as `@rationalization-patterns.md` defines it. "Should work now", "I believe this fixes", "likely resolved" with no
   output beside them fail this check: run the command or downgrade the claim. **A downgraded or
   unrun claim is a gap item**, so the report ends `## GAPS FOUND`, never `## VERIFIED`. Full list and
   what counts as evidence: `@rationalization-patterns.md`.

Do **not** claim done on "looks right" — there must be evidence (see `@rationalization-patterns.md`).
For UI, exercise the feature, don't just type-check. End with `## VERIFIED` or `## GAPS FOUND`. Hands off to `ship` only when verified; `ship` blocks on
`## GAPS FOUND`.
