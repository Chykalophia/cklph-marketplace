# ADR-003: RLS and application policies, both; service-role key isolation

## Status

Accepted, 2026-11-14

## Context

Supabase apps can enforce access in Postgres (row-level security) or in application code. Relying
on only one fails in predictable ways. RLS alone pushes business rules (roles, plan limits,
step-up auth) into SQL that is hard to test and review, and anyone holding the service-role key
bypasses it entirely. App checks alone leave every other path to the database (a new route that
forgot the check, a script, a misused client) open.

Two further facts shaped this. Middleware/Proxy auth can be skipped: CVE-2025-29927 let a spoofed
`x-middleware-subrequest` header bypass Next.js middleware. Server Actions are public POST endpoints
that page-level auth does not cover.

## Decision

Enforce access in both layers, always:

- **RLS is the tenancy and ownership floor.** It is on for every exposed table, with explicit
  per-operation policies (`using` and `with check`, never `using (true)`), written with
  `(select auth.uid())` and indexed policy columns. Each policy has a pgTAP test, and a CI test
  fails if any `public` table has RLS off.
- **Application policies hold business rules**, in `src/modules/<f>/application/policies.ts`,
  called by use cases. Queries still filter by owner as if RLS did not exist.
- **Auth runs inside every Server Action and Route Handler.** Middleware is an optimistic redirect
  only. Identity comes from `getClaims()`, or `getUser()` for sensitive operations, never
  `getSession()`.
- **The service-role client lives only in `src/server/admin/`.** Only `src/server/` imports it.
  Webhook, cron and job routes get a context from `makeSystemContext()` in
  `src/server/system-context.ts` instead, and only routes under `src/app/api/{webhooks,cron,jobs}/`
  may import that. Auth admin calls (invite, delete account, ban) go through `makeAdminContext()`
  from server actions, which exposes nothing else. dependency-cruiser enforces these boundaries,
  and seals the factories so no helper in `src/server/` can re-export or wrap them; a lint rule bans reading the key anywhere else.
  The key never gets a `NEXT_PUBLIC_` prefix.

## Consequences

- A single missed check no longer exposes data: the other layer still holds.
- Tenancy bugs are caught by pgTAP in CI rather than in production.
- Ownership logic is written twice, in SQL and in TypeScript, and the two can drift. pgTAP tests
  and use-case tests both have to change when the rule changes.
- RLS adds query cost. The `(select auth.uid())` form and policy indexes keep it small, but
  complex membership policies need `security definer` helpers and profiling.
- Webhooks and cron that need cross-user access must go through `makeSystemContext()`, which adds
  a step compared with creating a client inline.
