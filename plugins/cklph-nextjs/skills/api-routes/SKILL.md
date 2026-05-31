---
name: api-routes
description: Peter's route handler pattern using compose() middleware. Use when creating or editing files under app/api/ or writing route.ts files.
---

# api-routes — thin controllers with compose()

Routes parse HTTP, validate input, delegate to a service, and return JSON. Nothing else. If a route grows past ~100 lines it has business logic in it — move that logic into `lib/services/`.

## The shape

```ts
import { NextResponse } from "next/server";
import {
  compose,
  requireAuth,
  rateLimit,
  getUserIdentifier,
  APIErrors,
  type MiddlewareRequest,
} from "@/lib/middleware";
import { z } from "zod";
import { createItem } from "@/lib/services/item-service";

const CreateItemSchema = z.object({
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
}).strict();

export const POST = compose(
  requireAuth,
  async (request: MiddlewareRequest) => {
    // Rate-limit AFTER auth so we have a stable identifier.
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

    const result = await createItem(request.user!.id, parsed.data);
    if (!result.success) {
      const status = result.code === "VALIDATION_ERROR" ? 400 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ data: result.data }, { status: 201 });
  },
);
```

## Middleware library

- `requireAuth` — gates the route; attaches `request.user`.
- `optionalAuth` — for read paths that work signed-in or anonymous.
- `rateLimit(request, identifier, bucket)` — buckets like `default`, `ai`, `email`.
- `APIErrors` — `badRequest`, `unauthorized`, `forbidden`, `notFound`, `internal`.
- CSRF is handled at the framework edge; see **security**.

## Services return ServiceResult, routes translate to HTTP

Services return `{ success, data }` or `{ success, error, code }`. The route maps `code` to a status code — never throws raw from a service. This keeps services framework-agnostic and routes boring.

## Special handlers

- **Webhooks** (Stripe, QStash, Pub/Sub) — add `export const dynamic = "force-dynamic"`, verify the provider signature in lieu of CSRF, and return 200 even on internal errors to avoid retry storms.
- **Cron** (`app/api/cron/`) — wrap in `verifyCronAuth` (CRON_SECRET header). Return fast; enqueue the heavy work to the job queue.
- **Dynamic params** (`[id]`) — validate UUID format BEFORE the query, otherwise you get noisy PostgREST errors.

## Route review checklist

- Uses `compose()` with at minimum `requireAuth`.
- Rate-limit applied with a bucket appropriate to cost.
- Zod schema with `.strict()`.
- All DB work delegated to a service.
- Error responses don't leak stack traces or PostgREST internals.
- File is under 100 lines.

Pair with **security** for the mutation checklist, **architecture** for layer placement, **data-layer** for how clients call this route.
