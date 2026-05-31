---
name: discipline
description: Peter's cross-cutting house rules for Next.js + Supabase projects. Use at the start of any task and before pushing any code. These are non-negotiable.
---

# discipline — house rules

These rules apply to every cklph-stack project (MailPrism, SendBriefs, BeforeMerge, ApertureStack). They are not suggestions. Most are catch-once-then-they-stick.

## Styling

- **Tailwind + ShadCN only.** No WebAwesome (`wa-*` classes, `var(--wa-*)` variables). If you see them, they're being removed.
- Use the project's MP component library (`components/mp/atoms/`, `molecules/`, `organisms/`, `templates/`) and form wrappers in `components/ui/forms/`.

## Reuse over creation

- **Search before creating.** Every project has 50+ MP components and 50+ services. Duplicating one is the most common review-catch.
- Extend an existing component with new optional props before forking a new one.
- Three-strike rule — same logic in 3+ files extracts NOW, not "TODO later".

## Security on ALL mutations

Five steps, in order — rate-limit → CSRF → `getUser()` (NEVER `getSession()`) → Zod → correct Supabase client. See **security** for the full mutation checklist.

## Supabase client by intent

- `createServerSupabaseClient` — server components, API routes, server actions.
- `createClient` — client components.
- `createServiceRoleClient` — cron jobs, admin paths after `isAdmin()`. Bypasses RLS — danger zone.

## Stripe prices come from the DB

Read from a DB table (in MailPrism it's `pricing_tiers`; pick the right name per project) for price IDs and tier metadata. **Never hardcode** a `PRICING_PLANS` constant — environment drift between staging and prod will burn you.

## Schema changes via CLI, not MCP

`supabase migration new` then `supabase db push`. Migrations are checked-in source. The Supabase MCP is for read-only research (querying data, inspecting schema), never for DDL. **After every migration, regenerate types** — `supabase gen types typescript --linked > lib/types/database.ts` — and commit the regenerated file **in the same commit as the migration**. See **data-model** for how to consume them.

## DRY at three

One copy is fine. Two is a watch-list. Three is an extraction. Extract to `lib/utils/`, `lib/services/`, `lib/hooks/`, or `components/mp/` depending on type.

## Branch safety

NEVER commit directly to `dev` or `main`. Before any code, `git checkout dev && git pull && git checkout -b <type>/<short-description>`. Applies to one-liners too.

## Dark mode + WCAG AA on ALL new UI

- Pair every `bg-`, `text-`, `border-` class with a `dark:` variant.
- Target 4.5:1 contrast for body text, 3:1 for large text and UI components — verify in BOTH modes.
- Every input has a `<label>` or `aria-label`. Error messages associate via `aria-describedby`. Modals trap focus.
- Touch targets meet 44x44px (WCAG 2.5.5).

## Zero `any`

Use specific types, generics, or `unknown` with narrowing. `as any` and `: any` are both review-blockers. If a third-party type is wrong, declare a proper override.

## Client fetches through `lib/data/`

Never raw `fetch("/api/…")` from a component or hook. Use `authFetcher`, `useAuthQuery`, or `useAuthMutation`. See **data-layer** for why.

## File size limit

Hard ceiling 500 lines per file. At 400 you're already planning the split. Cohesion goes down past 500 and reviewers stop reading thoroughly.

---

Run through this list at the START of a task, not the end. Pair with **architecture** for layer rules, **pitfalls** for the recurring bug catalog.
