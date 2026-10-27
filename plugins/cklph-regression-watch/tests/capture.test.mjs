// capture.mjs must not write a baseline that is missing a screenshot: a baseline with no
// screenshot for a URL skips the visual check (VR1) for that URL on every re-check, silently.
// Needs `npm install` + `npx playwright install chromium`, like the self-test.
// Run: npm test   (node --test tests/*.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const capture = path.join(root, 'skills/monitor/scripts/capture.mjs');

test('a baseline screenshot that cannot be written fails the capture, naming the URL', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-capture-'));
  try {
    const site = path.join(tmp, 'site');
    fs.mkdirSync(site);
    fs.copyFileSync(path.join(root, 'fixtures/good.html'), path.join(site, 'page.html'));
    const config = path.join(tmp, 'config.json');
    fs.writeFileSync(config, JSON.stringify({ site: 't', baseUrl: site + path.sep, urls: ['page.html'], visual: { enabled: true } }));
    const out = path.join(tmp, 'baseline');
    // A directory where the PNG should go: the page loads fine, but the screenshot write fails.
    fs.mkdirSync(path.join(out, 'screens', 'page_html.png'), { recursive: true });

    const r = spawnSync(process.execPath, [capture, '--config', config, '--out', out], { encoding: 'utf8' });
    assert.equal(r.status, 2, `expected exit 2 (EXIT.ERROR), got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /page\.html/, `stderr should name the URL: ${r.stderr}`);
    assert.match(r.stderr, /screenshot/i, r.stderr);
    assert.equal(fs.existsSync(path.join(out, 'baseline.json')), false, 'an incomplete baseline was written');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
