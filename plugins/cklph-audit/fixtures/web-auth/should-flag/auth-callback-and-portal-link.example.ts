// FIXTURE: web-auth lens, should-flag (RECALL)
// A Supabase auth callback route plus an app-issued "client portal" magic link. Planted:
//   1. the callback redirects to the `next` query value after exchangeCodeForSession. An absolute
//      URL is passed through as is, and `${origin}${next}` with next="@evil.example" leaves the
//      origin too, so a login link becomes a phish -> web-auth:open-redirect (medium)
//   2. portal tokens come from Math.random, are stored in plaintext, never expire, are not marked
//      used, and the consume route never checks the token belongs to the email it is redeemed
//      for, so anyone can request a link for their own email and redeem it with email=<victim>: an
//      unauthenticated takeover of any portal account -> web-auth:recovery-token (critical)
// Expected verdict: FLAG both.
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const admin = createAdminClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;

async function supabaseFromCookies() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}

// app/auth/callback/route.ts
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await supabaseFromCookies();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(next.startsWith('http') ? next : `${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=callback`);
}

// app/api/portal-link/route.ts exports this as POST
export async function requestPortalLink(request: NextRequest) {
  const { email } = await request.json();
  const token = Math.random().toString(36).slice(2, 10);
  await admin.from('portal_links').insert({ email, token });
  await admin.functions.invoke('send-email', {
    body: { to: email, template: 'portal-link', url: `${SITE_URL}/portal/enter?token=${token}&email=${encodeURIComponent(email)}` },
  });
  return NextResponse.json({ ok: true });
}

// app/portal/enter/route.ts exports this as GET
export async function enterPortal(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const email = request.nextUrl.searchParams.get('email');
  const { data: link } = await admin.from('portal_links').select('id').eq('token', token).maybeSingle();
  if (!link || !email) return NextResponse.redirect(`${SITE_URL}/portal?error=invalid`);

  const { data: client } = await admin.from('portal_clients').select('id').eq('email', email).single();
  const sessionId = randomBytes(32).toString('base64url');
  await admin.from('portal_sessions').insert({
    id_hash: createHash('sha256').update(sessionId).digest('hex'),
    client_id: client!.id,
    expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
  });
  const res = NextResponse.redirect(`${SITE_URL}/portal`);
  res.cookies.set('portal_session', sessionId, { httpOnly: true, secure: true, sameSite: 'lax', path: '/portal', maxAge: 8 * 3600 });
  return res;
}
