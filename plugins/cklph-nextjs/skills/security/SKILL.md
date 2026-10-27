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
3. **Auth with `getUser()` — NEVER `getSession()`.** `getSession()` reads a cookie without verifying it; `getUser()` calls the auth server and validates.
   Once you have the user, apply any **per-user** limit (a user ID is a stable key; an IP is not).
   This is an extra limit for costly buckets (`ai`, `email`), not a replacement for step 1.
4. **Zod on all input.** Use `.strict()` on objects so unknown fields fail closed. Validate URL params (UUID regex) before they hit a query.
5. **Correct Supabase client.** Pick by intent, not convenience.

## Supabase client selection

| Where                       | Client                       | Why                                  |
| --------------------------- | ---------------------------- | ------------------------------------ |
| Server component / API route | `createServerSupabaseClient` | Honors RLS, attaches session cookie. |
| Client component            | `createClient`               | Honors RLS for the logged-in user.   |
| Cron / admin path           | `createServiceRoleClient`    | Bypasses RLS — danger zone.          |

`createServiceRoleClient` bypasses ALL row-level security. Use ONLY after an `isAdmin()` check, in a cron handler with no user context, or for explicit cross-user operations (system notifications, webhook fan-out). Never in a normal authenticated request path.

## RLS as defense in depth

Even with `getUser()` + correct client, write the query as if RLS doesn't exist — `.eq("user_id", user.id)` on every read and write of user data. RLS is the safety net, not the gate.

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

Pair with **api-routes** for the `compose()` middleware that wires this in.
