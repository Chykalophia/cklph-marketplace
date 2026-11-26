// FIXTURE: security lens, should-flag (RECALL). Twin of should-not-flag/admin-delete-user.example.ts.
// The route looks admin-only, so "an admin can delete users" seems to be the feature. It is not
// safe: the role is read from user_metadata, which every signed-in user can set on their own
// account with supabase.auth.updateUser({ data: { role: 'admin' } }). Any user makes themselves
// "admin" and deletes any account -> security:supabase-user-metadata-authz (critical).
// This is the case the reportability gate must NOT drop: the privilege is one an attacker can get.
// Expected verdict: FLAG.
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
  return data.user.user_metadata?.role === 'admin' ? data.user : null;
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
