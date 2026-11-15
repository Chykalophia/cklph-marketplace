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
supabase gen types typescript --linked > src/server/db/database.types.ts   # same file as data-model
supabase test db                             # pgTAP: RLS tests, run in CI too
```

Legacy repos on `lib/` write the types to `lib/types/database.ts`; everything else is the same.

If `db push` fails on remote, **don't edit the committed migration** — write a follow-up that fixes the state.

## RLS template for user-data tables

```sql
alter table public.<name> enable row level security;

create policy "users read own"  on public.<name>
  for select using ( (select auth.uid()) = user_id );

create policy "users insert own" on public.<name>
  for insert with check ( (select auth.uid()) = user_id );

create policy "users update own" on public.<name>
  for update using ( (select auth.uid()) = user_id ) with check ( (select auth.uid()) = user_id );

create policy "users delete own" on public.<name>
  for delete using ( (select auth.uid()) = user_id );
```

UPDATE needs both `USING` (which rows you can target) and `WITH CHECK` (what the new row looks like) — skipping `WITH CHECK` lets a user reassign `user_id`.

Write `(select auth.uid()) = user_id`, not bare `auth.uid() = user_id`: an uncorrelated subselect (one that reads no column of the row) runs once per query as an initPlan instead of once per row. Same for `auth.jwt()` and any stable helper called without row arguments. A helper that takes a column of the row, such as `is_member(organization_id)`, is correlated and still runs per row, so the wrapper does not help it. Index the column the policy filters on (`user_id`, `organization_id`).

## RLS rules (every exposed table)

RLS is the tenancy and ownership floor; app policies in `application/policies.ts` sit on top of it. Both, always (see **security**).

- **RLS on** for every table in `public`, in the same migration that creates it.
- **Explicit per-operation policies.** SELECT and DELETE take `using`; INSERT takes `with check`; UPDATE needs `using` AND `with check`. Postgres rejects the clause an operation cannot have.
- **Never `using (true)`** or `with check (true)` on user data — that is RLS switched off with extra steps.
- **`(select auth.uid())`**, never bare `auth.uid()`.
- **Index every policy column.**
- **Membership lookups** go in a `security definer` function in a private schema, not an inline subquery on a table that has its own RLS. Give it `set search_path = ''` (schema-qualify every name inside), then `revoke execute on function ... from public, anon` and `grant execute ... to authenticated`.
- **One pgTAP test per policy**, in `supabase/tests/`, in the same PR as the migration:

```sql
-- supabase/tests/rls_projects.test.sql
begin;
select plan(4);
-- Seed rows for user A and user B as postgres first, then act as A:
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<user-a-uuid>"}', true);

select is((select count(*) from public.projects), <a-row-count>::bigint,
  'A sees exactly its own seeded rows'); -- fails on an empty table, so the next check is not vacuous
select is((select count(*) from public.projects where user_id = '<user-b-uuid>'), 0::bigint,
  'A cannot read B''s projects');
-- The allowed insert proves the role has the grant, so the 42501 below is RLS, not a missing grant.
select lives_ok($$ insert into public.projects (user_id, name) values ('<user-a-uuid>', 'x') $$,
  'A can insert a row owned by A');
select throws_ok($$ insert into public.projects (user_id, name) values ('<user-b-uuid>', 'x') $$,
  '42501', null, 'A cannot insert a row owned by B');

select * from finish();
rollback;
```

- **CI fails if anything in `public` leaks past RLS.** A table with RLS off, a view without `security_invoker` (it runs as its owner, so it returns every tenant's rows), or a materialized view (no RLS at all). Extension-owned tables such as PostGIS's `spatial_ref_sys` are skipped, since you cannot alter them. Keep this test next to the policy tests, so `supabase test db` in CI catches what someone forgot:

```sql
-- supabase/tests/rls_enabled.test.sql
begin;
select plan(1);
select is(
  array(select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
          and ((c.relkind in ('r', 'p') and not c.relrowsecurity)
            or (c.relkind = 'v' and not coalesce(c.reloptions && array[
                  'security_invoker=true', 'security_invoker=on', 'security_invoker=1', 'security_invoker=yes'], false))
            or c.relkind = 'm')
        order by 1),
  '{}'::name[],
  'public: RLS on every table, security_invoker on every view, no materialized views');
select * from finish();
rollback;
```

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
- `using (true)` on user data, or a policy with no pgTAP test.
- UPDATE policy with `USING` but no `WITH CHECK` — lets users reassign `user_id`.
- Bare `auth.uid()` in a policy on a big table — re-evaluated per row; wrap it as `(select auth.uid())`.
- Foreign key without an index — every join does a sequential scan.
- Missing `UNIQUE` on app-unique columns (slug, email-per-workspace) — RLS won't save you from duplicates.

Pair with **security** for how RLS plays with the right Supabase client, **architecture** for where repositories consume the new schema, and **data-model** for how the regenerated types are consumed. For pre-merge review use `cklph-os:review`.
