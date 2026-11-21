// FIXTURE: client-side lens, should-not-flag (PRECISION)
// Looks like the admin-users-panel fixture, but the browser holds no authority:
//   - the only NEXT_PUBLIC_ value is the site URL; no key or secret ships to the client
//   - the client role check only hides UI; reads and writes go through /api/admin/users, whose
//     route handler re-checks the session with requireAdmin() server-side before it touches the
//     database, so a non-admin calling the API directly gets 403
//   - the API returns a narrow DTO (id, email, plan), not whole profile rows
// Expected verdict: NO FINDING.
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/api/admin/users`;

type Viewer = { id: string; role: 'member' | 'admin' };
type UserRow = { id: string; email: string; plan: 'free' | 'pro' | 'enterprise' };

export default function AdminUsersPanel({ me }: { me: Viewer | null }) {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);

  useEffect(() => {
    if (me?.role !== 'admin') {
      router.replace('/');
      return;
    }
    fetch(API, { credentials: 'same-origin' })
      .then(res => (res.ok ? res.json() : []))
      .then((rows: UserRow[]) => setUsers(rows));
  }, [me, router]);

  async function setPlan(userId: string, plan: UserRow['plan']) {
    const res = await fetch(`${API}/${encodeURIComponent(userId)}/plan`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    if (res.ok) setUsers(prev => prev.map(u => (u.id === userId ? { ...u, plan } : u)));
  }

  if (me?.role !== 'admin') return null;

  return (
    <table>
      <tbody>
        {users.map(u => (
          <tr key={u.id}>
            <td>{u.email}</td>
            <td>
              <select value={u.plan} onChange={e => setPlan(u.id, e.target.value as UserRow['plan'])}>
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
