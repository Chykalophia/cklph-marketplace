---
name: config
description: Peter's pattern for typed env vars and graceful-degradation config in Next.js. Use when adding env vars, wiring an optional integration (Stripe, Resend, Sentry, OpenAI), editing keys.ts, or asking why a feature is silently off.
---

# config — typed env, graceful degradation

Env vars get validated once, at boot, with Zod. Everything else imports the typed `env` object. Optional integrations fail closed — missing key means the feature is off, not the site is down.

## Typed env via t3-env

```ts
// keys.ts — runs at import time, throws if invalid
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),                   // required — site won't boot without it
    STRIPE_SECRET_KEY: z.string().min(1).optional(),  // optional integration
    RESEND_API_KEY: z.string().min(1).optional(),
    SENTRY_DSN: z.string().url().optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
  },
  client: { NEXT_PUBLIC_APP_URL: z.string().url() },
  runtimeEnv: process.env,
});
```

Anything not in the schema is invisible. No more `process.env.MAYBE_SET` scattered through deep modules.

## Public vs private — the hard wall

`NEXT_PUBLIC_*` ships to the browser. Everything else is server-only and must never be imported into a client module. The bundler inlines `NEXT_PUBLIC_*` at build time — a secret behind that prefix is now in the browser. Forever.

## Graceful degradation (the next-forge pattern)

```ts
import { env } from "@/keys";
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
- Hardcoded URLs like `https://myapp.com` — use `NEXT_PUBLIC_APP_URL`.
- Throwing when an optional integration env is missing — turns a config gap into a 500.
- `console.log(env)` for debugging — leaks every secret.
- Shared `.env` across monorepo apps — one app's leak becomes every app's leak.
- A `NEXT_PUBLIC_STRIPE_SECRET_KEY` — yes, this happens. Audit your prefixes.

Pair with **security** for what never gets logged, and **api-routes** for where validated env actually gets used.
