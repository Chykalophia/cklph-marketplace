// FIXTURE: data-isolation lens, should-flag (RECALL)
// A workspace notes app with private notes, file attachments in Supabase Storage, a CSV export,
// and account deletion. RLS on notes hides private notes from everyone but their author.
// Planted:
//   1. getAttachmentUrl signs whatever storage path the client sends, using the service-role
//      client, for seven days. Any signed-in user can sign another workspace's file
//      -> data-isolation:signed-ref-overreach (high)
//   2. exportWorkspace selects notes with the service-role client filtered only by workspace_id,
//      so it skips the RLS private-note rule and the soft-delete filter: a member's export holds
//      other members' private and deleted notes -> data-isolation:export-scope (high; the RLS bypass is
//      the same root cause, so it is not filed again as policy-query-drift)
//   3. the delete dialog promises every uploaded file is removed, but deleteAccount removes rows
//      and the auth user only. Files under attachments/<userId>/ stay in the bucket
//      -> data-isolation:deletion-lifecycle (medium)
// Expected verdict: FLAG all three.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const DELETE_ACCOUNT_COPY = 'This permanently deletes your account, your notes, and every file you uploaded.';

export async function getAttachmentUrl(db: SupabaseClient, body: { path: string }) {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error('unauthorized');
  const { data, error } = await admin.storage.from('attachments').createSignedUrl(body.path, 60 * 60 * 24 * 7);
  if (error) throw error;
  return data.signedUrl;
}

export async function exportWorkspace(db: SupabaseClient, workspaceId: string) {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error('unauthorized');
  const { data: member } = await db.from('workspace_members').select('user_id')
    .eq('workspace_id', workspaceId).eq('user_id', auth.user.id).maybeSingle();
  if (!member) throw new Error('forbidden');

  const { data: notes } = await admin.from('notes')
    .select('id, title, body, author_id, is_private, deleted_at')
    .eq('workspace_id', workspaceId);
  const rows = (notes ?? []).map(n => [n.id, n.title, JSON.stringify(n.body), n.author_id].join(','));
  return ['id,title,body,author_id', ...rows].join('\n');
}

export async function deleteAccount(db: SupabaseClient) {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error('unauthorized');
  const userId = auth.user.id;
  await admin.from('notes').delete().eq('author_id', userId);
  await admin.from('attachments').delete().eq('owner_id', userId);
  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
}
