---
name: auth
description: Peter's Supabase auth flows for Next.js — sign-in, OAuth callback, password reset, multi-tenant gating. Use when wiring sign-up/sign-in, the OAuth callback route, password reset, or any redirect-if-unauthenticated logic.
---

# auth — Supabase auth flows

`security` covers per-mutation auth (`getClaims()`/`getUser()`, rate-limit, CSRF). This skill is the surrounding flow — how users get a session and where auth gates live.

## Server vs client — the one rule

- **Server-side** (routes, server components, server actions, middleware): default to `await supabase.auth.getClaims()`. It verifies the JWT signature locally against the project's published keys, with no round trip, when the project uses asymmetric JWT signing keys (on the legacy shared secret it falls back to asking the auth server). Use `await supabase.auth.getUser()` for sensitive operations (password or email change, billing, role changes, anything irreversible) or when you need the freshest user record: it asks the auth server, so a revoked or deleted user fails immediately. Identity is resolved once per request in `src/server/context.ts` and handed to use cases on `ctx`.
- **Client-side**: a `useUser()` hook for reads. For data fetches, go through `authFetcher` from **data-layer** — it owns the 401 → refresh → retry path.

**Never `getSession()` on the server.** It reads a cookie without validating it. Stale tokens slip through, RLS becomes a lie.

**Middleware/Proxy is an optimistic check only.** It can redirect a signed-out visitor early, but it is never the gate: CVE-2025-29927 let a spoofed `x-middleware-subrequest` header skip middleware entirely. Re-check identity in the action, route handler or use case that does the work.

## OAuth callback route

OAuth providers redirect to `app/auth/callback/route.ts`, which exchanges the code for a session and redirects.

```ts
// `next` is attacker-controlled. Accept only a same-origin relative path: one leading "/",
// never "//" or "/\" (browsers read both as a new host), and re-check the resolved origin.
// Without this, `?next=@evil.example` redirects to https://app.example@evil.example.
function safeNext(raw: string | null, origin: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  const url = new URL(raw, origin);
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : "/dashboard";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), origin);
  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/auth/error`);
}
```

PKCE is handled by `@supabase/ssr`. The exchange must run server-side (HttpOnly cookie).

## Three entry points, one callback

Email+password (`signUp` → `signInWithPassword`), magic link (`signInWithOtp`), OAuth (`signInWithOAuth`) — all three land in `app/auth/callback/route.ts`.

## Password reset

Two pages: **Request** — `resetPasswordForEmail(email, { redirectTo })`. **Reset** — user arrives with a recovery session, call `updateUser({ password })`. After success, call `signOut({ scope: "others" })` to invalidate other sessions. A reset that leaves stolen sessions alive is a half-fix.

## Multi-tenant gating

RLS predicates include both `auth.uid()` AND `organization_id`. Verify membership in the use case policy (`src/modules/<f>/application/policies.ts`) too — RLS is the net, not the gate. Store `current_organization_id` in a cookie or user metadata; **never trust the request body**.

## Where auth code lives

- **Redirect-if-unauthenticated** → `middleware.ts` (`proxy.ts` on Next 16) or `app/(authed)/layout.tsx`. One boundary check, for UX only: it does not protect actions or routes.
- **Per-mutation auth** → `requireAuth` in route handlers (see **api-routes**, **security**), `authActionClient` in server actions (see **server-actions**).
- **Never** scatter auth checks inside leaf components.

## Anti-patterns

- `getSession()` server-side; auth checks scattered in leaf components.
- Treating middleware/Proxy or a layout check as the only gate — actions and routes must re-check.
- RLS policy missing the `auth.uid()` predicate.
- Password reset that doesn't invalidate other sessions.
- OAuth code exchange running on the client.
- Redirecting to an unvalidated `next` parameter (open redirect).
- Trusting `organization_id` from the request body.

Pair with **security** for the mutation checklist, **data-layer** for `authFetcher`'s 401 handling, **api-routes** for `requireAuth`.
