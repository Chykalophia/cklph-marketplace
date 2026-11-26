// FIXTURE: client-side lens, should-not-flag (PRECISION)
// Looks like the oauth-popup-callback fixture, but every browser control is in place:
//   - the hash error is rendered as React text, so markup in it is escaped, not parsed
//   - the message listener requires an exact origin match AND that the sender is the popup this
//     page opened, so no other window or look-alike domain can post a token
//   - ?next= is resolved against the current origin and rejected unless it stays same-origin,
//     with leading slashes collapsed after resolving, which blocks //evil.example, /.//evil.example,
//     /\evil.example, javascript: and data: destinations
// Expected verdict: NO FINDING.
'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const AUTH_ORIGIN = 'https://auth.acme.example';
const AUTH_URL = `${AUTH_ORIGIN}/authorize?client_id=web&response_mode=web_message`;

function safeNext(raw: string | null): string {
  if (!raw) return '/dashboard';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '/dashboard';
    // "/.//evil.example" resolves to the path "//evil.example", which a router would treat as
    // protocol-relative, so collapse leading slashes after resolving.
    return `${url.pathname.replace(/^\/+/, '/')}${url.search}${url.hash}`;
  } catch {
    return '/dashboard';
  }
}

export default function SignInPage() {
  const params = useSearchParams();
  const router = useRouter();
  const popupRef = useRef<Window | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    setError(hash.get('error'));
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== AUTH_ORIGIN) return;
      if (!popupRef.current || event.source !== popupRef.current) return;
      const { accessToken } = event.data as { accessToken?: string };
      if (typeof accessToken !== 'string') return;
      sessionStorage.setItem('access_token', accessToken);
      router.replace(safeNext(params.get('next')));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [params, router]);

  return (
    <main>
      {error && (
        <div role="alert">
          <strong>Sign-in failed:</strong> {error}
        </div>
      )}
      <button onClick={() => { popupRef.current = window.open(AUTH_URL, 'acme-auth', 'width=480,height=640'); }}>
        Continue with Acme
      </button>
    </main>
  );
}
