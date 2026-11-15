# cklph-nextjs

Peter's opinionated Next.js + Supabase patterns — house style on top of the framework, **not** a replacement for the official `vercel:*` skills.

## What this is

The accumulated patterns from **Peter's Next.js + Supabase products**, distilled into a reusable plugin that auto-loads across all of Peter's Next.js + Supabase repos.

## Stack assumptions

- **Next.js 15+** (App Router)
- **Supabase** (auth, DB, RLS, encrypted tokens)
- **TypeScript strict** (zero `any`)
- **Tailwind + ShadCN** (no WebAwesome)
- **Vercel** deployment
- **QStash** (Upstash) for background jobs
- **Google Pub/Sub** for real-time webhooks (some repos)
- **Stripe** prices sourced from a DB `pricing_tiers` table (never hardcoded)

## How it composes with `vercel:*`

Use both — they are layered, not competing:

| Layer | Source | Examples |
|---|---|---|
| **Framework patterns** | `vercel:*` | `vercel:nextjs`, `vercel:react-best-practices`, `vercel:routing-middleware`, `vercel:shadcn`, `vercel:turbopack`, `vercel:auth`, `vercel:ai-sdk` |
| **Peter's house style on top** | `cklph-nextjs` | feature-module architecture, mutation security checklist, RLS + app policies, data-layer abstraction, 15 accumulated review pitfalls, cross-cutting discipline rules |

## The layout

```
src/
  app/                  routes only: pages, layouts, actions.ts, route.ts (all thin)
  modules/<f>/
    ui/                 components, hooks, presenters
    application/        use-cases/, policies.ts, dto.ts, schemas.ts
    domain/             optional: entities, value objects, errors, ports
    infrastructure/     supabase-*.repository.ts, <vendor>.gateway.ts
    index.ts            the module's public API
  server/
    context.ts          composition root, built per request
    admin/              service-role Supabase client, isolated
    db/database.types.ts
  shared/               ui kit, lib/data, lib/middleware, result, branded types
```

`app → modules/*/index.ts → application → domain ← infrastructure`, checked in CI with the
dependency-cruiser config in `skills/architecture/references/`. Repos still on the older `lib/`
layout follow the same rules under the old paths and migrate one module at a time. Decisions behind
it: `docs/adr/` 001 to 004 at the repo root.

## What's inside

### Foundations
- `architecture` — feature modules layered inside (Lite / Standard / Full tiers per module), the dependency rule, "where does this code go?", ten non-negotiables, a dependency-cruiser reference config, and "Why these boundaries" linking each to a principle from `cklph-os:design`.
- `discipline` — cross-cutting house rules (Tailwind+ShadCN only · search-before-create · DRY at 3+ · branch safety · dark mode + WCAG AA · zero `any` · 500-line file limit · regen types after every migration).
- `pitfalls` — the 15 cumulative review-catch patterns with one-line WRONG-code examples (React updater purity, optimistic-update drift, Supabase `range()` inclusivity, `{count: "exact"}` for pagination, JSON.parse before Zod, state-machine catch blocks, layer skipping, leaky repositories, service locator, etc.).

### Mutation security
- `security` — ordered checklist (rate-limit FIRST · CSRF · `getClaims()`/`getUser()` · Zod · correct Supabase client by intent) + RLS and app policies, both + specific attack vectors (SQLi / IDOR / XSS / path traversal / open redirect / secrets-in-URL).
- `auth` — Supabase auth flows: sign-in / sign-up / OAuth callback / password reset / multi-tenant gating.

### Route shapes
- `api-routes` — route handler patterns: `compose()` middleware, `ServiceResult` shape, `dynamic = "force-dynamic"`, `verifyCronAuth`.
- `server-actions` — the `"use server"` boundary; when to use a server action vs an API route.

### Data access
- `data-layer` — no raw `fetch("/api/...")` in components or hooks; route through `authFetcher` / `useAuthQuery` / `useAuthMutation`.
- `data-model` — the Supabase-generated `src/server/db/database.types.ts` is the source of truth, used only in repositories; how to read `Row` / `Insert` / `Update` / `Enums` types.
- `supabase-migrations` — CLI-first workflow + RLS policy template + rollback discipline.
- `postgres` — index design, `EXPLAIN ANALYZE`, pgbouncer pooling, JSONB `gin` patterns.

### Background + webhooks
- `qstash` — Upstash QStash for background jobs (signature verification, idempotency, state machine).
- `pubsub` — Google Pub/Sub webhooks (always 200, JWT verification, atomic dedup, BigInt comparison).

### Quality
- `testing` — Vitest + Playwright coverage tiers; mock the data-layer, not the network; `ai-regression.md` for code an AI wrote and self-reviewed.
- `ui-quality` — dark mode + WCAG AA deep dive: `dark:` variants, contrast thresholds, `:focus-visible`, keyboard nav, ARIA, screen-reader smoke tests, and the checked list of animated component libraries.
- `error-handling` — `ServiceResult` returns, user-surface vs log-only, Sentry capture-at-boundary.
- `config` — typed env vars (Zod / `@t3-oss/env-nextjs`) + graceful degradation (missing env = feature off, not error).

## Install

```bash
claude plugin install cklph-nextjs@cklph
```

(The `cklph` marketplace also hosts `cklph-os`.)

See `CHANGELOG.md` for version history.
