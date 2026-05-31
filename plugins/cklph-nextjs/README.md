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

## What's inside (v0.1.0)

- `architecture` — layered `lib/` structure (services / data / middleware / security / utils / validation).
- `security` — security checklist for mutations (rate-limit FIRST · CSRF on state-change · `getUser()` not `getSession()` · Zod on all input · correct Supabase client by intent).
- `api-routes` — route handler patterns: `compose()` middleware, `ServiceResult` success/failure shape, when to set `dynamic = "force-dynamic"`.
- `data-layer` — no raw `fetch("/api/...")` in components or hooks; route everything through `authFetcher` / `useAuthQuery` / `useAuthMutation` (401 refresh-retry + CSRF + dedupe + invalidation).
- `pitfalls` — the 12 cumulative review pitfalls catalog (React updater purity, optimistic-update drift, Supabase `range()` inclusivity, `{count: "exact"}` for pagination, JSON.parse before Zod, state-machine catch blocks, etc.).
- `discipline` — cross-cutting rules (zero `any` · dark mode + WCAG AA on all new UI · Tailwind+ShadCN only · search-before-create · DRY at 3+ · Stripe prices from DB · migrations via CLI not MCP · 500-line file limit).

Planned for later: `supabase-migrations`, `qstash`, `google-pubsub`, `postgres-best-practices`, `ui-quality-standards` (dark mode + WCAG details).

## Install

```bash
claude plugin install cklph-nextjs@cklph
```

(The `cklph` marketplace also hosts `cklph-os`.)

See `CHANGELOG.md` for version history.
