---
name: postgres
description: Peter's PostgreSQL-on-Supabase patterns beyond migrations — indexes, EXPLAIN, pooling, JSONB. Use when chasing slow queries, designing indexes, sizing pgbouncer, or querying JSONB columns.
---

# postgres — query and index patterns

`supabase-migrations` covers DDL safety. This skill is what to do with the schema once it's live.

## Index design

- **btree by default** — equality, range, `ORDER BY`. Reach for `gin`/`gist`/`brin` only when type or query demands it.
- **Partial indexes for hot subsets** — if 95% of queries hit `where status = 'active'`, the index should too.
- **Covering indexes** (`INCLUDE`) when the SELECT shape is stable; use sparingly.
- **Don't index every column** — each one doubles write cost and bloats the table.

## Read EXPLAIN ANALYZE first

`EXPLAIN (ANALYZE, BUFFERS)` and look for `Seq Scan` on a large table (missing index), wrong join type (stale stats — run `ANALYZE`), or `Rows Removed by Filter` >> rows returned (index too broad — try partial/composite). Compare the plan with and without your proposed index before shipping.

## Connection pooling (Supavisor / pgbouncer)

- **Transaction mode** for serverless / Vercel — short queries, no `LISTEN/NOTIFY`, no prepared statements. Default for API routes.
- **Session mode** for long-lived workers with server-side state.

Mixing transaction mode + prepared statements silently breaks. `prepared statement … does not exist` = wrong port.

## N+1 — kill in SQL, not loops

```ts
// Bad
for (const u of users) await supabase.from("rules").select("*").eq("user_id", u.id);
// Good
await supabase.from("users").select("*, rules(*)").in("id", ids);
```

Flag during `verify`.

## JSONB

- `gin` for `@>` containment; expression index `((conditions->>'type'))` for a single path.
- **Never query an unindexed JSONB column on a hot table** — every read is a full scan.

## Anti-patterns

- Indexing every column "just in case" — write amplification, bloat, slow vacuums.
- `Seq Scan` on a > 10k-row hot path.
- `SELECT *` in production routes — pulls JSONB blobs you don't need.
- Transaction-mode pooling + prepared statements.
- Skipping `ANALYZE` after a large data load.

Pair with **supabase-migrations** for DDL, **architecture** for where queries live.
