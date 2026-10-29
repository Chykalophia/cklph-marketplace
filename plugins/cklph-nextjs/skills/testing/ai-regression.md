# ai-regression — when the same model wrote it and reviewed it

A model that wrote a fix reviews it with the assumptions it wrote it with. The review says "looks
correct", the bug is still there, and it comes back in the next fix. Only a mechanical check breaks
the loop: a test or a build, run before any review.

The upstream example: a field added to an API response took four AI fixes to land. Fix 1 forgot
the `select()`. Fix 2 added it, and the build failed because the generated types lacked the
column. Fix 3 switched to `select("*")`, which fixed the production path and forgot the sandbox
path. Each fix was reviewed and judged correct; the build caught Fix 2, nothing caught the others.
Fix 4 came with a test, which caught the bug on its first run.

## The order, every time a session wrote and is about to review its own change

1. **Run the suite and the build first** (`npm test`, then `npm run build` or `tsc --noEmit`). A
   failure here is the top finding; no judgment needed.
2. **Then review**, with the patterns below as the checklist.
3. **Every bug found gets a regression test that fails on the old code.** Prove it: revert the fix
   (or reinject the bug), watch the test fail, restore. One reinjection per bug *shape*: a test that
   catches a wrong flag order may miss a wrong branch condition.

## The patterns AI changes get wrong

| Pattern | What happens | How to test it |
|---|---|---|
| **Parallel paths drift** | A field or rule lands in one branch only: production but not the mock/sandbox/demo path, the flag-on branch but not flag-off, the confirmed path but not the unconfirmed one. The most common AI regression upstream (3 of 4). | Assert the **same contract on every path**: one `REQUIRED_FIELDS` list, one test per path. Pin paired branches against each other. |
| **`select()` omission** | A column is added to the response or the type but not to the Supabase `.select('…')`, so it is always `undefined`. A cast (`as Profile`) hides it from tsc. | Assert every required field is defined: `expect(data.field).not.toBeUndefined()` (null still passes). `'field' in data` is enough only on a parsed JSON response; on a service's return value a key spread as `undefined` still exists. Regenerate types after the migration; never cast a partial select to the full entity (`pitfalls`: cast to `Pick<…>`). |
| **Error state leakage** | The catch sets an error but keeps the previous data, so the UI shows the last tab's rows under an error banner. | Mock `useAuthQuery` to return `{ data: oldRows, error }` (a hook returns an error, it doesn't throw), or, in a component that calls `authFetcher` itself, have the mock resolve then reject (`mockResolvedValueOnce(rows).mockRejectedValueOnce(err)`) and switch tab or key between the two. Assert the old rows are not rendered under the error. A mock that only rejects never loads old rows, so it passes on the bug. |
| **Optimistic update, no rollback** | The UI removes the item, the request fails, the item is still in the DB. Or the rollback restores a whole-list snapshot and wipes a newer write. | The fix rules are `click-path-audit`'s (async races): roll back only the item you changed, no refetch racing the optimistic write, invalidate only after the last related mutation settles (with `lib/data`'s declarative `invalidates`, that may mean not declaring it on this mutation). This test is the deliberate exception to `SKILL.md`'s must-mock rule: it has to run on the real hooks' cache, with what each refetch returns made explicit, and assert the exact rendered list. See [the concurrent-rollback test](#the-concurrent-rollback-test) below; it was verified on a real `lib/data`. |
| **Null masked by a cast** | `data.x as string` where `x` can be null; tsc is satisfied, and the code calls a string method on it (crash) or interpolates it (the UI shows "null"). | Feed a row with `x: null`; assert the rendered fallback text appears, no literal "null", no crash. |

## How it fits the house tiers

- **Contract tests at the route handler.** Import the handler (`GET`, `POST` from `route.ts`), call
  it with a `NextRequest`, assert status and response shape. This is the "smoke + auth" tier with a
  required-fields list added. A `compose()`d route needs its request context in the test. On the
  default real Supabase branch: sign in a seeded test user through `@supabase/ssr`'s
  `createServerClient` with an in-memory `getAll`/`setAll` cookie adapter, and return the cookies
  it set (`sb-<ref>-auth-token`, possibly chunked) from a mocked `next/headers` `cookies()`, so
  `requireAuth`'s `getUser()` verifies a real token. A plain supabase-js client keeps the session
  in storage, not cookies, and a made-up cookie fails `getUser()`. Send a CSRF token on writes and
  give the rate limiter a test store. A route test that mocks the server client factory instead no
  longer exercises the real backend; keep that for service tests (`SKILL.md`). On Next 15+ a dynamic route's second argument is
  `{ params: Promise<…> }`.
- **Mock `lib/data/`, never `fetch`** (`SKILL.md`, `data-layer`): every "make it fail" above goes
  through the mocked `authFetcher` (rejects) or a mocked hook (returns an `error`).
- **A regression test overrides "components: skip mostly".** Patterns 3, 4 and 5 live in components;
  when one of them bit, the component gets the test.
- **The backend stays real by default** (a Supabase branch, per `SKILL.md`). If the app has a mock
  or demo mode, that is a *second path*: test both, never test only the mock.
- **Contract tests grow where bugs were found**, not for coverage. A bug in `/api/profile` buys a
  profile contract test; a route that has never broken keeps only the house smoke tier in
  `SKILL.md`. AI repeats the same category of mistake, so tests grow where the mistakes cluster.
- Name the test after the bug (`"notification_settings present (regression: 2026-10-29)"`), so a
  later session does not "fix" the assertion to match new code without reading why it exists.

## The concurrent-rollback test

The bug it catches: the standard TanStack recipe (`onMutate` snapshots the list, `onError` restores
the snapshot) restores *its* snapshot, taken before any later write. Delete B starts, delete A
starts and succeeds, B fails: B's rollback writes back `[a, b, c]` and the item the server already
deleted reappears. On a real `lib/data` that uses this recipe, the test below failed with exactly
`[a, b, c]`, and passed once the rollback re-inserted only B's item.

1. **Real cache, real hooks.** A fresh test `QueryClient` (retries off), the real mutation hook and
   its optimistic helper. Control only the request: the `mutationFn` (or the mocked `authFetcher`
   it calls) returns a deferred promise per call, so the test decides when each one settles.
2. **No `invalidates`** in this test. The race is in the rollback itself; a refetch can hide it
   for a moment, and has its own ordering problem (`click-path-audit`).
3. Seed `[a, b, c]` with `setQueryData`.
4. Start delete B and leave it pending. Start delete A, then resolve A. Then reject B.
5. Assert on the cache: `a` absent, `b` present exactly once, sorted ids equal `[b, c]`. Order is not
   what this test is about; add an order assertion only if the UI promises one.
6. Prove it both ways: it fails on the snapshot restore and passes on an item-only rollback
   (re-insert B's item from the snapshot only if it is missing from the current list).

## Don't

- Trust a self-review as a substitute for running the tests.
- Assert that a guard exists (a grep for the line) instead of what the code does.
- Update a failing assertion to match the code before re-deriving why it was written.
- Skip the mock path because "it's only mock data": it is what the demo and the tests see.
