// FIXTURE: security lens, should-flag (RECALL). Twin of should-not-flag/public-config-cors.example.ts.
// Planted: the account route reads the caller's session cookie, then reflects any request Origin
// into Access-Control-Allow-Origin together with Access-Control-Allow-Credentials: true, and the
// session cookie is SameSite=None so it rides cross-site requests. Any site
// the victim visits can fetch('/api/account', { credentials: 'include' }) and read their email,
// plan and billing address -> security:insecure-default, CWE-942 (high).
// Expected verdict: FLAG.
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

async function currentUser() {
  const store = await cookies();
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: () => {} },
    cookieOptions: { sameSite: 'none', secure: true },
  });
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

function corsFor(request: NextRequest) {
  return {
    'Access-Control-Allow-Origin': request.headers.get('origin') ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsFor(request) });
  const { data: account } = await supabase
    .from('accounts')
    .select('email, plan, billing_address')
    .eq('user_id', user.id)
    .single();
  return NextResponse.json(account, { headers: { ...corsFor(request), 'Cache-Control': 'private, no-store' } });
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: { ...corsFor(request), 'Access-Control-Allow-Methods': 'GET' } });
}
