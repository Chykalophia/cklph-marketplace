-- FIXTURE: security lens, should-not-flag (PRECISION)
-- The same schema as should-flag/supabase-policies.example.sql, done right. Every object below
-- matches a recall pattern (to authenticated, security definer, create view, auth.jwt()).
-- Clean because:
--   1. projects is readable only by members of the owning org. An anonymous sign-in has no
--      membership row, so it reads nothing (security:supabase-authn-not-authz does not apply).
--   2. The notes UPDATE policy checks ownership in both USING and WITH CHECK, so the new row must
--      still belong to the caller (security:supabase-update-check-weaker does not apply).
--   3. invoice_totals is created with security_invoker = true, so the caller's RLS on invoices
--      applies to the view (security:supabase-view-bypass does not apply).
--   4. org_invoices pins search_path to '' and uses qualified names. EXECUTE is revoked from
--      public, anon and authenticated and granted only to service_role, so it is server-only
--      (security:supabase-definer-exposed does not apply).
--   5. The admin policy reads the role from app_metadata, which only the service role can write.
--      It marks platform staff, who may manage every invoice by design
--      (security:supabase-user-metadata-authz does not apply).
-- Expected verdict: NO FINDINGS.

create table public.memberships (
  org_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  primary key (org_id, user_id)
);
alter table public.memberships enable row level security;

create policy "members read own memberships" on public.memberships
  for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  budget_cents bigint not null default 0
);
alter table public.projects enable row level security;

create policy "members read projects" on public.projects
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = projects.org_id and m.user_id = (select auth.uid())
    )
  );

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null
);
alter table public.notes enable row level security;

create policy "owners read notes" on public.notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "owners edit notes" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  amount_cents bigint not null,
  status text not null default 'open'
);
alter table public.invoices enable row level security;

create policy "members read invoices" on public.invoices
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = invoices.org_id and m.user_id = (select auth.uid())
    )
  );

create policy "staff manage invoices" on public.invoices
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create view public.invoice_totals
  with (security_invoker = true)
as
  select org_id, count(*) as invoice_count, sum(amount_cents) as total_cents
  from public.invoices
  group by org_id;

create function public.org_invoices(target_org uuid)
returns setof public.invoices
language sql
stable
security definer
set search_path = ''
as $$
  select i.* from public.invoices i where i.org_id = target_org;
$$;

revoke execute on function public.org_invoices(uuid) from public, anon, authenticated;
grant execute on function public.org_invoices(uuid) to service_role;
