# Rationalization patterns — "done" needs evidence

Lazy depth for `verify`. A claim of done is a claim about the world. If the output that proves it
is not on screen in this session, the claim is a guess, however confident it sounds.

## The check
Before sending a report that says "done", "fixed", "works", "verified" or `## VERIFIED`, reread
that draft, the one about to go out, not an earlier message. For every claim in it, point at the evidence **from this session** that shows it (see below). No
output → run the command, or rewrite the claim as what it is ("not yet run").

## Phrases that mean "I didn't check"
Said with no command output beside them, each of these is a finding against your own work:

| Phrase | What it usually hides | Replace with |
|---|---|---|
| "should work now", "should be fixed" | the fix was never run | run the repro; paste the passing output |
| "I believe this fixes", "this likely resolves" | a hypothesis presented as a result | test the hypothesis, then report the result |
| "looks good", "looks right" | code was read, not executed | run it; for UI, exercise it in the browser |
| "tests should pass" | the suite was not run | run the suite; paste the summary line |
| "this is a pre-existing issue" | a failure you are stepping around | prove it fails on the base revision too: `git worktree add --detach <tmp> <base>`, install and build there first, rerun, then `git worktree remove --force <tmp>` on that tmp path only (a stash reruns *this* branch's commits), or fix it |
| "skipping tests / lint / type-check for now" | a gate turned off to get to green | run it; if it can't run, that is a `## GAPS FOUND` item |
| "tests are failing but I'll fix them" | done claimed with red tests | not done; route the failure back to `build` |
| "leaving the failing test", "won't fix the broken build" | a known failure shipped | fix it, or ask the user to accept it explicitly |
| "it compiles, so…" | type-check mistaken for behavior | run the behavior |
| "same as before", "unchanged" | a regression nobody looked for | diff the output against the base |

## Evidence that counts
This section is the rule `verify`, `ship` and `spec` point to.
- Command output from this session: the test summary line, `tsc` exit status, the curl response,
  the build log tail.
- Observed behavior: what the screen showed after the click, with the steps taken. Per criterion:
  where an executable check exercises that same behavior, it decides and observation is
  supplemental; where none does (a backend test for a UI criterion, say), observation is required.
- For a bug fix: the repro failing **before** and passing **after**.

## Evidence that doesn't
- Output from an earlier session or another branch.
- "The CI will catch it."
- A subagent's summary that says it passed, without the output it saw.
- A green check on something that never ran (a skipped job, a filtered test).

A failed check here is a `## GAPS FOUND`, not a footnote. `ship` does not proceed past it.
