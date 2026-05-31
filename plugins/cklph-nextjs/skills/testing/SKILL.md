---
name: testing
description: Peter's testing tiers for Next.js + Supabase apps with Vitest and Playwright. Use when writing tests, adding coverage, wiring vitest or playwright, or touching any *.test.ts file.
---

# testing — what to test, what to skip

Coverage is a budget, not a goal. Spend it where bugs actually hide — services and route handlers — and skip the layers where tests add maintenance debt without catching anything real.

## The stack

- **Vitest** — unit + integration tests. Fast, ESM-native, plays well with TypeScript and Next.js.
- **Playwright** — E2E for the few flows worth driving in a real browser (auth, checkout, the one critical happy path per feature).
- **Supabase branches** — preferred backend for integration tests; in-memory doubles only for hot-path unit tests.

## What to test

| Layer            | Coverage     | Why                                                        |
| ---------------- | ------------ | ---------------------------------------------------------- |
| `lib/services/`  | High         | Pure business logic, easy to test, where bugs cost most.   |
| `app/api/*/route.ts` | Smoke + auth | Confirm `compose()` wiring, 401/403/429 paths.        |
| `lib/hooks/`     | Selective    | Test state machines; skip trivial wrappers.                |
| Components       | Skip mostly  | Snapshot tests rot; Playwright covers what matters.        |
| `lib/utils/`     | Per-helper   | Pure funcs are cheap to test — write the test.             |

## Mock the data layer, not the network

Components and hooks must mock `authFetcher`, `useAuthQuery`, and `useAuthMutation` from `lib/data/`. Never mock `fetch` directly — that bypasses the abstraction described in **data-layer** and couples tests to transport details that change.

For service tests, mock the **repo or Supabase client factory**, not the Supabase SDK internals.

## Real Supabase vs in-memory doubles

- **Default to real Supabase** via a per-PR branch. RLS bugs, type-coercion quirks, and trigger order are invisible to doubles.
- **Doubles are for** very fast inner-loop unit tests where you've already proven the integration elsewhere.
- **Reset between tests** — every test owns its rows. Shared state across tests is the #1 cause of flaky CI.

## When to write tests

- New service → write the test first.
- New route → smoke test (200, 401, 429) at minimum.
- Bug fix → regression test that fails on the old code.
- New hook with non-trivial state → test it.

## When to skip

- Pure visual tweaks (color, spacing, copy).
- Dependency bumps with no behavior change.
- Throwaway scripts in `scripts/`.

## Anti-patterns

- Testing through the UI when a service test would do — slower, flakier, less specific.
- Mocking the Supabase SDK directly — mock the **repo** or `lib/data/` layer instead.
- Shared test database state — every test inserts its own fixtures, cleans up after itself.
- Snapshot tests on components — they rot and nobody reads the diffs.
- Asserting on log output as a behavior signal.

Pair with **architecture** for what each layer does, **data-layer** for the abstractions tests should mock, and **discipline** for the review-tier ladder that runs these tests automatically.
