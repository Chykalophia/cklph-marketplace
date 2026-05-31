---
name: pitfalls
description: The recurring review-catch list. Twelve patterns external reviewers find again and again. Use during pre-PR review, pre-commit checks, or whenever editing data-fetching, state, or async code.
---

# pitfalls — the twelve recurring bugs

These are the patterns reviewers consistently catch in Next.js + Supabase code. Check them DURING writing, not after. Each one has bitten production at least once across the cklph stack.

## 1. React updater purity

Never call `setStats` inside a `setEmails` updater. React Strict Mode runs updaters twice — your side-effect runs twice too, and counters drift. Updaters must be pure functions of `prev`.

`setEmails(prev => { setStats(s => s + 1); return [...prev, e]; })` // stats double in Strict Mode

## 2. Optimistic update drift

When optimistically toggling a flag, use a `didChange` boolean inside the functional updater BEFORE adjusting any counter. Otherwise repeated toggles inflate or deflate aggregates as React replays the update.

`setItems(prev => prev.map(i => i.id === id ? {...i, done: !i.done} : i)); setDoneCount(c => c + 1);` // counter drifts on replay

## 3. Toggle idempotency

Rapid-click on a toggle fires two in-flight mutations and the second response overwrites the first. Guard with a `useRef(new Set<string>())` of in-flight IDs; skip if already present.

`<button onClick={() => toggleStar(id)}>` // double-click fires two mutations, last wins

## 4. Supabase `range()` is inclusive on both ends

`.range(offset, offset + limit)` returns `limit + 1` rows. Use `.range(offset, offset + limit - 1)`. Off-by-one shows up as duplicate rows at page boundaries.

`.range(offset, offset + limit)` // returns 21 rows when limit is 20; row 21 repeats on next page

## 5. Pagination needs `{ count: "exact" }`

Without `count`, `hasMore` is a guess based on the page size. Either request the count or accept that "Load more" sometimes runs one extra empty fetch.

`const { data } = await sb.from("emails").select("*").range(0, 19); const hasMore = data.length === 20;` // guess

## 6. Partial select needs a Pick type

`.select("id, name, created_at")` does NOT return your full entity type — cast as `Pick<Entity, "id" | "name" | "created_at">[]`. Casting as the full type lies to every consumer and breaks downstream reads.

`const rows = await sb.from("emails").select("id, subject") as Email[];` // missing fields, consumers crash

## 7. `JSON.parse` happens BEFORE Zod

`Schema.safeParse(JSON.parse(rawText))` — but `JSON.parse` throws on malformed input and Zod never sees it. Wrap the parse in try/catch and return 400 on failure.

`const body = Schema.safeParse(JSON.parse(await req.text()));` // malformed JSON throws past Zod, 500s

## 8. State machine catch blocks

If the happy path sets a row to `"in_progress"`, the catch block MUST set it to `"failed"` or `"pending"` — never leave it `"in_progress"`. Otherwise restart-after-crash spins on stuck rows forever.

`try { await setStatus("in_progress"); await work(); } catch (e) { logger.error(e); }` // row stuck forever

## 9. Service-role client in auth routes

A service-role client bypasses RLS. In an auth or signup route, use the factory that returns a session-aware client by default. Service-role is a sledgehammer; reserve it for cron and admin paths after an explicit `isAdmin()` check.

`// app/api/auth/signup/route.ts → const sb = createServiceRoleClient();` // bypasses RLS on a public route

## 10. `string` params that have finite values

If a column is `"draft" | "published" | "archived"`, type it that way — not `string`. Bare strings let typos and SQL-injection-shaped inputs reach the database. Union types make the wrong values uncompilable.

`function setStatus(id: string, status: string) { ... }` // "drsft" compiles fine, breaks at runtime

## 11. Control flow after error checks

After `if (error) return …`, success logic goes in an `else` block (or use early return and let the success path fall through cleanly). Mixed fall-through invites the "I forgot to return" bug.

`if (error) { logger.error(error); } return data;` // missing return — runs success on error

## 12. The 500-line file limit

Files over 500 lines hide things. Split by responsibility — readers vs writers, evaluator vs executor, query vs mutation — before the file passes 500. Refactoring later is more expensive than splitting now.

`lib/services/rule-engine.ts (847 lines)` // evaluator, executor, and storage all in one file

---

Use this list as a checklist during writing. If you're touching state, async, or DB code and HAVEN'T checked these twelve, you haven't reviewed yet. Pair with **discipline** for the broader house rules.
