---
name: testing
description: Peter's testing tiers for Next.js + Supabase apps with Vitest and Playwright. Use when writing tests, adding coverage, wiring vitest or playwright, touching any *.test.ts file, adding the regression test for a bug fix, or locking down code an AI wrote and self-reviewed.
---

# testing — what to test, what to skip

Coverage is a budget, not a goal. Spend it where bugs actually hide — domain rules, use cases, repositories against a real database, and RLS — and skip the layers where tests add maintenance debt without catching anything real.

## The stack

- **Vitest** — unit + integration tests. Fast, ESM-native, plays well with TypeScript and Next.js.
- **Playwright** — E2E for the few flows worth driving in a real browser: one journey per role, plus a tenant-isolation test (user A signs in and cannot see or change tenant B's data by URL or request).
- **pgTAP** — one test per RLS policy, run with `supabase test db`.
- **Supabase branches** — preferred backend for integration tests; in-memory doubles only for hot-path unit tests.

## What to test

| Layer                                   | Tool                                        | Coverage     | Why                                                   |
| --------------------------------------- | ------------------------------------------- | ------------ | ----------------------------------------------------- |
| `modules/<f>/domain/`                   | Vitest, pure, no mocks                      | High         | Invariants live here; pure functions are cheap to test. |
| `modules/<f>/application/use-cases/`    | Vitest, in-memory fakes of ports via `ctx`  | High         | Policies, orchestration, `ServiceResult` codes.        |
| `modules/<f>/infrastructure/` repos     | Vitest against Supabase local               | Medium-High  | Column lists, row-to-DTO mapping, error translation.   |
| RLS policies                            | pgTAP                                       | High         | The tenancy floor; doubles cannot see it.              |
| `app/**/route.ts`, `actions.ts`         | Smoke + auth                                | Smoke        | Confirm `compose()` / `authActionClient` wiring, 401/403/429 paths. |
| `modules/<f>/ui/` hooks                 | Vitest                                      | Selective    | Test state machines; skip trivial wrappers.            |
| Components                              | Playwright                                  | Skip mostly  | Snapshot tests rot; Playwright covers what matters.    |
| `src/shared/` utils                     | Vitest                                      | Per-helper   | Pure funcs are cheap to test — write the test.         |

Legacy repos on `lib/`: `lib/services/` gets the use-case row, `lib/hooks/` the hooks row, `lib/utils/` the utils row.

## Mock the data layer, not the network

Components and hooks must mock `authFetcher`, `useAuthQuery`, and `useAuthMutation` from `src/shared/lib/data/`. Exception: a regression test for cache or optimistic-rollback behaviour needs the real hooks, since a mocked hook has no cache (`ai-regression.md`). Never mock `fetch` directly — that bypasses the abstraction described in **data-layer** and couples tests to transport details that change.

For use-case tests, inject an in-memory fake of the repository port via `ctx`, not a mocked Supabase SDK. The fake is a second implementation of the port, which is what earns the port its place (see **architecture**).

## Real Supabase vs in-memory doubles

- **Default to real Supabase** via a per-PR branch. RLS bugs, type-coercion quirks, and trigger order are invisible to doubles.
- **Doubles are for** very fast inner-loop unit tests where you've already proven the integration elsewhere.
- **Reset between tests** — every test owns its rows. Shared state across tests is the #1 cause of flaky CI.

## When to write tests

- New use case → write the test first.
- New RLS policy → pgTAP test in the same migration PR.
- New route → smoke test (200, 401, 429) at minimum.
- Bug fix → regression test that fails on the old code.
- New hook with non-trivial state → test it.

## When the same session wrote it and reviews it

Self-review shares the author's blind spots. Run the suite and the build **before** reviewing, write
the regression test for each bug found, and prove it fails on the old code. The five patterns AI
changes get wrong (parallel paths drifting, `select()` omissions, stale state on error, optimistic
updates with no rollback, nulls hidden by a cast) and how to test each: `@ai-regression.md`.

## When to skip

- Pure visual tweaks (color, spacing, copy).
- Dependency bumps with no behavior change.
- Throwaway scripts in `scripts/`.

## Anti-patterns

- Testing through the UI when a use-case test would do — slower, flakier, less specific.
- Mocking the Supabase SDK directly — inject an in-memory fake of the repository port via `ctx`, or mock `src/shared/lib/data/` on the client.
- Shared test database state — every test inserts its own fixtures, cleans up after itself.
- Snapshot tests on components — they rot and nobody reads the diffs.
- Asserting on log output as a behavior signal.

Pair with **architecture** for what each layer does, **data-layer** for the abstractions tests should mock, and **discipline** for the house rules these tests enforce.
