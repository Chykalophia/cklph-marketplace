// figma-audit-rules.mjs: the Figma audit's rules, grouping and recheck diff.
//
// Pure JavaScript with no imports and no Figma API, so it runs in two places:
// figma-audit.mjs pastes it (minus the `export` keywords) into the use_figma
// scan, and the tests import it directly. Keep it free of imports for that reason.
//
// The Figma side turns every node into a plain "fact" and calls audit.visit(fact):
//   { id, name, type, visible, x, y, w, h, bbox: {x,y,w,h} | null,
//     screen: {id,name} | null, section: {id,name} | null, path: [names], ancestorIds: [ids],
//     isScreen, parentIsScreen,
//     via: {id, name, remote, copyId, instanceId} | null  // nearest component and its instance; instanceId is the outermost
//     text: {chars, segments: [{family, size, textStyleId, fills, fillStyled}]} | null,
//     fills: [paint], fillStyled, strokes: [paint], strokeStyled,
//       paint = {type, visible, hex, opacity, bound}
//     missingFont, detachedFrom: name | null, layoutMode,
//     inferredLayout: 'HORIZONTAL' | 'VERTICAL' | 'GRID' | 'NONE' | null (null: Figma gave no answer),
//     visibleChildren, childNames: [names], main: {id, name, setName, pageName} | null,
//     sizingH, sizingV: 'FIXED' | 'HUG' | 'FILL' | null, parentAuto: parent uses auto layout,
//     varIds: [variable ids bound on the node or its paints] }

export const SEVERITIES = [
  { id: 'must', label: '🔴 Must fix before dev starts' },
  { id: 'system', label: '🟠 Design system cleanup' },
  { id: 'house', label: '🟡 Housekeeping' },
];

export const RULES = {
  'placeholder-content': { sev: 'must', title: 'Placeholder or lorem ipsum content', fix: 'Replace it with final copy or the approved image. If the frame is a template, label it as one.' },
  'small-text': { sev: 'must', title: 'Text smaller than {minFont}px', fix: 'Use {minFont}px or larger, through a text style.' },
  'missing-font': { sev: 'must', title: 'Font missing from the file', fix: 'Install the font or swap to a brand font. Dev cannot match a font Figma cannot render.' },
  'wireframe-leftover': { sev: 'must', title: 'Wireframe component left in the design', fix: 'Swap it for the hi-fi component. If it is hidden, delete it.' },
  'off-brand-font': { sev: 'system', title: 'Font outside the brand set ({fonts})', fix: 'Swap to a brand font through the matching text style. Every extra font is another font load and more custom CSS.' },
  'no-text-style': { sev: 'system', title: 'Text without a text style', fix: 'Apply the matching text style. Fix components first: one fix there covers every copy.' },
  'raw-color': { sev: 'system', title: 'Hardcoded color instead of a variable', fix: 'Bind it to the matching color variable.' },
  'detached-instance': { sev: 'system', title: 'Detached from its component', fix: 'Swap it back to an instance of the component, or make it a new component on purpose.' },
  'no-auto-layout': { sev: 'system', title: 'Frame without auto layout', fix: 'If the layers stack or sit in a row, turn on auto layout (Shift+A) so the spacing matches how dev builds it. Layers that overlap on purpose, like an image under an overlay, can stay.' },
  'repeated-frame': { sev: 'system', title: 'Same frame copied onto several screens, not a component', fix: 'Make it a component and swap the copies for instances.' },
  'unused-collection': { sev: 'system', title: 'Variable collection with no bindings on this page', fix: 'Pick one set. Check the other pages, then delete the unused collection or move the bindings to it. Tell dev which set is correct.' },
  'unused-text-style': { sev: 'system', title: 'Text style not used on this page', fix: 'Check the other pages, then delete it or merge it into the set in use.' },
  'hidden-layer': { sev: 'house', title: 'Hidden layer', fix: 'Delete it if it is junk. If it is a real state, name it, e.g. "button / hover".' },
  'default-name': { sev: 'house', title: 'Default layer name', fix: 'Name sections and cards at least, e.g. "hero" or "service-card".' },
  'group-layer': { sev: 'house', title: 'Group instead of a frame', fix: 'Turn it into a frame, with auto layout where it fits.' },
  'fractional-size': { sev: 'house', title: 'Half-pixel position or size', fix: 'Round to whole pixels.' },
  'stacked-duplicate': { sev: 'house', title: 'Two copies of one component on a screen', fix: 'If the second copy is a state (e.g. sticky), name it so. If not, delete it.' },
};

// Rules a designer fixes once in the main component, so hits inside instances group by component.
const COMPONENT_SCOPED = new Set(['small-text', 'missing-font', 'off-brand-font', 'no-text-style', 'raw-color']);
// Rules about structure the instance inherits; inside an instance they are the component's business.
const SKIP_INSIDE_INSTANCE = new Set(['hidden-layer', 'default-name', 'group-layer', 'fractional-size', 'no-auto-layout', 'detached-instance', 'wireframe-leftover']);

export const DEFAULTS = {
  minFont: 12,
  fonts: null,
  fontShare: 0.1,
  maxGroups: 20,
  maxExamples: 3,
  repeatMin: 3,
  exceptions: [],
  // 'summary' reports unused text styles as one row; 'full' lists each (for the design-system page).
  unusedStyles: 'summary',
  placeholder: /lorem ipsum|placeholder|\[[^\]]*(?:tbd|todo|copy|text|image)[^\]]*\]|\bTBD\b/i,
  wireframe: /wire ?frame|lo-?fi|\bwf\b/i,
  defaultName: /^(?:Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Image|Union|Subtract|Intersect|Exclude|Component|Instance)(?: \d+)?$/,
};

