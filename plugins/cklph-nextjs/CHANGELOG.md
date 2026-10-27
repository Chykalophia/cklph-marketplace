# Changelog

All notable changes to `cklph-nextjs` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.2.4] — 2026-10-27

### Fixed
- **`security`** is now the single owner of the mutation order: an IP-keyed rate limit first (covers
  unauthenticated traffic), CSRF, `getUser()`, then any per-user limit. `api-routes` and
  `discipline` reference it instead of contradicting it.
- **`api-routes`** — the route example ran the rate limit only after auth and had no CSRF step. It
  now composes `limitByIp → csrfValidate → requireAuth` and keeps the per-user limit in the handler.
- **`auth`** — the OAuth callback redirected to an unvalidated `next` (`?next=@evil.example` sent the
  user to `evil.example`). A `safeNext` helper now accepts only a same-origin relative path.
- **`security`** — the path-traversal check (`startsWith(base)`) let `/data/uploads-evil` through;
  it now compares against `base + path.sep`. The open-redirect rule names the `//` and `/\` cases.
- **`security`** — `path.resolve` does not follow symlinks, so a link inside the upload dir could
  still point outside. Added a `realpath` variant (the parent dir for new files) and the `wx` write
  flag, which refuses a dangling link.
- **`error-handling`** — the sample used `.single()`, so a missing row came back as an error and the
  `NOT_FOUND` branch was unreachable. It now uses `.maybeSingle()`.
- **`supabase-migrations`** — type generation now matches `discipline` and `data-model`
  (`supabase gen types typescript --linked > lib/types/database.ts`).
- **`ui-quality`**, **`testing`**, **`supabase-migrations`** — removed references to a nonexistent
  `component-standards` skill and a "review tier" that `discipline` never defined.
- **`discipline`** — replaced a project-specific component-library name with generic wording.
- README: dropped the stale version number from the "What's inside" heading.

## [0.2.3] — 2026-10-26

### Fixed
- **`postgres`** — the "foreign keys with no index" query matched `a.attnum = any(i.indkey)`, so a
  trailing composite or `INCLUDE` column counted as covering the FK (false negative). It now
  requires the column to lead the index (`i.indkey[0] = a.attnum`), ignores partial indexes
  (`i.indpred is null`), and is restricted to single-column FKs (`array_length(c.conkey, 1) = 1`)
  so a composite FK `(a, b)` indexed on `(a, b)` no longer reports `b`. Composite FKs need a
  manual check.
- **`supabase-migrations`** — the RLS template now uses `(select auth.uid())`, matching the rule
  below it. The initPlan claim is limited to uncorrelated helpers; a helper that takes a row column
  still runs per row.

## [0.2.2] — 2026-10-26

### Added
- **`postgres`** — composite index column order (equality first, then range), keyset pagination
  over deep `offset`, `for update skip locked` job claims, catalog queries for unindexed foreign
  keys and slow statements.
- **`supabase-migrations`** — wrap `auth.uid()` as `(select auth.uid())` in RLS policies on large
  tables (evaluated once per query, not per row); index the policy's filter column.
- **`ui-quality`** — pointer to `vercel:react-best-practices` for React/Next.js performance (no
  rules ported; that skill already carries them).
- Adapted from: ECC (MIT) `skills/postgres-patterns`, commit 25278e7 (notices in `skills/postgres/NOTICE.md`, `skills/supabase-migrations/NOTICE.md`).

## [0.2.1] — 2026-05-31

### Fixed
- **`discipline` softens the `pricing_tiers` reference.** Was phrased as if `pricing_tiers` is the
  canonical table name across all repos in the cklph stack — that's repo-specific. Now phrased
  as "a DB table (e.g. `pricing_tiers`; pick the right name per project)" with the
  actual rule (don't hardcode `PRICING_PLANS` constants) preserved. Removes a real source of
  confusion for other repos in the stack that don't have a `pricing_tiers` table.

## [0.2.0] — 2026-05-30

### Added — 11 new skills
- **`testing`** — Vitest + Playwright coverage tiers; what to test by layer (services for breadth, routes for smoke, hooks selectively); **mock the data-layer, not the network**; integration tests against a Supabase branch for real-DB confidence.
- **`server-actions`** — the `"use server"` boundary in Next.js 15+: when to use a server action vs an API route, return `ServiceResult<T>` (never throw to the form), form-action pattern with `useFormStatus()`, security checklist still applies.
- **`supabase-migrations`** — CLI-first workflow (`supabase migration new` → SQL → `db push`), RLS policy template per user-data table, rollback discipline for destructive changes, index naming convention.
- **`qstash`** — Upstash QStash for background jobs: signature verification at the route boundary, deterministic job IDs + DB state tracking (`pending → processing → completed/failed`), return-200-on-non-retryable, cron-enqueues-fast.
- **`pubsub`** — Google Cloud Pub/Sub webhooks: **always 200** (no retry storm), JWT verification via `OAuth2Client` (audience + issuer + email), atomic deduplication with optimistic locking, BigInt comparison for large IDs (`historyId`), 7-day watch renewal cron.
- **`config`** — typed env vars (Zod / `@t3-oss/env-nextjs`) + **graceful-degradation** pattern from next-forge — only the DB env is required; optional integrations silently disable when their env is missing (feature off, not error).
- **`postgres`** — PostgreSQL on Supabase: btree default with partial / covering indexes; `EXPLAIN ANALYZE` before assuming a problem; pgbouncer transaction-vs-session-mode; N+1 prevention; JSONB `gin` indexing.
- **`ui-quality`** — dark mode + WCAG AA deep dive: every color paired with `dark:` variant; contrast 4.5:1 / 3:1; `:focus-visible` always; keyboard nav; ARIA; color-is-never-the-only-signal; screen-reader smoke tests.
- **`auth`** — Supabase auth flows beyond the mutation checklist: `getUser()` server-side / `useUser()` client-side, OAuth callback with PKCE, password reset, multi-tenant `organization_id` in RLS, where auth code lives (layouts + middleware, not leaf components).
- **`error-handling`** — `ServiceResult<T, ServiceError>` (never throw from services), user-surface vs log-only text discipline, observability capture **at the route boundary only** (no double-capture), recoverable vs non-recoverable differentiation.
- **`data-model`** — the Supabase-generated `lib/types/database.ts` is the source of truth — how to read `Row` / `Insert` / `Update` / `Enums` / `Functions` types; never hand-roll a row type; regenerate after every migration and commit alongside; use generated types in service signatures.

### Enhanced
- **`pitfalls`** (60 → 84 lines) — one-line WRONG-code example under each of the 12 patterns. The catalog stays symptom-only; fixes live in `cklph-os:debugging`. Emoji marker stripped per house style.
- **`security`** (47 → 58 lines) — new "Specific attack vectors" section: SQL injection (parameterize via SDK), IDOR (app-layer ownership check + RLS as net), XSS (`dangerouslySetInnerHTML` sanitize + `<a href>` scheme validation), path traversal (`path.resolve` + `startsWith`), open redirect (allowlist), secrets-in-URL / log.
- **`discipline`** — adds the regen-types-after-migration rule (`supabase gen types typescript --linked > lib/types/database.ts` in the same commit as the migration). See `data-model`.

## [0.1.1] — 2026-05-30

### Added
- **"Why these layers"** section in `architecture` — each layer cited against the principle it enforces
  from `cklph-os:design` (SRP for services, DIP for data-layer, OCP for middleware, SRP+ISP for
  security, DRY for utils, SRP for validation). Surfaces the *rationale*, doesn't teach the principles.

### Fixed
- `architecture` final line no longer references the non-existent `service-layer-patterns` skill — that
  content was absorbed into `architecture` + `api-routes` during the v0.1.0 distillation. Replaced with
  pointers to `api-routes`, `security`, and `cklph-os:design`.

## [0.1.0] — 2026-05-30

### Added — initial release
- **`architecture`** — layered `lib/` structure (services / data / middleware / security / utils / validation): what each layer owns and the rule that components don't reach into services directly.
- **`security`** — ordered mutation checklist: rate-limit FIRST · CSRF on state-change · `getUser()` not `getSession()` · Zod on all input · correct Supabase client by intent (`createServerSupabaseClient` · `createClient` · `createServiceRoleClient` ONLY after admin check or in cron).
- **`api-routes`** — route handler patterns: `compose()` middleware (`requireAuth` + `rateLimit` + `csrfValidate`), `ServiceResult<T>` typed success/failure shape, `dynamic = "force-dynamic"` for webhooks, `verifyCronAuth` for cron.
- **`data-layer`** — no raw `fetch("/api/...")` in components or hooks; route everything through `lib/data/` (`authFetcher` / `useAuthQuery` / `useAuthMutation`) for 401 refresh-retry, CSRF, cache dedupe, and invalidation. Semgrep rule `no-raw-fetch-to-api-in-client-code` enforces it.
- **`pitfalls`** — the 12 cumulative review pitfalls catalog (React updater purity, optimistic-update drift, toggle idempotency, Supabase `range()` inclusivity, `{count: "exact"}` for pagination, partial-select `Pick<T>` typing, JSON.parse before Zod, state-machine catch blocks, service-role in auth routes, finite-value `string` → union types, control flow after error checks, 500-line file limit).
- **`discipline`** — cross-cutting rules (Tailwind+ShadCN only · search-before-create · security on ALL mutations · correct Supabase client · Stripe prices from `pricing_tiers` table · migrations via CLI not MCP for DDL · DRY at 3+ · branch safety · dark mode + WCAG AA on all new UI · zero `any` · client fetches through `lib/data/` · 500-line file limit).

### Composition with `vercel:*`
This plugin is **layered on top of**, not a replacement for, the official `vercel:*` skills. `vercel:*` covers Next.js + React + Vercel framework patterns (`vercel:nextjs`, `vercel:react-best-practices`, `vercel:routing-middleware`, `vercel:shadcn`, `vercel:turbopack`, `vercel:auth`, `vercel:ai-sdk`); `cklph-nextjs` covers Peter's house style on top.

### Distilled from
Surviving project-level `.claude/skills/` after the v0.7.1 cleanup pass (`layered-architecture`, `security-patterns`, `api-route-patterns`, `service-layer-patterns`, `api-error-handling`, `component-standards`, `ui-quality-standards`) plus that project's `AGENTS.md` "Critical Rules" and "Common Review Pitfalls" sections — generalized to be reusable across all Peter's Next.js + Supabase repos.
