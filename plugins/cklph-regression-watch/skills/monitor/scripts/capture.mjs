// capture.mjs — snapshot a URL set into a versioned baseline (signals + full-page screenshots).
// Usage: node capture.mjs --config <config.json> --out <baselineDir>
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';
import { probeUrl } from './lib/probe.mjs';
import { EXIT } from './lib/exit.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
const outDir = args.out || 'baseline';
const slug = (u) => u.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
const resolve = (u) => { if (/^https?:|^file:/.test(u)) return u; const j = (config.baseUrl || '') + u; return /^https?:|^file:/.test(j) ? j : pathToFileURL(path.resolve(j)).href; };

fs.mkdirSync(path.join(outDir, 'screens'), { recursive: true });
const masks = config.visual?.masks || [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

const pages = {};
// A baseline with no screenshot for a URL would skip VR1 for it on every re-check, silently.
// When the visual check is on, every URL must have one, or the capture fails.
const visualOn = config.visual?.enabled !== false;
const missing = [];
for (const u of config.urls) {
  const full = resolve(u);
  const shot = path.join(outDir, 'screens', slug(u) + '.png');
  const sig = await probeUrl(page, full, { masks, screenshotPath: shot });
  // Store the screenshot path relative to the baseline dir so the baseline works from any cwd and can be moved.
  if (sig.screenshotPath) sig.screenshotPath = path.relative(outDir, shot);
  pages[u] = sig;
  if (visualOn && !(sig.screenshotPath && fs.existsSync(shot))) {
    missing.push(`${u}: ${sig.error ? `page failed to load (${sig.error})` : `screenshot could not be written to ${shot}`}`);
  }
  console.log(`baseline ${u}: status=${sig.status} title=${sig.title ? 'y' : 'n'} canonical=${sig.canonical ? 'y' : 'n'} jsonld=${sig.jsonLdCount} ga4=${sig.analytics.ga4} gtm=${sig.analytics.gtm}`);
}
await browser.close();
if (missing.length) {
  process.stderr.write(`capture failed: no baseline screenshot for ${missing.length} URL(s); baseline.json was not written.\n`);
  for (const m of missing) process.stderr.write(`  ${m}\n`);
  process.exit(EXIT.ERROR);
}
const baseline = { site: config.site, capturedAt: new Date().toISOString(), baseUrl: config.baseUrl, pages };
fs.writeFileSync(path.join(outDir, 'baseline.json'), JSON.stringify(baseline, null, 2));
console.log(`\nBaseline written: ${path.join(outDir, 'baseline.json')} (${Object.keys(pages).length} pages)`);
