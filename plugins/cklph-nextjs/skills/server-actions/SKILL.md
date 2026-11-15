---
name: server-actions
description: Peter's rules for the use server boundary in Next.js 15+. Use when writing server actions, actions.ts files, form action handlers, or deciding between an action and an API route.
---

# server-actions — the `"use server"` boundary

Server actions are the right tool for form submissions and simple React-triggered mutations. They're the wrong tool for webhooks, cron, third-party integrations, or any caller that isn't a React component.

## Use a server action when

- The caller is a React form (`<form action={...}>`).
- The mutation is simple — one use case via `@/modules/<f>`, return a result, re-render.
- You want progressive enhancement (form works without JS).

## Use an API route instead when

- The caller isn't React (Stripe webhook, QStash job, Pub/Sub push, external integration).
- You need custom headers, signed-payload verification, or non-cookie auth.
- The flow is multi-step (resumable uploads, streaming responses).
- Rate-limiting from third-party identifiers (IP, API key) — easier in middleware.

If you'd ever `curl` it, use an API route. If only a React form calls it, server action. Don't use actions as a public API: anything outside your own UI gets a route handler (see **api-routes**).

## File convention

Top-of-file `"use server"` in `actions.ts` under `src/app/`, next to the page that uses it (a file in an `actions/` folder or a `*.actions.ts` file also counts; the dependency-cruiser config recognises all three). Each export is built from the authenticated action client, validates input, calls ONE use case and returns a `ServiceResult<T>`.

`actions.ts` imports only from `@/modules/<f>` (the module's `index.ts`) and `@/server/*`. Never Supabase, never `src/modules/*/infrastructure/`.

```ts
// src/server/action-client.ts: the one place actions get their identity and rate limits
import "server-only";
import { headers } from "next/headers";
import { createSafeActionClient } from "next-safe-action";
import { makeAuthedContext } from "@/server/context";
import { limit } from "@/shared/lib/rate-limit"; // (key, bucket) => Promise<boolean>; the limiter behind rateLimit()

// 1. Rate-limit FIRST, keyed by IP. On Vercel the first x-forwarded-for entry is the client; behind
//    your own proxy, use the address that proxy appends, or callers can spoof their bucket.
export const actionClient = createSafeActionClient().use(async ({ next }) => {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await limit(`ip:${ip}`, "ip")) throw new Error("Too many requests");
  return next();
});

// 2. Auth inside the action, then the per-user limit.
async function requireUser(fresh: boolean) {
  const ctx = await makeAuthedContext({ fresh }); // non-null user or it throws; fresh: getUser(), else getClaims()
  if (await limit(`user:${ctx.user.id}`, "default")) throw new Error("Too many requests");
  return ctx;
}

export const authActionClient = actionClient.use(async ({ next }) => next({ ctx: await requireUser(false) }));

// Billing, role changes, deletes, anything irreversible: identity re-checked with the auth server.
export const sensitiveActionClient = actionClient.use(async ({ next }) => next({ ctx: await requireUser(true) }));
```

```ts
// src/app/items/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authActionClient } from "@/server/action-client";
import { createItem } from "@/modules/items";

const Schema = z.object({ name: z.string().min(1).max(100) }).strict();

export const createItemAction = authActionClient
  .inputSchema(Schema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await createItem(ctx, parsedInput);
    if (!result.success) return result;
    revalidatePath("/items");
    return { success: true as const, data: { id: result.data.id } }; // minimal DTO, never the row
  });
```

## Return `{ success: true }` or a minimal DTO, never the row

Whatever an action returns is serialized to the browser. Return `{ success: true }`, or the few fields the UI needs (an `id` to navigate to). Never the inserted or updated row: it leaks columns the user should not see and couples the UI to the schema.

## Return `ServiceResult` for expected failures

next-safe-action wraps what the action returns. The client gets one of:

- `result.data`: your `ServiceResult`. Read `result.data?.success`, not `result.success`.
- `result.validationErrors`: the Zod failures, per field.
- `result.serverError`: anything thrown, with the message masked by default.

Return expected failures (not found, forbidden, a business rule) as `failure(...)` so the form can show the message in place. Throw only for the unexpected: the middleware rejects above, or a bug.

## Form-action pattern

Wire it with next-safe-action's `useAction` hook. When the form must work without JS, define it with `.stateAction()` and a `zod-form-data` schema (`zfd.formData(...)`), and bind it with React's `useActionState(action, {})`, passing the returned `dispatch` to `<form action={dispatch}>`. A plain `.action()` is not a `<form action>` handler. Show the pending state with the `isPending` value from `useActionState`, or `useFormStatus()` in a client child component.

## Security is the same checklist

Server actions are NOT a security shortcut. Every exported action is a public POST endpoint: anyone can call it with a crafted request, whatever page renders it. Page-level or layout auth does not cover it, and middleware/Proxy is an optimistic check only (CVE-2025-29927). Auth runs **inside** the action, which is why every action starts from `authActionClient` or `sensitiveActionClient`.

Run the full **security** checklist — rate-limit, auth with `getClaims()` (or `getUser()` for sensitive operations), Zod-validate with `.strict()`, and let the use case's policy check ownership.

## Anti-patterns

- Throwing for an expected failure: the user sees a masked `serverError` instead of the message.
- Importing actions into client utility files that don't render — the `"use server"` boundary only protects components that actually render.
- Using an action when an API route fits better (cron, webhooks, third-party callbacks).
- Skipping rate-limit "because it's an action" — actions don't auto-rate-limit.
- A bare `export async function` action that skips `authActionClient` — relying on the page to have checked auth.
- A sensitive action (billing, roles, deletes) built from `authActionClient` instead of `sensitiveActionClient`.
- Importing `createServerSupabaseClient` or a repository into `actions.ts` — layer skipping; call the use case.
- Returning the inserted/updated row to the client.

Legacy repos on `lib/` call the service in `lib/services/` the same way: one call, auth inside the action.

Pair with **security** for the mutation checklist, **architecture** for where use cases live, and **api-routes** when an action doesn't fit.
