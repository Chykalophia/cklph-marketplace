// FIXTURE: web-auth lens, should-not-flag (PRECISION). Safe lookalike: a redirect validated against
// an allowlist. Logout redirects to a caller-supplied absolute `returnTo` URL, which looks like an
// open redirect, but:
//   - returnTo is parsed with new URL (no base), so a relative or malformed value falls back
//   - it is followed only when its parsed origin is exactly one of three fixed https origins, so
//     `https://app.example.com@evil.example`, `//evil.example`, `javascript:` (origin "null") and
//     look-alike hosts such as `app.example.com.evil.example` all fall back to the app root
//   - logout is a POST, and the redirect is a 303 to that vetted URL
// The twin open redirect is web-auth/should-flag/auth-callback-and-portal-link.example.ts (`next`).
// Expected verdict: NO FINDING.
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const RETURN_ORIGINS = new Set(['https://app.example.com', 'https://docs.example.com', 'https://status.example.com']);
const DEFAULT_RETURN = 'https://app.example.com/';

function safeReturnTo(raw: string | null): string {
  if (!raw) return DEFAULT_RETURN;
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return DEFAULT_RETURN;
  }
  return RETURN_ORIGINS.has(target.origin) ? target.href : DEFAULT_RETURN;
}

export async function POST(request: NextRequest) {
  const store = await cookies();
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
  await supabase.auth.signOut();
  return NextResponse.redirect(safeReturnTo(request.nextUrl.searchParams.get('returnTo')), 303);
}
