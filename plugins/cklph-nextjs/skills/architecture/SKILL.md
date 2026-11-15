---
name: architecture
description: Peter's layered architecture for Next.js + Supabase apps — feature modules, layered inside, with tiers. Use when creating any server-side or module file, designing a new feature, choosing where code should live, or reviewing a PR for structure.
---

# architecture — feature modules, layered inside

Every cklph app is a **modular monolith**: one deployable, one module per business area, each module internally layered (Presentation → Application → Domain ← Infrastructure). Organize by **feature first, layer second** — layer-first top-level folders cause shotgun surgery (one field = edits in seven folders).

Full reference with definitions and the anti-pattern catalog: the "SaaS Layered Architecture Reference" doc.

## Pick a tier (per app AND per module)

| Tier | When | Shape |
| --- | --- | --- |
| **1 – Lite** | Prototype, marketing + simple CRUD, < ~10 screens, one dev | `src/features/<f>/{components, actions.ts, data.ts (server-only DAL), schema.ts}`. RLS + Zod. No domain, no ports. |
| **2 – Standard (default)** | Most client SaaS | `src/modules/<f>/{ui, application, infrastructure, index.ts}` + `src/server/context.ts` + Result types. `domain/` only where invariants exist. |
| **3 – Full** | Billing, scheduling, ledgers, compliance; long-lived; several devs | Tier 2 + full `domain/` (aggregates, value objects, events, ports), outbox/jobs for events, Turborepo package per bounded context, contract tests. |

Modules in one app can sit at different tiers. Record the tier in `ARCHITECTURE.md`.

## Folder template (Tier 2)

```
src/
  app/                      # routes only: pages, layouts, actions.ts, route.ts — all thin
  modules/<f>/
    ui/                     # components, hooks (TanStack Query), presenters
    application/            # use-cases/*.ts, policies.ts, dto.ts, schemas.ts (Zod)
    domain/                 # optional: entities, value objects, errors, ports (interfaces) — framework-free
    infrastructure/         # supabase-*.repository.ts, <vendor>.gateway.ts
    index.ts                # the module's public API — the ONLY import path for other code
  server/
    context.ts              # composition root, built per request
    admin/                  # service-role Supabase client, isolated
    db/database.types.ts    # generated Supabase types (see data-model)
  shared/                   # ui kit, lib (result, logger, flags), branded types
supabase/migrations/        # schema + RLS, migrations only
docs/adr/                   # Nygard-format ADRs
ARCHITECTURE.md  AGENTS.md
```

## Dependency rule (CI-enforced)

```
app → modules/*/index.ts → application → domain ← infrastructure
                                            (implements domain/application ports)
```

- `domain/` imports nothing outside itself: no `next/*`, no `@supabase/*`.
- `application/` never imports `infrastructure/` — it receives implementations via `ctx` from `src/server/context.ts`.
- `@supabase/*` only in `infrastructure/` and `src/server/`. Service-role key only in `src/server/admin/`.
- No cross-module deep imports; go through `index.ts`.
- `app/**` never imports `infrastructure/**` or `@supabase/*` (layer skipping = IDOR risk).
- Components never `fetch("/api/…")` directly — read in Server Components via query use cases; client hooks only for interactive data (see **data-layer**).

## Where does this code go?

| If it… | Put it in |
| --- | --- |
| Is a page/layout | `src/app/` |
| Is a mutation from your own UI | `src/app/**/actions.ts` (thin Server Action) |
| Is a webhook, public API, OAuth callback, cron | `src/app/**/route.ts` (thin Route Handler) |
| Renders UI / formats for one screen | `modules/<f>/ui/` |
| Validates input shape | `modules/<f>/application/schemas.ts` |
| Runs a use case | `modules/<f>/application/use-cases/` (one per file) |
| Decides if actor may do X to resource Y | `modules/<f>/application/policies.ts` |
| Is the shape sent to the client | `modules/<f>/application/dto.ts` |
| Is a business rule / invariant | `modules/<f>/domain/` (pure functions or entities) |
| Describes something the core needs from outside | port (interface) in `domain/` or `application/` |
| Reads/writes the DB | `modules/<f>/infrastructure/*.repository.ts` |
| Talks to a vendor | `modules/<f>/infrastructure/*.gateway.ts` |
| Needs the service-role key | `src/server/admin/` |
| Wires implementations to ports | `src/server/context.ts` |
| Is used by 3+ modules | `src/shared/` |
| Is tenancy/ownership that must hold for every writer | RLS policy in `supabase/migrations/` |

