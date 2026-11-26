// FIXTURE: security lens, should-not-flag (PRECISION). Safe lookalike: an action gated to admins.
// A route deletes ANY user by id with the service-role client, which looks like broken access
// control, but deleting users is the designed power of a staff admin, and only one reaches it:
//   - identity comes from supabase.auth.getUser(), which validates the session with the auth server
//   - the role is read from app_metadata, which only the service role can write (users can edit
//     user_metadata, never app_metadata)
//   - a non-admin, or no session, gets 403 before any write; the id must be a UUID; an admin cannot
//     delete their own account; every delete is logged with the actor
//   - DELETE is not a simple CORS method, so another site cannot send it with the victim's cookies
// "An admin can delete users" is the feature, not a vulnerability.
// Twin: should-flag/admin-delete-user-metadata-role.example.ts.
// Expected verdict: NO FINDING.
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireStaffAdmin() {
  const store = await cookies();
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: () => {} },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.app_metadata?.role === 'admin' ? data.user : null;
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaffAdmin();
  if (!actor) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  if (id === actor.id) return NextResponse.json({ error: 'cannot delete yourself' }, { status: 400 });

  const { error } = await service.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: 'delete failed' }, { status: 500 });

  await service.from('admin_audit_log').insert({ actor_id: actor.id, action: 'user.delete', target_id: id });
  return new NextResponse(null, { status: 204 });
}
