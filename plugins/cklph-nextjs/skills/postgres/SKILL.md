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
- **Composite order: equality columns first, then the range/sort column.** `(status, created_at)` serves `where status = 'pending' and created_at > …`; `(created_at, status)` mostly doesn't.
- **Don't index every column** — each one doubles write cost and bloats the table.

## Read EXPLAIN ANALYZE first

`EXPLAIN (ANALYZE, BUFFERS)` and look for `Seq Scan` on a large table (missing index), wrong join type (stale stats — run `ANALYZE`), or `Rows Removed by Filter` >> rows returned (index too broad — try partial/composite). Compare the plan with and without your proposed index before shipping.

## Connection pooling (Supavisor / pgbouncer)

- **Transaction mode** for serverless / Vercel — short queries, no `LISTEN/NOTIFY`, no prepared statements. Default for API routes.
- **Session mode** for long-lived workers with server-side state.

Mixing transaction mode + prepared statements silently breaks. `prepared statement … does not exist` = wrong port.

## Pagination and job claims

- **Keyset (cursor) pagination for deep or infinite lists** — `where id > $last_id order by id limit 20` stays index-fast; `offset` scans and discards every skipped row, so page 500 costs 500 pages.
- **Claim DB-backed jobs with `for update skip locked`** — `update jobs set status = 'processing' where id = (select id from jobs where status = 'pending' order by created_at limit 1 for update skip locked) returning *`. Two workers never grab the same row, and neither blocks on the other.

## Find the problems the catalog already knows

```sql
-- single-column foreign keys with no full (non-partial) index LEADING on the referencing column.
-- An index only serves the FK if the column is its first key, so a trailing composite or INCLUDE
-- column does not count, and a partial index (WHERE ...) does not cover every row. Composite
-- (multi-column) FKs are excluded by array_length(c.conkey, 1) = 1; check those by hand.
select c.conrelid::regclass as tbl, a.attname as col
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f'
  and array_length(c.conkey, 1) = 1
  and not exists (select 1 from pg_index i
                  where i.indrelid = c.conrelid and i.indkey[0] = a.attnum and i.indpred is null);

-- slowest statements (pg_stat_statements is on by default in Supabase)
select query, mean_exec_time, calls from pg_stat_statements order by mean_exec_time desc limit 20;
```

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
- Deep `offset` pagination on a growing table.
- Polling a jobs table with plain `select … limit 1` then `update` (two workers claim the same job).

Pair with **supabase-migrations** for DDL, **architecture** for where queries live.
