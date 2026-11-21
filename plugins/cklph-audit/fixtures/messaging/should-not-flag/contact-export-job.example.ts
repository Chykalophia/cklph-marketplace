// FIXTURE: messaging lens, should-not-flag (PRECISION)
// Looks like the contact-export-job should-flag fixture, but:
//   - the server action resolves the user from the session and inserts the export row through the
//     user-scoped client, so RLS refuses a workspace the user is not a member of
//   - the job body carries only exportId; the consumer loads the requester and workspace from that
//     row and re-checks membership, so a forged or stale message cannot pick the victim
//   - the consumer is wrapped in verifySignatureAppRouter, which checks Upstash-Signature over the
//     raw body before the handler runs
//   - a conditional queued -> running update claims the job once, so a QStash retry does not deliver
//     twice
//   - delivery goes only to the workspace's registered endpoint, over https, to an address resolved
//     once, checked as public unicast and pinned for the connection, with redirects refused; it is
//     signed with that endpoint's own secret and carries no app credential
// Expected verdict: NO FINDING.
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as pinnedFetch } from 'undici';
import { Client } from '@upstash/qstash';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient as createUserClient } from '@/lib/supabase/server';

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
const admin = createAdminClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type ExportJob = { exportId: string };

export async function requestExport(workspaceId: string) {
  'use server';
  const db = await createUserClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('unauthorized');

  const { data: row, error } = await db
    .from('exports')
    .insert({ workspace_id: workspaceId, requested_by: user.id, status: 'queued' })
    .select('id')
    .single();
  if (error) throw new Error('not allowed');

  await qstash.publishJSON({
    url: `${process.env.APP_URL}/api/jobs/export`,
    body: { exportId: row.id } satisfies ExportJob,
  });
  return { queued: true };
}

async function resolvePublic(url: URL) {
  if (url.protocol !== 'https:') throw new Error('endpoint must be https');
  const addrs = await lookup(url.hostname, { all: true });
  if (!addrs.length || addrs.some(a => ipaddr.parse(a.address).range() !== 'unicast')) {
    throw new Error('endpoint does not resolve to a public address');
  }
  return addrs[0];
}

async function deliver(endpoint: { url: string; secret: string }, payload: unknown) {
  const target = new URL(endpoint.url);
  const pinned = await resolvePublic(target);
  // Connect to the address we checked, so a second DNS answer cannot swap in a private host.
  const pinnedLookup: LookupFunction = (_host, opts, cb) =>
    opts.all ? cb(null, [pinned]) : cb(null, pinned.address, pinned.family);
  const dispatcher = new Agent({ connect: { lookup: pinnedLookup } });

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', endpoint.secret).update(`${timestamp}.${body}`).digest('hex');
  try {
    await pinnedFetch(target, {
      method: 'POST',
      redirect: 'manual',
      dispatcher,
      headers: { 'content-type': 'application/json', 'x-export-timestamp': timestamp, 'x-export-signature': signature },
      body,
    });
  } finally {
    await dispatcher.close();
  }
}

export const POST = verifySignatureAppRouter(async (req: Request) => {
  const { exportId } = (await req.json()) as ExportJob;

  const { data: job } = await admin
    .from('exports')
    .update({ status: 'running' })
    .eq('id', exportId)
    .eq('status', 'queued')
    .select('id, workspace_id, requested_by')
    .maybeSingle();
  if (!job) return NextResponse.json({ ok: true, skipped: true });

  const { data: member } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', job.workspace_id)
    .eq('user_id', job.requested_by)
    .maybeSingle();
  const { data: endpoint } = await admin
    .from('workspace_webhook_endpoints')
    .select('url, secret')
    .eq('workspace_id', job.workspace_id)
    .eq('verified', true)
    .maybeSingle();
  if (!member || !endpoint) {
    await admin.from('exports').update({ status: 'rejected' }).eq('id', job.id);
    return NextResponse.json({ ok: true, rejected: true });
  }

  const { data: contacts } = await admin
    .from('contacts')
    .select('id, name, email, phone, notes')
    .eq('workspace_id', job.workspace_id);

  await admin.from('audit_log').insert({ actor_id: job.requested_by, action: 'contacts.export', count: contacts?.length ?? 0 });
  try {
    await deliver(endpoint, { exportId: job.id, contacts: contacts ?? [] });
  } catch (err) {
    // Return the job to queued so the QStash retry can claim it again.
    await admin.from('exports').update({ status: 'queued' }).eq('id', job.id);
    throw err;
  }
  await admin.from('exports').update({ status: 'done' }).eq('id', job.id);

  return NextResponse.json({ ok: true });
});
