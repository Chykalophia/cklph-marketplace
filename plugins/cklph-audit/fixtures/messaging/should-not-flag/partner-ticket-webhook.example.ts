// FIXTURE: messaging lens, should-not-flag (PRECISION)
// Looks like the partner-ticket-webhook should-flag fixture, but every transport control holds:
//   - the HMAC covers `${timestamp}.${rawBody}` read with req.text() before any parse, and the compare
//     is timingSafeEqual after a length check
//   - the signed timestamp must be within five minutes, so a captured request expires
//   - the event id is claimed with an atomic insert on a unique (source, event_id) key BEFORE any side
//     effect; a retry hits the conflict and returns 200 without opening a ticket or sending an email
//   - the secret is per partner source, looked up by a source slug in the URL
// Expected verdict: NO FINDING.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/server/email';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TOLERANCE_SECONDS = 300;

type TicketEvent = {
  id: string;
  type: 'ticket.created';
  data: { customerEmail: string; subject: string; body: string };
};

function verify(secret: string, timestamp: string, rawBody: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const { data: partner } = await admin
    .from('webhook_sources')
    .select('workspace_id, signing_secret')
    .eq('slug', source)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: 'unknown source' }, { status: 404 });

  const rawBody = await req.text();
  const timestamp = req.headers.get('x-partner-timestamp') ?? '';
  const signature = req.headers.get('x-partner-signature') ?? '';
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS || !verify(partner.signing_secret, timestamp, rawBody, signature)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as TicketEvent;
  const { data: claimed } = await admin
    .from('webhook_events')
    .upsert({ source, event_id: event.id }, { onConflict: 'source,event_id', ignoreDuplicates: true })
    .select('event_id');
  if (!claimed?.length) return NextResponse.json({ ok: true, duplicate: true });

  const { data: ticket, error } = await admin
    .from('tickets')
    .insert({
      workspace_id: partner.workspace_id,
      customer_email: event.data.customerEmail,
      subject: event.data.subject,
      body: event.data.body,
    })
    .select('id')
    .single();
  if (error) {
    // Release the claim so the partner's retry can still open the ticket.
    await admin.from('webhook_events').delete().eq('source', source).eq('event_id', event.id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await sendEmail({
    to: event.data.customerEmail,
    subject: `Re: ${event.data.subject}`,
    text: `We received your request. Ticket #${ticket.id}.`,
  });

  return NextResponse.json({ ok: true });
}