const FRACTION_TYPES = new Set(['FRAME', 'RECTANGLE', 'INSTANCE', 'COMPONENT', 'GROUP', 'ELLIPSE', 'LINE']);
// Shapes inside icons keep names like "Vector"; renaming those helps nobody.
const NAMED_TYPES = new Set(['FRAME', 'GROUP', 'COMPONENT', 'RECTANGLE', 'SECTION']);

// A frame copied by hand keeps its name, size and children; a reused generic name does not.
const frameSignature = (f) => [f.name, Math.round(f.w), Math.round(f.h), (f.childNames || []).join(',')].join('|');

/** FNV-1a over UTF-16 code units, as hex. The scan and join both use it to prove a copied result is intact. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** UTF-8 length of a string, the unit use_figma's return limit is counted in. */
export function utf8Length(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/**
 * Splits str into [start, end) ranges whose JSON-escaped form stays under maxBytes of UTF-8.
 * Deterministic, so every rerun of the scan cuts the same parts. Never splits a surrogate pair.
 */
export function chunkBounds(str, maxBytes) {
  const out = [];
  let start = 0;
  while (start < str.length || out.length === 0) {
    let len = Math.min(str.length - start, maxBytes);
    const fits = (l) => utf8Length(JSON.stringify(str.slice(start, start + l))) <= maxBytes;
    while (len > 1 && !fits(len)) len = Math.floor(len * 0.9);
    const last = str.charCodeAt(start + len - 1);
    if (len > 1 && start + len < str.length && last >= 0xd800 && last <= 0xdbff) len--;
    out.push([start, start + len]);
    start += len;
    if (len === 0) break;
  }
  return out;
}

/**
 * The scan result in its wire form: everything join can rebuild is left out (titles and fixes,
 * group keys, screen names, the screen at the start of each layer path, nulls), because every
 * byte returned from use_figma is copied by hand. expandScan is its exact inverse.
 */
export function compactScan(r) {
  const screens = (r.scope && r.scope.screens) || {};
  const box = (b) => (b ? [b.x, b.y, b.w, b.h] : undefined);
  const findings = r.findings.map((f) => ({
    r: f.rule, t: f.total, n: f.groupCount,
    i: Object.fromEntries(Object.entries(f.index).map(([k, n]) => [k.slice(f.rule.length + 1), n])),
    g: f.groups.map((g) => {
      const w = { k: g.kind, id: g.id, nm: g.name, c: g.count };
      const key = f.rule + '|' + g.kind + '|' + g.id + (g.family ? '|' + g.family : '');
      if (g.key !== key) w.K = g.key;
      if (g.screen) {
        if (screens[g.screen.id] && screens[g.screen.id].name === g.screen.name) w.s = g.screen.id;
        else w.S = g.screen;
      }
      if (g.family) w.f = g.family;
      if (g.remote) w.rm = 1;
      if (g.deleted) w.dl = 1;
      if (g.layers !== undefined) w.ly = g.layers;
      if (g.copies !== undefined) w.cp = g.copies;
      if (g.values.length) w.v = g.values;
      if (g.examples.length) {
        w.x = g.examples.map((e) => {
          const x = { id: e.id };
          const pre = e.screenId && screens[e.screenId] ? screens[e.screenId].name + ' › ' : null;
          if (pre && e.path.startsWith(pre)) x.p = e.path.slice(pre.length);
          else x.P = e.path;
          if (e.value != null) x.v = e.value;
          if (e.bbox) x.b = box(e.bbox);
          if (e.screenId) x.s = e.screenId;
          if (e.layerId) x.l = e.layerId;
          return x;
        });
      }
      return w;
    }),
  }));
  const out = { w: 1, version: r.version, options: r.options, counts: r.counts, findings };
  for (const k of ['ignored', 'ignoredDetail', 'hiddenKeys', 'scope']) if (r[k]) out[k] = r[k];
  return out;
}

/** Rebuilds the full scan from compactScan's wire form; a full scan passes through as is. */
export function expandScan(w) {
  if (!w || w.w !== 1) return w;
  const screens = (w.scope && w.scope.screens) || {};
  const findings = w.findings.map((f) => {
    const def = RULES[f.r];
    if (!def) throw new Error('unknown rule in scan: ' + f.r);
    return {
      rule: f.r,
      sev: def.sev,
      title: fillTemplate(def.title, w.options),
      fix: fillTemplate(def.fix, w.options),
      total: f.t,
      groupCount: f.n,
      index: Object.fromEntries(Object.entries(f.i).map(([k, n]) => [f.r + '|' + k, n])),
      groups: f.g.map((g) => {
        const family = g.f || null;
        const out = {
          key: g.K || f.r + '|' + g.k + '|' + g.id + (family ? '|' + family : ''),
          kind: g.k, id: g.id, name: g.nm,
          screen: g.s ? { id: g.s, name: screens[g.s].name } : g.S || null,
          family, count: g.c,
        };
        if (g.rm) out.remote = true;
        if (g.dl) out.deleted = true;
        if (g.ly !== undefined) out.layers = g.ly;
        if (g.cp !== undefined) out.copies = g.cp;
        out.values = g.v || [];
        out.examples = (g.x || []).map((x) => {
          const e = { id: x.id, path: x.P != null ? x.P : screens[x.s].name + ' › ' + x.p, value: x.v != null ? x.v : null, bbox: x.b ? { x: x.b[0], y: x.b[1], w: x.b[2], h: x.b[3] } : null, screenId: x.s || null };
          if (x.l) e.layerId = x.l;
          return e;
        });
        return out;
      }),
    };
  });
  const out = { version: w.version, options: w.options, counts: w.counts };
  if (w.ignored) out.ignored = w.ignored;
  out.findings = findings;
  for (const k of ['ignoredDetail', 'hiddenKeys', 'scope']) if (w[k]) out[k] = w[k];
  return out;
}

const roundBox = (b) => (b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } : null);

