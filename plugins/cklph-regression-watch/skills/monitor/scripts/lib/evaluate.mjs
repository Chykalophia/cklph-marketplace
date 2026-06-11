// evaluate.mjs — compare a current snapshot to the baseline and emit findings.
// A finding = { id, url, severity, status: pass|changed|regressed, message, evidence }.
// "regressed" = something good in the baseline is now broken/absent. "changed" = differs but not clearly worse (FYI).
import fs from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const SEV = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

function fillRect(png, box) {
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(png.width, Math.ceil(box.x + box.width)), y1 = Math.min(png.height, Math.ceil(box.y + box.height));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (png.width * y + x) << 2;
    png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 255;
  }
}

export function visualDiff(baseShot, curShot, maskBoxes = [], outDiffPath = null) {
  if (!baseShot || !curShot || !fs.existsSync(baseShot) || !fs.existsSync(curShot)) return null;
  const a = PNG.sync.read(fs.readFileSync(baseShot));
  const b = PNG.sync.read(fs.readFileSync(curShot));
  if (a.width !== b.width || a.height !== b.height) {
    return { diffPct: 100, sizeMismatch: true, base: [a.width, a.height], cur: [b.width, b.height] };
  }
  for (const m of maskBoxes) { fillRect(a, m); fillRect(b, m); }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  if (outDiffPath) fs.writeFileSync(outDiffPath, PNG.sync.write(diff));
  return { diffPct: (n / (a.width * a.height)) * 100, changedPixels: n, maskedRegions: maskBoxes.length, diffImage: outDiffPath };
}

export function evaluate(base, cur, opts = {}) {
  const f = [];
  const cfg = opts.config || {};
  const tol = (cfg.visual && cfg.visual.tolerancePct != null) ? cfg.visual.tolerancePct : 1.0;
  const add = (id, severity, status, message, evidence) => f.push({ id, url: cur.url, severity, status, message, evidence });

  // AV1 — availability
  if (cur.error) add('AV1', SEV.critical, 'regressed', 'Page failed to load', { baseline: base.status, current: 'error: ' + cur.error });
  else if (base.status === 200 && cur.status !== 200) add('AV1', SEV.critical, 'regressed', `Status ${base.status} → ${cur.status}`, { baseline: base.status, current: cur.status });
  else add('AV1', SEV.critical, 'pass', `Status ${cur.status}`, { current: cur.status });

  // AV2 — redirect integrity
  if (base.finalUrl && cur.finalUrl && base.finalUrl !== cur.finalUrl)
    add('AV2', SEV.high, 'changed', 'Final URL changed (redirect)', { baseline: base.finalUrl, current: cur.finalUrl });

  // SE1 — title
  if (base.title && !cur.title) add('SE1', SEV.high, 'regressed', 'Title tag lost', { baseline: base.title, current: cur.title });
  else if (base.title && cur.title && base.title !== cur.title) add('SE1', SEV.medium, 'changed', 'Title changed', { baseline: base.title, current: cur.title });
  else if (cur.title) add('SE1', SEV.high, 'pass', 'Title present', { current: cur.title });

  // SE2 — canonical
  if (base.canonical && !cur.canonical) add('SE2', SEV.high, 'regressed', 'Canonical tag removed', { baseline: base.canonical, current: null });
  else if (base.canonical && cur.canonical && base.canonical !== cur.canonical) add('SE2', SEV.high, 'changed', 'Canonical target changed', { baseline: base.canonical, current: cur.canonical });

  // SE3 — h1
  if (base.h1Count >= 1 && cur.h1Count === 0) add('SE3', SEV.medium, 'regressed', 'H1 lost', { baseline: base.h1Count, current: cur.h1Count });
  else if (base.h1Count !== cur.h1Count) add('SE3', SEV.medium, 'changed', `H1 count ${base.h1Count} → ${cur.h1Count}`, { baseline: base.h1Count, current: cur.h1Count });

  // SE4 — indexability (the dangerous one)
  const baseNoindex = (base.robots || '').toLowerCase().includes('noindex');
  const curNoindex = (cur.robots || '').toLowerCase().includes('noindex');
  if (!baseNoindex && curNoindex) add('SE4', SEV.critical, 'regressed', 'Page is now noindex (was indexable)', { baseline: base.robots || '(none)', current: cur.robots });

  // SE6 — structured data
  if (base.jsonLdCount > 0 && cur.jsonLdCount === 0) add('SE6', SEV.high, 'regressed', 'JSON-LD structured data disappeared', { baseline: base.jsonLdCount, current: cur.jsonLdCount });

  // TR1 / TR2 — tracking tag firing
  if (base.analytics?.ga4 && !cur.analytics?.ga4) add('TR1', SEV.critical, 'regressed', 'GA4 / gtag stopped firing', { baseline: true, current: false });
  else if (base.analytics?.ga4 && cur.analytics?.ga4) add('TR1', SEV.critical, 'pass', 'GA4 firing', { current: true });
  if (base.analytics?.gtm && !cur.analytics?.gtm) add('TR2', SEV.high, 'regressed', 'GTM container stopped loading', { baseline: true, current: false });

  // VR1 — visual regression (mask dynamic regions first)
  if (cfg.visual?.enabled !== false && base.screenshotPath && cur.screenshotPath) {
    const vd = visualDiff(base.screenshotPath, cur.screenshotPath, cur.maskBoxes || [], opts.diffOut || null);
    if (vd) {
      if (vd.diffPct > tol) add('VR1', SEV.high, 'regressed', `Visual diff ${vd.diffPct.toFixed(2)}% > ${tol}% tolerance`, { diffPct: +vd.diffPct.toFixed(2), tolerance: tol, maskedRegions: vd.maskedRegions, sizeMismatch: !!vd.sizeMismatch, diffImage: vd.diffImage });
      else add('VR1', SEV.high, 'pass', `Visual diff ${vd.diffPct.toFixed(2)}% within ${tol}% (masked ${vd.maskedRegions} region[s])`, { diffPct: +vd.diffPct.toFixed(2), tolerance: tol, maskedRegions: vd.maskedRegions });
    }
  }
  return f;
}
