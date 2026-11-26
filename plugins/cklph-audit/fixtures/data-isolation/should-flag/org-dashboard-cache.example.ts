// FIXTURE: data-isolation lens, should-flag (RECALL)
// An org dashboard caches stats with Next.js and caches project membership in Upstash Redis.
// Planted:
//   1. unstable_cache wraps a closure that captures orgId from the outer scope. The cache key is
//      the function source plus its (empty) arguments plus ['dashboard-stats'], so every org shares
//      one entry and the first org to load the page serves its revenue to all others
//      -> data-isolation:key-collision (high)
//   2. project access is decided from a Redis set of member ids cached for a day. removeMember
//      deletes the database row but never touches the Redis key, so a removed member keeps reading
//      the project until the TTL lapses -> data-isolation:stale-authorization (high)
// Expected verdict: FLAG both.
import { unstable_cache } from 'next/cache';
import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const redis = Redis.fromEnv();

export async function getDashboardStats(orgId: string) {
  const load = unstable_cache(
    async () => {
      const { data } = await admin.from('invoices').select('amount_cents, status').eq('org_id', orgId);
      const paid = (data ?? []).filter(i => i.status === 'paid');
      return { invoiceCount: data?.length ?? 0, revenueCents: paid.reduce((s, i) => s + i.amount_cents, 0) };
    },
    ['dashboard-stats'],
    { revalidate: 300 },
  );
  return load();
}

async function projectMembers(projectId: string): Promise<string[]> {
  const key = `project:${projectId}:members`;
  const cached = await redis.get<string[]>(key);
  if (cached) return cached;
  const { data } = await admin.from('project_members').select('user_id').eq('project_id', projectId);
  const ids = (data ?? []).map(r => r.user_id as string);
  await redis.set(key, ids, { ex: 60 * 60 * 24 });
  return ids;
}

export async function getProject(userId: string, projectId: string) {
  const members = await projectMembers(projectId);
  if (!members.includes(userId)) throw new Error('forbidden');
  const { data } = await admin.from('projects').select('*').eq('id', projectId).single();
  return data;
}

export async function removeMember(actorId: string, projectId: string, userId: string) {
  const { data: actor } = await admin.from('project_members').select('role')
    .eq('project_id', projectId).eq('user_id', actorId).single();
  if (actor?.role !== 'owner') throw new Error('forbidden');
  await admin.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId);
}
