// Tests for scripts/figma-audit.mjs and its rules.
//
//   node --test plugins/cklph-figma/tests/*.test.mjs
//
// The scan is the exact code figma-audit.mjs emits for use_figma, run against a mock
// Figma file. Assertions are on outcomes: which findings come back, where they are
// grouped, what the report links to, and what a recheck calls each change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildScanScript, buildExistsScript, linkedIds, renderReport, renderRecheck, planShots, cropPlan, annotate, pngSize, buildRows, joinParts, uploadWithTickets, existsParts, existsMap, magickText, groupLink,
} from '../scripts/figma-audit.mjs';
import { compareScans, chunkBounds, utf8Length, createAudit } from '../scripts/figma-audit-rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'scripts', 'figma-audit.mjs');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// ---- mock Figma file ------------------------------------------------------------

const BRAND = 'Brand Sans';
const solid = (r, g, b, extra) => ({ type: 'SOLID', visible: true, opacity: 1, color: { r, g, b }, ...(extra || {}) });
const GRAY = solid(0x54 / 255, 0x54 / 255, 0x54 / 255);
const BOUND = solid(1, 1, 1, { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'VariableID:1' } } });

function makeFile() {
  const nodes = new Map();
  let seq = 100;
  const nextId = () => '1:' + seq++;

  function node(type, name, props, children) {
    const n = {
      id: (props && props.id) || nextId(), type, name, visible: true, x: 0, y: 0, width: 100, height: 40,
      fills: [], strokes: [], fillStyleId: '', strokeStyleId: '', layoutMode: type === 'FRAME' ? 'VERTICAL' : undefined,
      detachedInfo: null, inferredAutoLayout: null, boundVariables: {}, parent: null,
      ...(props || {}),
    };
    delete n.abs;
    const abs = (props && props.abs) || { x: n.x, y: n.y };
    n.absoluteBoundingBox = { x: abs.x, y: abs.y, width: n.width, height: n.height };
    if (children) {
      n.children = children;
      for (const c of children) c.parent = n;
    }
    nodes.set(n.id, n);
    return n;
  }

  function text(name, chars, segs, props) {
    const t = node('TEXT', name, { characters: chars, hasMissingFont: false, ...(props || {}) });
    t.getStyledTextSegments = () => segs.map((s) => ({
      fontName: { family: s.family || BRAND, style: 'Regular' }, fontSize: s.size || 16,
      textStyleId: s.style === undefined ? 'S:body' : s.style, fills: s.fills || [BOUND], fillStyleId: s.fillStyleId || '',
    }));
    return t;
  }

  // Components live on another page, as they do in real files.
  const fabText = text('Notice text', 'Read the notice.', [{ size: 9 }]);
  const fab = node('COMPONENT', 'notice-chip', { id: '9:1' }, [fabText]);
  const header = node('COMPONENT', 'Size=Mobile', { id: '9:2' }, [text('nav', 'Get Help', [{ family: 'Figtree', style: '' }])]);
  const headerSet = node('COMPONENT_SET', 'global-header', { id: '9:20' }, [header]);
  const wire = node('COMPONENT', 'wireframes button', { id: '9:3' }, []);
  const libPage = node('PAGE', 'Design System', { id: '0:9' }, [fab, headerSet, wire]);

  const instance = (main, props, kids) => {
    const i = node('INSTANCE', main.name, props, kids || main.children.map((c) => {
      const copy = text(c.name, c.characters, c.getStyledTextSegments().map((s) => ({ family: s.fontName.family, size: s.fontSize, style: s.textStyleId })));
      copy.id = 'I' + nextId() + ';' + c.id;
      nodes.set(copy.id, copy);
      return copy;
    }));
    i.getMainComponentAsync = async () => main;
    return i;
  };

  const inner = () => node('FRAME', 'notice-links', {}, [text('l1', 'Exit', [{}]), text('l2', 'Help', [{}])]);
  const screen = (name, id, abs, kids) => node('FRAME', name, { id, width: 390, height: 2000, abs }, kids);

  const home = screen('Home — Mobile', '2:1', { x: 0, y: 0 }, [
    instance(header, { id: '2:10' }),
    instance(header, { id: '2:11' }),
    node('FRAME', 'hero', { id: '2:20', abs: { x: 0, y: 100 }, width: 390, height: 400 }, [
      text('label', 'PLACEHOLDER', [{ family: 'Geist Mono', size: 11, style: '' }], { id: '2:21', abs: { x: 20, y: 150 }, width: 73, height: 14 }),
      node('FRAME', 'Frame 1171276693', { id: '2:22', width: 100.5, layoutMode: 'NONE', inferredAutoLayout: { layoutMode: 'HORIZONTAL' } }, [
        node('RECTANGLE', 'a', { fills: [GRAY] }), node('RECTANGLE', 'b', { fills: [BOUND] }),
      ]),
      node('RECTANGLE', 'styled', { fills: [GRAY], fillStyleId: 'S:gray' }),
      node('FRAME', 'old cta', { id: '2:23', visible: false }, [text('t', 'Lorem ipsum', [{}])]),
      text('body', 'Final copy', [{ fills: [GRAY] }], { id: '2:24' }),
      text('body2', 'More copy', [{}], { id: '2:25', width: 120.5 }),
      node('FRAME', 'cards', { id: '2:26', width: 1216 }, [
        node('FRAME', 'card-a', { id: '2:27', width: 405.33, x: 0, layoutSizingHorizontal: 'FILL' }, [text('a', 'A', [{}]), text('b', 'B', [{}])]),
        node('FRAME', 'card-b', { id: '2:28', width: 405.33, x: 405.33, layoutSizingHorizontal: 'FILL' }, [text('a', 'A', [{}]), text('b', 'B', [{}])]),
      ]),
      node('FRAME', 'icon-box', { id: '2:29', width: 24, height: 24, layoutMode: 'NONE' }, [node('GROUP', 'Group', { id: '2:291', width: 20.5, height: 20 }, [node('VECTOR', 'Vector')]), node('VECTOR', 'Vector')]),
    ]),
    node('FRAME', 'card', { id: '2:30', detachedInfo: { type: 'local', componentId: '9:1' } }, [text('x', 'Card', [{}]), text('y', 'Card', [{}])]),
    node('FRAME', 'notice-bar', { id: '2:40' }, [instance(fab, { id: '2:41', abs: { x: 200, y: 600 }, width: 135, height: 44 }), text('s', 'Notice', [{}]), inner()]),
    node('FRAME', 'overlay-stack', { id: '2:70', layoutMode: 'NONE', inferredAutoLayout: null }, [node('RECTANGLE', 'photo', { fills: [BOUND] }), node('RECTANGLE', 'tint', { fills: [BOUND] })]),
    node('FRAME', 'free-art', { id: '2:71', layoutMode: 'NONE', inferredAutoLayout: { layoutMode: 'NONE' } }, [node('VECTOR', 'Vector', { fills: [BOUND] }), node('VECTOR', 'Vector', { fills: [BOUND] })]),
    instance(wire, { id: '2:50' }, []),
    node('GROUP', 'Group 12', { id: '2:60' }, [node('RECTANGLE', 'r', { fills: [BOUND] })]),
  ]);
  const about = screen('About — Mobile', '3:1', { x: 500, y: 0 }, [
    node('FRAME', 'notice-bar', { id: '3:40' }, [instance(fab, { id: '3:41', abs: { x: 700, y: 600 }, width: 135, height: 44 }), text('s', 'Notice', [{}]), inner()]),
  ]);
  const news = screen('News — Mobile', '4:1', { x: 1000, y: 0 }, [
    node('FRAME', 'notice-bar', { id: '4:40' }, [instance(fab, { id: '4:41', abs: { x: 1200, y: 600 }, width: 135, height: 44 }), text('s', 'Notice', [{}]), inner()]),
    node('FRAME', 'hero', { id: '4:20' }, [text('a', 'News', [{}]), text('b', 'News', [{}])]),
  ]);
  const section = node('SECTION', 'Hand-off', { id: '1:1' }, [home, about, news]);
  const page = node('PAGE', 'Dev Hand-off', { id: '0:1' }, [section]);

  const figma = {
    mixed: Symbol('mixed'),
    currentPage: null,
    async getNodeByIdAsync(id) { return nodes.get(id) || null; },
    async setCurrentPageAsync(p) { this.currentPage = p; },
    async getLocalTextStylesAsync() {
      return [
        { id: 'S:body', name: 'Paragraph / Body', fontName: { family: BRAND } },
        { id: 'S:old', name: 'Caption Old', fontName: { family: 'Roboto' } },
      ];
    },
    variables: {
      async getLocalVariableCollectionsAsync() {
        return [
          { id: 'VC:1', name: 'Primitives', variableIds: ['VariableID:1'] },
          { id: 'VC:2', name: 'Brand / Semantic', variableIds: ['VariableID:2', 'VariableID:3'] },
        ];
      },
    },
  };
  return { figma, nodes, page, libPage };
}

