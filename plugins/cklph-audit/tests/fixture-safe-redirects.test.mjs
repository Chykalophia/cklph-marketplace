// The should-not-flag next-path helpers must keep every redirect on-origin. A helper that resolves
// `next` and returns the pathname as is turns "/.//evil.example" into "//evil.example", which the
// redirect then resolves off-origin, so a correct open-redirect finding would score as a false positive.
// The logout returnTo helper takes absolute URLs and must land each one on one of its allowed origins.
//
//   node plugins/cklph-audit/tests/fixture-safe-redirects.test.mjs     (also runs under `node --test`)
//
// Teeth: the same probes against the pre-fix helper (pathname returned as is) must fail.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://app.example';
const PROBES = ['/.//evil.example', '/a/..//evil.example', '//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)'];
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

// the function's source text from a fixture, with its one TypeScript signature stripped
function extract(rel, name) {
  const src = fs.readFileSync(path.join(PLUGIN, rel), 'utf8');
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`no ${name} in ${rel}`);
  let end = src.indexOf('{', src.indexOf(')', start));
  for (let depth = 0; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}' && --depth === 0) break;
  }
  return src.slice(start, end + 1).replace(/\(raw: string \| null\): string/, '(raw)').replace(/let (\w+): URL;/g, 'let $1;');
}

const offOrigin = fn => PROBES.filter(p => new URL(fn(p), ORIGIN).origin !== ORIGIN);

const web = new Function('SITE_URL', `${extract('fixtures/web-auth/should-not-flag/auth-callback-and-portal-link-safe.example.ts', 'safeNextPath')}; return safeNextPath;`)(ORIGIN);
const cli = new Function('window', `${extract('fixtures/client-side/should-not-flag/oauth-popup-callback-safe.example.tsx', 'safeNext')}; return safeNext;`)({ location: { origin: ORIGIN } });

console.log('safe next-path helpers');
for (const [label, fn] of [['web-auth safeNextPath', web], ['client-side safeNext', cli]]) {
  const bad = offOrigin(fn);
  ok(bad.length === 0, `${label} keeps all ${PROBES.length} probes on-origin${bad.length ? ` (off-origin: ${JSON.stringify(bad)})` : ''}`);
}

// the logout returnTo helper accepts absolute URLs, but only on three fixed origins
const ALLOWED = ['https://app.example.com', 'https://docs.example.com', 'https://status.example.com'];
const RETURN_PROBES = ['https://app.example.com@evil.example/', 'https://app.example.com.evil.example/', '//evil.example', 'javascript:alert(1)',
  'https://evil.example/?https://app.example.com', 'http://app.example.com/', 'https://APP.example.com:443/x', '/relative', 'https://docs.example.com/guide'];
const notAllowed = fn => RETURN_PROBES.filter(p => !ALLOWED.includes(new URL(fn(p)).origin));
const ret = new Function('RETURN_ORIGINS', 'DEFAULT_RETURN', `${extract('fixtures/web-auth/should-not-flag/logout-return-allowlist.example.ts', 'safeReturnTo')}; return safeReturnTo;`)(new Set(ALLOWED), 'https://app.example.com/');
{
  const bad = notAllowed(ret);
  ok(bad.length === 0, `web-auth safeReturnTo lands every one of ${RETURN_PROBES.length} probes on an allowed origin${bad.length ? ` (escaped: ${JSON.stringify(bad)})` : ''}`);
  ok(ret('https://docs.example.com/guide') === 'https://docs.example.com/guide', 'an allowed absolute URL is kept, not replaced by the default');
}

console.log('teeth');
{
  const preFix = raw => { const u = new URL(raw, ORIGIN); return u.origin === ORIGIN ? u.pathname + u.search : '/'; };
  ok(offOrigin(preFix).includes('/.//evil.example'), 'a helper returning the resolved pathname as is sends "/.//evil.example" off-origin');
  const prefixCheck = raw => (ALLOWED.some(o => String(raw).startsWith(o)) ? raw : 'https://app.example.com/');
  ok(notAllowed(prefixCheck).includes('https://app.example.com@evil.example/'), 'a prefix check instead of an origin check lets "https://app.example.com@evil.example" through');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
