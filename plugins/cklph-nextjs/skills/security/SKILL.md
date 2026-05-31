---
name: security
description: Peter's ordered checklist for every Next.js + Supabase mutation. Use when writing POST/PUT/PATCH/DELETE, server actions, or any code that writes to the database.
---

# security — the mutation checklist

Every mutation runs the same five steps in the same order. Skipping any one is a bug.

## The order (NEVER reorder)

1. **Rate-limit FIRST.** Stops abuse before any work happens.
2. **CSRF on state-change.** All POST/PUT/PATCH/DELETE from a browser session must carry a CSRF token. Exempt only OAuth callbacks, signed webhooks, and cron paths.
3. **Auth with `getUser()` — NEVER `getSession()`.** `getSession()` reads a cookie without verifying it; `getUser()` calls the auth server and validates.
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
- **Path traversal** — file uploads/downloads validate the **resolved** path stays inside the allowed directory (`path.resolve` + `startsWith` check).
- **Open redirect** — `redirect(user_provided_url)` must validate against an allowlist (or use relative paths only).
- **Secret in URL / log** — never put a token in a query string (it lands in proxy logs and browser history); never log full request URLs that include credentials.

Pair with **api-routes** for the `compose()` middleware that wires this in.
