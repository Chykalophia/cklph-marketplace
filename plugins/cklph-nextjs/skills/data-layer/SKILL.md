---
name: data-layer
description: The lib/data/ rule. Components and hooks NEVER call fetch directly. Use when adding any client-side API call or wiring a form/mutation to the backend.
---

# data-layer — lib/data/ is the only fetch path

Components and hooks never call `fetch("/api/…")`. Every client-side network call goes through `lib/data/`. A raw fetch in a component is a bug — Semgrep rule `no-raw-fetch-to-api-in-client-code` will catch it.

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

If you see `fetch("/api/…")` inside `components/`, `app/`, or `lib/hooks/`, rewrite it before doing anything else. The pattern is non-negotiable across MailPrism, SendBriefs, BeforeMerge, and ApertureStack.

Server-side data fetching (RSC, route handlers) does NOT use `lib/data/` — it talks to services or Supabase directly. The rule is for the client only.

Pair with **architecture** for the lib/ layout, **api-routes** for what's on the other end of the call.
