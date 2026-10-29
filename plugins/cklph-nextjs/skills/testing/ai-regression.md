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
| **Optimistic update, no rollback** | The UI removes the item, the request fails, the item is still in the DB. Or the rollback restores a whole-list snapshot and wipes a newer write. | The fix rules are `click-path-audit`'s (async races): roll back only the item you changed, no refetch racing the optimistic write, invalidate only after the last related mutation settles (with `lib/data`'s declarative `invalidates`, that may mean not declaring it on this mutation). This test is the deliberate exception to `SKILL.md`'s must-mock rule: it has to run on the real hooks' cache and assert the in-flight list, then the final list. See [the concurrent-rollback test](#the-concurrent-rollback-test) below; it was verified on a real `lib/data`. |
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
  through the mocked `authFetcher` (rejects) or a mocked hook (returns an `error`). Pattern 4 is
  the exception: its test keeps the real hooks (below).
- **A regression test overrides "components: skip mostly".** Patterns 3 and 5 live in components;
  when one of them bit, the component gets the test. Pattern 4 is tested at the hook, against the
  cache.
- **The backend stays real by default** (a Supabase branch, per `SKILL.md`). If the app has a mock
  or demo mode, that is a *second path*: test both, never test only the mock.
- **Contract tests grow where bugs were found**, not for coverage. A bug in `/api/profile` buys a
  profile contract test; a route that has never broken keeps only the house smoke tier in
  `SKILL.md`. AI repeats the same category of mistake, so tests grow where the mistakes cluster.
- Name the test after the bug (`"notification_settings present (regression: 2026-10-29)"`), so a
  later session does not "fix" the assertion to match new code without reading why it exists.

## The concurrent-rollback test

Two optimistic deletes on one cached list overlap: delete B starts, delete A starts, then one of
them fails. A rollback that writes back a whole-list snapshot can resurrect an item the server
already deleted, or lose one that failed to delete. The results below are from real hooks
(TanStack Query 5.90 `useMutation`, SWR 2.3.7 `useSWRMutation`) in the cklph-marketplace repo's
[`docs/proof/testing/rollback-harness/`](https://github.com/Chykalophia/cklph-marketplace/tree/main/docs/proof/testing/rollback-harness),
where every case is pinned to its exact result; copy `reinsert`, `runCase` and the fix adapters
from `rollback.test.jsx`. The harness uses string ids; for row objects, capture the deleted row
and compare by `id` (`current.some((r) => r.id === row.id)`), or `reinsert` will put a bare id in
the list. The TanStack fix also ran on a real `lib/data`.

**Steps** (engine-neutral):
1. **Find the engine** from what `lib/data` imports (`@tanstack/react-query` or `swr`), not from the
   hook's shape: a TanStack wrapper can return `trigger` too.
2. **Real cache, real hooks.** A fresh cache per test (a new `QueryClient`, or
   `<SWRConfig value={{ provider: () => new Map([['/api/items', { data: ['a', 'b', 'c'] }]]), dedupingInterval: 0 }}>`)
   and the real mutation hook. Control only the request: create one deferred promise per delete up
   front, each with a no-op `.catch` (a rejection that lands before the request starts is otherwise
   an unhandled rejection that fails the run). Mock at the module the hook imports its fetcher from;
   `vi.mock` does not reach a call inside the same module. Resolve with what the real endpoint
   returns, in case the hook writes the response into the cache. (The `vi.mock` point is Vitest
   behaviour, not something the harness exercises.)
3. **No refetch.** Leave out the house `invalidates`, and on SWR set `revalidate: false`. A refetch
   can hide the race for a moment and has its own ordering problem (`click-path-audit`).
4. Seed `[a, b, c]`. Start delete B and let its optimistic write land (its own `act`); start
   delete A and let its write land. **Assert the cache is `[c]`** before settling anything: without
   it, an engine that undoes B's removal mid-flight can end at the right list on buggy code.
5. **Settle both ways**, as separate cases: B fails and A succeeds (expect `[b, c]`), and B
   succeeds and A fails (expect `[a, c]`), in that order: the fix puts the item back where it was.
   Run each with A settling before B and after it, with one shared hook issuing both deletes and
   with one hook per delete: 4 orders × 2 hook shapes.
6. **Prove it both ways:** the test fails on the repo's current rollback and passes on the fix.

**TanStack Query v5: the fix.** In the hook-level `onError`, re-insert only B's item, after its
nearest earlier neighbour still in the list, and only if it is missing; never restore the snapshot.
It passes all 8 cases, with and without a mutation `scope`. What fails, and why it matters:
- The standard snapshot restore fails when the *earlier* mutation fails (`a` comes back:
  `[a, b, c]`); the later-fails direction passes, so a test of only that direction misses the bug.
- The same rollback passed to `mutate()` instead of the hook fails with one shared hook (`b` stays
  lost, `[c]`): per-`mutate()` callbacks fire only for a hook instance's latest call.
- A `scope` changes nothing: it queues the requests, but A's `onMutate` still writes before B's
  `onError` runs.

**SWR 2.x (`useSWRMutation` with the list as its string key): the fix.** Pass
`optimisticData: (_, displayed) => displayed.filter(...)`, `rollbackOnError: false` and
`populateCache: false`. In the fetcher (it runs before the optimistic write, so capture the list and
the item synchronously, before its first `await`), catch the failure, read the displayed list from
`useSWRConfig().cache.get(key)?.data`, re-insert the item, write it with
`mutate(key, list, { revalidate: false })`, then rethrow so SWR records the failure (with one
shared hook, only the latest call's caller receives it, so don't hang an error toast on an earlier
`trigger`). It passes all 8 cases. What fails:
- `optimisticData: (current) => …` gets the *committed* list and undoes B's removal mid-flight (the
  step-4 precondition fails at `[b, c]`).
- `(_, displayed) => …` with SWR's own rollback: B failing leaves `b` lost (`[c]`), A failing
  restores the whole committed snapshot (`[a, b, c]`).
- Re-inserting through `mutate(key, (cur) => …)` (committed data again) passes 2 of 8.
- The same re-insert in a `.catch` around `trigger` fails with one shared hook: SWR drops the error
  of every call but a hook's latest.
With the fix above, `rollbackOnError: true` also passed (the re-insert's own `mutate` makes SWR skip
its rollback); set it to `false` so the fix does not depend on that. A house hook shaped
`useAuthMutation(url, …)`, with an item URL as its key and no optimistic options, needs its API
changed before this fix fits; that design is not covered here. Nor is a non-string key: SWR stores
an array or object key under its serialized form, so read the cache with `unstable_serialize(key)`
(the harness uses a string key only).

**Updates** race the same way, plus one case deletes do not have: two updates to the *same* row
(b1 → b2, then b2 → b3) where the first fails. Restoring "the prior version" puts b1 back over b3.
The fix is a compare-and-swap: revert the row only if it is still the object this mutation wrote,
else leave it. Verified on the real TanStack `lib/data` (both failure directions, both settle
orders), not in the harness.

**Unsolved: both updates fail.** If the first fails while the second is pending, compare-and-swap
correctly leaves b3; when the second then fails, it restores *its* prior value, b2, which was the
first update's rejected write. The server still has b1. If the second fails first, both rollbacks
run and end at b1. (Both read from the code, found in review; not run.) A likely fix is to refetch the list once the last overlapping mutation on the key settles, whenever a
rollback was skipped; it has not been built or tested.

## Don't

- Trust a self-review as a substitute for running the tests.
- Assert that a guard exists (a grep for the line) instead of what the code does.
- Update a failing assertion to match the code before re-deriving why it was written.
- Skip the mock path because "it's only mock data": it is what the demo and the tests see.
