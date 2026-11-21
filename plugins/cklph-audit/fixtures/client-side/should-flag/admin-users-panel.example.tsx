// FIXTURE: client-side lens, should-flag (RECALL)
// An admin screen that lists users and can change a user's plan, built entirely in the browser.
// Planted:
//   1. the Supabase service-role key is read from NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY, so it is
//      inlined into the client bundle and anyone can bypass RLS with it
//      -> client-side:client-exposure (critical)
//   2. the only admin gate is the client-side role check and router.replace; the list query and the
//      plan update go straight to the database with the service-role client, so any signed-in user
//      (or anyone with the bundle) can read every profile and grant themselves a paid plan
//      -> client-side:client-only-authz (high)
// Expected verdict: FLAG both.
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!,
);

type Profile = { id: string; email: string; role: 'member' | 'admin'; plan: 'free' | 'pro' | 'enterprise' };

export default function AdminUsersPanel({ me }: { me: Profile | null }) {
  const router = useRouter();
  const [users, setUsers] = useState<Profile[]>([]);

  useEffect(() => {
    if (me?.role !== 'admin') {
      router.replace('/');
      return;
    }
    admin.from('profiles').select('id, email, role, plan').order('email').then(({ data }) => setUsers(data ?? []));
  }, [me, router]);

  async function setPlan(userId: string, plan: Profile['plan']) {
    await admin.from('profiles').update({ plan }).eq('id', userId);
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, plan } : u)));
  }

  if (me?.role !== 'admin') return null;

  return (
    <table>
      <tbody>
        {users.map(u => (
          <tr key={u.id}>
            <td>{u.email}</td>
            <td>
              <select value={u.plan} onChange={e => setPlan(u.id, e.target.value as Profile['plan'])}>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
