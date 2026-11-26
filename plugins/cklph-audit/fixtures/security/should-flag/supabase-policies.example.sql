-- FIXTURE: security lens, should-flag (RECALL)
-- A multi-tenant Supabase app: orgs own projects and invoices, users own notes.
-- Planted:
--   1. projects has a SELECT policy "to authenticated using (true)". Any signed-in user, including
--      an anonymous sign-in, reads every org's projects and budgets
--      -> security:supabase-authn-not-authz (high)
--   2. notes has an UPDATE policy that checks ownership in USING but whose WITH CHECK only asks for
--      a signed-in user. An owner can set user_id to another user and hand the row to them
--      -> security:supabase-update-check-weaker (high)
--   3. invoice_totals is a view over the RLS table invoices with no security_invoker. It runs as
--      its owner, so anon and authenticated read every org's totals through the API
--      -> security:supabase-view-bypass (high)
--   4. org_invoices is SECURITY DEFINER in public with no revoke and no search_path. EXECUTE is
--      granted to PUBLIC by default, so anon calls it over /rpc with any org id
--      -> security:supabase-definer-exposed (high)
--   5. The invoices admin policy reads the role from user_metadata, which every user can set on
--      themselves with updateUser -> security:supabase-user-metadata-authz (critical)
-- Expected verdict: FLAG all five.

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

create policy "signed in users read projects" on public.projects
  for select to authenticated
  using (true);

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
  with check ((select auth.uid()) is not null);

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

create policy "admins manage invoices" on public.invoices
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create view public.invoice_totals as
  select org_id, count(*) as invoice_count, sum(amount_cents) as total_cents
  from public.invoices
  group by org_id;

create function public.org_invoices(target_org uuid)
returns setof public.invoices
language sql
stable
security definer
as $$
  select * from public.invoices where org_id = target_org;
$$;
