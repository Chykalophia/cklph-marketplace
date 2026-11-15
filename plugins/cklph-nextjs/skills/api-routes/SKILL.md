---
name: api-routes
description: Peter's route handler pattern using compose() middleware. Use when creating or editing files under app/api/ or writing route.ts files, or deciding between a route handler and a server action.
---

# api-routes — thin controllers with compose()

Routes parse HTTP, validate input, call ONE use case from the module's public API (`@/modules/<f>`), and return JSON. Nothing else. If a route grows past ~100 lines it has business logic in it — move that logic into `src/modules/<f>/application/use-cases/`.

## Route handler or server action?

- **Route handler** (`route.ts`): webhooks, public/partner APIs, OAuth callbacks, cron, anything a non-React client calls.
- **Server action** (`actions.ts`): mutations from your own UI (see **server-actions**). Don't use server actions as a public API.
- Never put DB or Supabase calls in either. Never import from `src/modules/*/infrastructure/` — only from the module's `index.ts`.

## The shape

```ts
import { NextResponse } from "next/server";
import {
  compose,
  csrfValidate,
  requireAuth,
  rateLimit,
  getUserIdentifier,
  APIErrors,
  type MiddlewareRequest,
} from "@/shared/lib/middleware";
import { z } from "zod";
import { createItem } from "@/modules/items"; // the module's index.ts — never a deep import
import { makeAuthedContext } from "@/server/context"; // composition root

const CreateItemSchema = z.object({
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
}).strict();

const HTTP_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400, INVALID_ID: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
};

// Order is owned by the security skill: IP rate-limit -> CSRF -> auth -> per-user limit -> Zod.
const limitByIp = (request: MiddlewareRequest) =>
  rateLimit(request, getUserIdentifier(request), "ip"); // no user yet, so this keys on IP

export const POST = compose(
  limitByIp,
  csrfValidate,
  requireAuth,
  async (request: MiddlewareRequest) => {
    // Per-user limit, now that there is a stable identifier.
    const id = getUserIdentifier(request, request.user!.id);
    const limited = await rateLimit(request, id, "default");
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    if (!body) throw APIErrors.badRequest("Invalid JSON");

    const parsed = CreateItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // The use case authorizes the actor against the resource (IDOR) and returns a DTO, never a raw row.
    const ctx = await makeAuthedContext(); // ctx.user is non-null; throws APIErrors.unauthorized() if there is none
    const result = await createItem(ctx, parsed.data);
    if (!result.success) {
      const status = HTTP_STATUS[result.code] ?? 500;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ data: result.data }, { status: 201 });
  },
);
```

## Middleware library

- `requireAuth` — gates the route; attaches `request.user`.
- `optionalAuth` — for read paths that work signed-in or anonymous.
- `rateLimit(request, identifier, bucket)` — buckets like `ip`, `default`, `ai`, `email`. `getUserIdentifier(request)` falls back to the client IP when no user ID is passed.
- `csrfValidate` — rejects a state-changing request without a valid CSRF token (403). Leave it out only on the exempt paths **security** lists (OAuth callback, signed webhooks, cron).
- `APIErrors` — `badRequest`, `unauthorized`, `forbidden`, `notFound`, `internal`.

## Use cases return ServiceResult, routes translate to HTTP

Use cases return `{ success, data }` or `{ success, error, code }`, where `data` is a DTO. The route maps `code` to a status code — never throws raw from a use case. This keeps use cases framework-agnostic and routes boring.

## Special handlers

- **Webhooks** (Stripe, QStash, Pub/Sub; `app/api/webhooks/`, or `app/api/jobs/` for QStash) — add `export const dynamic = "force-dynamic"`, verify the provider signature in lieu of CSRF, and return 200 even on internal errors to avoid retry storms.
- **Cron** (`app/api/cron/`) — wrap in `verifyCronAuth` (CRON_SECRET header). Return fast; enqueue the heavy work to the job queue.
- **Dynamic params** (`[id]`) — validate UUID format BEFORE the query, otherwise you get noisy PostgREST errors.

## Route review checklist

- Uses `compose()` in the **security** order: IP rate-limit, `csrfValidate`, `requireAuth`.
- Per-user rate-limit applied with a bucket appropriate to cost.
- Zod schema with `.strict()`.
- Calls exactly one use case via `@/modules/<f>`; no Supabase, no `infrastructure/` imports.
- Webhook/cron/job routes that need the service-role client live under `src/app/api/{webhooks,cron,jobs}/` and get it through `makeSystemContext()` in `src/server/system-context.ts`. Nothing else imports either.
- Error responses don't leak stack traces or PostgREST internals.
- File is under 100 lines.

Pair with **security** for the mutation checklist, **architecture** for layer placement, **data-layer** for how clients call this route.
