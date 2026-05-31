---
name: supabase-migrations
description: Peter's CLI-first workflow for Supabase schema changes with RLS and rollback discipline. Use when changing schema, running supabase migration new, writing RLS policies, or touching anything under supabase/migrations/.
---

# supabase-migrations — schema changes only via CLI

Every schema change goes through a tracked migration file. The Supabase MCP is **read-only** here — for inspecting schema and querying data during research, never for `CREATE`, `ALTER`, or `DROP`.

## The workflow

```bash
supabase migration new add_tracking_labels   # creates supabase/migrations/<ts>_*.sql
# edit the SQL, then:
supabase db reset                            # test locally (reset + replay)
supabase db push                             # apply to remote
supabase gen types typescript --local > lib/supabase/types.ts
```

If `db push` fails on remote, **don't edit the committed migration** — write a follow-up that fixes the state.

## RLS template for user-data tables

```sql
alter table public.<name> enable row level security;

create policy "users read own"  on public.<name>
  for select using ( auth.uid() = user_id );

create policy "users insert own" on public.<name>
  for insert with check ( auth.uid() = user_id );

create policy "users update own" on public.<name>
  for update using ( auth.uid() = user_id ) with check ( auth.uid() = user_id );

create policy "users delete own" on public.<name>
  for delete using ( auth.uid() = user_id );
```

UPDATE needs both `USING` (which rows you can target) and `WITH CHECK` (what the new row looks like) — skipping `WITH CHECK` lets a user reassign `user_id`.

## Indexes — separate migration, named consistently

`create index idx_<table>_<columns> on public.<table> (<columns>);` — only index what you actually query. Every index slows writes; discipline matters.

## Rollback strategy

- **Additive** (`ADD COLUMN`, new table/index) — forward-only is fine, no DOWN needed.
- **Destructive** (`DROP COLUMN`, type/rename) — write a paired DOWN before pushing, and stage as expand-then-contract (add new shape → migrate data → drop old shape in a later release).
- Editing a committed migration corrupts history across environments — never do it.

## MCP boundary

The Supabase MCP is **read-only** here. Use it for `execute_sql` (SELECTs only), `list_tables`, `get_advisors`. Any DDL (`CREATE`/`ALTER`/`DROP`) goes through a CLI migration — no exceptions.

## Anti-patterns

- Editing a committed migration — corrupts history; write a follow-up.
- Using MCP for DDL — no migration file, drifts across environments.
- User-data table without RLS enabled.
- UPDATE policy with `USING` but no `WITH CHECK` — lets users reassign `user_id`.
- Foreign key without an index — every join does a sequential scan.
- Missing `UNIQUE` on app-unique columns (slug, email-per-workspace) — RLS won't save you from duplicates.

Pair with **security** for how RLS plays with the right Supabase client, **architecture** for where services consume the new schema, and **discipline** for the review tier that catches migration mistakes pre-merge.
