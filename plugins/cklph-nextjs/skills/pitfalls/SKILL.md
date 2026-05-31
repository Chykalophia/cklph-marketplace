---
name: pitfalls
description: The recurring review-catch list. Twelve patterns external reviewers find again and again. Use during pre-PR review, pre-commit checks, or whenever editing data-fetching, state, or async code.
---

# pitfalls — the twelve recurring bugs

These are the patterns reviewers consistently catch in Next.js + Supabase code. Check them DURING writing, not after. Each one has bitten production at least once across the cklph stack.

## 1. React updater purity

Never call `setStats` inside a `setEmails` updater. React Strict Mode runs updaters twice — your side-effect runs twice too, and counters drift. Updaters must be pure functions of `prev`.

## 2. Optimistic update drift

When optimistically toggling a flag, use a `didChange` boolean inside the functional updater BEFORE adjusting any counter. Otherwise repeated toggles inflate or deflate aggregates as React replays the update.

## 3. Toggle idempotency

Rapid-click on a toggle fires two in-flight mutations and the second response overwrites the first. Guard with a `useRef(new Set<string>())` of in-flight IDs; skip if already present.

## 4. Supabase `range()` is inclusive on both ends

`.range(offset, offset + limit)` returns `limit + 1` rows. Use `.range(offset, offset + limit - 1)`. Off-by-one shows up as duplicate rows at page boundaries.

## 5. Pagination needs `{ count: "exact" }`

Without `count`, `hasMore` is a guess based on the page size. Either request the count or accept that "Load more" sometimes runs one extra empty fetch.

## 6. Partial select needs a Pick type

`.select("id, name, created_at")` does NOT return your full entity type — cast as `Pick<Entity, "id" | "name" | "created_at">[]`. Casting as the full type lies to every consumer and breaks downstream reads.

## 7. `JSON.parse` happens BEFORE Zod

`Schema.safeParse(JSON.parse(rawText))` — but `JSON.parse` throws on malformed input and Zod never sees it. Wrap the parse in try/catch and return 400 on failure.

## 8. State machine catch blocks

If the happy path sets a row to `"in_progress"`, the catch block MUST set it to `"failed"` or `"pending"` — never leave it `"in_progress"`. Otherwise restart-after-crash spins on stuck rows forever.

## 9. Service-role client in auth routes

A service-role client bypasses RLS. In an auth or signup route, use the factory that returns a session-aware client by default. Service-role is a sledgehammer; reserve it for cron and admin paths after an explicit `isAdmin()` check.

## 10. `string` params that have finite values

If a column is `"draft" | "published" | "archived"`, type it that way — not `string`. Bare strings let typos and SQL-injection-shaped inputs reach the database. Union types make the wrong values uncompilable.

## 11. Control flow after error checks

After `if (error) return …`, success logic goes in an `else` block (or use early return and let the success path fall through cleanly). Mixed fall-through invites the "I forgot to return" bug.

## 12. The 500-line file limit

Files over 500 lines hide things. Split by responsibility — readers vs writers, evaluator vs executor, query vs mutation — before the file passes 500. Refactoring later is more expensive than splitting now.

---

Use this list as a checklist during writing. If you're touching state, async, or DB code and HAVEN'T checked these twelve, you haven't reviewed yet. Pair with **discipline** for the broader house rules.
