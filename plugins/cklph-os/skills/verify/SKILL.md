---
name: verify
description: The VERIFY phase of the cklph-os flow — prove it works. Run build/type-check/tests and walk the spec's acceptance criteria. Use after review, before ship.
---

# verify — does it actually work?

1. Run the project's checks (type-check, build, test suite — per `AGENTS.md`). Capture real output.
   Step 3 fails on any uncommitted change, so run `git status --porcelain --untracked-files=all`
   before and after the checks. Undo only what appeared in between (`git checkout -- <file>` for a
   rewritten tracked file such as `next-env.d.ts`; remove new build output). Never delete anything
   else: an untracked file that was already there may be the user's. Ask, or set it aside with
   `git stash push --include-untracked -m "verify leftovers"`, which can be undone.
2. Run **each task's executable acceptance command** and walk the spec's **acceptance criteria** one by
   one — confirm each is met with captured evidence, not "looks right."
3. **Attack tests intact.** From the repo root run
   `"${CLAUDE_PLUGIN_ROOT}/scripts/attack-tests.sh" check <base> --require-file docs/flow/<task-slug>/attack-tests.txt`
   (`<base>` per `flow` → Hand-offs; add `--branch <name>` on a detached HEAD; add `--clean` when the
   test command doesn't need gitignored files such as `node_modules`, so a fix that only exists in
   an ignored file fails too). It fails if a locked test was touched after its lock, was dropped,
   forged or re-locked, or doesn't pass under its recorded command in time, and on any unlock the
   user didn't approve. A failure is a gap. It checks the test file only: helpers, fixtures and
   runner config are `review`'s job (its NOTE lines list the ones that changed).
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