// Runs the emitted scan part by part, exactly as an agent would, and joins the parts.
async function scanParts(figma, params) {
  const run = (part) => new AsyncFunction('figma', buildScanScript({ ...params, part }))(figma);
  const first = await run(0);
  const parts = [first];
  for (let i = 1; i < first.parts; i++) parts.push(await run(i));
  return parts;
}

async function runScan(options, frames, extra) {
  const { figma, nodes } = makeFile();
  const parts = await scanParts(figma, { pageId: '0:1', frames: frames || null, options: options || {}, ...(extra || {}) });
  return { scan: joinParts(parts), parts, nodes, figma };
}

const finding = (scan, rule) => scan.findings.find((f) => f.rule === rule);

// ---- scan --------------------------------------------------------------------

test('scan script fits the use_figma code limit', () => {
  assert.ok(buildScanScript({ pageId: '0:1', options: {} }).length < 50000);
});

test('scan finds every screen inside a section and reports the scope', async () => {
  const { scan } = await runScan();
  assert.deepEqual(Object.keys(scan.scope.screens).sort(), ['2:1', '3:1', '4:1']);
  assert.equal(scan.scope.pageName, 'Dev Hand-off');
});

test('placeholder text is grouped by its section and links the exact layer', async () => {
  const { scan } = await runScan();
  const f = finding(scan, 'placeholder-content');
  assert.equal(f.sev, 'must');
  assert.equal(f.total, 1, 'hidden lorem ipsum under a hidden frame is not walked');
  const g = f.groups[0];
  assert.equal(g.kind, 'section');
  assert.equal(g.id, '2:20');
  assert.equal(g.screen.name, 'Home — Mobile');
  assert.equal(g.examples[0].id, '2:21');
  assert.equal(g.examples[0].path, 'Home — Mobile › hero › label');
});

test('small text inside a component groups by component with layer and copy counts', async () => {
  const { scan } = await runScan();
  const f = finding(scan, 'small-text');
  const comp = f.groups.find((g) => g.kind === 'component');
  assert.equal(comp.id, '9:1');
  assert.equal(comp.name, 'notice-chip');
  assert.equal(comp.copies, 3);
  assert.equal(comp.layers, 1);
  assert.deepEqual(comp.values[0], ['9px', 3]);
  assert.ok(['2:41', '3:41', '4:41'].includes(comp.examples[0].id), 'example links the instance, not an I-prefixed sublayer');
  const sec = f.groups.find((g) => g.kind === 'section');
  assert.equal(sec.id, '2:20', 'the 11px label outside any instance groups by section');
});

test('min font size is configurable', async () => {
  const { scan } = await runScan({ minFont: 9 });
  assert.equal(finding(scan, 'small-text'), undefined);
});

test('off-brand fonts use the given brand set', async () => {
  const { scan } = await runScan({ fonts: [BRAND] });
  const f = finding(scan, 'off-brand-font');
  assert.deepEqual(f.groups.map((g) => g.family).sort(), ['Figtree', 'Geist Mono']);
  assert.ok(f.groups.every((g) => g.family !== BRAND));
  assert.equal(scan.options.fontsInferred, false);
});

test('without a brand set, minority fonts are flagged and the inference is reported', async () => {
  const { scan } = await runScan();
  assert.equal(scan.options.fontsInferred, true);
  assert.ok(scan.options.fonts.includes(BRAND));
  const fam = scan.counts.families;
  const total = Object.values(fam).reduce((a, b) => a + b, 0);
  const minority = Object.keys(fam).filter((k) => fam[k] / total < 0.1).sort();
  assert.ok(minority.includes('Geist Mono'), 'fixture has a minority font');
  const flagged = [...new Set(finding(scan, 'off-brand-font').groups.map((g) => g.family))].sort();
  assert.deepEqual(flagged, minority, 'exactly the families under a 10% share are flagged');
});

test('hardcoded colors are flagged; bound or styled ones are not', async () => {
  const { scan } = await runScan();
  const f = finding(scan, 'raw-color');
  const where = f.groups.flatMap((g) => g.examples.map((e) => e.path));
  assert.ok(where.includes('Home — Mobile › hero › Frame 1171276693 › a'));
  assert.ok(where.includes('Home — Mobile › hero › body'), 'raw text fill');
  assert.ok(!where.some((p) => p.endsWith('› styled') || p.endsWith('› b')));
  assert.deepEqual(f.groups.find((g) => g.id === '2:20').values[0], ['#545454', 2]);
});

test('hidden layers count once and their children are skipped', async () => {
  const { scan } = await runScan();
  const f = finding(scan, 'hidden-layer');
  assert.equal(f.total, 1);
  assert.equal(f.groups[0].examples[0].id, '2:23');
});

test('structure rules ignore layers inside instances', async () => {
  const { scan } = await runScan();
  const paths = scan.findings.filter((f) => ['default-name', 'hidden-layer', 'fractional-size'].includes(f.rule)).flatMap((f) => f.groups.flatMap((g) => g.examples.map((e) => e.layerId || e.id)));
  assert.ok(paths.every((id) => !id.startsWith('I')));
});

test('detached instances name their component', async () => {
  const { scan } = await runScan();
  const f = finding(scan, 'detached-instance');
  assert.equal(f.groups[0].examples[0].id, '2:30');
  assert.deepEqual(f.groups[0].values[0], ['notice-chip', 1]);
});

test('frames without auto layout are flagged unless Figma says no layout fits', async () => {
  const { scan } = await runScan();
  const f = finding(scan, 'no-auto-layout');
  const byId = Object.fromEntries(f.groups.flatMap((g) => g.examples.map((e) => [e.id, e.value])));
  assert.equal(byId['2:22'], 'fits horizontal');
  assert.equal(byId['2:70'], '2 layers', 'Figma gave no answer, so it is flagged for a person to judge');
  assert.equal(byId['2:71'], undefined, 'Figma says no auto layout fits');
});

test('icon internals are left alone by naming, grouping, auto layout and half-pixel rules', async () => {
  const { scan } = await runScan();
  const ids = scan.findings.filter((f) => ['default-name', 'group-layer', 'no-auto-layout', 'fractional-size'].includes(f.rule)).flatMap((f) => f.groups.flatMap((g) => g.examples.map((e) => e.id)));
  assert.ok(!ids.includes('2:29') && !ids.includes('2:291'));
  const vals = finding(scan, 'default-name').groups.flatMap((g) => g.values.map(([v]) => v));
  assert.ok(!vals.includes('Vector'));
});

test('handSetFractions ignores what auto layout computes', async () => {
  const { handSetFractions } = await import('../scripts/figma-audit-rules.mjs');
  assert.deepEqual(handSetFractions({ x: 10.5, y: 0, w: 405.33, h: 40, sizingH: 'FILL', parentAuto: true }), []);
  assert.deepEqual(handSetFractions({ x: 10.5, y: 0, w: 405.33, h: 40, sizingH: 'FIXED', parentAuto: false }), [10.5, 405.33]);
  assert.deepEqual(handSetFractions({ x: 0, y: 0, w: 100, h: 40.5, sizingV: 'HUG', parentAuto: true }), []);
});

test('component groups name the variant, so two variants never share a label', async () => {
  const { scan } = await runScan();
  const comp = finding(scan, 'no-text-style').groups.find((g) => g.kind === 'component');
  assert.equal(comp.name, 'global-header › Size=Mobile');
});

test('a frame copied onto 3 screens is flagged; one on 2 screens is not', async () => {
  const { scan } = await runScan();
  const f = finding(scan, 'repeated-frame');
  assert.deepEqual(f.groups.map((g) => g.name), ['notice-bar'], 'notice-links repeats only inside notice-bar; two different "hero" frames share a name only');
  assert.equal(f.groups[0].count, 3);
  const fewer = await runScan({ repeatMin: 4 });
  assert.equal(finding(fewer.scan, 'repeated-frame'), undefined);
});

