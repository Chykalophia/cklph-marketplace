// FIXTURE: security lens, should-not-flag (PRECISION). Safe lookalike: outbound fetch behind a host
// allowlist. A route fetches a URL built from user input, which looks like SSRF, but:
//   - the user link is parsed with new URL and accepted only when it is https, has no credentials
//     or explicit port, and its exact hostname is a key of a fixed Map (no prefix or suffix match)
//   - the request goes to a fixed oEmbed endpoint chosen by that Map; the user link is only an
//     encoded query parameter, so it cannot change the scheme, host or port that is fetched
//   - redirects are refused (redirect: 'error') and the call times out after 4 s
//   - only a trimmed title and an https thumbnail URL are returned, never the provider's HTML
// Expected verdict: NO FINDING.
import { NextResponse, type NextRequest } from 'next/server';

const OEMBED_ENDPOINTS = new Map([
  ['www.youtube.com', 'https://www.youtube.com/oembed'],
  ['youtube.com', 'https://www.youtube.com/oembed'],
  ['vimeo.com', 'https://vimeo.com/api/oembed.json'],
]);

function endpointFor(raw: string): { endpoint: string; link: URL } | null {
  let link: URL;
  try {
    link = new URL(raw);
  } catch {
    return null;
  }
  if (link.protocol !== 'https:' || link.username || link.password || link.port) return null;
  const endpoint = OEMBED_ENDPOINTS.get(link.hostname);
  return endpoint ? { endpoint, link } : null;
}

export async function GET(request: NextRequest) {
  const target = endpointFor(request.nextUrl.searchParams.get('url') ?? '');
  if (!target) return NextResponse.json({ error: 'unsupported link' }, { status: 400 });

  const upstream = await fetch(`${target.endpoint}?format=json&url=${encodeURIComponent(target.link.href)}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(4000),
  });
  if (!upstream.ok) return NextResponse.json({ error: 'preview unavailable' }, { status: 502 });

  const data = (await upstream.json()) as { title?: unknown; thumbnail_url?: unknown };
  const thumbnail = typeof data.thumbnail_url === 'string' && data.thumbnail_url.startsWith('https://') ? data.thumbnail_url : null;
  return NextResponse.json({ title: String(data.title ?? '').slice(0, 200), thumbnail });
}
