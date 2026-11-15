---
name: security
description: Peter's ordered checklist for every Next.js + Supabase mutation. Use when writing POST/PUT/PATCH/DELETE, server actions, or any code that writes to the database.
---

# security — the mutation checklist

Every mutation runs the same five steps in the same order. Skipping any one is a bug. This list is
the one place the order is defined; other skills reference it.

## The order (NEVER reorder)

1. **Rate-limit FIRST, keyed by IP.** Stops abuse before any work happens, including unauthenticated
   traffic and credential stuffing that never gets past auth.
2. **CSRF on state-change.** All POST/PUT/PATCH/DELETE from a browser session must carry a CSRF token. Exempt only OAuth callbacks, signed webhooks, and cron paths.
3. **Auth with `getClaims()` or `getUser()` — NEVER `getSession()`.** `getSession()` reads a cookie without verifying it. `getClaims()` verifies the JWT signature locally (fast default); `getUser()` calls the auth server for the freshest record (use it for sensitive operations).
   Auth runs **inside** every route handler and server action. Server actions are public POST endpoints: page-level auth does not cover them. Signed webhooks and cron have no user session: there, verifying the provider signature or the cron secret is the auth step. Middleware/Proxy auth is an optimistic check only, never the gate (CVE-2025-29927 bypassed it with a spoofed header).
   Once you have the user, apply any **per-user** limit (a user ID is a stable key; an IP is not).
   This is an extra limit for costly buckets (`ai`, `email`), not a replacement for step 1.
4. **Zod on all input.** Use `.strict()` on objects so unknown fields fail closed. Validate URL params (UUID regex) before they hit a query.
5. **Correct Supabase client.** Pick by intent, not convenience.

## Supabase client selection

| Where                       | Client                       | Why                                  |
| --------------------------- | ---------------------------- | ------------------------------------ |
| Request context (`src/server/context.ts`), for use cases | `createServerSupabaseClient` | Honors RLS, attaches session cookie. |
| Client component (realtime, auth UI), `src/shared/lib/supabase/browser.ts` | `createClient` | Honors RLS for the logged-in user. |
| Webhook / cron / job context (`src/server/system-context.ts`) | `createServiceRoleClient` | Bypasses RLS — danger zone. |
| Auth admin calls from a server action (`src/server/admin-context.ts`) | auth admin API only | No table access by design (checked in review); policy-gated per method. |

Pages, routes and actions never hold a client: they call a use case, which gets one through `ctx`.

Where they live (see **architecture**): the user-scoped server client is created once per request in `src/server/context.ts` and passed to repositories in `src/modules/<f>/infrastructure/`. `createServiceRoleClient` lives ONLY in `src/server/admin/` and is lint-banned everywhere else. The key never gets a `NEXT_PUBLIC_` prefix; prefer Supabase's new secret keys (rejected from browsers) and rotate on any exposure.

`createServiceRoleClient` bypasses ALL row-level security. Use ONLY in webhook, cron and job handlers with no user context, for the cross-user work they do (system notifications, webhook fan-out). Never in a normal authenticated request path. Admin screens read and write through RLS policies that grant an admin role taken from `app_metadata` or a roles table, never `user_metadata` (users can edit it). Auth admin calls (invite, delete account, ban, list users) go through `makeAdminContext()` from a server action on `sensitiveActionClient`: `makeAdminContext(actor)` takes the `getUser()`-verified actor and every gateway method re-checks the admin policy, so a factory imported where it should not be is useless without an authorized actor. The gateway (built on `src/server/admin/auth-admin.ts`, which creates its own client and exports only the auth admin API) has fixed-purpose methods (invite, delete, ban for a duration), never a generic `updateUserById`, and the use case's policy decides who may call them. Changing a role in `app_metadata` is its own `sensitiveActionClient` use case, since that claim is what admin RLS trusts.

## RLS as defense in depth

Even with verified identity + correct client, write the query as if RLS doesn't exist — `.eq("user_id", user.id)` on every read and write of user data, and an ownership check in the use case's policy. RLS is the safety net, not the gate. Both layers, always:

- **RLS = tenancy and ownership floor.** Enabled on every exposed table, explicit per-operation policies (`using` on SELECT and DELETE, `with check` on INSERT, both on UPDATE; never `using (true)`), tested with pgTAP. A CI check fails if any `public` table has RLS off.
- **App policies = business rules** (roles, plan limits, step-up auth) in `src/modules/<f>/application/policies.ts`.
- **RLS performance:** write `(select auth.uid())`, not bare `auth.uid()`; index every column a policy filters on; put membership lookups in `security definer` functions in a private schema.

## Never send to the client

Return DTOs, not rows: no full records as props, no updated row from an action (return `{ success: true }` or a minimal DTO). Explicit `select` columns, never `select('*')`. Only server code reads `process.env`. Put `import 'server-only'` in every application, infrastructure and DAL file.

## Never log or return

- OAuth tokens (access / refresh).
- Encrypted API keys, decryption keys, secrets.
- Password hashes, session cookies.
- Full email bodies or message contents (PII).
- Stack traces in 4xx responses.

## Quick negative tests

- Hit the route without a CSRF token → must 403.
- Hit it without a session → must 401.
- Hit it with another user's resource ID → must 404 or 403 (RLS).
- Hit it 100x in a minute → must 429.

If any of those four pass when they shouldn't, you skipped a step.

## Specific attack vectors

- **SQL injection** — always parameterize via the Supabase SDK; never string-build queries. The SDK does it for you; raw `rpc()` arguments are *typed*, not *interpolated*.
- **IDOR** — every fetch/mutation by an entity ID checks `owner_user_id === auth.uid()` at the app layer; RLS is the safety net, not the first line.
- **XSS** — React escapes by default. Danger zones — `dangerouslySetInnerHTML` (sanitize first with DOMPurify or similar), `<a href={user_input}>` (validate the URL scheme — allow `https://` only).
- **Path traversal** — file uploads/downloads validate the **resolved** path stays inside the allowed directory. A bare `startsWith(base)` is not enough: `/data/uploads-evil` starts with `/data/uploads`. Compare against the base plus a separator:
  ```ts
  const base = path.resolve(UPLOAD_DIR);
  const target = path.resolve(base, userPath);
  if (!target.startsWith(base + path.sep)) throw APIErrors.forbidden();
  ```
  `path.resolve` is lexical, so a symlink inside `UPLOAD_DIR` can still point outside it. If users can create links there, or you cannot rule it out, resolve links with `realpath`. A new file does not exist yet, so resolve its parent directory instead:
  ```ts
  import fs from 'node:fs/promises';

  async function safePath(userPath: string) {
    const base = await fs.realpath(UPLOAD_DIR);
    const target = path.resolve(base, userPath);
    const real = await fs.realpath(target).catch(async (e) => {
      if (e.code !== 'ENOENT') throw e;
      return path.join(await fs.realpath(path.dirname(target)), path.basename(target));
    });
    if (!real.startsWith(base + path.sep)) throw APIErrors.forbidden();
    return real;
  }
  ```
  Write new files with `{ flag: 'wx' }`: it fails if the name already exists, including a dangling symlink, which the parent-directory check cannot see.
- **Open redirect** — `redirect(user_provided_url)` must validate against an allowlist, or accept only a same-origin relative path: it starts with a single `/`, and not `//` or `/\` (browsers read both as a new host). See the `safeNext` helper in **auth**.
- **Secret in URL / log** — never put a token in a query string (it lands in proxy logs and browser history); never log full request URLs that include credentials.

Pair with **api-routes** for the `compose()` middleware that wires this in, and **architecture** for where policies, repositories and the admin client live.
