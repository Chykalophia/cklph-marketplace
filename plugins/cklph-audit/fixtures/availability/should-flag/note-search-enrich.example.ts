// FIXTURE: availability lens, should-flag (RECALL)
// A signed-in note search route and a QStash consumer that enriches companies. Planted:
//   1. the `q` query param is compiled with new RegExp and run over every loaded note, so a pattern
//      like (a+)+$ backtracks catastrophically; the function instance serves other users' requests
//      concurrently and their requests stall -> availability:redos (medium)
//   2. `limit` comes straight from the query string into .limit() with no server maximum, so one
//      request can pull every note in the tenant from the shared database -> availability:pagination-cap (medium)
//   3. the enrichment call retries forever on 429 and 5xx with no backoff, no jitter, no attempt
//      ceiling, and ignores Retry-After; each attempt is a paid call and holds the worker
//      -> availability:retry-storm (medium)
// Expected verdict: FLAG all three.
import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const limit = Number(searchParams.get('limit') ?? 50);

  const { data: notes } = await supabase
    .from('notes')
    .select('id, title, body, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  const pattern = new RegExp(q, 'i');
  const hits = (notes ?? []).filter(n => pattern.test(n.title) || pattern.test(n.body));
  return NextResponse.json({ results: hits });
}

async function enrichCompany(domain: string) {
  for (;;) {
    const res = await fetch(`https://api.enrich.example/v2/companies?domain=${encodeURIComponent(domain)}`, {
      headers: { Authorization: `Bearer ${process.env.ENRICH_API_KEY}` },
    });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
  }
}

export const POST = verifySignatureAppRouter(async (req: Request) => {
  const { companyId, domain } = (await req.json()) as { companyId: string; domain: string };
  const profile = await enrichCompany(domain);
  await createAdminClient().from('companies').update({ profile }).eq('id', companyId);
  return NextResponse.json({ ok: true });
});