test('a second copy of a component on one screen is flagged once', async () => {
  const { scan } = await runScan();
  const f = finding(scan, 'stacked-duplicate');
  assert.equal(f.total, 1);
  assert.equal(f.groups[0].examples[0].id, '2:11');
});

test('wireframe components, default names, groups and half pixels are found', async () => {
  const { scan } = await runScan();
  assert.equal(finding(scan, 'wireframe-leftover').groups[0].examples[0].id, '2:50');
  assert.deepEqual(finding(scan, 'default-name').groups.flatMap((g) => g.examples.map((e) => e.id)).sort(), ['2:22', '2:60']);
  assert.equal(finding(scan, 'group-layer').groups[0].examples[0].id, '2:60');
  const frac = finding(scan, 'fractional-size').groups.flatMap((g) => g.examples.map((e) => e.id));
  assert.deepEqual(frac, ['2:22'], 'text width 120.5 and FILL cards at 405.33 are not flagged');
});

test('a collection with no bindings is flagged only when another one is used', async () => {
  const { scan } = await runScan();
  const f = finding(scan, 'unused-collection');
  assert.deepEqual(f.groups.map((g) => g.name), ['Brand / Semantic']);
  assert.deepEqual(finding(scan, 'unused-text-style').groups.map((g) => g.name), ['Caption Old']);
});

test('findings come back in severity order', async () => {
  const { scan } = await runScan();
  const order = scan.findings.map((f) => f.sev);
  const rank = { must: 0, system: 1, house: 2 };
  assert.deepEqual(order, [...order].sort((a, b) => rank[a] - rank[b]));
});

test('exclude-screens skips matching screens and the report says so', async () => {
  const { scan } = await runScan({}, null, { excludeScreens: 'about|news' });
  assert.deepEqual(Object.keys(scan.scope.screens), ['2:1']);
  assert.deepEqual(scan.scope.excluded, ['About — Mobile', 'News — Mobile']);
  assert.ok(renderReport(scan, { fileKey: 'K' }).includes('1 screens, skipping 2 screens matching "about\\|news"'));
});

test('frames scopes the scan to chosen screens', async () => {
  const { scan } = await runScan({}, ['3:1']);
  assert.deepEqual(Object.keys(scan.scope.screens), ['3:1']);
  assert.equal(finding(scan, 'placeholder-content'), undefined);
});

test('a big result comes back in parts that each fit use_figma, and join rebuilds it', async () => {
  const whole = await runScan();
  const split = await runScan({}, null, { chunkBytes: 2000 });
  assert.ok(split.parts.length > 3);
  for (const p of split.parts) assert.ok(JSON.stringify(p).length <= 2000 + 200, 'part ' + p.part + ' fits');
  assert.deepEqual(split.scan, whole.scan);
  assert.deepEqual(joinParts([...split.parts].reverse()), whole.scan, 'order does not matter');
});

test('join refuses a part that was altered or is missing', async () => {
  const { parts } = await runScan({}, null, { chunkBytes: 2000 });
  const bad = parts.map((p) => ({ ...p }));
  bad[1].chunk = bad[1].chunk.replace(/[0-9]/, (d) => String((Number(d) + 1) % 10));
  assert.throws(() => joinParts(bad), /hash mismatch/);
  assert.throws(() => joinParts(parts.slice(0, -1)), /missing part/);
});

test('chunkBounds keeps quote-heavy text under the byte limit once escaped', () => {
  const str = '"'.repeat(5000) + 'x'.repeat(5000);
  const b = chunkBounds(str, 1000);
  assert.equal(b.map(([s, e]) => str.slice(s, e)).join(''), str);
  for (const [s, e] of b) assert.ok(Buffer.byteLength(JSON.stringify(str.slice(s, e)), 'utf8') <= 1000);
});

// ---- links, report, screenshots ---------------------------------------------

test('every Figma link in the report points at a node that exists', async () => {
  const { scan, nodes } = await runScan();
  const md = renderReport(scan, { fileKey: 'KEY123', fileName: 'Client WEB' });
  const ids = [...md.matchAll(/node-id=([0-9-]+)/g)].map((m) => m[1].replace('-', ':'));
  assert.ok(ids.length > 10);
  for (const id of ids) assert.ok(nodes.has(id), 'link to missing node ' + id);
  assert.ok(ids.includes('2:20'), 'section link');
  assert.ok(ids.includes('2:21'), 'layer link');
  assert.ok(ids.includes('9:1'), 'component link');
  assert.match(md, /Home — Mobile › hero › label/);
  assert.match(md, /the "Dev Hand-off" page only, 3 screens/);
});

test('the exists script reports what is missing, and report refuses to link it', async () => {
  const { scan, figma, nodes } = await runScan();
  nodes.delete('2:21');
  const ids = linkedIds(scan, true);
  const parts = existsParts(ids);
  assert.equal(parts.length, 1);
  const result = await new AsyncFunction('figma', buildExistsScript(parts[0], 0, 1))(figma);
  assert.deepEqual(result.missing, ['2:21']);
  const map = existsMap(scan, [result]);
  assert.equal(map.get('2:21'), false);
  assert.equal(map.get('2:20'), true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-'));
  fs.writeFileSync(path.join(dir, 'scan.json'), JSON.stringify(scan));
  fs.writeFileSync(path.join(dir, 'exists.json'), JSON.stringify(result));
  const run = () => spawnSync(process.execPath, [CLI, 'report', '--scan', path.join(dir, 'scan.json'), '--file-key', 'K', '--exists', path.join(dir, 'exists.json')], { encoding: 'utf8' });
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /2:21/);
  fs.writeFileSync(path.join(dir, 'exists.json'), JSON.stringify({ ...result, missing: [] }));
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /## 🔴 Must fix before dev starts/);
});

test('exists results from another scan are refused', async () => {
  const { scan } = await runScan();
  const other = await runScan({}, ['3:1']);
  const parts = existsParts(linkedIds(other.scan, true));
  const foreign = { figmaAuditExists: 1, part: 0, parts: parts.length, idsHash: 'deadbeef', missing: [] };
  assert.throws(() => existsMap(scan, [foreign]), /different scan|does not belong/);
});

test('exists checks split into parts that fit the use_figma code limit', () => {
  const ids = Array.from({ length: 9000 }, (_, i) => '12345:' + (10000 + i));
  const parts = existsParts(ids);
  assert.ok(parts.length > 1);
  assert.deepEqual(parts.flat(), ids);
  for (let i = 0; i < parts.length; i++) assert.ok(buildExistsScript(parts[i], i, parts.length).length < 50000);
});