// Icon internals: renaming, regrouping or auto-laying-out a 20px glyph helps nobody.
const ICON_MAX = 48;
const isIconSized = (f) => typeof f.w === 'number' && f.w <= ICON_MAX && f.h <= ICON_MAX;

/**
 * Fractional values a designer set by hand. Auto layout computes positions inside it and
 * FILL or HUG sizes (three FILL cards in 1216px are 405.33 each), so those are not errors.
 */
export function handSetFractions(f) {
  const out = [];
  if (!f.parentAuto) { if (isFraction(f.x)) out.push(f.x); if (isFraction(f.y)) out.push(f.y); }
  if ((f.sizingH == null || f.sizingH === 'FIXED') && isFraction(f.w)) out.push(f.w);
  if ((f.sizingV == null || f.sizingV === 'FIXED') && isFraction(f.h)) out.push(f.h);
  return out;
}

const isFraction = (v) => typeof v === 'number' && Math.abs(v - Math.round(v)) > 0.01;
const rawPaint = (p) => p && p.type === 'SOLID' && p.visible !== false && (p.opacity == null || p.opacity > 0) && !p.bound;

// Kinds an exception line can name, and the rules a kind applies to when the line names none.
const EXCEPTION_KINDS = {
  any: null, rule: null, text: null, layer: null, screen: null, component: null,
  font: ['off-brand-font'], color: ['raw-color'], style: ['unused-text-style'], collection: ['unused-collection'],
};
const EXCEPTION_LINE = /^(?:ignore|allow|skip)\s*(?:(rule|text|layer|screen|component|font|colou?r|style|collection)s?)?\s*:\s*(.+)$/i;

/**
 * Parses an exceptions list, one per line: "ignore <kind>: <pattern>", optionally followed by
 * " for <rule>, <rule>" and " because <note>". Kinds: rule, text, layer, screen, component,
 * font, color, style, collection; with no kind the pattern is matched against text, layer
 * path and component. A /pattern/ is a case-insensitive regex, anything else a substring.
 * List markers, checkboxes, headings and blank lines are skipped. Returns { exceptions,
 * unparsed }; unparsed lines are prose for the agent to turn into ignore lines.
 */
