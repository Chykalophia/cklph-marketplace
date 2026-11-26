// FIXTURE: data-isolation lens, should-not-flag (PRECISION)
// Looks like the attachment-export-delete fixture, but each copy is bound to the caller:
//   - getAttachmentUrl takes an attachment id, reads the row through the user's RLS client, and
//     signs only the stored path for 60 seconds. A guessed id returns no row
//   - exportWorkspace reads notes through the user's RLS client, so the private-note rule applies,
//     and it filters out soft-deleted rows. The service-role client is not used
//   - deleteAccount removes every object under attachments/<userId>/ page by page before deleting
//     rows and the auth user, which is what the dialog promises, and stops before deleting the
//     auth user if any row delete fails, so nothing is left orphaned
// Expected verdict: NO FINDING.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const DELETE_ACCOUNT_COPY = 'This permanently deletes your account, your notes, and every file you uploaded.';

export async function getAttachmentUrl(db: SupabaseClient, body: { attachmentId: string }) {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error('unauthorized');
  const { data: row } = await db.from('attachments').select('storage_path').eq('id', body.attachmentId).maybeSingle();
  if (!row) throw new Error('not found');
  const { data, error } = await admin.storage.from('attachments').createSignedUrl(row.storage_path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function exportWorkspace(db: SupabaseClient, workspaceId: string) {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error('unauthorized');
  const { data: notes, error } = await db.from('notes')
    .select('id, title, body, author_id')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);
  if (error) throw error;
  const rows = (notes ?? []).map(n => [n.id, n.title, JSON.stringify(n.body), n.author_id].join(','));
  return ['id,title,body,author_id', ...rows].join('\n');
}

async function removeUserFiles(userId: string) {
  const bucket = admin.storage.from('attachments');
  const pageSize = 100;
  for (;;) {
    const { data: files, error } = await bucket.list(userId, { limit: pageSize });
    if (error) throw error;
    if (!files || files.length === 0) return;
    const { error: removeError } = await bucket.remove(files.map(f => `${userId}/${f.name}`));
    if (removeError) throw removeError;
    if (files.length < pageSize) return;
  }
}

export async function deleteAccount(db: SupabaseClient) {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error('unauthorized');
  const userId = auth.user.id;
  await removeUserFiles(userId);
  for (const step of [
    admin.from('notes').delete().eq('author_id', userId),
    admin.from('attachments').delete().eq('owner_id', userId),
    admin.from('profiles').delete().eq('id', userId),
  ]) {
    const { error } = await step;
    if (error) throw error;
  }
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) throw authError;
}