test('screenshot plan keys match report rows, and uploaded shots are embedded', async () => {
  const { scan } = await runScan();
  const plan = planShots(scan);
  const rows = buildRows(scan);
  assert.ok(plan.length > 0);
  for (const p of plan) {
    const row = rows.find((r) => r.shotKey === p.key);
    assert.ok(row, 'plan key ' + p.key + ' has a row');
    assert.ok(scan.scope.screens[p.screenId]);
    assert.ok(p.boxes.length >= 1);
  }
  const smallRow = plan.find((p) => p.key.includes('-small-text-'));
  const shots = { [smallRow.key]: { url: 'https://x.test/full.png', thumb: 'https://x.test/thumb.png' } };
  const md = renderReport(scan, { fileKey: 'K', shots });
  assert.match(md, /!\[#\d+\]\(https:\/\/x\.test\/thumb\.png\)/, 'thumbnail in the table');
  assert.match(md, /## Screenshots[\s\S]*!\[#\d+\]\(https:\/\/x\.test\/full\.png\)/, 'full size below');
});

test('markdown table cells escape pipes in layer names', async () => {
  const { scan } = await runScan();
  scan.findings[0].groups[0].name = 'a | b';
  const md = renderReport(scan, { fileKey: 'K' });
  assert.match(md, /a \\\| b/);
});

test('upload sends each file with its own ticket and keeps only real results', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-'));
  fs.writeFileSync(path.join(dir, '3-small-text.png'), Buffer.from('png'));
  fs.writeFileSync(path.join(dir, '4-small-text.png'), Buffer.from('png'));
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push(init.headers['X-Upload-Ticket']);
    const name = init.body.get('attachment').name;
    if (name.startsWith('4')) return { ok: false, status: 401, json: async () => ({ err: 'ticket expired' }) };
    return { ok: true, status: 200, json: async () => ({ id: 'a1', url: 'https://x.test/' + name, thumbnail_small: 'https://x.test/t_' + name }) };
  };
  const r = await uploadWithTickets([
    { file: '3-small-text.png', upload_url: 'https://up.test', upload_ticket: 'T3' },
    { file: '4-small-text.png', upload_url: 'https://up.test', upload_ticket: 'T4' },
  ], dir, fakeFetch);
  assert.deepEqual(seen, ['T3', 'T4']);
  assert.deepEqual(r.shots, { '3-small-text': { url: 'https://x.test/3-small-text.png', thumb: 'https://x.test/t_3-small-text.png', id: 'a1' } });
  assert.equal(r.failed.length, 1);
  assert.match(r.failed[0].error, /401/);
});

// ---- recheck -----------------------------------------------------------------

test('recheck calls each change fixed, removed, improved, open or new', () => {
  const scanOf = (index) => ({ findings: [{ rule: 'raw-color', sev: 'system', title: 'Hardcoded color', index, groups: Object.entries(index).map(([key, count]) => ({ key, name: key.split('|')[2], id: key.split('|')[2], count })) }] });
  const prev = scanOf({ 'raw-color|section|1:1': 5, 'raw-color|section|1:2': 5, 'raw-color|section|1:3': 5, 'raw-color|section|1:4': 5 });
  const curr = scanOf({ 'raw-color|section|1:3': 2, 'raw-color|section|1:4': 5, 'raw-color|section|1:9': 1 });
  const rows = compareScans(prev, curr, { '1:1': true, '1:2': false });
  const status = Object.fromEntries(rows.map((r) => [r.id, r.status]));
  assert.deepEqual(status, { '1:1': 'fixed', '1:2': 'removed', '1:3': 'improved', '1:4': 'open', '1:9': 'new' });
  const md = renderRecheck(rows, { fileKey: 'K', date: '2026-11-20' });
  assert.match(md, /⛔ Still open: 1/);
  assert.ok(md.indexOf('Still open |') < md.indexOf('✅ Fixed |'), 'open rows come first');
});

test('recheck does not call a group fixed just because it fell off the shown list', () => {
  const index = Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['raw-color|section|1:' + i, 30 - i]));
  const shown = Object.entries(index).slice(0, 20).map(([key, count]) => ({ key, name: key, id: key.split('|')[2], count }));
  const scan = { findings: [{ rule: 'raw-color', sev: 'system', title: 'x', index, groups: shown }] };
  const rows = compareScans(scan, scan, {});
  assert.ok(rows.every((r) => r.status === 'open'));
  assert.equal(rows.length, 30);
});

// ---- crop and annotate -------------------------------------------------------

test('cropPlan keeps every box inside the crop and scales small crops up', () => {
  const screen = { x: 1000, y: -2000, w: 390, h: 8000 };
  const box = { x: 1231, y: -1841, w: 135, h: 11 };
  const p = cropPlan(screen, [box], 390, 8000);
  assert.equal(p.crop.x, 0, 'a narrow screen keeps its full width');
  assert.equal(p.crop.w, 390);
  assert.ok(p.crop.y <= 159 && p.crop.y + p.crop.h >= 170);
  assert.equal(p.resize, 2);
  const r = p.rects[0];
  assert.equal(r.x0, 231 * 2 - 6);
  assert.ok(r.x1 <= p.out.w && r.y1 <= p.out.h && r.x0 >= 0 && r.y0 >= 0);
});

test('cropPlan clips a layer that overhangs its screen, so the box stays visible', () => {
  const screen = { x: 1000, y: -2000, w: 390, h: 8000 };
  const p = cropPlan(screen, [{ x: 310, y: -1825, w: 1439, h: 659 }], 390, 8000);
  const r = p.rects[0];
  assert.ok(r.x0 >= 2 && r.x1 <= p.out.w - 3, 'all four edges on the image: ' + JSON.stringify(r));
  assert.ok(r.y0 >= 2 && r.y1 <= p.out.h - 3);
});

test('cropPlan clamps at the screen edge', () => {
  const p = cropPlan({ x: 0, y: 0, w: 1440, h: 900 }, [{ x: 1400, y: 880, w: 40, h: 20 }], 1440, 900);
  assert.ok(p.crop.x + p.crop.w <= 1440 && p.crop.y + p.crop.h <= 900);
});

const hasMagick = spawnSync('magick', ['-version']).status === 0;

test('annotate writes a crop at the planned size', { skip: !hasMagick && 'ImageMagick not installed' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-'));
  const png = path.join(dir, 'screen.png');
  execFileSync('magick', ['-size', '390x2000', 'xc:#eeeeee', png]);
  const out = path.join(dir, 'out.png');
  const p = annotate({ png, screen: { x: 0, y: 0, w: 390, h: 2000 }, boxes: [{ x: 100, y: 500, w: 135, h: 11 }], caption: '', out });
  assert.deepEqual(pngSize(fs.readFileSync(out)), p.out);
});

test('--help prints the usage header', () => {
  const r = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /node figma-audit\.mjs script --page ID/);
});

// ---- regressions from review -----------------------------------------------------

// A small file builder for cases the main fixture does not cover.
function miniFile(build) {
  const nodes = new Map();
  const mk = (n, kids) => {
    Object.assign(n, { visible: true, x: 0, y: 0, width: n.width || 300, height: n.height || 300, fills: [], strokes: [], fillStyleId: '', strokeStyleId: '', boundVariables: {}, ...n });
    n.absoluteBoundingBox = { x: n.x, y: n.y, width: n.width, height: n.height };
    if (kids) { n.children = kids; for (const c of kids) c.parent = n; }
    nodes.set(n.id, n);
    return n;
  };
  const text = (id, chars, seg) => {
    const t = mk({ id, type: 'TEXT', name: (seg && seg.name) || 'copy', characters: chars, hasMissingFont: false });
    t.getStyledTextSegments = () => [{ fontName: { family: (seg && seg.family) || 'A' }, fontSize: (seg && seg.size) || 16, textStyleId: 'S:1', fills: [], fillStyleId: '' }];
    return t;
  };
  const inst = (n, main, kids) => { const i = mk({ ...n, type: 'INSTANCE' }, kids); i.getMainComponentAsync = async () => main; return i; };
  build({ mk, text, inst });
  return {
    nodes,
    figma: {
      mixed: Symbol('mixed'),
      async getNodeByIdAsync(id) { return nodes.get(id) || null; },
      async setCurrentPageAsync() {},
      async getLocalTextStylesAsync() { return [{ id: 'S:1', name: 'Body', fontName: { family: 'A' } }]; },
      variables: { async getLocalVariableCollectionsAsync() { return []; } },
    },
  };
}

async function scanOf(figma, params) {
  return joinParts(await scanParts(figma, { pageId: '0:1', options: {}, ...(params || {}) }));
}

test('a top-level instance used as a screen never yields an instance-internal link', async () => {
  const { figma } = miniFile(({ mk, text, inst }) => {
    const main = mk({ id: '9:1', type: 'COMPONENT', name: 'Page template' }, [mk({ id: '9:2', type: 'FRAME', name: 'hero', layoutMode: 'VERTICAL' }, [text('9:3', 'Lorem ipsum')])]);
    mk({ id: '0:9', type: 'PAGE', name: 'Library' }, [main]);
    const screen = inst({ id: '2:1', name: 'Home' }, main, [mk({ id: 'I2:1;9:2', type: 'FRAME', name: 'hero', layoutMode: 'VERTICAL' }, [text('I2:1;9:3', 'Lorem ipsum')])]);
    mk({ id: '0:1', type: 'PAGE', name: 'Page' }, [screen]);
  });
  const scan = await scanOf(figma);
  const md = renderReport(scan, { fileKey: 'K' });
  const linked = [...md.matchAll(/node-id=([^)\s]+)/g)].map((m) => m[1]);
  assert.ok(linked.length > 1);
  for (const id of linked) assert.match(id, /^\d+-\d+$/, 'instance-internal link in report: ' + id);
  for (const id of linkedIds(scan, true)) assert.match(id, /^\d+:\d+$/);
  assert.equal(groupLink(finding(scan, 'placeholder-content').groups[0]), '2:1', 'the place links the instance screen, not a dead label');
});

