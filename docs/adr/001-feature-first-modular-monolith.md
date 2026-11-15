# ADR-001: Feature-first modular monolith with tiers

## Status

Accepted, 2026-11-14

## Context

`cklph-nextjs` told every app to organize code by layer at the top level: `lib/services/`,
`lib/data/`, `lib/types/`, `lib/utils/`. That works for a small app. As apps grow, one change to a
feature (a new field on an entity) touches the migration, the generated types, a service, a route,
a data hook and two components, spread over seven folders. Reviewers can't see a feature's whole
surface, nothing stops one feature reaching into another's internals, and "where does this go?"
gets a different answer per developer.

Client apps also vary a lot in size. A marketing site with a contact form and a billing ledger
should not carry the same structure.

## Decision

Every cklph Next.js + Supabase app is a modular monolith: one deployable, one module per business
area under `src/modules/<f>/`, each layered inside (`ui/`, `application/`, optional `domain/`,
`infrastructure/`, and an `index.ts` that is the module's only public import path).

Dependencies point inward: `app → modules/*/index.ts → application → domain ← infrastructure`.
`src/server/` holds the composition root, the isolated admin client and the generated DB types.
`src/shared/` holds what 3+ modules use. dependency-cruiser enforces the rule in CI.

Tiers are chosen per module: Lite (`src/features/<f>/` with a server-only `data.ts`), Standard
(the default above) and Full (adds a complete `domain/`). A module moves up a tier when it gains
rules, never ahead of need.

Repos on the old `lib/` layout stay valid. They follow the same rules under the old paths and
migrate one module at a time when touched.

## Consequences

- A feature change stays inside one folder, and a module's surface is its `index.ts`.
- The dependency rule is checked by a tool, not by memory.
- Lite modules keep small features cheap; the tiers stop over-layering as well as under-layering.
- More files and folders per feature, and more indirection for simple CRUD than the old layout.
- Two layouts coexist across Peter's repos for a long time. Skills have to describe both, and a
  developer moving between repos has to know which one they are in.
- Judging the tier is a call someone has to make and record in `ARCHITECTURE.md`; a wrong call
  costs a later restructure of that module.
- dependency-cruiser needs TypeScript below 7 installed, or it scans nothing and passes silently.
