// The should-not-flag next-path helpers must keep every redirect on-origin. A helper that resolves
// `next` and returns the pathname as is turns "/.//evil.example" into "//evil.example", which the
// redirect then resolves off-origin, so a correct open-redirect finding would score as a false positive.
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
  return src.slice(start, end + 1).replace(/\(raw: string \| null\): string/, '(raw)');
}

const offOrigin = fn => PROBES.filter(p => new URL(fn(p), ORIGIN).origin !== ORIGIN);

const web = new Function('SITE_URL', `${extract('fixtures/web-auth/should-not-flag/auth-callback-and-portal-link-safe.example.ts', 'safeNextPath')}; return safeNextPath;`)(ORIGIN);
const cli = new Function('window', `${extract('fixtures/client-side/should-not-flag/oauth-popup-callback-safe.example.tsx', 'safeNext')}; return safeNext;`)({ location: { origin: ORIGIN } });

console.log('safe next-path helpers');
for (const [label, fn] of [['web-auth safeNextPath', web], ['client-side safeNext', cli]]) {
  const bad = offOrigin(fn);
  ok(bad.length === 0, `${label} keeps all ${PROBES.length} probes on-origin${bad.length ? ` (off-origin: ${JSON.stringify(bad)})` : ''}`);
}

console.log('teeth');
{
  const preFix = raw => { const u = new URL(raw, ORIGIN); return u.origin === ORIGIN ? u.pathname + u.search : '/'; };
  ok(offOrigin(preFix).includes('/.//evil.example'), 'a helper returning the resolved pathname as is sends "/.//evil.example" off-origin');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
