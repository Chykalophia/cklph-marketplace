// FIXTURE: messaging lens, should-flag (RECALL)
// A server action queues a contact export through QStash; a route handler consumes the job and posts
// the rows to a callback URL. Planted:
//   1. requestExport is a 'use server' action with no session lookup: any caller can POST it with any
//      workspaceId -> messaging:rpc-missing-auth (high)
//   2. the consumer route never verifies the Upstash-Signature header (no Receiver, no
//      verifySignatureAppRouter), so anyone who finds /api/jobs/export can run it
//      -> messaging:queue-consumer-auth (high)
//   3. the consumer trusts userId and workspaceId from the job body and reads with the service-role
//      client, so the sender picks whose contacts are exported -> messaging:payload-identity (high)
//   4. callbackUrl is caller-supplied and fetched with no public-address check and default redirect
//      following, and the request carries the app's INTERNAL_API_TOKEN
//      -> messaging:outbound-callback (high)
// Expected verdict: FLAG all four.
import { Client } from '@upstash/qstash';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type ExportJob = { userId: string; workspaceId: string; callbackUrl: string };

export async function requestExport(userId: string, workspaceId: string, callbackUrl: string) {
  'use server';
  await qstash.publishJSON({
    url: `${process.env.APP_URL}/api/jobs/export`,
    body: { userId, workspaceId, callbackUrl } satisfies ExportJob,
  });
  return { queued: true };
}

export async function POST(req: Request) {
  const job = (await req.json()) as ExportJob;

  const { data: contacts, error } = await admin
    .from('contacts')
    .select('id, name, email, phone, notes')
    .eq('workspace_id', job.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from('audit_log').insert({ actor_id: job.userId, action: 'contacts.export', count: contacts.length });

  await fetch(job.callbackUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}`,
    },
    body: JSON.stringify({ workspaceId: job.workspaceId, contacts }),
  });

  return NextResponse.json({ ok: true });
}