test('every scan part stays under 48,000 UTF-8 bytes for non-Latin layer names', () => {
  const json = JSON.stringify({ ex: Array.from({ length: 3000 }, () => ({ path: 'ホーム画面 › ヒーローセクション › 見出しテキスト', value: 'ここに本文が入ります 🎉' })) });
  const bounds = chunkBounds(json, 44000);
  assert.equal(bounds.map(([s, e]) => json.slice(s, e)).join(''), json);
  for (const [s, e] of bounds) {
    const ret = JSON.stringify({ figmaAudit: 1, part: 0, parts: 9, hash: '00000000', chunk: json.slice(s, e) });
    assert.ok(Buffer.byteLength(ret, 'utf8') <= 48000, 'part is ' + Buffer.byteLength(ret, 'utf8') + ' bytes');
  }
  assert.equal(utf8Length('a›🎉'), 1 + 3 + 4);
});

test('a recheck checks unshown groups too: deleted reads removed and is not linked', async () => {
  const index = Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['raw-color|section|7:' + i, 1]));
  const shown = Object.keys(index).slice(0, 20).map((key) => ({ key, kind: 'section', id: key.split('|')[2], name: 'sec', count: 1, values: [], examples: [] }));
  const prev = { findings: [{ rule: 'raw-color', sev: 'system', title: 'Hardcoded color', index, groups: shown }] };
  const ids = linkedIds(prev, true);
  assert.ok(ids.includes('7:25'), 'unshown groups are existence-checked');
  const parts = existsParts(ids);
  const result = { figmaAuditExists: 1, part: 0, parts: 1, idsHash: (await import('../scripts/figma-audit-rules.mjs')).fnv1a(parts[0].join(',')), missing: ['7:25'] };
  const exists = existsMap(prev, [result]);
  const rows = compareScans(prev, { findings: [] }, Object.fromEntries(exists));
  assert.equal(rows.find((r) => r.id === '7:25').status, 'removed');
  assert.equal(rows.find((r) => r.id === '7:3').status, 'fixed');
  const md = renderRecheck(rows, { fileKey: 'K', exists });
  assert.ok(!md.includes('node-id=7-25'), 'deleted node linked');
  assert.ok(md.includes('node-id=7-3'), 'a fixed, still-existing section is linked');
  assert.ok(!renderRecheck(rows, { fileKey: 'K' }).includes('node-id='), 'nothing is linked without an exists check');
});

test('a recheck counts new problems beyond --max-groups', () => {
  const prev = { findings: [] };
  const index = Object.fromEntries(Array.from({ length: 25 }, (_, i) => ['raw-color|section|8:' + i, 1]));
  const curr = { findings: [{ rule: 'raw-color', sev: 'system', title: 'x', index, groups: [] }] };
  assert.equal(compareScans(prev, curr, {}).filter((r) => r.status === 'new').length, 25);
});

test('a library component is grouped by component but links its first instance', async () => {
  const { figma } = miniFile(({ mk, text, inst }) => {
    const main = mk({ id: '50:1', type: 'COMPONENT', name: 'Button', remote: true }, [text('50:2', 'Go', { size: 9 })]);
    const a = inst({ id: '2:5', name: 'Button' }, main, [text('I2:5;50:2', 'Go', { size: 9 })]);
    mk({ id: '0:1', type: 'PAGE', name: 'Page' }, [mk({ id: '2:1', type: 'FRAME', name: 'Home', layoutMode: 'VERTICAL' }, [a])]);
  });
  const scan = await scanOf(figma);
  const g = finding(scan, 'small-text').groups[0];
  assert.equal(g.kind, 'component');
  assert.equal(g.remote, true);
  assert.equal(groupLink(g), '2:5');
  const md = renderReport(scan, { fileKey: 'K' });
  assert.match(md, /\[Library component: Button\]\([^)]*node-id=2-5\)/);
  assert.ok(!md.includes('node-id=50-1'));
});

test('nested components: blame the nearest one, link the outermost instance', async () => {
  const { figma } = miniFile(({ mk, text, inst }) => {
    const button = mk({ id: '60:1', type: 'COMPONENT', name: 'Button' }, [text('60:2', 'Go', { size: 9 })]);
    const card = mk({ id: '61:1', type: 'COMPONENT', name: 'Card' }, []);
    mk({ id: '0:9', type: 'PAGE', name: 'Library' }, [button, card]);
    const nested = inst({ id: 'I2:5;61:3', name: 'Button' }, button, [text('I2:5;61:3;60:2', 'Go', { size: 9 })]);
    const outer = inst({ id: '2:5', name: 'Card' }, card, [nested]);
    mk({ id: '0:1', type: 'PAGE', name: 'Page' }, [mk({ id: '2:1', type: 'FRAME', name: 'Home', layoutMode: 'VERTICAL' }, [outer])]);
  });
  const scan = await scanOf(figma);
  const g = finding(scan, 'small-text').groups[0];
  assert.equal(g.name, 'Button');
  assert.equal(g.id, '60:1');
  assert.equal(g.examples[0].id, '2:5');
});

test('must-fix places past the eighth get a row with a Resolved box, not silence', async () => {
  const { figma } = miniFile(({ mk, text }) => {
    const secs = Array.from({ length: 12 }, (_, i) => mk({ id: '3:' + (10 + i), type: 'FRAME', name: 'sec-' + i, layoutMode: 'VERTICAL' }, [text('4:' + (10 + i), 'Small', { size: 9 })]));
    mk({ id: '0:1', type: 'PAGE', name: 'Page' }, [mk({ id: '2:1', type: 'FRAME', name: 'Home', layoutMode: 'VERTICAL' }, secs)]);
  });
  const scan = await scanOf(figma);
  const rows = buildRows(scan).filter((r) => r.finding.rule === 'small-text');
  assert.equal(rows.length, 8);
  assert.equal(rows[7].places, 5);
  assert.equal(rows.reduce((a, r) => a + r.places, 0), 12);
  const md = renderReport(scan, { fileKey: 'K' });
  const row8 = md.split('\n').find((l) => l.startsWith('| ' + rows[7].n + ' |'));
  assert.match(row8, /and 2 more, see Where to look/);
  assert.match(row8, /Text smaller than 12px: 5/);
  assert.match(row8, /☐ \| ☐ \|$/);
});

test('a copied frame resized by 1px is the same finding in a recheck', async () => {
  const build = (w) => miniFile(({ mk, text }) => {
    const bar = (i) => mk({ id: '5:' + i, type: 'FRAME', name: 'promo-bar', width: w, layoutMode: 'VERTICAL' }, [text('6:' + i + '1', 'A'), text('6:' + i + '2', 'B')]);
    mk({ id: '0:1', type: 'PAGE', name: 'Page' }, [1, 2, 3].map((i) => mk({ id: '2:' + i, type: 'FRAME', name: 'S' + i, layoutMode: 'VERTICAL' }, [bar(i)])));
  });
  const before = await scanOf(build(300).figma);
  const after = await scanOf(build(301).figma);
  const rows = compareScans(before, after, {}).filter((r) => r.rule === 'repeated-frame');
  assert.deepEqual(rows.map((r) => r.status), ['open']);
});

test('scope problems fail loudly instead of producing a clean report', async () => {
  const { figma } = miniFile(({ mk, text }) => {
    mk({ id: '0:1', type: 'PAGE', name: 'Page' }, [
      mk({ id: '2:9', type: 'GROUP', name: 'flow' }, [mk({ id: '2:1', type: 'FRAME', name: 'Home', layoutMode: 'VERTICAL' }, [text('2:2', 'Hi')])]),
      text('2:3', 'loose note'),
    ]);
    mk({ id: '0:2', type: 'PAGE', name: 'Other' }, [mk({ id: '7:1', type: 'FRAME', name: 'Elsewhere' }, [])]);
  });
  const scan = await scanOf(figma);
  assert.deepEqual(Object.keys(scan.scope.screens), ['2:1'], 'screens inside a group are found');
  assert.deepEqual(scan.scope.skipped, ['copy (text)']);
  await assert.rejects(scanOf(figma, { excludeScreens: 'home' }), /No screens to scan/);
  await assert.rejects(scanOf(figma, { frames: ['7:1'] }), /not on the page/);
  await assert.rejects(scanOf(figma, { frames: ['2:3'] }), /is a TEXT, not a screen/);
});

