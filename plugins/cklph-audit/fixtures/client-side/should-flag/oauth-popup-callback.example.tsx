// FIXTURE: client-side lens, should-flag (RECALL)
// A sign-in page opens an OAuth popup and finishes the flow in the browser. Planted:
//   1. the page reads #error=... from the URL hash and writes it into innerHTML, so a crafted link
//      runs script in the victim's session -> client-side:dom-xss (high)
//   2. the message listener only checks event.origin.includes('auth.acme.example'), so a page on
//      https://auth.acme.example.evil.example can post a forged token that the app stores and uses
//      -> client-side:postmessage-trust (high)
//   3. ?next= goes straight into window.location.href, so next=javascript:... executes and
//      next=https://evil.example sends the freshly signed-in user off-site
//      -> client-side:open-redirect (high, executable scheme)
// Expected verdict: FLAG all three.
'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

const AUTH_URL = 'https://auth.acme.example/authorize?client_id=web&response_mode=web_message';

export default function SignInPage() {
  const params = useSearchParams();
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const error = hash.get('error');
    if (error && errorRef.current) {
      errorRef.current.innerHTML = `<strong>Sign-in failed:</strong> ${decodeURIComponent(error)}`;
    }
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.includes('auth.acme.example')) return;
      const { accessToken } = event.data as { accessToken?: string };
      if (!accessToken) return;
      localStorage.setItem('access_token', accessToken);
      const next = params.get('next') ?? '/dashboard';
      window.location.href = next;
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [params]);

  return (
    <main>
      <div ref={errorRef} role="alert" />
      <button onClick={() => window.open(AUTH_URL, 'acme-auth', 'width=480,height=640')}>
        Continue with Acme
      </button>
    </main>
  );
}