## Non-negotiables (every tier)

1. `import 'server-only'` in every application, infrastructure and DAL file.
2. Auth **inside** every Server Action and Route Handler — actions are public POST endpoints; page-level auth does not cover them. Build actions from an authenticated action client (next-safe-action `authActionClient` pattern). Middleware/Proxy is for optimistic checks only (CVE-2025-29927).
3. Controllers: parse with Zod → call ONE use case → map Result → revalidate. Nothing else.
4. Use cases take `(ctx, input)`, authorize via `policies.ts` (resource ownership — IDOR), return `ServiceResult<DTO>` (`{ success, data }` / `{ success, error, code }`, see **error-handling**). Expected failures are Results; only unexpected ones throw. Moving to neverthrow `Result<DTO, AppError>` is an ADR decision, not a per-repo one.
5. DTOs to the client. Never pass raw rows as props or return them from actions. Only server code reads `process.env`.
6. RLS on every exposed table, explicit per-operation policies, tested with pgTAP. Use `(select auth.uid())` and index policy columns. RLS = tenancy floor; app policies = business rules. Both, always.
7. User-scoped Supabase client by default. Identity via `getClaims()` / `getUser()` — never `getSession()` on the server.
8. Repositories return domain types/DTOs, translate errors, select explicit columns (no `select('*')`). Generated DB types stay in `infrastructure/`.
9. Ports only at real seams: external systems, or a second implementation (a test fake counts). No interface wrapping a pure function.
10. DI = manual composition root. No tsyringe/Inversify (decorator metadata breaks under esbuild). Effect only by ADR. No `container.resolve()` outside `context.ts` (service locator).

## Hard limits

- Action/route file > 100 lines, or function > ~50 → logic leaked; move to a use case.
- Use-case/service file > 500 lines → split per use case.
- Same logic in 3+ places → extract now.
- New circular dependency → CI fails (`no-circular: error`).

## Enforcement

- dependency-cruiser rules matching the dependency rule above (`no-circular` set to `error`; confirm TypeScript is installed so it scans > 0 modules, and that it is below 7: dependency-cruiser 18 cannot load TypeScript 7 and passes silently on 0 modules). Starting config: [`references/dependency-cruiser.cjs`](references/dependency-cruiser.cjs). Copy it to the app root as `.dependency-cruiser.cjs` and run `npx depcruise src --config .dependency-cruiser.cjs` in CI.
- eslint-plugin-boundaries or `import/no-restricted-paths` for in-editor feedback.
- On legacy apps: record a violations baseline, fail CI only on new ones, burn down.

## Legacy repos on `lib/`

Repos still on the layer-first layout (`lib/services/`, `lib/data/`, `lib/types/database.ts`) follow the same rules under the old paths: services play the use-case role, `lib/data/` is the client fetch path. Migrate one module at a time when you next touch it. Never a big-bang rewrite.

## Growing a module without a rewrite

1. Start Lite with a server-only `data.ts` and thin actions.
2. When a feature gains rules, split `data.ts` into `application/` use cases + an `infrastructure/` repository. Other features stay Lite.
3. When an invariant repeats across use cases, move it into `domain/`.
4. Add ports only at real seams.
5. Move a mature module into a Turborepo package; a separate deployable needs evidence (scaling, ownership, compliance).

## Testing per layer

Domain → Vitest, no mocks. Application → Vitest with in-memory fakes. Infrastructure → Supabase local + Vitest, pgTAP for RLS. Vendors → contract tests / Zod-validated payloads. E2E → Playwright, one journey per role + tenant isolation. (See **testing**.)

## Why these boundaries (see `design`)

- Dependency rule → **DIP**: the core owns its interfaces; swap Supabase or a vendor by adding an implementation, not editing use cases.
- One use case per file, module per business area → **SRP**.
- Composable action clients + middleware → **OCP**.
- Feature-first folders → change stays local (no shotgun surgery).
- Domain layer only where invariants exist → **YAGNI** (over-layering is an anti-pattern too).

Pair with **api-routes** for route conventions, **server-actions** for the `use server` boundary, **security** for the mutation checklist, **supabase-migrations** for RLS workflow, and **`cklph-os:design`** for principles.
