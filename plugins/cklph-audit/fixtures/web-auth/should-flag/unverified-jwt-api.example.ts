// FIXTURE: web-auth lens, should-flag (RECALL)
// An account summary API for the mobile app, called with the Supabase access token as a Bearer
// header. Planted:
//   1. the token payload is read with decodeJwt and never verified, so any client can mint a token
//      with another user's `sub` and read that user's profile and invoices -> web-auth:jwt-verify (high)
// Expected verdict: FLAG it.
import { NextResponse, type NextRequest } from 'next/server';
import { decodeJwt } from 'jose';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function userIdFromRequest(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const claims = decodeJwt(header.slice('Bearer '.length));
  return typeof claims.sub === 'string' ? claims.sub : null;
}

// app/api/me/route.ts
export async function GET(request: NextRequest) {
  const userId = userIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: profile } = await admin.from('profiles').select('full_name, email, plan').eq('id', userId).single();

  const { data: billing } = await admin.from('invoices').select('amount_cents, status, due_at').eq('user_id', userId).order('due_at', { ascending: false }).limit(5);

  return NextResponse.json({ profile, billing }, { headers: { 'Cache-Control': 'private, no-store' } });
}