test('a layer named Placeholder inside a component is not a placeholder; its content still counts', async () => {
  const { figma } = miniFile(({ mk, text, inst }) => {
    const input = mk({ id: '70:1', type: 'COMPONENT', name: 'Input' }, [text('70:2', 'Email', { name: 'Placeholder' })]);
    mk({ id: '0:9', type: 'PAGE', name: 'Library' }, [input]);
    const a = inst({ id: '2:5', name: 'Input' }, input, [text('I2:5;70:2', 'Email', { name: 'Placeholder' })]);
    const b = inst({ id: '2:6', name: 'Input' }, input, [text('I2:6;70:2', 'Lorem ipsum', { name: 'Placeholder' })]);
    mk({ id: '0:1', type: 'PAGE', name: 'Page' }, [mk({ id: '2:1', type: 'FRAME', name: 'Home', layoutMode: 'VERTICAL' }, [a, b])]);
  });
  const scan = await scanOf(figma);
  assert.equal(finding(scan, 'placeholder-content').total, 1);
});

test('brand fonts match regardless of case', async () => {
  const { scan } = await runScan({ fonts: ['brand sans', 'GEIST MONO', 'figtree'] });
  assert.equal(finding(scan, 'off-brand-font'), undefined);
});

test('layer names cannot smuggle ImageMagick escapes into captions', () => {
  assert.equal(magickText('%[fx:6*7] 50%'), '%%[fx:6*7] 50%%');
  assert.equal(magickText('@/etc/passwd'), ' @/etc/passwd');
});

test('upload refuses a ticket that names a file outside the folder', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-'));
  let called = false;
  const r = await uploadWithTickets([{ file: '../../etc/hosts', upload_url: 'https://up.test', upload_ticket: 'T' }], dir, async () => { called = true; });
  assert.equal(called, false);
  assert.match(r.failed[0].error, /outside/);
});

test('table cells survive backslashes, pipes, newlines and angle brackets in layer names', async () => {
  const { scan } = await runScan();
  scan.findings[0].groups[0].examples[0].path = 'a\\|b\r<Button>\nc';
  const md = renderReport(scan, { fileKey: 'K' });
  const row = md.split('\n').find((l) => l.startsWith('| 1 |'));
  const cells = row.split(/(?<!\\)\|/).slice(1, -1);
  assert.equal(cells.length, 8, row);
  assert.ok(!/(?<!\\)<Button>/.test(row), 'raw HTML tag left in the row');
});

test('annotate output matches its plan when the scale is not a whole percent', { skip: !hasMagick && 'ImageMagick not installed' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-'));
  const png = path.join(dir, 'screen.png');
  execFileSync('magick', ['-size', '487x3000', 'xc:#eeeeee', png]);
  const out = path.join(dir, 'out.png');
  const p = annotate({ png, screen: { x: 0, y: 0, w: 487, h: 3000 }, boxes: [{ x: 100, y: 500, w: 135, h: 11 }], caption: '', out });
  assert.ok(p.resize > 1 && Math.round(p.resize * 100) !== p.resize * 100);
  assert.deepEqual(pngSize(fs.readFileSync(out)), p.out);
});

// ---- regressions from review round 2 -----------------------------------------------

test('every must-fix place gets a row, with true counts, when --max-groups is under 8', () => {
  const mk = (n, maxGroups) => {
    const keys = Array.from({ length: n }, (_, i) => 'small-text|section|3:' + (10 + i));
    const groups = keys.slice(0, maxGroups).map((key) => ({ key, kind: 'section', id: key.split('|')[2], name: 's', screen: null, count: 2, values: [], examples: [] }));
    return { findings: [{ rule: 'small-text', sev: 'must', title: 'Small', fix: 'f', total: n * 2, groupCount: n, index: Object.fromEntries(keys.map((k) => [k, 2])), groups }], options: {}, scope: {} };
  };
  for (const [n, maxGroups] of [[8, 6], [10, 6], [12, 10], [12, 20], [5, 3]]) {
    const rows = buildRows(mk(n, maxGroups));
    assert.equal(rows.reduce((a, r) => a + r.places, 0), n, n + ' places at --max-groups ' + maxGroups);
    assert.equal(rows.reduce((a, r) => a + r.count, 0), n * 2, 'hit counts add up');
    assert.ok(rows.length <= 8);
  }
  const md = renderReport(mk(10, 6), { fileKey: 'K' });
  const last = md.split('\n').filter((l) => /^\| \d+ \|/.test(l)).pop();
  assert.match(last, /\| 4 places, see Where to look \|/);
  assert.match(last, /Small: 8/);
});

test('recheck never links a library main component or a name that looks like an id', () => {
  const comp = 'small-text|component|50:1';
  const named = 'repeated-frame|name|10:30';
  const curr = { findings: [
    { rule: 'small-text', sev: 'must', title: 'Small', index: { [comp]: 1 }, groups: [{ key: comp, kind: 'component', id: '50:1', name: 'Button', remote: true, count: 1, values: [], examples: [{ id: '2:5', path: 'Home › Button › Go' }] }] },
    { rule: 'repeated-frame', sev: 'system', title: 'Copied', index: { [named]: 3 }, groups: [] },
  ] };
  const md = renderRecheck(compareScans({ findings: [] }, curr, {}), { fileKey: 'K' });
  assert.ok(!md.includes('node-id=50-1'), 'recheck links a library main component');
  assert.ok(!md.includes('node-id=10-30'), 'recheck links a frame name as a node');
  assert.ok(md.includes('node-id=2-5'), 'the library row links its instance');
  const prevLib = { findings: [{ rule: 'small-text', sev: 'must', title: 'Small', index: { [comp]: 1 }, groups: curr.findings[0].groups }] };
  assert.ok(!linkedIds(prevLib, true).includes('50:1'), 'a library main is never existence-checked');
});

test('copies count the blamed component instances, not the outer one', async () => {
  const { figma } = miniFile(({ mk, text, inst }) => {
    const button = mk({ id: '60:1', type: 'COMPONENT', name: 'Button' }, [text('60:2', 'Go', { size: 9 })]);
    const card = mk({ id: '61:1', type: 'COMPONENT', name: 'Card' }, []);
    mk({ id: '0:9', type: 'PAGE', name: 'Library' }, [button, card]);
    const cardInst = (cid) => inst({ id: cid, name: 'Card' }, card, [1, 2, 3].map((k) => inst({ id: 'I' + cid + ';61:' + k, name: 'Button' }, button, [text('I' + cid + ';61:' + k + ';60:2', 'Go', { size: 9 })])));
    mk({ id: '0:1', type: 'PAGE', name: 'Page' }, [mk({ id: '2:1', type: 'FRAME', name: 'Home', layoutMode: 'VERTICAL' }, [cardInst('2:5'), cardInst('2:6')])]);
  });
  const g = finding(await scanOf(figma), 'small-text').groups[0];
  assert.equal(g.name, 'Button');
  assert.equal(g.count, 6);
  assert.equal(g.layers, 1);
  assert.equal(g.copies, 6);
});

test('existsMap refuses a missing part', () => {
  const ids = Array.from({ length: 9000 }, (_, i) => '12345:' + (10000 + i));
  const scan = { findings: [{ rule: 'raw-color', sev: 'system', title: 'x', index: Object.fromEntries(ids.map((id) => ['raw-color|section|' + id, 1])), groups: [] }] };
  const parts = existsParts(linkedIds(scan, true));
  assert.ok(parts.length > 1);
  const results = parts.map((p, i) => new AsyncFunction('figma', buildExistsScript(p, i, parts.length))({ async getNodeByIdAsync() { return {}; } }));
  return Promise.all(results).then((rs) => {
    assert.equal(existsMap(scan, rs).size, 9000);
    assert.throws(() => existsMap(scan, rs.slice(0, 1)), /missing/);
  });
});

test('overlapping --frames scan each screen once', async () => {
  const { scan } = await runScan({}, ['1:1', '2:1', '2:1']);
  const single = await runScan();
  assert.equal(finding(scan, 'placeholder-content').total, finding(single.scan, 'placeholder-content').total);
  assert.equal(finding(scan, 'stacked-duplicate').total, finding(single.scan, 'stacked-duplicate').total);
});

test('the scan restores skipInvisibleInstanceChildren, even when it fails', async () => {
  const { figma } = makeFile();
  figma.skipInvisibleInstanceChildren = false;
  await new AsyncFunction('figma', buildScanScript({ pageId: '0:1', options: {} }))(figma);
  assert.equal(figma.skipInvisibleInstanceChildren, false);
  await assert.rejects(new AsyncFunction('figma', buildScanScript({ pageId: '0:1', frames: ['404:1'], options: {} }))(figma));
  assert.equal(figma.skipInvisibleInstanceChildren, false);
});

