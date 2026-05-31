# Changelog

All notable changes to `cklph-nextjs` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

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
Surviving MailPrism `.claude/skills/` after the v0.7.1 cleanup pass (`layered-architecture`, `security-patterns`, `api-route-patterns`, `service-layer-patterns`, `api-error-handling`, `component-standards`, `ui-quality-standards`) plus MailPrism's `AGENTS.md` "Critical Rules" and "Common Review Pitfalls" sections — generalized to be reusable across all Peter's Next.js + Supabase repos.
