// Unit tests for the visual check in lib/evaluate.mjs. No browser needed.
// Run: npm test   (node --test tests/*.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { evaluate } from '../skills/monitor/scripts/lib/evaluate.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-eval-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Write a white PNG, with optional black rectangles, and return its path.
function png(file, width, height, blackBoxes = []) {
  const img = new PNG({ width, height });
  img.data.fill(255);
  for (const b of blackBoxes) {
    for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) {
      const i = (width * y + x) << 2;
      img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(img));
  return file;
}

// A minimal signal snapshot: only the fields the visual check reads.
const snap = (screenshotPath, maskBoxes = []) => ({ url: 'u', status: 200, screenshotPath, maskBoxes, analytics: {} });
const vr = (findings) => findings.filter((f) => f.id.startsWith('VR1'));

test('a taller page with identical content is a size change, not a 100% regression', () => {
  const a = png(path.join(tmp, 'size', 'base.png'), 100, 100);
  const b = png(path.join(tmp, 'size', 'cur.png'), 100, 150);
  const f = vr(evaluate(snap(a), snap(b), { config: {} }));
  assert.equal(f.filter((x) => x.status === 'regressed').length, 0, JSON.stringify(f));
  const size = f.find((x) => x.status === 'changed');
  assert.ok(size, 'expected a size-change finding');
  assert.deepEqual([size.evidence.baseline, size.evidence.current], ['100x100', '100x150']);
});

test('a size change still reports a real visual regression inside the overlap', () => {
  const a = png(path.join(tmp, 'size2', 'base.png'), 100, 100);
  const b = png(path.join(tmp, 'size2', 'cur.png'), 100, 150, [{ x: 0, y: 0, width: 100, height: 50 }]);
  const reg = vr(evaluate(snap(a), snap(b), { config: {} })).find((x) => x.status === 'regressed');
  assert.ok(reg, 'expected VR1 regressed');
  assert.ok(reg.evidence.diffPct > 40 && reg.evidence.diffPct < 60, `diffPct ${reg.evidence.diffPct} should be ~50% of the overlap, not 100`);
});

test('a baseline screenshot path is resolved against the baseline dir, not the cwd', () => {
  const baseDir = path.join(tmp, 'moved-baseline');
  png(path.join(baseDir, 'screens', 'p.png'), 100, 100);
  const cur = png(path.join(tmp, 'rel', 'cur.png'), 100, 100, [{ x: 0, y: 0, width: 100, height: 100 }]);
  assert.notEqual(process.cwd(), baseDir);
  const f = vr(evaluate(snap('screens/p.png'), snap(cur), { config: {}, baseDir }));
  assert.ok(f.find((x) => x.id === 'VR1' && x.status === 'regressed'), `visual check did not run: ${JSON.stringify(f)}`);
});

test('a missing baseline screenshot is reported, not silently skipped', () => {
  const baseDir = path.join(tmp, 'no-shot');
  const cur = png(path.join(tmp, 'missing', 'cur.png'), 100, 100);
  const f = vr(evaluate(snap('screens/gone.png'), snap(cur), { config: {}, baseDir }));
  assert.equal(f.length, 1, JSON.stringify(f));
  assert.equal(f[0].status, 'changed');
  assert.match(f[0].message, /baseline screenshot/i);
});

test('mask boxes from the baseline are applied too, so a moved dynamic region does not alert', () => {
  // A dynamic block sat at (0,0) in the baseline and at (50,50) now. Each capture masks its own position.
  const a = png(path.join(tmp, 'mask', 'base.png'), 100, 100, [{ x: 0, y: 0, width: 20, height: 20 }]);
  const b = png(path.join(tmp, 'mask', 'cur.png'), 100, 100, [{ x: 50, y: 50, width: 20, height: 20 }]);
  const f = vr(evaluate(
    snap(a, [{ sel: '#dyn', x: 0, y: 0, width: 20, height: 20 }]),
    snap(b, [{ sel: '#dyn', x: 50, y: 50, width: 20, height: 20 }]),
    { config: {} },
  ));
  assert.equal(f.filter((x) => x.status === 'regressed').length, 0, JSON.stringify(f));
});
