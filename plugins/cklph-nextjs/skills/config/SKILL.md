---
name: config
description: Peter's pattern for typed env vars and graceful-degradation config in Next.js. Use when adding env vars, wiring an optional integration (Stripe, Resend, Sentry, OpenAI), editing keys.ts, or asking why a feature is silently off.
---

# config — typed env, graceful degradation

Env vars get validated once, at boot, with Zod. Everything else imports the typed `env` object. Optional integrations fail closed — missing key means the feature is off, not the site is down.

## Typed env via t3-env — a server schema and a public schema

```ts
// src/server/env.ts: the server schema. No 'server-only' here, so next.config.ts can import it.
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),                   // required — site won't boot without it
    SUPABASE_SECRET_KEY: z.string().min(1).optional(), // service-role; src/server/admin/ throws if it is missing
    STRIPE_SECRET_KEY: z.string().min(1).optional(),  // optional integration
    RESEND_API_KEY: z.string().min(1).optional(),
    SENTRY_DSN: z.string().url().optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
  },
  experimental__runtimeEnv: process.env,              // Next >= 13.4.4; t3-env's split-file pattern
});
```

```ts
// src/server/keys.ts: what the app imports
import "server-only";
export { env } from "./env";
```

```ts
// next.config.ts: validate at build, so a missing required var fails the deploy, not the first request
import "./src/server/env";
```

```ts
// src/shared/public-keys.ts: client-safe values only
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const publicEnv = createEnv({
  client: { NEXT_PUBLIC_APP_URL: z.string().url() },
  runtimeEnv: { NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL }, // list each one so Next inlines it
});
```

Anything not in a schema is invisible. No more `process.env.MAYBE_SET` scattered through deep modules.

## Who may read `env`

`src/server/keys.ts` carries `import 'server-only'`, so a client module that imports it fails the build instead of leaking. Only `src/server/` and `src/modules/*/infrastructure/` import it. Nothing but `keys.ts` and `next.config.ts` imports `env.ts`. Use cases get configured gateways on `ctx`, never raw keys; UI and `domain/` never see `env`. Client code reads `publicEnv` only.

## Public vs private — the hard wall

`NEXT_PUBLIC_*` ships to the browser. Everything else is server-only and must never be imported into a client module. The bundler inlines `NEXT_PUBLIC_*` at build time — a secret behind that prefix is now in the browser. Forever. Never put a secret, and above all the Supabase service-role/secret key, under `NEXT_PUBLIC_`.

## Graceful degradation (the next-forge pattern)

```ts
// src/modules/notifications/infrastructure/resend.gateway.ts
import "server-only";
import { env } from "@/server/keys";
import { Resend } from "resend";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  if (!resend) return { skipped: true, reason: "RESEND_API_KEY not set" };
  return resend.emails.send(opts);
}
```

Only the database is required. Stripe, Resend, Sentry, OpenAI — each is `null` if the key is missing, and callers branch on `if (resend)` instead of throwing. A new contributor can `npm run dev` with just the DB.

## One env per app (monorepos)

In Turborepo, `apps/web/.env.local` and `apps/admin/.env.local` are separate. Never share env across deployable apps — that's how a dev secret ends up in the marketing site bundle.

## Anti-patterns

- `process.env.FOO` in a deep module — bypasses typing, ships undefined to prod.
- Importing `@/server/keys` from a use case, component or `domain/` — pass a configured gateway on `ctx` instead.
- One `createEnv` with both `server` and `client` imported into client code — drop `server-only` and the secrets schema rides along.
- Hardcoded URLs like `https://myapp.com` — use `NEXT_PUBLIC_APP_URL`.
- Throwing when an optional integration env is missing — turns a config gap into a 500.
- `console.log(env)` for debugging — leaks every secret.
- Shared `.env` across monorepo apps — one app's leak becomes every app's leak.
- A `NEXT_PUBLIC_STRIPE_SECRET_KEY` — yes, this happens. Audit your prefixes.

Legacy repos with a root `keys.ts`: add `import 'server-only'` to it and move `NEXT_PUBLIC_` values to their own schema; the move to `src/server/` can wait until the next touch.

Pair with **security** for what never gets logged, **architecture** for which layers may read config, and **api-routes** for where validated env actually gets used.
