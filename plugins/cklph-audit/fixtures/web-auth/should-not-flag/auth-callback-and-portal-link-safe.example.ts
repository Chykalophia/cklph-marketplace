// FIXTURE: web-auth lens, should-not-flag (PRECISION)
// Looks like the auth-callback-and-portal-link fixture, but:
//   - `next` is accepted only as a same-origin path: it must start with one "/", and "//" and "/\"
//     are rejected, then it is resolved against SITE_URL, the origin is re-checked, and leading
//     slashes are collapsed after resolving, so "/.//evil.example" cannot become "//evil.example"
//   - the redirect base is SITE_URL from env, never a request header
//   - portal tokens are 32 random bytes, only their SHA-256 hash is stored, they expire after 15
//     minutes, and one atomic update consumes them, so a token works once
//   - the client id comes from the consumed link row, not from a query parameter, and the cookie
//     holds a fresh random session id whose hash is stored server side
//   - exchangeCodeForSession has no manual state check because @supabase/ssr checks the PKCE
//     verifier cookie itself
// Expected verdict: NO FINDING.
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const admin = createAdminClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;
const LINK_TTL_MS = 15 * 60_000;

async function supabaseFromCookies() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard';
  const resolved = new URL(raw, SITE_URL);
  if (resolved.origin !== new URL(SITE_URL).origin) return '/dashboard';
  // Dot segments can rebuild a protocol-relative path ("/.//evil.example" resolves to "//evil.example"),
  // so collapse leading slashes after resolving, not only before.
  return resolved.pathname.replace(/^\/+/, '/') + resolved.search;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// app/auth/callback/route.ts
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));

  if (code) {
    const supabase = await supabaseFromCookies();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, SITE_URL));
  }
  return NextResponse.redirect(new URL('/login?error=callback', SITE_URL));
}

// app/api/portal-link/route.ts exports this as POST
export async function requestPortalLink(request: NextRequest) {
  const { email } = await request.json();
  const { data: client } = await admin.from('portal_clients').select('id').eq('email', email).maybeSingle();
  if (client) {
    const token = randomBytes(32).toString('base64url');
    await admin.from('portal_links').insert({
      client_id: client.id,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
    });
    await admin.functions.invoke('send-email', {
      body: { to: email, template: 'portal-link', url: `${SITE_URL}/portal/enter?token=${token}` },
    });
  }
  return NextResponse.json({ ok: true });
}

// app/portal/enter/route.ts exports this as GET
export async function enterPortal(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const { data: link } = await admin
    .from('portal_links')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hashToken(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('client_id')
    .maybeSingle();
  if (!link) return NextResponse.redirect(new URL('/portal?error=invalid', SITE_URL));

  const sessionId = randomBytes(32).toString('base64url');
  await admin.from('portal_sessions').insert({
    id_hash: hashToken(sessionId),
    client_id: link.client_id,
    expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
  });
  const res = NextResponse.redirect(new URL('/portal', SITE_URL));
  res.cookies.set('portal_session', sessionId, { httpOnly: true, secure: true, sameSite: 'lax', path: '/portal', maxAge: 8 * 3600 });
  return res;
}
