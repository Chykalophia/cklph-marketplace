// FIXTURE: security lens, should-not-flag (PRECISION). Safe lookalike: CORS `*` on public data.
// `Access-Control-Allow-Origin: *` looks like a CORS misconfiguration, but:
//   - the body is a constant: no cookie, header, session or database value reaches it
//   - there is no Access-Control-Allow-Credentials, and browsers refuse `*` on a credentialed
//     request anyway, so another origin can read only what any visitor can already fetch
//   - the route exports only GET (and the OPTIONS preflight), so nothing else is reachable
// Twin: should-flag/account-cors-reflect.example.ts.
// Expected verdict: NO FINDING.
import { NextResponse } from 'next/server';

const PUBLIC_CONFIG = {
  theme: 'dark',
  supportEmail: 'support@example.com',
  features: { signup: true, publicPricing: true },
} as const;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
};

export function GET() {
  return NextResponse.json(PUBLIC_CONFIG, {
    headers: { ...CORS, 'Cache-Control': 'public, max-age=300' },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '600' } });
}
