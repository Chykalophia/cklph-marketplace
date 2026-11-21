// FIXTURE: data-isolation lens, should-not-flag (PRECISION)
// Looks like the org-dashboard-cache fixture, but every copy carries the tenant and is invalidated:
//   - the cached function is defined once at module scope and takes orgId as an argument, and
//     unstable_cache includes its arguments in the key, so each org gets its own entry
//   - only denials are cached, per (project, user) pair; a positive check always reads the database,
//     so a removed member is never let in from cache, even if a lookup races the removal. A stale
//     denial after someone is added fails closed and clears within 60s, or at once via addMember.
// Expected verdict: NO FINDING.
import { unstable_cache, revalidateTag } from 'next/cache';
import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const redis = Redis.fromEnv();

const loadStats = unstable_cache(
  async (orgId: string) => {
    const { data } = await admin.from('invoices').select('amount_cents, status').eq('org_id', orgId);
    const paid = (data ?? []).filter(i => i.status === 'paid');
    return { invoiceCount: data?.length ?? 0, revenueCents: paid.reduce((s, i) => s + i.amount_cents, 0) };
  },
  ['dashboard-stats'],
  { revalidate: 300, tags: ['dashboard-stats'] },
);

export async function getDashboardStats(orgId: string) {
  return loadStats(orgId);
}

export function invalidateDashboardStats() {
  revalidateTag('dashboard-stats');
}

const memberKey = (projectId: string, userId: string) => `project:${projectId}:member:${userId}`;

async function isMember(projectId: string, userId: string): Promise<boolean> {
  if ((await redis.exists(memberKey(projectId, userId))) === 1) return false;
  const { data } = await admin.from('project_members').select('user_id')
    .eq('project_id', projectId).eq('user_id', userId).maybeSingle();
  if (!data) await redis.set(memberKey(projectId, userId), 'denied', { ex: 60 });
  return Boolean(data);
}

export async function getProject(userId: string, projectId: string) {
  if (!(await isMember(projectId, userId))) throw new Error('forbidden');
  const { data } = await admin.from('projects').select('*').eq('id', projectId).single();
  return data;
}

export async function removeMember(actorId: string, projectId: string, userId: string) {
  const { data: actor } = await admin.from('project_members').select('role')
    .eq('project_id', projectId).eq('user_id', actorId).single();
  if (actor?.role !== 'owner') throw new Error('forbidden');
  await admin.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId);
}

export async function addMember(actorId: string, projectId: string, userId: string) {
  const { data: actor } = await admin.from('project_members').select('role')
    .eq('project_id', projectId).eq('user_id', actorId).single();
  if (actor?.role !== 'owner') throw new Error('forbidden');
  await admin.from('project_members').insert({ project_id: projectId, user_id: userId, role: 'member' });
  await redis.del(memberKey(projectId, userId));
}
