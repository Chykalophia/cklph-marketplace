---
name: architecture
description: Peter's layered lib/ structure for Next.js + Supabase apps. Use when creating any file under lib/, designing a new feature, or asking where code should live.
---

# architecture — the layered lib/ layout

Every project in the cklph stack (MailPrism, SendBriefs, BeforeMerge, ApertureStack) uses the same `lib/` shape. Components don't reach into services directly. Routes stay thin. Business logic lives in one place.

## The layers

| Path              | Owns                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `lib/services/`   | Business logic. One file per domain. Returns `ServiceResult<T>`.  |
| `lib/data/`       | Client-side data plumbing — `authFetcher`, `useAuthQuery`, `useAuthMutation`. The ONLY way components talk to APIs. |
| `lib/middleware/` | `compose()` + middleware (`requireAuth`, `rateLimit`, etc).        |
| `lib/security/`   | CSRF token, rate-limit buckets, encryption helpers.                |
| `lib/utils/`      | Pure helpers — formatters, type guards, Supabase client factories. |
| `lib/validation/` | Zod schemas. One file per domain. Schemas are the boundary contract. |

## Dependency direction

```
components / app  →  lib/data  →  app/api  →  lib/services  →  Supabase
                                       ↑              ↑
                                  middleware     validation
```

- Routes call services. Services own all writes.
- Services NEVER import from `app/`. Validation NEVER imports from services.
- Components NEVER call `fetch("/api/…")` directly — go through `lib/data/` (see **data-layer**).

## Where does this code go?

| If it…                            | Put it in            |
| --------------------------------- | -------------------- |
| Renders UI                        | `components/` or `app/` |
| Handles HTTP                      | `app/api/` (thin)    |
| Holds business logic              | `lib/services/`      |
| Validates input                   | `lib/validation/`    |
| Composes auth/rate-limit/csrf     | `lib/middleware/`    |
| Is a pure helper                  | `lib/utils/`         |
| Is called from a component        | `lib/data/` or hook in `lib/hooks/` |

## Hard limits

- Route file `> 100` lines → business logic leaked in. Move it to a service.
- Service file `> 500` lines → split by responsibility (`*-reader`, `*-writer`, `*-evaluator`).
- Same logic in 3+ places → extract NOW, not "later".

Pair with **service-layer-patterns** for `ServiceResult<T>` conventions, **api-routes** for `compose()` middleware, **security** for the mutation checklist.