test('numeric flags reject junk instead of silently disabling a rule', () => {
  const r = spawnSync(process.execPath, [CLI, 'script', '--page', '1:1', '--min-font', '12px'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /expected a number/);
});

test('upload refuses a symlink inside the folder that points outside it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-'));
  fs.symlinkSync('/etc/hosts', path.join(dir, 'shot.png'));
  let called = false;
  const r = await uploadWithTickets([{ file: 'shot.png', upload_url: 'https://up.test', upload_ticket: 'T' }], dir, async () => { called = true; });
  assert.equal(called, false);
  assert.match(r.failed[0].error, /outside/);
});

// ---- regressions from review round 3 -----------------------------------------------

test('a flag with no value, a fraction or a tiny repeat count is refused', () => {
  for (const args of [['--min-font'], ['--min-font', ''], ['--repeat-min', '1'], ['--part', '1.5'], ['--max-groups', '0']]) {
    const r = spawnSync(process.execPath, [CLI, 'script', '--page', '1:1', ...args, '--fonts', 'A'], { encoding: 'utf8' });
    assert.equal(r.status, 1, args.join(' ') + ' was accepted');
    assert.match(r.stderr, /expected/);
  }
  const ok = spawnSync(process.execPath, [CLI, 'script', '--page', '1:1', '--min-font', '11.5'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
});

test('a passed frame inside another passed frame is scanned once', async () => {
  const { figma } = miniFile(({ mk, text }) => {
    const b = mk({ id: '5:2', type: 'FRAME', name: 'B', layoutMode: 'VERTICAL' }, [text('5:3', 'Lorem ipsum')]);
    mk({ id: '0:1', type: 'PAGE', name: 'Page' }, [mk({ id: '5:1', type: 'FRAME', name: 'A', layoutMode: 'VERTICAL' }, [b])]);
  });
  const scan = await scanOf(figma, { frames: ['5:1', '5:2'] });
  assert.deepEqual(Object.keys(scan.scope.screens), ['5:1']);
  assert.equal(finding(scan, 'placeholder-content').total, 1);
});

test('a deleted local component links its instance and says it was deleted', async () => {
  const { figma } = miniFile(({ mk, text, inst }) => {
    const main = mk({ id: '80:1', type: 'COMPONENT', name: 'Old badge' }, [text('80:2', 'x', { size: 9 })]);
    main.parent = null;
    const a = inst({ id: '2:5', name: 'Old badge' }, main, [text('I2:5;80:2', 'x', { size: 9 })]);
    mk({ id: '0:1', type: 'PAGE', name: 'Page' }, [mk({ id: '2:1', type: 'FRAME', name: 'Home', layoutMode: 'VERTICAL' }, [a])]);
  });
  const scan = await scanOf(figma);
  const md = renderReport(scan, { fileKey: 'K' });
  assert.match(md, /\[Deleted component: Old badge\]\([^)]*node-id=2-5\)/);
  assert.ok(!linkedIds(scan, true).includes('80:1'));
});

test('a recheck names groups that were never listed instead of showing a bare id', () => {
  const prev = { findings: [{ rule: 'raw-color', sev: 'system', title: 'x', index: { 'raw-color|component|9:3': 2 }, groups: [] }] };
  const rows = compareScans(prev, { findings: [] }, {});
  assert.equal(rows[0].name, 'a component not listed in the report (9:3)');
});

// ---- review fixes: recheck settings, sandbox property reads, doc escaping ----------------

// In use_figma a member the node type lacks is absent to `in` and throws on read, where the
// plain mock returns undefined. Wraps every node so the mock behaves the same way.
function strictLayout(nodes) {
  const AUTO = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SLOT']);
  const CHILD_KEYS = new Set(['layoutSizingHorizontal', 'layoutSizingVertical', 'layoutPositioning']);
  const NO_CHILD = new Set(['SECTION', 'PAGE', 'WIDGET', 'STICKY']);
  const lacks = (t, k) => (k === 'layoutMode' && !AUTO.has(t.type)) || (CHILD_KEYS.has(k) && NO_CHILD.has(t.type));
  const proxies = new Map();
  const wrap = (n) => {
    if (!n || typeof n !== 'object') return n;
    if (!proxies.has(n)) {
      proxies.set(n, new Proxy(n, {
        has: (t, k) => !lacks(t, k) && k in t,
        get: (t, k, r) => {
          if (lacks(t, k)) throw new TypeError('node.' + String(k) + ": no such property '" + String(k) + "' on " + t.type + ' node');
          return Reflect.get(t, k, r);
        },
      }));
    }
    return proxies.get(n);
  };
  const raw = [...new Set(nodes.values())];
  for (const n of raw) {
    if (n.children) n.children = n.children.map(wrap);
    n.parent = wrap(n.parent);
  }
  for (const [id, n] of nodes) nodes.set(id, wrap(n));
}

// Adds a raw mock node under a parent, as makeFile would.
function addChild(nodes, parent, props) {
  const n = {
    visible: true, x: 0, y: 0, width: 10, height: 10, fills: [], strokes: [], fillStyleId: '', strokeStyleId: '',
    boundVariables: {}, detachedInfo: null, inferredAutoLayout: null, ...props, parent,
  };
  n.absoluteBoundingBox = { x: n.x, y: n.y, width: n.width, height: n.height };
  parent.children = (parent.children || []).concat(n);
  nodes.set(n.id, n);
  return n;
}

test('children of an auto-layout slot get no half-pixel position finding', async () => {
  const { figma, nodes } = makeFile();
  const slot = addChild(nodes, nodes.get('2:20'), { id: '2:80', type: 'SLOT', name: 'slot', layoutMode: 'VERTICAL', children: [] });
  addChild(nodes, slot, { id: '2:81', type: 'RECTANGLE', name: 'r', x: 100.5, width: 200, height: 50, fills: [BOUND] });
  strictLayout(nodes);
  const scan = joinParts(await scanParts(figma, { pageId: '0:1', options: {} }));
  const { scan: baseline } = await runScan();
  assert.equal(finding(scan, 'fractional-size').total, finding(baseline, 'fractional-size').total);
});

test('a widget inside a screen does not break the scan', async () => {
  const { figma, nodes } = makeFile();
  addChild(nodes, nodes.get('2:20'), { id: '2:82', type: 'WIDGET', name: 'widget' });
  strictLayout(nodes);
  const scan = joinParts(await scanParts(figma, { pageId: '0:1', options: {} }));
  assert.ok(scan.findings.length);
});

test('the scan reads auto layout only on node types that have it, with the same findings', async () => {
  const { figma, nodes } = makeFile();
  strictLayout(nodes);
  const strict = joinParts(await scanParts(figma, { pageId: '0:1', options: {} }));
  const { scan } = await runScan();
  assert.deepEqual(strict.findings, scan.findings);
});

let factSeq = 100;
function textFact(family, size, varIds) {
  const id = '5:' + factSeq++;
  return {
    id, name: 'copy', type: 'TEXT', visible: true, x: 0, y: 0, w: 10, h: 10, bbox: { x: 0, y: 0, w: 10, h: 10 },
    screen: { id: '2:1', name: 'Home' }, section: { id: '2:20', name: 'hero' }, path: ['Home', 'hero', 'copy'], ancestorIds: ['2:1', '2:20'],
    isScreen: false, parentIsScreen: false, via: null,
    text: { chars: 'Final copy', segments: [{ family, size: size || 16, textStyleId: 'S:1', fills: [{ type: 'SOLID', visible: true, opacity: 1, hex: '#FFFFFF', bound: true }], fillStyled: false }] },
    fills: [], strokes: [], fillStyled: false, strokeStyled: false, missingFont: false, detachedFrom: null, layoutMode: null,
    inferredLayout: null, visibleChildren: 0, childNames: [], main: null, varIds: varIds || [], sizingH: null, sizingV: null, parentAuto: true,
  };
}
const fontScan = (counts, options) => {
  const a = createAudit(options || {});
  for (const [family, n] of Object.entries(counts)) for (let i = 0; i < n; i++) a.visit(textFact(family));
  return a.finish({});
};

test('a recheck refuses scans whose inferred brand fonts differ, rather than call off-brand text fixed', () => {
  // Comic grows from 9% to 11% of the text, which would move it into the inferred brand set.
  const prev = fontScan({ 'Brand Sans': 91, Comic: 9 });
  const curr = fontScan({ 'Brand Sans': 89, Comic: 11 });
  assert.throws(() => compareScans(prev, curr, {}), /brand fonts/);
  const pinned = fontScan({ 'Brand Sans': 89, Comic: 11 }, { fonts: prev.options.fonts });
  const row = compareScans(prev, pinned, {}).find((r) => r.rule === 'off-brand-font');
  assert.equal(row.status, 'open');
  assert.equal(row.after, 11);
});

test('a recheck refuses a different --min-font or scope', () => {
  const mk = (minFont) => {
    const a = createAudit({ minFont, fonts: ['Brand Sans'] });
    a.visit(textFact('Brand Sans', 11));
    return a.finish({});
  };
  assert.throws(() => compareScans(mk(12), mk(10), {}), /--min-font 12 vs 10/);
  const prev = { ...mk(12), scope: { pageId: '0:1', frames: null, excludeScreens: null } };
  assert.throws(() => compareScans(prev, { ...mk(12), scope: { pageId: '0:1', frames: ['2:1'], excludeScreens: null } }, {}), /--frames/);
  assert.throws(() => compareScans(prev, { ...mk(12), scope: { pageId: '0:1', frames: null, excludeScreens: 'old' } }, {}), /--exclude-screens/);
});

test('an unused collection does not read fixed when the page lost every binding', () => {
  const file = { collections: [{ id: 'C:1', name: 'Primitives', variableCount: 1 }, { id: 'C:2', name: 'Old', variableCount: 4 }], variableCollectionOf: { 'V:1': 'C:1' } };
  const a = createAudit({ fonts: ['Brand Sans'] });
  a.visit(textFact('Brand Sans', 16, ['V:1']));
  const prev = a.finish(file);
  const b = createAudit({ fonts: ['Brand Sans'] });
  b.visit(textFact('Brand Sans', 16, []));
  const rows = compareScans(prev, b.finish(file), {});
  assert.equal(rows.find((r) => r.rule === 'unused-collection').status, 'unchecked');
  assert.match(renderRecheck(rows, {}), /Not checkable now/);
});

test('script --like rescans with the earlier settings, so the recheck accepts it', async () => {
  const { scan: old } = await runScan({ minFont: 14, fonts: ['Brand Sans'], repeatMin: 2 }, null, { excludeScreens: 'News' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-like-'));
  const oldPath = path.join(dir, 'old.json');
  fs.writeFileSync(oldPath, JSON.stringify(old));
  const { figma } = makeFile();
  const emit = (part) => {
    const r = spawnSync(process.execPath, [CLI, 'script', '--like', oldPath, '--part', String(part)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return new AsyncFunction('figma', r.stdout)(figma);
  };
  const first = await emit(0);
  const parts = [first];
  for (let i = 1; i < first.parts; i++) parts.push(await emit(i));
  const curr = joinParts(parts);
  assert.deepEqual(curr.options, old.options);
  assert.equal(curr.scope.excludeScreens, 'News');
  assert.ok(compareScans(old, curr, {}).every((r) => r.status === 'open'));
  const clash = spawnSync(process.execPath, [CLI, 'script', '--like', oldPath, '--min-font', '10'], { encoding: 'utf8' });
  assert.equal(clash.status, 1);
  assert.match(clash.stderr, /--like sets --min-font/);
});

test('report refuses to run without the link check unless told it is a draft', async () => {
  const { scan } = await runScan();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-noexists-'));
  fs.writeFileSync(path.join(dir, 'scan.json'), JSON.stringify(scan));
  const base = [CLI, 'report', '--scan', path.join(dir, 'scan.json'), '--file-key', 'K'];
  const r = spawnSync(process.execPath, base, { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing --exists/);
  const draft = spawnSync(process.execPath, [...base, '--unchecked-links'], { encoding: 'utf8' });
  assert.equal(draft.status, 0, draft.stderr);
});

test('an empty --frames is refused instead of scanning the whole page', () => {
  const r = spawnSync(process.execPath, [CLI, 'script', '--page', '1:1', '--frames', ''], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--frames is empty/);
});

test('layer names cannot inject a link or an image into the doc', async () => {
  const { scan } = await runScan();
  const evil = '![x](https://e.test/p.png) [click](https://evil.test) www.evil.test';
  const f = scan.findings.find((x) => x.groups[0].examples.length);
  f.groups[0].name = evil;
  f.groups[0].examples[0].path = evil;
  const md = renderReport(scan, { fileKey: 'K' });
  // Lenient parsers render "!\[x\](url)" inside link text as an image, so the parenthesis and
  // the bang must be escaped too, and a bare URL must not auto-link.
  assert.ok(!/(?<!\\)\(https?:\/\/(?:e|evil)\.test/.test(md), 'no unescaped ( before an injected URL');
  assert.ok(!/(?<!\\)!(?:\\)?\[x/.test(md), 'no unescaped ! before the injected image');
  assert.ok(!md.includes('https://e.test') && !md.includes('https://evil.test') && !md.includes('www.evil'), 'no bare injected URL to auto-link');
});

test('script --like on an old scan without its repeat count asks for it', async () => {
  const { scan: old } = await runScan({ fonts: ['Brand Sans'] });
  delete old.options.repeatMin;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-like-old-'));
  const oldPath = path.join(dir, 'old.json');
  fs.writeFileSync(oldPath, JSON.stringify(old));
  const r = spawnSync(process.execPath, [CLI, 'script', '--like', oldPath], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /does not record its --repeat-min/);
  const ok = spawnSync(process.execPath, [CLI, 'script', '--like', oldPath, '--repeat-min', '2'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /"repeatMin":2/);
  const bare = spawnSync(process.execPath, [CLI, 'script', '--like'], { encoding: 'utf8' });
  assert.match(bare.stderr, /--like needs the path/);
});

test('an earlier scan with no brand fonts can still be rechecked', async () => {
  const { scan: old } = await runScan({ fonts: [] });
  assert.deepEqual(old.options.fonts, []);
  assert.match(finding(old, 'off-brand-font').title, /\(none set\)/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-like-empty-'));
  const oldPath = path.join(dir, 'old.json');
  fs.writeFileSync(oldPath, JSON.stringify(old));
  const { figma } = makeFile();
  const r = spawnSync(process.execPath, [CLI, 'script', '--like', oldPath], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const first = await new AsyncFunction('figma', r.stdout)(figma);
  assert.equal(first.parts, 1);
  assert.doesNotThrow(() => compareScans(old, joinParts([first]), {}));
});

test('the exists check treats a removed node as missing', async () => {
  const { figma, nodes } = makeFile();
  nodes.get('2:21').removed = true;
  const r = await new AsyncFunction('figma', buildExistsScript(['2:20', '2:21'], 0, 1))(figma);
  assert.deepEqual(r.missing, ['2:21']);
});

test('annotate-all skips a screen with no bounds and still writes the rest', { skip: !hasMagick && 'needs ImageMagick 7' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-all-'));
  const renders = path.join(dir, 'renders');
  fs.mkdirSync(renders);
  execFileSync('magick', ['-size', '390x800', 'xc:#eeeeee', path.join(renders, '2-1.png')]);
  const box = { x: 20, y: 150, w: 73, h: 14 };
  const plan = [
    { key: '1-a-000000', screenId: '2:1', screenName: 'Home', screenBbox: null, boxes: [box], caption: '#1' },
    { key: '2-b-000000', screenId: '2:1', screenName: 'Home', screenBbox: { x: 0, y: 0, w: 390, h: 800 }, boxes: [box], caption: '#2' },
  ];
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan));
  const r = spawnSync(process.execPath, [CLI, 'annotate-all', '--plan', path.join(dir, 'plan.json'), '--renders', renders, '--out', path.join(dir, 'out')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.wrote.length, 1);
  assert.equal(out.failed[0].key, '1-a-000000');
  assert.ok(fs.existsSync(path.join(dir, 'out', '2-b-000000.png')));
});

test('a caption with an ImageMagick expression renders literally', { skip: !hasMagick && 'needs ImageMagick 7' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-audit-fx-'));
  const png = path.join(dir, 's.png');
  execFileSync('magick', ['-size', '390x800', 'xc:#eeeeee', png]);
  const shot = (caption) => {
    const out = path.join(dir, fnvName(caption) + '.png');
    annotate({ png, screen: { x: 0, y: 0, w: 390, h: 800 }, boxes: [{ x: 20, y: 150, w: 73, h: 14 }], caption, out });
    return fs.readFileSync(out);
  };
  assert.ok(!shot('#1 %[fx:6*7]').equals(shot('#1 42')), 'the expression was not evaluated');
});
const fnvName = (s) => Buffer.from(s).toString('hex');
