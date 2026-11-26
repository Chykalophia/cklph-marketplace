// FIXTURE: security lens, should-flag (RECALL). Twin of should-not-flag/storage-setup-docs.example.md.
// Planted: the webhook signing secret falls back to a literal committed in source when the env var
// is missing (a preview deploy, a renamed variable). Anyone who reads the repo can sign a "payment succeeded" event, and the route marks
// the order paid -> security:insecure-default, CWE-798 / CWE-1188 (high).
// Expected verdict: FLAG.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const SIGNING_SECRET = process.env.PAYMENTS_WEBHOOK_SECRET ?? 'pay-hook-signing-7f3a91c04be2d58e';

function validSignature(body: string, header: string | null): boolean {
  if (!header) return false;
  const expected = createHmac('sha256', SIGNING_SECRET).update(body).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!validSignature(body, request.headers.get('x-payments-signature'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  const event = JSON.parse(body) as { type: string; orderId: string };
  if (event.type === 'payment.succeeded') {
    await service.from('orders').update({ status: 'paid' }).eq('id', event.orderId);
  }
  return NextResponse.json({ received: true });
}
