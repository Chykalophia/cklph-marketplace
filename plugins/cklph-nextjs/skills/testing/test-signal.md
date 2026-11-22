# test-signal: does this test fail when the feature breaks?

A suite can be green while the feature is broken. In one session, five regressions landed in one
payment flow, and every one passed a test that checked a guard was present. A flag set one line too
early made every successful payment skip submission, in the same commit that added a test for that
flag. The test read the code; it never ran the payment.

Count signal, not tests. A smaller suite whose tests can each fail is worth more than a large one
that describes its own implementation.

## Seven questions per test

Ask them of every test you add, and of every test an AI wrote that you're reviewing.

1. What behavior or regression does it protect? Name it in one line.
2. Would it fail if that behavior broke? Prove it once: reinject the bug and watch it go red.
3. Where does the expected value come from? It must come from the spec, a known example or a real
   caller, never from the code under test or a copy of its logic.
4. Does a stronger test already cover the same path and outcome?
5. Does it observe a boundary that matters (the route's response, the rendered screen, the row in
   the database), or a private detail?
6. Would a harmless refactor break it while the behavior stayed the same?
7. Was it added after a small correction without a new way to fail?

If no distinct regression is left after these, delete or merge it.

## Shapes that pass while the feature is broken

| Shape | What it looks like | Instead |
|---|---|---|
| Guard presence | A regex or source scan proving a line exists (`expect(src).toMatch(/if \(succeeded\)/)`) | Run the path and assert the outcome: one POST, the right screen, the row written |
| Self-computed expected value | `expect(total(items)).toBe(items.reduce(...))`, the same sum the code does | A worked example with the number written down |
| Mock verifies mock | The mock returns X, the test asserts X came back | Mock only the boundary you can't reach, and assert what the code did with it |
| Fixture tautology | The setup inserts the state the test then asserts, without calling the code | Call the use case or route between setup and assertion |
| Defensive machinery | A test that exists only for a fallback, retry or validator that is itself unjustified | Trace the fallback to a requirement, or delete the pair (`error-handling`, "Fail visible") |
| Call counts and order | `toHaveBeenCalledTimes(3)` mirroring today's loop | Assert the effect, unless the count is the contract (billing, retries, idempotency) |
| Presence only | `expect(data).toBeDefined()` beside nothing stronger | Assert the field's value, or every required field (`ai-regression.md`) |
| Paired branch untested | "Retries exhausted, success" tested for the confirmed path only | One test per branch, pinned against each other |

## When it's fine to keep a "weak" test

Keep it when the weak-looking thing is the contract: a call count that bills a customer, an order a
transaction depends on, a field's presence in a public API response. Say so in the test name.

Adapted, in our own words, from the test-smells guide in MrZoyo/deslop-GPT (MIT, commit 3913d8a);
see `NOTICE.md`.
