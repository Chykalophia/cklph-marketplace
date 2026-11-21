// FIXTURE: messaging lens, should-flag (RECALL)
// A Next.js route handler receives a partner CRM's "ticket.created" webhook, opens a support ticket,
// and sends the customer an auto-reply email. Planted:
//   1. the HMAC is computed over JSON.stringify(await req.json()), not the raw body, and the digests
//      are compared with ===, so verification depends on re-serialization and leaks timing; one
//      global secret serves every partner while workspaceId comes from the body, so any partner can
//      file tickets into any workspace -> messaging:webhook-authenticity (high)
//   2. no signed timestamp and no tolerance window: a captured request can be resent at any time
//      -> messaging:webhook-replay (medium)
//   3. the partner retries on any non-2xx and the handler has no dedup on event.id, so a retry opens a
//      second ticket and sends a second email -> messaging:duplicate-delivery (medium)
// Expected verdict: FLAG all three. A messaging:payload-identity hit on the body's workspaceId is
// the same root cause as 1: score it as that true positive, not as a false positive.
import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/server/email';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type TicketEvent = {
  id: string;
  type: 'ticket.created';
  data: { workspaceId: string; customerEmail: string; subject: string; body: string };
};

export async function POST(req: Request) {
  const event = (await req.json()) as TicketEvent;
  const expected = createHmac('sha256', process.env.PARTNER_WEBHOOK_SECRET!)
    .update(JSON.stringify(event))
    .digest('hex');
  if (req.headers.get('x-partner-signature') !== expected) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  const { data: ticket, error } = await admin
    .from('tickets')
    .insert({
      workspace_id: event.data.workspaceId,
      customer_email: event.data.customerEmail,
      subject: event.data.subject,
      body: event.data.body,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sendEmail({
    to: event.data.customerEmail,
    subject: `Re: ${event.data.subject}`,
    text: `We received your request. Ticket #${ticket.id}.`,
  });

  return NextResponse.json({ ok: true });
}
