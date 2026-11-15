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

Top-of-file `"use server"` in `actions.ts` under `src/app/`, next to the page that uses it. Each export is built from the authenticated action client, validates input, calls ONE use case and returns a `ServiceResult<T>`.

`actions.ts` imports only from `@/modules/<f>` (the module's `index.ts`) and `@/server/*`. Never Supabase, never `src/modules/*/infrastructure/`.

```ts
// src/server/action-client.ts: the one place actions get their identity
import "server-only";
import { createSafeActionClient } from "next-safe-action";
import { makeRequestContext } from "@/server/context";

export const actionClient = createSafeActionClient();

export const authActionClient = actionClient.use(async ({ next }) => {
  const ctx = await makeRequestContext(); // identity via getClaims(); getUser() for sensitive ops
  if (!ctx.user) throw new Error("Unauthorized");
  return next({ ctx });
});
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

## Return `ServiceResult`, never throw

Throwing bubbles to the React error boundary and kills the form. Return `{ success, data }` or `{ success, error, code }` — the form reads `result.success` and renders feedback in place.

## Form-action pattern

Wire it with next-safe-action's `useAction` hook, or `<form action={...}>` with a FormData-aware schema (`zod-form-data`) when the form must work without JS. For a plain `<form action>`, use `useFormStatus()` in a client child component for the pending state — `const { pending } = useFormStatus()` disables the button while the action runs.

## Security is the same checklist

Server actions are NOT a security shortcut. Every exported action is a public POST endpoint: anyone can call it with a crafted request, whatever page renders it. Page-level or layout auth does not cover it, and middleware/Proxy is an optimistic check only (CVE-2025-29927). Auth runs **inside** the action, which is why every action starts from `authActionClient`.

Run the full **security** checklist — rate-limit, auth with `getClaims()` (or `getUser()` for sensitive operations), Zod-validate with `.strict()`, and let the use case's policy check ownership.

## Anti-patterns

- Throwing instead of returning `failure` — breaks the form lifecycle.
- Importing actions into client utility files that don't render — the `"use server"` boundary only protects components that actually render.
- Using an action when an API route fits better (cron, webhooks, third-party callbacks).
- Skipping rate-limit "because it's an action" — actions don't auto-rate-limit.
- A bare `export async function` action that skips `authActionClient` — relying on the page to have checked auth.
- Importing `createServerSupabaseClient` or a repository into `actions.ts` — layer skipping; call the use case.
- Returning the inserted/updated row to the client.

Legacy repos on `lib/` call the service in `lib/services/` the same way: one call, auth inside the action.

Pair with **security** for the mutation checklist, **architecture** for where use cases live, and **api-routes** when an action doesn't fit.
