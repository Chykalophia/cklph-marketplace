---
name: data-layer
description: The client data-layer rule. Components and hooks NEVER call fetch directly — they use authFetcher / useAuthQuery / useAuthMutation from src/shared/lib/data/. Use when adding any client-side API call, wiring a form/mutation to the backend, or deciding whether data should be fetched on the client at all.
---

# data-layer — src/shared/lib/data/ is the only client fetch path

Components and hooks never call `fetch("/api/…")`. Every client-side network call goes through `src/shared/lib/data/` (`authFetcher`, `useAuthQuery`, `useAuthMutation`). Feature-specific hooks live in `src/modules/<f>/ui/` and wrap those primitives. A raw fetch in a component is a bug — Semgrep rule `no-raw-fetch-to-api-in-client-code` will catch it.

## First: does this need client fetching at all?

Default to reading in a **Server Component** through the module's query use case (imported from `@/modules/<f>`). Reach for the client data layer only for interactive data: frequent refetch, optimistic updates, polling, or user-driven filters. `'use client'` + a fetch for data available at render is an anti-pattern (bigger bundle, waterfalls, extra endpoints to secure).

## Why this rule exists

The data-layer wraps every request with:

- **401 refresh-retry** — silently refreshes a stale Supabase session and replays the request once.
- **CSRF token attachment** — pulled from the auth context, added to every state-changing request.
- **Cache dedupe** — concurrent identical reads share one request, one response.
- **Invalidation graph** — a mutation can declare which queries it invalidates; matching `useAuthQuery` calls refetch automatically.

Skip the layer and you lose all four. The bypass shows up as flaky logouts on token expiry, missing CSRF errors in production, duplicate requests on mount, and stale UI after writes.

## Pick the right primitive

| Need                                    | Use                | Returns                              |
| --------------------------------------- | ------------------ | ------------------------------------ |
| One-off read (server action, effect)    | `authFetcher`      | `Promise<T>`                         |
| Cached read in a component              | `useAuthQuery`     | `{ data, error, isLoading, mutate }` |
| Mutation (POST/PUT/PATCH/DELETE)        | `useAuthMutation`  | `{ trigger, data, error, isMutating }` |

```ts
// Cached read
const { data, isLoading } = useAuthQuery<Item[]>("/api/items");

// Mutation — declares what to invalidate on success
const { trigger } = useAuthMutation<CreateItemInput, Item>("/api/items", {
  method: "POST",
  invalidates: ["/api/items", "/api/dashboard/stats"],
});
```

## Migration trigger

If you see `fetch("/api/…")` inside `src/app/`, `src/modules/*/ui/`, or any `'use client'` file, rewrite it before doing anything else. The pattern is non-negotiable across every cklph-stack project.

Server-side data fetching (Server Components, actions, route handlers) does NOT use `src/shared/lib/data/` — it calls the module's use cases through `@/modules/<f>` (its `index.ts`). It never imports Supabase or `infrastructure/` directly (that's layer skipping). The rule is for the client only.

Legacy repos still on `lib/data/`: same rule, old path. Migrate when you next touch the module.

Pair with **architecture** for the module layout, **api-routes** for what's on the other end of the call.