export function parseExceptions(text) {
  const exceptions = [];
  const unparsed = [];
  for (const raw of String(text == null ? '' : text).split(/\r?\n/)) {
    let line = raw.trim();
    for (let prev = null; prev !== line;) { prev = line; line = line.replace(/^(?:[-*•+]|\d+[.)]|\[[ xX]?\])\s*/, ''); }
    if (!line || /^#{1,6}\s|^#{1,6}$|^<!--|^-{3,}$|^={3,}$/.test(line)) continue;
    const m = line.match(EXCEPTION_LINE);
    if (!m) { unparsed.push(raw.trim()); continue; }
    const kind = (m[1] || 'any').toLowerCase().replace('colour', 'color');
    const body = m[2].trim();
    // A quoted pattern is taken literally, so copy like "We exist because you matter" keeps its
    // "because"; only what follows the closing quote is read as " for ..." and " because ...".
    // Docs and ClickUp turn straight quotes into curly ones, so those count as quotes too.
    const quoted = body.match(/^(["'`“‘«„])(.+?)(["'`”’»“])(?=\s|$)(.*)$/);
    let rest = quoted ? quoted[4] : body;
    let note = null;
    const because = rest.match(/(?:^|\s+)because\s+(.+)$/i);
    if (because) { note = because[1].trim(); rest = rest.slice(0, because.index); }
    let rules = null;
    const scope = rest.match(/(?:^|\s+)for\s+([a-z-]+(?:\s*,\s*[a-z-]+)*)\s*$/i);
    if (scope) {
      const ids = scope[1].split(',').map((s) => s.trim().toLowerCase());
      if (ids.every((id) => RULES[id])) { rules = ids; rest = rest.slice(0, scope.index); }
    }
    if (quoted && rest.trim()) { unparsed.push(raw.trim()); continue; }
    let pattern = quoted ? quoted[2] : rest.trim();
    let re = false;
    if (kind === 'rule') {
      const ids = pattern.split(',').map((s) => s.trim().toLowerCase());
      if (!ids.every((id) => RULES[id])) { unparsed.push(raw.trim()); continue; }
      exceptions.push({ kind, pattern: null, re: false, rules: ids, note, line });
      continue;
    }
    const rx = quoted ? null : pattern.match(/^\/(.+)\/i?$/);
    if (rx) {
      // A repeated group such as (a+)+ or (a|aa)+ can backtrack for minutes and hang use_figma,
      // and nesting hides it from any simple check, so no group may be repeated at all.
      if (rx[1].length > 200 || /\)\s*[+*?{]/.test(rx[1])) { unparsed.push(raw.trim()); continue; }
      try { new RegExp(rx[1], 'i'); } catch (e) { unparsed.push(raw.trim()); continue; }
      pattern = rx[1];
      re = true;
    }
    // One or two letters match nearly every layer, which hides real problems.
    if (!pattern || (!re && pattern.replace(/\s+/g, '').length < 3)) { unparsed.push(raw.trim()); continue; }
    exceptions.push({ kind, pattern, re, rules: rules || (EXCEPTION_KINDS[kind] ? EXCEPTION_KINDS[kind].slice() : null), note, line });
  }
  return { exceptions, unparsed };
}

const exceptionShape = (list) => JSON.stringify((list || []).map((e) => [e.kind, e.pattern, !!e.re, (e.rules || []).slice().sort()]));

// Three ways to match: names by substring, text content also with spacing removed, and fonts
// by the whole family name ("Inter" must not hide "Inter Tight").
function patternTest(e) {
  if (e.pattern == null) {
    const all = () => true;
    return { name: all, text: all, exact: all };
  }
  if (e.re) {
    const r = new RegExp(e.pattern, 'i');
    const f = (s) => s != null && r.test(String(s));
    return { name: f, text: f, exact: f };
  }
  const p = String(e.pattern).toLowerCase();
  const squeezed = p.replace(/\s+/g, '');
  const name = (s) => s != null && String(s).toLowerCase().includes(p);
  // Designers fake letter-spacing with spaces ("C H Y K A L O P H I A"). Squeezing joins words
  // too ("Join a Venture" holds "nav"), so only a long pattern is compared without spaces.
  const text = (s) => {
    if (s == null) return false;
    const v = String(s).toLowerCase();
    return v.includes(p) || (squeezed.length >= 8 && v.replace(/\s+/g, '').includes(squeezed));
  };
  const exact = (s) => s != null && String(s).toLowerCase() === p;
  return { name, text, exact };
}

/** Cuts s to at most n UTF-16 units without splitting a surrogate pair, which would not survive JSON transport. */
export function cutText(s, n) {
  const t = String(s);
  if (t.length <= n) return t;
  const c = t.charCodeAt(n - 1);
  return t.slice(0, c >= 0xd800 && c <= 0xdbff ? n - 1 : n);
}

/** Scan format version. Bump it whenever a rule's meaning changes, so a recheck never diffs two rule sets. */
export const SCAN_VERSION = 2;

/** Fills {minFont} and {fonts} in a rule's title or fix text. */
export function fillTemplate(text, opts) {
  return text
    .replace(/\{minFont\}/g, String(opts.minFont))
    .replace(/\{fonts\}/g, opts.fonts && opts.fonts.length ? opts.fonts.join(', ') : opts.fontsInferred === false ? 'none set' : 'inferred from usage');
}

/**
 * Starts an audit. Call visit(fact) for every node in walk order, then finish(file)
 * once. finish returns the result the report, the screenshot plan and the recheck read.
 */
export function createAudit(options) {
  const o = { ...DEFAULTS, ...(options || {}) };
  const groups = new Map();
  const framesByName = new Map();
  const instancesByScreen = new Map();
  const familyCounts = new Map();
  const variableUses = new Map();
  const styleUses = new Map();
  // The CLI sends the raw lines, which are shorter than parsed objects in the use_figma script.
  const parsed = o.exceptionLines ? parseExceptions(o.exceptionLines.join('\n')).exceptions : (o.exceptions || []);
  const exceptions = parsed.map((e) => ({ ...e, test: patternTest(e) }));
  const exceptionHits = exceptions.map(() => 0);
  const exceptionRules = exceptions.map(() => ({}));
  const exceptionMatched = exceptions.map(() => false);
  // Group keys an exception hid, so a recheck can tell "now hidden" from "fixed".
  const hiddenKeys = {};
  // Off-brand hits are only known after the brand set is settled in finish, so skips wait here.
  const fontSkips = new Map();
  const ignoredFrames = new Map();
  let nodes = 0;
  let texts = 0;

  function hide(ix, rule, key, n) {
    exceptionHits[ix] += n;
    exceptionRules[ix][rule] = (exceptionRules[ix][rule] || 0) + n;
    hiddenKeys[key] = (hiddenKeys[key] || 0) + n;
  }

  // Returns the first exception that matches, and marks every one that does, so a line that a
  // line above already covers is not reported as matching nothing.
  function exceptionFor(rule, fact, value, family) {
    const text = fact.text ? fact.text.chars : fact.hiddenChars || null;
    const comps = (fact.via ? [fact.via.name] : []).concat(fact.main ? [fact.main.name, fact.main.setName] : []);
    // The screen name is the screen kind's job; on the path it would let a layer pattern hide a
    // whole screen whose name happens to contain it.
    const path = (fact.path || []).slice(fact.screen || fact.isScreen ? 1 : 0);
    const families = family ? [family] : fact.text ? (fact.text.segments || []).map((s) => s.family) : [];
    // For a hardcoded color the flagged paint is the one to match; another paint on the same
    // layer (a white stroke, say) must not hide it. Other rules look at every paint.
    const colors = rule === 'raw-color' ? [String(value).replace(/ border$/, '')] : (fact.fills || []).concat(fact.strokes || []).map((p) => p.hex);
    let first = -1;
    for (let i = 0; i < exceptions.length; i++) {
      const e = exceptions[i];
      if (e.rules && !e.rules.includes(rule)) continue;
      const t = e.test;
      let ok = false;
      if (e.kind === 'rule') ok = true;
      else if (e.kind === 'text') ok = t.text(text);
      else if (e.kind === 'layer') ok = path.some(t.name);
      else if (e.kind === 'screen') ok = t.name(fact.screen ? fact.screen.name : fact.isScreen ? fact.name : null);
      else if (e.kind === 'component') ok = comps.some(t.name);
      else if (e.kind === 'font') ok = families.some(t.exact);
      else if (e.kind === 'color') ok = colors.some(t.name);
      else if (e.kind === 'any') ok = t.text(text) || path.some(t.name) || comps.some(t.name);
      if (ok) {
        exceptionMatched[i] = true;
        if (first < 0) first = i;
      }
    }
    return first;
  }

  function fileExceptionFor(rule, name) {
    let first = -1;
    for (let i = 0; i < exceptions.length; i++) {
      const e = exceptions[i];
      if (e.rules && !e.rules.includes(rule)) continue;
      if (e.kind === 'rule' || (['style', 'collection', 'any'].includes(e.kind) && e.test.name(name))) {
        exceptionMatched[i] = true;
        if (first < 0) first = i;
      }
    }
    return first;
  }

  function target(rule, fact) {
    if (fact.via && COMPONENT_SCOPED.has(rule)) {
      return { kind: 'component', id: fact.via.id, name: fact.via.name, screen: null, remote: !!fact.via.remote, deleted: !!fact.via.deleted };
    }
    const sec = fact.section || (fact.isScreen ? null : { id: fact.id, name: fact.name });
    if (!sec) return { kind: 'screen', id: fact.id, name: fact.name, screen: { id: fact.id, name: fact.name } };
    return { kind: 'section', id: sec.id, name: sec.name, screen: fact.screen };
  }

  function hit(rule, fact, value, family) {
    const t = target(rule, fact);
    const key = rule + '|' + t.kind + '|' + t.id + (family ? '|' + family : '');
    const ix = exceptionFor(rule, fact, value, family);
    if (ix >= 0) {
      if (rule === 'off-brand-font') {
        const k = ix + '\u0000' + family + '\u0000' + key;
        fontSkips.set(k, (fontSkips.get(k) || 0) + 1);
      } else hide(ix, rule, key, 1);
      return;
    }
    let g = groups.get(key);
    if (!g) {
      g = { key, rule, kind: t.kind, id: t.id, name: t.name, screen: t.screen, remote: !!t.remote, deleted: !!t.deleted, family: family || null, count: 0, layers: new Set(), copies: new Set(), values: new Map(), examples: [] };
      groups.set(key, g);
    }
    g.count++;
    if (fact.via) { g.copies.add(fact.via.copyId || fact.via.instanceId); g.layers.add(fact.path.slice(-2).join('/')); }
    if (value != null) g.values.set(String(value), (g.values.get(String(value)) || 0) + 1);
    const exId = fact.via ? fact.via.instanceId : fact.id;
    if (g.examples.length < o.maxExamples && !g.examples.some((e) => e.id === exId)) {
      const ex = { id: exId, path: fact.path.join(' › '), value: value == null ? null : cutText(value, 60), bbox: roundBox(fact.bbox), screenId: fact.screen ? fact.screen.id : null };
      if (fact.id !== exId) ex.layerId = fact.id;
      g.examples.push(ex);
    }
  }

  function visit(fact) {
    nodes++;
    for (const id of fact.varIds || []) variableUses.set(id, (variableUses.get(id) || 0) + 1);
    const inside = !!fact.via;
    const can = (rule) => !(inside && SKIP_INSIDE_INSTANCE.has(rule));

    if (fact.visible === false) {
      if (can('hidden-layer')) hit('hidden-layer', fact, fact.zeroOpacity ? fact.type + ', 0% opacity' : fact.type);
      return;
    }

    if (fact.text) {
      texts++;
      const segs = fact.text.segments || [];
      const chars = fact.text.chars || '';
      // Inside a component a layer named "Placeholder" is usually an input's hint text, so only content counts there.
      if (o.placeholder.test(chars) || (!inside && o.placeholder.test(fact.name))) hit('placeholder-content', fact, cutText(chars, 60));
      const small = segs.find((s) => typeof s.size === 'number' && s.size < o.minFont);
      if (small) hit('small-text', fact, small.size + 'px');
      if (fact.missingFont) hit('missing-font', fact, segs.map((s) => s.family).join(', '));
      if (segs.some((s) => !s.textStyleId)) hit('no-text-style', fact, null);
      for (const s of segs) if (s.textStyleId) styleUses.set(s.textStyleId, (styleUses.get(s.textStyleId) || 0) + 1);
      const families = [...new Set(segs.map((s) => s.family).filter(Boolean))];
      for (const fam of families) {
        familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
        hit('off-brand-font', fact, fam, fam);
      }
      const rawText = segs.find((s) => !s.fillStyled && (s.fills || []).some(rawPaint));
      if (rawText) hit('raw-color', fact, (rawText.fills || []).find(rawPaint).hex);
    }

    if (!fact.text && !fact.fillStyled) {
      const p = (fact.fills || []).find(rawPaint);
      if (p) hit('raw-color', fact, p.hex);
    }
    if (!fact.strokeStyled) {
      const p = (fact.strokes || []).find(rawPaint);
      if (p) hit('raw-color', fact, p.hex + ' border');
    }

    if (fact.type === 'INSTANCE' && fact.main && can('wireframe-leftover')) {
      const m = fact.main;
      if ([m.name, m.setName, m.pageName].some((s) => s && o.wireframe.test(s))) hit('wireframe-leftover', fact, m.setName || m.name);
    }
    if (fact.detachedFrom && can('detached-instance')) hit('detached-instance', fact, fact.detachedFrom);
    const icon = isIconSized(fact);
    if (fact.type === 'FRAME' && !fact.isScreen && !icon && fact.layoutMode === 'NONE' && fact.visibleChildren >= 2 && fact.inferredLayout !== 'NONE' && can('no-auto-layout')) {
      hit('no-auto-layout', fact, fact.inferredLayout ? 'fits ' + fact.inferredLayout.toLowerCase() : fact.visibleChildren + ' layers');
    }
    if (!fact.isScreen && !icon && NAMED_TYPES.has(fact.type) && o.defaultName.test(fact.name || '') && can('default-name')) hit('default-name', fact, fact.name);
    if (fact.type === 'GROUP' && !icon && can('group-layer')) hit('group-layer', fact, null);
    if (FRACTION_TYPES.has(fact.type) && !fact.isScreen && !icon && can('fractional-size')) {
      const fr = handSetFractions(fact);
      if (fr.length) hit('fractional-size', fact, fr.map((v) => Math.round(v * 100) / 100).join(', '));
    }

    if (!inside && fact.type === 'FRAME' && !fact.isScreen && fact.visibleChildren >= 2 && fact.screen && !o.defaultName.test(fact.name || '')) {
      const sig = frameSignature(fact);
      let e = framesByName.get(sig);
      if (!e) { e = new Map(); framesByName.set(sig, e); }
      if (!e.has(fact.screen.id)) {
        e.set(fact.screen.id, fact);
        const ix = exceptionFor('repeated-frame', fact, null, null);
        if (ix >= 0) ignoredFrames.set(fact.id, ix);
      }
    }
    if (!inside && fact.type === 'INSTANCE' && fact.parentIsScreen && fact.main && fact.screen) {
      const k = fact.screen.id + '|' + fact.main.id;
      const list = instancesByScreen.get(k) || [];
      list.push(fact);
      instancesByScreen.set(k, list);
    }
  }

  function finish(file) {
    const f = file || {};
    // An explicit list, even an empty one from an earlier scan, is never re-inferred.
    let fonts = Array.isArray(o.fonts) ? o.fonts : null;
    const fontsInferred = !fonts;
    if (!fonts) {
      const total = [...familyCounts.values()].reduce((a, b) => a + b, 0) || 1;
      fonts = [...familyCounts.entries()].filter(([, n]) => n / total >= o.fontShare).map(([fam]) => fam);
    }
    const brand = new Set(fonts.map((x) => x.toLowerCase()));
    for (const [key, g] of groups) if (g.rule === 'off-brand-font' && brand.has(String(g.family).toLowerCase())) groups.delete(key);
    for (const [k, n] of fontSkips) {
      const [ix, family, key] = k.split('\u0000');
      if (!brand.has(family.toLowerCase())) hide(Number(ix), 'off-brand-font', key, n);
    }

    // A frame an exception covers still counts toward the repeat, so ignoring one copy does not
    // hide the others; it is only left out of the report.
    const repeated = [];
    const repeatedIds = new Set();
    for (const [, byScreen] of framesByName) {
      if (byScreen.size < o.repeatMin) continue;
      repeated.push([...byScreen.values()]);
      for (const x of byScreen.values()) repeatedIds.add(x.id);
    }
    // Detection needs name, size and children to match; the key is the name alone, so a 1px
    // resize between audits still reads as the same finding in a recheck.
    const byName = new Map();
    const hiddenByName = new Map();
    for (const facts of repeated) {
      // A frame inside a repeated frame repeats with it; report the outer one only. Copies an
      // exception covers are counted here, after the fold, so a nested frame is not counted twice.
      if (facts.every((x) => (x.ancestorIds || []).some((id) => repeatedIds.has(id)))) continue;
      const name = facts[0].name;
      const merged = byName.get(name) || new Map();
      const hidden = hiddenByName.get(name) || new Map();
      for (const x of facts) {
        if (ignoredFrames.has(x.id)) { if (!hidden.has(x.screen.id)) hidden.set(x.screen.id, ignoredFrames.get(x.id)); }
        else if (!merged.has(x.screen.id)) merged.set(x.screen.id, x);
      }
      byName.set(name, merged);
      hiddenByName.set(name, hidden);
    }
    for (const [name, hidden] of hiddenByName) {
      for (const ix of hidden.values()) hide(ix, 'repeated-frame', 'repeated-frame|name|' + name, 1);
    }
    for (const [name, merged] of byName) {
      if (!merged.size) continue;
      const facts = [...merged.values()];
      const key = 'repeated-frame|name|' + name;
      groups.set(key, {
        key, rule: 'repeated-frame', kind: 'name', id: facts[0].id, name, screen: null, family: null,
        count: facts.length, layers: new Set(), copies: new Set(), values: new Map([[facts.length + ' screens', 1]]),
        examples: facts.slice(0, o.maxExamples).map((x) => ({ id: x.id, path: x.path.join(' › '), value: null, bbox: roundBox(x.bbox), screenId: x.screen.id })),
      });
    }
    for (const list of instancesByScreen.values()) {
      for (const dup of list.slice(1)) hit('stacked-duplicate', dup, dup.main.setName || dup.main.name);
    }

    const collections = f.collections || [];
    const bindings = new Map(collections.map((c) => [c.id, 0]));
    for (const [varId, n] of variableUses) {
      const cid = (f.variableCollectionOf || {})[varId];
      if (bindings.has(cid)) bindings.set(cid, bindings.get(cid) + n);
    }
    const anyBound = [...bindings.values()].some((n) => n > 0);
    const fileFindings = [];
    if (anyBound) {
      for (const c of collections) {
        if (bindings.get(c.id) !== 0) continue;
        const ix = fileExceptionFor('unused-collection', c.name);
        if (ix >= 0) { hide(ix, 'unused-collection', 'unused-collection|file|' + c.id, 1); continue; }
        fileFindings.push({ rule: 'unused-collection', id: c.id, name: c.name, value: c.variableCount + ' variables' });
      }
    }
    const unusedStyles = [];
    for (const s of f.textStyles || []) {
      if (styleUses.has(s.id)) continue;
      const ix = fileExceptionFor('unused-text-style', s.name);
      if (ix >= 0) { hide(ix, 'unused-text-style', 'unused-text-style|file|' + (o.unusedStyles === 'full' ? s.id : '*'), 1); continue; }
      unusedStyles.push(s);
    }
    if (o.unusedStyles === 'full') {
      for (const s of unusedStyles) fileFindings.push({ rule: 'unused-text-style', id: s.id, name: s.name, value: s.family || null });
    }
    const fileGroup = (rule, id, name, count, values) => ({ key: rule + '|file|' + id, rule, kind: 'file', id, name, screen: null, family: null, count, layers: new Set(), copies: new Set(), values, examples: [] });
    for (const ff of fileFindings) {
      const g = fileGroup(ff.rule, ff.id, ff.name, 1, new Map(ff.value ? [[ff.value, 1]] : []));
      groups.set(g.key, g);
    }
    // Text styles are file-wide, so most are used on some other page; one row with a count is
    // enough unless this is the page that holds the system.
    if (o.unusedStyles !== 'full' && unusedStyles.length) {
      const shown = unusedStyles.slice(0, 3).map((s) => s.name);
      const more = unusedStyles.length - shown.length;
      const name = unusedStyles.length + (unusedStyles.length === 1 ? ' text style' : ' text styles') + ', e.g. ' + shown.join(', ') + (more > 0 ? ' and ' + more + ' more' : '');
      const g = fileGroup('unused-text-style', '*', name, unusedStyles.length, new Map());
      groups.set(g.key, g);
    }

    const byRule = new Map();
    for (const g of groups.values()) {
      if (!byRule.has(g.rule)) byRule.set(g.rule, []);
      byRule.get(g.rule).push(g);
    }
    const sevOrder = SEVERITIES.map((s) => s.id);
    const findings = [...byRule.entries()].map(([rule, gs]) => {
      gs.sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));
      const def = RULES[rule];
      return {
        rule,
        sev: def.sev,
        title: fillTemplate(def.title, { minFont: o.minFont, fonts, fontsInferred }),
        fix: fillTemplate(def.fix, { minFont: o.minFont, fonts, fontsInferred }),
        total: gs.reduce((a, g) => a + g.count, 0),
        groupCount: gs.length,
        index: Object.fromEntries(gs.map((g) => [g.key, g.count])),
        groups: gs.slice(0, o.maxGroups).map((g) => ({
          key: g.key, kind: g.kind, id: g.id, name: g.name, screen: g.screen, family: g.family, count: g.count, remote: g.remote || undefined, deleted: g.deleted || undefined,
          layers: g.kind === 'component' ? g.layers.size : undefined,
          copies: g.kind === 'component' ? g.copies.size : undefined,
          values: [...g.values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
          examples: g.examples,
        })),
      };
    }).sort((a, b) => sevOrder.indexOf(a.sev) - sevOrder.indexOf(b.sev) || b.total - a.total);

    const out = {
      version: SCAN_VERSION,
      options: {
        minFont: o.minFont, fonts, fontsInferred, maxGroups: o.maxGroups, repeatMin: o.repeatMin,
        unusedStyles: o.unusedStyles,
        exceptions: exceptions.map((e) => ({ kind: e.kind, pattern: e.pattern, re: !!e.re, rules: e.rules || null, note: e.note || null, line: e.line || null })),
      },
      counts: { nodes, texts, families: Object.fromEntries(familyCounts), bindingsOnPage: anyBound },
      ignored: exceptionHits,
      findings,
    };
    if (exceptions.length) {
      out.ignoredDetail = exceptions.map((e, i) => ({ matched: exceptionMatched[i], rules: exceptionRules[i] }));
      out.hiddenKeys = hiddenKeys;
    }
    return out;
  }

  return { visit, finish };
}

const LINK_ID = /^\d+:\d+$/;

/**
 * The node a group's link opens, or null when there is nothing linkable. A copied frame links
 * its first copy, and a library component its first instance, since the library's main
 * component is not in this file.
 */
export function groupLink(g) {
  const id = g.kind === 'name' || (g.kind === 'component' && g.remote) ? g.examples[0] && g.examples[0].id : g.kind === 'file' ? null : g.id;
  return id && LINK_ID.test(id) ? id : null;
}

// For a group known only by its index key: sections and screens are nodes in the file; an
// unshown component may be a library main and a name is not an id, so neither is linkable.
function keyLink(key) {
  const [, kind, id] = key.split('|');
  return (kind === 'section' || kind === 'screen') && LINK_ID.test(id) ? id : null;
}

// A group beyond --max-groups has only its key, so name it from that.
function unlistedName(key) {
  const [, kind, ...rest] = key.split('|');
  const id = rest.join('|');
  if (kind === 'name') return id;
  return 'a ' + kind + ' not listed in the report (' + id + ')';
}

const sameList = (a, b) => JSON.stringify((a || []).map((x) => String(x).toLowerCase()).sort()) === JSON.stringify((b || []).map((x) => String(x).toLowerCase()).sort());

/**
 * Why two scans cannot be diffed, or null. A count that drops because the threshold, the
 * brand fonts or the scope changed is not a fix, so the recheck must reuse all of them.
 */
export function scanMismatch(prev, curr) {
  const po = prev.options || {};
  const co = curr.options || {};
  const out = [];
  if (prev.version != null && curr.version != null && prev.version !== curr.version) out.push('scanner version ' + prev.version + ' vs ' + curr.version);
  if (po.minFont !== co.minFont) out.push('--min-font ' + po.minFont + ' vs ' + co.minFont);
  if (!sameList(po.fonts, co.fonts)) out.push('brand fonts "' + (po.fonts || []).join(', ') + '" vs "' + (co.fonts || []).join(', ') + '"');
  if (po.repeatMin != null && co.repeatMin != null && po.repeatMin !== co.repeatMin) out.push('--repeat-min ' + po.repeatMin + ' vs ' + co.repeatMin);
  // A scan without these options listed every unused style and had no exceptions.
  if ((po.unusedStyles || 'full') !== (co.unusedStyles || 'full')) out.push('--unused-styles ' + (po.unusedStyles || 'full') + ' vs ' + (co.unusedStyles || 'full'));
  if (exceptionShape(po.exceptions) !== exceptionShape(co.exceptions)) out.push('exceptions');
  const ps = prev.scope;
  const cs = curr.scope;
  if (ps && cs) {
    if (ps.pageId !== cs.pageId) out.push('page ' + ps.pageId + ' vs ' + cs.pageId);
    if (!sameList(ps.frames, cs.frames)) out.push('--frames');
    if ((ps.excludeScreens || null) !== (cs.excludeScreens || null)) out.push('--exclude-screens');
  }
  return out.length ? out.join('; ') : null;
}

/**
 * Diffs two scans of the same scope and options; throws when they differ (see scanMismatch).
 * exists maps node ids from the previous scan to whether they still exist, so a group that
 * vanished can read "removed" rather than "fixed".
 */
export function compareScans(prev, curr, exists) {
  const mismatch = scanMismatch(prev, curr);
  if (mismatch && /scanner version/.test(mismatch)) {
    throw new Error('the earlier scan was made by a scanner whose rules differ (' + mismatch + '), so unchanged problems could read as fixed; run a fresh audit instead of a recheck');
  }
  if (mismatch) throw new Error('the two scans used different settings (' + mismatch + '); rescan with script --like <earlier scan.json>');
  const e = exists || {};
  // A count can drop because an exception now covers it (a layer renamed into a pattern, say);
  // that is not a fix, so the growth in what each key's exceptions hide is added back.
  const hiddenPrev = prev.hiddenKeys || {};
  const hiddenCurr = curr.hiddenKeys || {};
  const newlyHidden = (key) => Math.max(0, (hiddenCurr[key] || 0) - (hiddenPrev[key] || 0));
  // With nothing bound on the page, unused collections are not reported at all, so their
  // absence says nothing about whether one was cleaned up.
  const collectionsUnjudged = curr.counts && curr.counts.bindingsOnPage === false;
  const currIndex = new Map();
  for (const f of curr.findings) for (const [k, n] of Object.entries(f.index)) currIndex.set(k, n);
  const prevGroups = new Map();
  for (const f of prev.findings) for (const g of f.groups) prevGroups.set(g.key, g);
  const rows = [];
  for (const f of prev.findings) {
    for (const [key, before] of Object.entries(f.index)) {
      const after = currIndex.get(key) || 0;
      const g = prevGroups.get(key);
      const id = key.split('|')[2];
      const linkId = g ? groupLink(g) : keyLink(key);
      const grew = newlyHidden(key);
      const counted = after + grew;
      let status;
      if (after === 0 && f.rule === 'unused-collection' && collectionsUnjudged) status = 'unchecked';
      else if (after === 0 && grew > 0) status = 'excepted';
      else if (counted === 0) status = linkId && e[linkId] === false ? 'removed' : 'fixed';
      else if (counted < before) status = 'improved';
      else status = 'open';
      rows.push({ key, rule: f.rule, sev: f.sev, title: f.title, name: g ? g.name : unlistedName(key), id, linkId, before, after, status });
    }
  }
  const prevKeys = new Set(prev.findings.flatMap((f) => Object.keys(f.index)));
  for (const f of curr.findings) {
    const shown = new Map(f.groups.map((g) => [g.key, g]));
    for (const [key, after] of Object.entries(f.index)) {
      if (prevKeys.has(key)) continue;
      const g = shown.get(key);
      const id = key.split('|')[2];
      rows.push({ key, rule: f.rule, sev: f.sev, title: f.title, name: g ? g.name : unlistedName(key), id, linkId: g ? groupLink(g) : keyLink(key), before: 0, after, status: 'new' });
    }
  }
  return rows;
}
