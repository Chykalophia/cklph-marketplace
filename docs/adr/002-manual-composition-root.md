# ADR-002: Manual composition root, no decorator DI

## Status

Accepted, 2026-11-14

## Context

ADR-001 has use cases depend on ports (repository and gateway interfaces) rather than on Supabase
or vendor SDKs. Something has to construct the implementations and hand them to use cases, once
per request, with the request's user-scoped Supabase client.

The options were a DI container (tsyringe, Inversify), an effect system (Effect), or plain
functions. Decorator-based containers rely on `emitDecoratorMetadata`, which esbuild, SWC and
Turbopack do not emit, so they break or need workarounds in a Next.js build. A container also
invites `container.resolve()` calls deep in the code, which is a service locator: dependencies
become invisible and tests need the container. Effect is powerful but is a whole programming model
the team and every client handover would have to learn.

## Decision

Wire dependencies by hand in `src/server/context.ts`. A `makeRequestContext()` function creates the
user-scoped Supabase client, resolves identity (`getClaims()`, or `getUser()` for sensitive
operations), constructs repositories and gateways, and returns a typed `ctx`. Use cases take
`(ctx, input)`. Tests build a `ctx` with in-memory fakes.

No tsyringe or Inversify. No `container.resolve()` outside `context.ts`. Effect only through a
separate ADR for a specific module.

## Consequences

- Every dependency is visible in a use case's `ctx` type, and tests swap them without a framework.
- No build-tool coupling: plain functions survive any bundler.
- `context.ts` grows with every module and has to be kept readable, for example by splitting it
  into per-module factories it calls.
- No lifetime management, scoping or lazy construction for free; anything beyond per-request
  construction is written by hand.
- Building the whole context per request costs some work even when a request needs one repository.
  Keep construction cheap (no I/O in constructors) so it stays negligible.
