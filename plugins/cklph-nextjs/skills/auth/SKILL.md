---
name: auth
description: Peter's Supabase auth flows for Next.js — sign-in, OAuth callback, password reset, multi-tenant gating. Use when wiring sign-up/sign-in, the OAuth callback route, password reset, or any redirect-if-unauthenticated logic.
---

# auth — Supabase auth flows

`security` covers per-mutation auth (`getUser()`, rate-limit, CSRF). This skill is the surrounding flow — how users get a session and where auth gates live.

## Server vs client — the one rule

- **Server-side** (routes, server components, server actions, middleware): always `await supabase.auth.getUser()`. It validates the token with the auth server and refreshes as a side effect.
- **Client-side**: a `useUser()` hook for reads. For data fetches, go through `authFetcher` from **data-layer** — it owns the 401 → refresh → retry path.

**Never `getSession()` on the server.** It reads a cookie without validating it. Stale tokens slip through, RLS becomes a lie.

## OAuth callback route

OAuth providers redirect to `app/auth/callback/route.ts`, which exchanges the code for a session and redirects.

```ts
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
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

RLS predicates include both `auth.uid()` AND `organization_id`. Verify membership in the service layer too — RLS is the net, not the gate. Store `current_organization_id` in a cookie or user metadata; **never trust the request body**.

## Where auth code lives

- **Redirect-if-unauthenticated** → `middleware.ts` or `app/(authed)/layout.tsx`. One boundary check.
- **Per-mutation auth** → `requireAuth` (see **api-routes**, **security**).
- **Never** scatter auth checks inside leaf components.

## Anti-patterns

- `getSession()` server-side; auth checks scattered in leaf components.
- RLS policy missing the `auth.uid()` predicate.
- Password reset that doesn't invalidate other sessions.
- OAuth code exchange running on the client.
- Trusting `organization_id` from the request body.

Pair with **security** for the mutation checklist, **data-layer** for `authFetcher`'s 401 handling, **api-routes** for `requireAuth`.
