# cklph-nextjs

Peter's opinionated Next.js + Supabase patterns — house style on top of the framework, **not** a replacement for the official `vercel:*` skills.

## What this is

The accumulated patterns from **MailPrism / SendBriefs / BeforeMerge / ApertureStack**, distilled into a reusable plugin that auto-loads across all of Peter's Next.js + Supabase repos.

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
| **Peter's house style on top** | `cklph-nextjs` | layered `lib/` architecture, mutation security checklist, data-layer abstraction, 12 accumulated review pitfalls, cross-cutting discipline rules |

## What's inside (v0.2.0)

### Foundations
- `architecture` — layered `lib/` structure (services / data / middleware / security / utils / validation) + "Why these layers" linking each to a principle from `cklph-os:design`.
- `discipline` — cross-cutting house rules (Tailwind+ShadCN only · search-before-create · DRY at 3+ · branch safety · dark mode + WCAG AA · zero `any` · 500-line file limit · regen types after every migration).
- `pitfalls` — the 12 cumulative review-catch patterns with one-line WRONG-code examples (React updater purity, optimistic-update drift, Supabase `range()` inclusivity, `{count: "exact"}` for pagination, JSON.parse before Zod, state-machine catch blocks, etc.).

### Mutation security
- `security` — ordered checklist (rate-limit FIRST · CSRF · `getUser()` · Zod · correct Supabase client by intent) + specific attack vectors (SQLi / IDOR / XSS / path traversal / open redirect / secrets-in-URL).
- `auth` — Supabase auth flows: sign-in / sign-up / OAuth callback / password reset / multi-tenant gating.

### Route shapes
- `api-routes` — route handler patterns: `compose()` middleware, `ServiceResult` shape, `dynamic = "force-dynamic"`, `verifyCronAuth`.
- `server-actions` — the `"use server"` boundary; when to use a server action vs an API route.

### Data access
- `data-layer` — no raw `fetch("/api/...")` in components or hooks; route through `authFetcher` / `useAuthQuery` / `useAuthMutation`.
- `data-model` — the Supabase-generated `lib/types/database.ts` is the source of truth; how to read `Row` / `Insert` / `Update` / `Enums` types.
- `supabase-migrations` — CLI-first workflow + RLS policy template + rollback discipline.
- `postgres` — index design, `EXPLAIN ANALYZE`, pgbouncer pooling, JSONB `gin` patterns.

### Background + webhooks
- `qstash` — Upstash QStash for background jobs (signature verification, idempotency, state machine).
- `pubsub` — Google Pub/Sub webhooks (always 200, JWT verification, atomic dedup, BigInt comparison).

### Quality
- `testing` — Vitest + Playwright coverage tiers; mock the data-layer, not the network.
- `ui-quality` — dark mode + WCAG AA deep dive: `dark:` variants, contrast thresholds, `:focus-visible`, keyboard nav, ARIA, screen-reader smoke tests.
- `error-handling` — `ServiceResult` returns, user-surface vs log-only, Sentry capture-at-boundary.
- `config` — typed env vars (Zod / `@t3-oss/env-nextjs`) + graceful degradation (missing env = feature off, not error).

## Install

```bash
claude plugin install cklph-nextjs@cklph
```

(The `cklph` marketplace also hosts `cklph-os`.)

See `CHANGELOG.md` for version history.
