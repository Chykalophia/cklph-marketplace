// FIXTURE: web-auth lens, should-not-flag (PRECISION)
// Looks like the unverified-jwt-api fixture, but:
//   - the Bearer token is verified with jwtVerify against the project's JWKS, with the algorithm,
//     issuer, and audience pinned, and jose checks exp and nbf
//   - the per-user response is `Cache-Control: private, no-store`, and unstable_cache includes the
//     user id in its key parts, so no shared cache entry spans two users
//   - the pricing route really is public: it reads no identity, so `s-maxage` on it is correct
// Expected verdict: NO FINDING.
import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

async function userIdFromRequest(request: NextRequest): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const { payload } = await jwtVerify(header.slice('Bearer '.length), JWKS, {
      algorithms: ['ES256'],
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

const billingSummary = (userId: string) =>
  unstable_cache(
    async () => {
      const { data } = await admin.from('invoices').select('amount_cents, status, due_at').eq('user_id', userId).order('due_at', { ascending: false }).limit(5);
      return data ?? [];
    },
    ['account-billing-summary', userId],
    { revalidate: 300, tags: [`billing:${userId}`] },
  )();

// app/api/me/route.ts
export async function GET(request: NextRequest) {
  const userId = await userIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: profile } = await admin.from('profiles').select('full_name, email, plan').eq('id', userId).single();
  const billing = await billingSummary(userId);

  return NextResponse.json({ profile, billing }, { headers: { 'Cache-Control': 'private, no-store' } });
}

// app/api/plans/route.ts exports this as GET
export async function listPlans() {
  const { data: plans } = await admin.from('plans').select('slug, name, price_cents, features').eq('public', true).order('price_cents');
  return NextResponse.json({ plans }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } });
}
