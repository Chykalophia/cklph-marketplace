// FIXTURE: availability lens, should-not-flag (PRECISION)
// Looks like the note-search-enrich fixture, but each lead is bounded:
//   - `q` is capped at 100 characters and escaped before new RegExp, so the pattern is a literal
//     match with linear cost; the user cannot supply quantifiers
//   - `limit` is clamped to 1..100 on the server, so one request reads at most 100 rows
//   - enrichment makes at most 4 attempts, waits with exponential backoff plus jitter, honours
//     Retry-After, and times each attempt out; a timeout or network error, while connecting or
//     reading the body, is caught and counts as an attempt. After the last attempt it gives up and
//     stores null, so QStash does not retry the message again
// Expected verdict: NO FINDING.
import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_PAGE = 100;
const MAX_ATTEMPTS = 4;

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').slice(0, 100);
  const requested = Number.parseInt(searchParams.get('limit') ?? '50', 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_PAGE) : 50;

  const { data: notes } = await supabase
    .from('notes')
    .select('id, title, body, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  const pattern = new RegExp(escapeRegExp(q), 'i');
  const hits = (notes ?? []).filter(n => pattern.test(n.title) || pattern.test(n.body));
  return NextResponse.json({ results: hits });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function enrichCompany(domain: string) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://api.enrich.example/v2/companies?domain=${encodeURIComponent(domain)}`, {
        headers: { Authorization: `Bearer ${process.env.ENRICH_API_KEY}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return await res.json();
    } catch {
      // A timeout or network error, while connecting or reading the body, counts as one attempt;
      // throwing would hand the retry back to QStash.
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(Math.min(2 ** attempt * 500, 8_000) + Math.random() * 250);
      continue;
    }
    if (res.status !== 429 && res.status < 500) return null;
    if (attempt === MAX_ATTEMPTS) break;

    const retryAfter = Number(res.headers.get('retry-after'));
    const backoff = Math.min(2 ** attempt * 500, 8_000) + Math.random() * 250;
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 15_000) : backoff);
  }
  return null;
}

export const POST = verifySignatureAppRouter(async (req: Request) => {
  const { companyId, domain } = (await req.json()) as { companyId: string; domain: string };
  const profile = await enrichCompany(domain);
  await createAdminClient().from('companies').update({ profile, enriched_at: new Date().toISOString() }).eq('id', companyId);
  return NextResponse.json({ ok: true });
});
