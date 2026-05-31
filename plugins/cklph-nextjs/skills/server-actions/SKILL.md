---
name: server-actions
description: Peter's rules for the use server boundary in Next.js 15+. Use when writing server actions, actions.ts files, form action handlers, or deciding between an action and an API route.
---

# server-actions — the `"use server"` boundary

Server actions are the right tool for form submissions and simple React-triggered mutations. They're the wrong tool for webhooks, cron, third-party integrations, or any caller that isn't a React component.

## Use a server action when

- The caller is a React form (`<form action={...}>`).
- The mutation is simple — one service call, return a result, re-render.
- You want progressive enhancement (form works without JS).

## Use an API route instead when

- The caller isn't React (Stripe webhook, QStash job, Pub/Sub push, external integration).
- You need custom headers, signed-payload verification, or non-cookie auth.
- The flow is multi-step (resumable uploads, streaming responses).
- Rate-limiting from third-party identifiers (IP, API key) — easier in middleware.

If you'd ever `curl` it, use an API route. If only a React form calls it, server action.

## File convention

Top-of-file `"use server"` in `actions.ts`, colocated with the feature. Each export is async, takes `FormData` or a typed arg, returns a `ServiceResult<T>`.

```ts
"use server";
const Schema = z.object({ name: z.string().min(1).max(100) }).strict();

export async function createItemAction(formData: FormData) {
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, error: "Validation failed", code: "VALIDATION_ERROR" };
  return createItem(parsed.data);
}
```

## Return `ServiceResult`, never throw

Throwing bubbles to the React error boundary and kills the form. Return `{ success, data }` or `{ success, error, code }` — the form reads `result.success` and renders feedback in place.

## Form-action pattern

`<form action={createItemAction}>` for the wiring. Use `useFormStatus()` in a client child component for the pending state — `const { pending } = useFormStatus()` disables the button while the action runs.

## Security is the same checklist

Server actions are NOT a security shortcut. Run the full **security** checklist — rate-limit, auth with `getUser()`, Zod-validate with `.strict()`, pick the right Supabase client.

## Anti-patterns

- Throwing instead of returning `failure` — breaks the form lifecycle.
- Importing actions into client utility files that don't render — the `"use server"` boundary only protects components that actually render.
- Using an action when an API route fits better (cron, webhooks, third-party callbacks).
- Skipping rate-limit "because it's an action" — actions don't auto-rate-limit.

Pair with **security** for the mutation checklist, **architecture** for where services live, and **api-routes** when an action doesn't fit.
