// run_checks.mjs — re-check vs baseline with the confirmation engine, then render the report.
// A finding only counts as a regression if it fails consistently across all retries (flakes are quarantined).
// Usage: node run_checks.mjs --config <config.json> --baseline <baselineDir>
// Exit: 0 = no confirmed regressions, 1 = confirmed regressions (count is in the report), 2 = engine error.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { exitCodeFor, EXIT } from './lib/exit.mjs';

// Modules with npm dependencies load inside the guard, so a broken install exits ERROR (2), not 1.
let chromium, probeUrl, evaluate;
try {
  ({ chromium } = await import('playwright'));
  ({ probeUrl } = await import('./lib/probe.mjs'));
  ({ evaluate } = await import('./lib/evaluate.mjs'));
  process.exit(exitCodeFor(await main()));
} catch (e) {
  process.stderr.write(`run_checks error: ${e && e.stack ? e.stack : e}\n`);
  process.exit(EXIT.ERROR);
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
  const config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
  const baseDir = args.baseline || 'baseline';
  const baseline = JSON.parse(fs.readFileSync(path.join(baseDir, 'baseline.json'), 'utf8'));
  const retries = config.retries || 3;
  const runDir = path.join(baseDir, 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(path.join(runDir, 'screens'), { recursive: true });
  const slug = (u) => u.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  const resolve = (u) => { if (/^https?:|^file:/.test(u)) return u; const j = (config.baseUrl || '') + u; return /^https?:|^file:/.test(j) ? j : pathToFileURL(path.resolve(j)).href; };
  const masks = config.visual?.masks || [];

  const confirmed = [], changes = [], quarantined = [];
  let passCount = 0;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

    for (const u of config.urls) {
      const base = baseline.pages[u];
      if (!base) {
        changes.push({ id: 'BASELINE', url: u, message: 'Not in the baseline, so nothing was checked. Re-run capture.mjs to include it.' });
        continue;
      }
      const perRun = []; // array (len retries) of findings arrays
      for (let i = 0; i < retries; i++) {
        const shot = path.join(runDir, 'screens', slug(u) + `_r${i}.png`);
        const cur = await probeUrl(page, resolve(u), { masks, screenshotPath: shot });
        const diffOut = path.join(runDir, 'screens', slug(u) + `_r${i}_diff.png`);
        perRun.push(evaluate(base, cur, { config, diffOut, baseDir }));
      }
      // aggregate by check id (confirmation engine)
      const ids = new Set(perRun.flat().map((x) => x.id));
      for (const id of ids) {
        const fs_ = perRun.map((run) => run.find((x) => x.id === id) || { id, url: u, status: 'pass' });
        const statuses = fs_.map((x) => x.status);
        const regressed = statuses.filter((s) => s === 'regressed').length;
        const changed = statuses.filter((s) => s === 'changed').length;
        const sample = fs_.find((x) => x.status === 'regressed') || fs_.find((x) => x.status === 'changed') || fs_[0];
        if (regressed === retries) confirmed.push({ ...sample, confirmations: `${regressed}/${retries}` });
        else if (regressed > 0) quarantined.push({ ...sample, note: `flapped ${regressed}/${retries} — quarantined, not alerted` });
        else if (changed === retries) changes.push(sample);
        else if (changed > 0) changes.push({ ...sample, note: `intermittent ${changed}/${retries}` });
        else passCount++;
      }
    }
  } finally {
    await browser.close();
  }

  confirmed.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  function sevRank(s) { return ({ Critical: 0, High: 1, Medium: 2, Low: 3 }[s] ?? 9); }

  // ---- report (output contract) ----
  const broken = confirmed.length > 0;
  const L = [];
  L.push(`REGRESSION WATCH — ${baseline.site} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} — ${broken ? confirmed.length + ' REGRESSION(S)' : 'PASS'}`);
  L.push(`Baseline: ${baseline.capturedAt}   URLs: ${config.urls.length}   Confirmed: ${confirmed.length}   Quarantined(flakes): ${quarantined.length}   Passing checks: ${passCount}`);
  L.push('');
  if (broken) {
    L.push('## Regressions (confirmed, severity-ordered)');
    for (const r of confirmed) {
      L.push(`- [${r.id} · ${r.severity}] ${r.url} — ${r.message}  (re-tested ${r.confirmations})`);
      L.push(`    evidence: ${JSON.stringify(r.evidence)}`);
    }
    L.push('');
  }
  if (changes.length) {
    L.push('## Changes (within tolerance / FYI)');
    for (const c of changes) L.push(`- [${c.id}] ${c.url} — ${c.message}${c.note ? ' (' + c.note + ')' : ''}`);
    L.push('');
  }
  if (quarantined.length) {
    L.push('## Quarantined (flaky — needs tolerance tweak, NOT alerted)');
    for (const q of quarantined) L.push(`- [${q.id}] ${q.url} — ${q.message} (${q.note})`);
    L.push('');
  }
  if (!broken) L.push('All confirmed checks passing. Silent-unless-broken: no alert fired.');

  const report = L.join('\n');
  fs.writeFileSync(path.join(runDir, 'report.md'), report);
  console.log(report);
  console.log(`\n(report: ${path.join(runDir, 'report.md')})`);
  return confirmed.length;
}
