#!/usr/bin/env node
// figma-audit.mjs: build, report and recheck a Figma file audit.
//
// Usage:
//   node figma-audit.mjs script --page ID [--frames ID,ID] [--exclude-screens REGEX]
//                               [--fonts "A,B"] [--min-font 12] [--max-groups 20]
//                               [--max-examples 3] [--repeat-min 3] [--part N]
//                               [--exceptions FILE] [--allow TEXT] [--unused-styles summary|full]
//   node figma-audit.mjs script --like old.json [--max-groups 20] [--max-examples 3] [--part N]
//       Prints the read-only use_figma code for one page. Pass it as use_figma's
//       `code`. Save its result verbatim as part-0.json. When it says parts > 1, rerun
//       the same command plus --part N for each other part, then join.
//       --exclude-screens skips screens whose name matches, case-insensitive.
//       --exceptions leaves out what an exceptions list names (see the exceptions
//       command); --allow TEXT is one "ignore: TEXT" line. --unused-styles full lists
//       every unused text style, for the design-system page; the default is one row.
//       --like takes the page, frames, exclusions, brand fonts, thresholds, exceptions
//       and unused-styles mode from an earlier scan. A recheck needs it: recheck
//       refuses scans made with other settings.
//   node figma-audit.mjs exceptions --file FILE
//       Prints how FILE parses as an exceptions list: one "ignore <kind>: <pattern>" per
//       line, kinds rule, text, layer, screen, component, font, color, style, collection
//       (none matches text, layer path and component), with optional " for <rule>, ..."
//       and " because <note>". Exits 1 when a line is prose that still needs rewriting.
//   node figma-audit.mjs join part-0.json [part-1.json ...] --out scan.json
//       Rebuilds the scan from its parts and checks the hash, so a part copied
//       wrong fails here instead of producing a wrong report.
//   node figma-audit.mjs exists-script --from scan.json [--part N]
//       Prints use_figma code that checks every node the scan can link to, shown or
//       not. It returns the ids that are missing. Big scans take more than one part:
//       stderr says how many. Save each result verbatim as exists-N.json.
//   node figma-audit.mjs report --scan scan.json --file-key KEY [--file-name NAME]
//                               [--title TEXT] [--date YYYY-MM-DD] [--target TEXT]
//                               [--shots shots.json] (--exists exists-0.json,... | --unchecked-links)
//       Prints the fix-list markdown for a ClickUp doc page. It refuses to print a report
//       that links to a missing or unchecked node. --unchecked-links skips that check, for
//       a draft nobody else will see.
//   node figma-audit.mjs shots --scan scan.json
//       Prints the screenshot plan as JSON: one entry per report row that has a layer to box.
//   node figma-audit.mjs annotate --png SCREEN.png --screen x,y,w,h --boxes JSON
//                                 [--caption TEXT] --out OUT.png
//       Crops a 1x screen render around the boxes and draws them. Needs ImageMagick 7.
//   node figma-audit.mjs annotate-all --plan plan.json --renders DIR --out DIR
//       Runs annotate for every plan entry. DIR holds one 1x render per screen,
//       named by screen id with ":" as "-" (e.g. 123-456.png). Prints what it wrote
//       and which screens still need a render. Hidden layers get a dashed outline.
//   node figma-audit.mjs contact-sheet --dir DIR --out sheet.png
//       Tiles every PNG in DIR, nine to a sheet, labelled by file name, so every
//       screenshot can be checked in one look before anything is published.
//   node figma-audit.mjs upload --tickets tickets.json --dir DIR --out shots.json
//       POSTs each file in DIR to ClickUp with the upload tickets from the ClickUp
//       connector's clickup_request_attachment_upload, one ticket per file:
//       [{ "file": "3-small-text.png", "upload_url": "...", "upload_ticket": "..." }]
//       Writes shots.json from ClickUp's responses. A file whose upload fails is
//       reported and left out; its ticket is spent, so request a new one.
//   node figma-audit.mjs recheck --prev old.json --curr new.json [--exists exists-0.json,...]
//                                [--file-key KEY] [--file-name NAME] [--date YYYY-MM-DD]
//       Prints a recheck page: each earlier finding as open, improved, fixed or removed,
//       plus anything new. --exists comes from exists-script --from old.json; without it
//       only new rows are linked and nothing can read "removed".
//   node figma-audit.mjs --help
//
// shots.json maps a shot key from the plan to the uploaded image:
//   { "3-small-text-1a2b3c": { "url": "https://...png", "thumb": "https://..._small.png" } }
// The key ends in a hash of the finding, so a rescan that renumbers the rows drops a stale
// screenshot instead of showing it on the wrong row.
//
// Exit codes: 0 ok, 1 bad input or a failed check.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SEVERITIES, compareScans, expandScan, fnv1a, groupLink, parseExceptions } from './figma-audit-rules.mjs';

export { groupLink };

const NODE_ID = /^\d+:\d+$/;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USE_FIGMA_LIMIT = 50000;

/** Returns the use_figma code that scans one page. */
export function buildScanScript(params) {
  const rules = fs.readFileSync(path.join(HERE, 'figma-audit-rules.mjs'), 'utf8').replace(/^export /gm, '');
  const collect = fs.readFileSync(path.join(HERE, 'figma-audit-collect.js'), 'utf8');
  const code = stripComments(rules + '\n' + collect) + '\nreturn await collect(' + JSON.stringify(params) + ');\n';
  if (code.length > USE_FIGMA_LIMIT) throw new Error('scan script is ' + code.length + ' chars, over the use_figma limit of ' + USE_FIGMA_LIMIT);
  return code;
}

function stripComments(src) {
  // Whole-line comments only, so nothing inside a string or regex is touched.
  return src.split('\n').filter((l) => !/^\s*(\/\/|\/\*\*|\*\/|\* |\*$)/.test(l) && l.trim() !== '').join('\n');
}

/** Rebuilds a scan from the parts the use_figma script returned, in any order. */
export function joinParts(parts) {
  if (!parts.length) throw new Error('no parts given');
  const { parts: total, hash } = parts[0];
  if (parts.some((p) => p.figmaAudit !== 1 || p.hash !== hash || p.parts !== total)) throw new Error('these parts come from different scans');
  // A one-part scan carries the object itself; serialising it again gives back the exact text
  // the hash was taken over, because JSON keeps key order.
  const byPart = new Map(parts.map((p) => [p.part, p.scan !== undefined ? JSON.stringify(p.scan) : p.chunk]));
  const missing = [];
  for (let i = 0; i < total; i++) if (typeof byPart.get(i) !== 'string') missing.push(i);
  if (missing.length) throw new Error('missing part(s) ' + missing.join(', ') + ' of ' + total + '; rerun the scan with --part N');
  const json = Array.from({ length: total }, (_, i) => byPart.get(i)).join('');
  if (fnv1a(json) !== hash) throw new Error('hash mismatch: a part was changed while it was copied. Save each use_figma result exactly as returned.');
  return expandScan(JSON.parse(json));
}

/**
 * Node ids a report links to; with all, also every unshown section and screen. Unshown
 * components are left out: one may be a library main, which is not in this file.
 */
export function linkedIds(scan, all) {
  const ids = new Set();
  for (const f of scan.findings) {
    for (const g of f.groups) {
      const l = groupLink(g);
      if (l) ids.add(l);
      for (const e of g.examples) if (NODE_ID.test(e.id)) ids.add(e.id);
    }
    if (all) {
      for (const key of Object.keys(f.index)) {
        const [, kind, id] = key.split('|');
        if ((kind === 'section' || kind === 'screen') && NODE_ID.test(id)) ids.add(id);
      }
    }
  }
  return [...ids].sort();
}

const EXISTS_IDS_CHARS = 40000;

/** Splits ids into parts whose exists script stays under the use_figma code limit. */
export function existsParts(ids) {
  const parts = [[]];
  let size = 0;
  for (const id of ids) {
    if (size + id.length + 3 > EXISTS_IDS_CHARS && parts[parts.length - 1].length) { parts.push([]); size = 0; }
    parts[parts.length - 1].push(id);
    size += id.length + 3;
  }
  return parts;
}

/** use_figma code that checks one part of ids and returns only the missing ones. */
export function buildExistsScript(ids, part, parts) {
  return 'const ids = ' + JSON.stringify(ids) + ';\nconst missing = [];\n' +
    'for (const id of ids) { let n = null; try { n = await figma.getNodeByIdAsync(id); } catch (e) { n = null; } if (!n || n.removed) missing.push(id); }\n' +
    'return { figmaAuditExists: 1, part: ' + part + ', parts: ' + parts + ', idsHash: ' + JSON.stringify(fnv1a(ids.join(','))) + ', missing };\n';
}

/**
 * Turns exists-script results back into id -> exists for every id of the scan. Results that
 * belong to another scan, or a missing part, fail rather than read as "exists".
 */
export function existsMap(scan, results) {
  const parts = existsParts(linkedIds(scan, true));
  const map = new Map();
  const got = new Set(results.map((r) => r.part));
  const short = parts.map((_, i) => i).filter((i) => !got.has(i));
  if (short.length) throw new Error('exists part(s) ' + short.join(', ') + ' of ' + parts.length + ' missing; pass every part, comma-separated');
  for (const r of results) {
    if (r.figmaAuditExists !== 1 || r.parts !== parts.length || !parts[r.part]) throw new Error('exists result does not belong to this scan; rerun exists-script --from it');
    const ids = parts[r.part];
    if (fnv1a(ids.join(',')) !== r.idsHash) throw new Error('exists part ' + r.part + ' was made from a different scan');
    const missing = new Set(r.missing);
    for (const id of ids) map.set(id, !missing.has(id));
  }
  return map;
}

/** Deep link that opens the file with this node selected. */
export function figmaLink(fileKey, nodeId, fileName) {
  const slug = String(fileName || 'file').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  return 'https://www.figma.com/design/' + fileKey + '/' + slug + '?node-id=' + String(nodeId).replace(/:/g, '-');
}

// Layer names and copy come from the client's file. Escaping ! [ ] ( ) keeps a name like
// "![x](https://...)" from rendering as an image or link, even inside link text, and breaking
// "://" and "www." stops a bare URL from turning into a link.
const cell = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').replace(/</g, '\\<').replace(/([!()[\]])/g, '\\$1').replace(/:\/\//g, ':\\/\\/').replace(/\bwww\./gi, (m) => m.slice(0, 3) + '\\.');
const linkText = cell;
const MUST_ROWS_PER_RULE = 8;

function groupLabel(g) {
  if (g.kind === 'component') return (g.deleted ? 'Deleted component: ' : g.remote ? 'Library component: ' : 'Component: ') + g.name;
  if (g.kind === 'file') return g.name;
  if (g.kind === 'name') return g.name;
  const screen = g.screen ? g.screen.name : '';
  return screen && screen !== g.name ? screen + ' › ' + g.name : g.name;
}

function groupCount(g, f) {
  if (g.kind === 'component') return g.layers + (g.layers === 1 ? ' layer' : ' layers') + ' × ' + g.copies + (g.copies === 1 ? ' copy' : ' copies');
  if (g.kind === 'name') return 'on ' + g.count + ' screens';
  if (g.kind === 'file') return g.values.length ? g.values[0][0] : '';
  return g.count + (g.count === 1 ? ' layer' : ' layers');
}

function valuesText(values) {
  const short = (v) => (v.length > 40 ? v.slice(0, 39).trimEnd() + '…' : v);
  return values.slice(0, 3).map(([v, n]) => (n > 1 ? short(v) + ' ×' + n : short(v))).join(', ');
}

/**
 * Report rows in order. Must-fix rules get a row per place; the rest get one row per rule,
 * with every place listed under "Where to look". Each row's shotKey names its screenshot.
 */
export function buildRows(scan) {
  const rows = [];
  for (const f of scan.findings) {
    // places and count cover groups the scan did not list (beyond --max-groups) too, so a row
    // never claims fewer problems than there are.
    let chunks = [{ groups: f.groups, places: f.groupCount, count: f.total }];
    if (f.sev === 'must') {
      const cap = f.groupCount > MUST_ROWS_PER_RULE ? MUST_ROWS_PER_RULE - 1 : MUST_ROWS_PER_RULE;
      const single = Math.min(f.groups.length, cap);
      chunks = f.groups.slice(0, single).map((g) => ({ groups: [g], places: 1, count: g.count }));
      if (f.groupCount > single) {
        const counted = chunks.reduce((a, c) => a + c.count, 0);
        chunks.push({ groups: f.groups.slice(single), places: f.groupCount - single, count: f.total - counted });
      }
    }
    for (const c of chunks) {
      const n = rows.length + 1;
      const shotGroup = c.groups.find((g) => g.examples.some((e) => e.bbox && e.screenId));
      rows.push({ n, finding: f, groups: c.groups, places: c.places, count: c.count, shotKey: shotGroup ? n + '-' + f.rule + '-' + fnv1a(shotGroup.key).slice(0, 6) : null, shotGroup: shotGroup || null });
    }
  }
  return rows;
}

function shortPath(p) {
  const parts = String(p).split(' › ');
  return parts.length <= 3 ? parts.join(' › ') : parts[0] + ' › … › ' + parts.slice(-2).join(' › ');
}

const CAPTION_MAX = 70;

/** Shortens text to max characters at a word break, ending in an ellipsis. */
export function clipCaption(text, max) {
  const s = String(text);
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(' ', max - 1);
  return s.slice(0, cut > max / 2 ? cut : max - 1).trimEnd() + '…';
}

/** Screenshot plan: which screen to render and which boxes to draw for each row. */
export function planShots(scan) {
  const screens = (scan.scope && scan.scope.screens) || {};
  const plan = [];
  for (const r of buildRows(scan)) {
    if (!r.shotGroup) continue;
    const first = r.shotGroup.examples.find((e) => e.bbox && e.screenId && screens[e.screenId]);
    if (!first) continue;
    const boxes = r.shotGroup.examples.filter((e) => e.screenId === first.screenId && e.bbox).map((e) => e.bbox);
    // A hidden layer shows nothing in the render, so its outline is dashed and the caption says
    // why the box looks empty. A box that is the whole section says so too.
    const hidden = r.finding.rule === 'hidden-layer';
    const whole = (r.shotGroup.kind === 'section' || r.shotGroup.kind === 'screen') && first.id === r.shotGroup.id;
    const note = hidden ? ' (hidden, outline shows where it sits)' : whole ? ' (the whole ' + r.shotGroup.kind + ')' : '';
    plan.push({
      key: r.shotKey,
      row: r.n,
      screenId: first.screenId,
      screenName: screens[first.screenId].name,
      screenBbox: screens[first.screenId].bbox,
      boxes,
      dashed: hidden,
      caption: clipCaption('#' + r.n + ' ' + shortPath(first.path), CAPTION_MAX - note.length) + note,
    });
  }
  return plan;
}

/** Markdown for the fix-list doc page. */
export function renderReport(scan, meta) {
  const m = meta || {};
  const shots = m.shots || {};
  const link = (id) => figmaLink(m.fileKey, id, m.fileName);
  const placeLink = (g) => {
    const id = groupLink(g);
    return id ? '[' + linkText(groupLabel(g)) + '](' + link(id) + ')' : linkText(groupLabel(g));
  };
  const rows = buildRows(scan);
  const scope = scan.scope || {};
  const screenCount = Object.keys(scope.screens || {}).length;
  const out = [];
  out.push('# ' + (m.title || (m.fileName || 'Figma file') + ': Dev Hand-off Fix List'), '');
  out.push('**File:** [' + linkText(m.fileName || m.fileKey) + ' › ' + linkText(scope.pageName) + '](' + link(scope.pageId) + ')  ');
  const skipped = scope.excluded && scope.excluded.length ? ', skipping ' + scope.excluded.length + ' screens matching "' + cell(scope.excludeScreens) + '"' : '';
  const loose = scope.skipped && scope.skipped.length ? ' Loose layers on the page that are not screens were not checked: ' + cell(scope.skipped.slice(0, 5).join(', ')) + (scope.skipped.length > 5 ? ' and ' + (scope.skipped.length - 5) + ' more' : '') + '.' : '';
  out.push('**Scope:** the "' + cell(scope.pageName) + '" page only, ' + screenCount + ' screens' + (scope.frames ? ' (chosen frames)' : '') + skipped + '. Counts cover nothing outside it.' + loose + '  ');
  out.push('**Audited:** ' + (m.date || new Date().toISOString().slice(0, 10)) + ' (technical review of the Figma file, not the visual design)  ');
  if (m.target) out.push('**Build target:** ' + cell(m.target) + '  ');
  if (scan.options.fontsInferred && scan.options.fonts.length) out.push('**Brand fonts:** inferred from usage as ' + cell(scan.options.fonts.join(', ')) + '. Tell us if that is wrong.  ');
  out.push('');
  out.push('## How to use this list', '');
  out.push('* **Where** opens the section in Figma. **Layer** gives the exact layer path; if a link ever misses, paste the last part into the layers search.');
  out.push('* Every place a problem appears is under **Where to look** at the end, grouped by section.');
  out.push('* **Creative team:** fix the item, then change **Resolved?** to ✅ and add your initials.');
  out.push('* **Dev:** check the fix in Figma, then change **Rechecked by dev** to ✅ and add your initials.');
  out.push('* A recheck adds a new page to this doc. It never overwrites this one.', '');
  out.push('**Priority key:**', '');
  for (const s of SEVERITIES) out.push('* ' + s.label);
  out.push('');

  const exceptions = scan.options.exceptions || [];
  if (exceptions.length) {
    out.push('## Ignored on purpose', '');
    out.push('These were left out because the team listed them as known exceptions. Counts are the problems each one hid.', '');
    exceptions.forEach((e, i) => {
      const n = (scan.ignored || [])[i] || 0;
      const what = n ? n + (n === 1 ? ' problem' : ' problems') + ' left out' : 'matched nothing in this scope; check the wording';
      out.push('* ' + cell(e.line || e.kind + ': ' + e.pattern) + ' (' + what + ')');
    });
    out.push('');
  }

  for (const s of SEVERITIES) {
    const sevRows = rows.filter((r) => r.finding.sev === s.id);
    if (!sevRows.length) continue;
    out.push('## ' + s.label, '');
    out.push('| # | Where | Layer | What is wrong | Fix | Screenshot | Resolved? | Rechecked by dev |');
    out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of sevRows) {
      const f = r.finding;
      const placesShown = r.groups.filter((g) => g.kind !== 'file').slice(0, 3).map((g) => placeLink(g) + ' (' + groupCount(g, f) + ')');
      const files = r.groups.filter((g) => g.kind === 'file').slice(0, 5).map((g) => cell(g.name));
      const listed = placesShown.concat(files);
      const more = r.places - listed.length;
      if (more > 0) listed.push((listed.length ? 'and ' + more + ' more' : more + (more === 1 ? ' place' : ' places')) + ', see Where to look');
      const where = listed.join('<br>');
      const ex = r.groups.flatMap((g) => g.examples)[0];
      const layer = ex ? cell(ex.path) + (NODE_ID.test(ex.id) ? ' [open layer](' + link(ex.id) + ')' : '') : '';
      const count = r.count;
      const valued = r.groups.filter((g) => g.kind !== 'file');
      const vals = valuesText(valued.length === 1 ? valued[0].values : mergeValues(valued));
      const what = cell(f.title) + ': ' + count + (vals ? ' (' + cell(vals) + ')' : '');
      const shot = r.shotKey && shots[r.shotKey] ? '![#' + r.n + '](' + (shots[r.shotKey].thumb || shots[r.shotKey].url) + ')' : '';
      out.push('| ' + [r.n, where, layer, what, cell(f.fix), shot, '☐', '☐'].join(' | ') + ' |');
    }
    out.push('');
  }

  out.push('## Where to look', '');
  if (!scan.findings.length) out.push('No problems found in this scope.', '');
  for (const f of scan.findings) {
    out.push('### ' + cell(f.title) + ' (' + f.total + ')', '');
    for (const g of f.groups) {
      const target = placeLink(g);
      const eg = g.examples[0] ? ', e.g. ' + cell(g.examples[0].path) : '';
      const vals = g.values.length && g.kind !== 'file' ? ' [' + cell(valuesText(g.values)) + ']' : '';
      const count = groupCount(g, f);
      out.push('* ' + target + (count ? ': ' + count : '') + vals + eg);
    }
    const unlisted = f.groupCount - f.groups.length;
    if (unlisted > 0) out.push('* and ' + unlisted + ' more ' + (unlisted === 1 ? 'place' : 'places') + ', not listed. Rerun the scan with a higher --max-groups to see them.');
    out.push('');
  }

  const withShots = rows.filter((r) => r.shotKey && shots[r.shotKey]);
  if (withShots.length) {
    out.push('## Screenshots', '');
    for (const r of withShots) out.push('### #' + r.n + ' ' + cell(r.finding.title), '', '![#' + r.n + '](' + shots[r.shotKey].url + ')', '');
  }
  return out.join('\n');
}

function mergeValues(groups) {
  const m = new Map();
  for (const g of groups) for (const [v, n] of g.values) m.set(v, (m.get(v) || 0) + n);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const STATUS_ORDER = ['open', 'improved', 'new', 'unchecked', 'fixed', 'removed'];
const STATUS_LABEL = { open: '⛔ Still open', improved: '🔁 Fewer, not done', new: '🆕 New', unchecked: '❔ Not checkable now', fixed: '✅ Fixed', removed: '✅ Layer removed' };

/** Markdown for a recheck page, from compareScans rows. */
export function renderRecheck(rows, meta) {
  const m = meta || {};
  const exists = m.exists || new Map();
  const sorted = [...rows].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.after - a.after);
  const tally = Object.fromEntries(STATUS_ORDER.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const out = ['# Recheck ' + (m.date || new Date().toISOString().slice(0, 10)), ''];
  out.push(STATUS_ORDER.filter((s) => tally[s]).map((s) => STATUS_LABEL[s] + ': ' + tally[s]).join(' · '), '');
  out.push('"Layer removed" means the flagged section is gone, which usually means it was fixed by deleting or rebuilding it.', '');
  if (tally.unchecked) out.push('"Not checkable now" means nothing on the page is bound to a variable any more, so an unused collection can no longer be told apart from the one in use.', '');
  out.push('| Status | What | Where | Before | Now |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const r of sorted) {
    // Link only what was checked and still exists (new rows come from the current file); a
    // stale link is worse than none.
    const live = r.linkId && (r.status === 'new' || exists.get(r.linkId) === true);
    const where = m.fileKey && live ? '[' + linkText(r.name) + '](' + figmaLink(m.fileKey, r.linkId, m.fileName) + ')' : cell(r.name);
    out.push('| ' + [STATUS_LABEL[r.status], cell(r.title), where, r.before, r.after].join(' | ') + ' |');
  }
  return out.join('\n') + '\n';
}

/** Width and height of a PNG, read from its header. */
export function pngSize(buf) {
  if (buf.length < 24 || buf.toString('latin1', 1, 4) !== 'PNG') throw new Error('not a PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * Where to crop a screen render and where to draw each box, in output pixels.
 * screen and boxes are absolute Figma bounds; the render is pngW wide.
 */
export function cropPlan(screen, boxes, pngW, pngH, opts) {
  const o = { pad: 120, minW: 480, minH: 360, outMinW: 780, ...(opts || {}) };
  if (!boxes.length) throw new Error('no boxes to draw');
  // A layer can overhang its screen (a bleed image); the screen clips it, so the box must too.
  boxes = boxes.map((b) => {
    const x0 = Math.max(b.x, screen.x);
    const y0 = Math.max(b.y, screen.y);
    const x1 = Math.min(b.x + b.w, screen.x + screen.w);
    const y1 = Math.min(b.y + b.h, screen.y + screen.h);
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  });
  const scale = pngW / screen.w;
  const ux = Math.min(...boxes.map((b) => b.x)) - screen.x;
  const uy = Math.min(...boxes.map((b) => b.y)) - screen.y;
  const ur = Math.max(...boxes.map((b) => b.x + b.w)) - screen.x;
  const ub = Math.max(...boxes.map((b) => b.y + b.h)) - screen.y;
  const w = Math.min(screen.w, Math.max(ur - ux + 2 * o.pad, Math.min(screen.w, o.minW)));
  const h = Math.min(screen.h, Math.max(ub - uy + 2 * o.pad, Math.min(screen.h, o.minH)));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const x = clamp((ux + ur) / 2 - w / 2, 0, screen.w - w);
  const y = clamp((uy + ub) / 2 - h / 2, 0, screen.h - h);
  const crop = { x: Math.round(x * scale), y: Math.round(y * scale), w: Math.min(pngW, Math.round(w * scale)), h: Math.min(pngH, Math.round(h * scale)) };
  const resize = crop.w < o.outMinW ? o.outMinW / crop.w : 1;
  const k = scale * resize;
  const rects = boxes.map((b) => {
    const left = (b.x - screen.x - x) * k;
    const top = (b.y - screen.y - y) * k;
    return { x0: left - 6, y0: top - 6, x1: left + b.w * k + 6, y1: top + b.h * k + 6 };
  });
  const out = { w: Math.round(crop.w * resize), h: Math.round(crop.h * resize) };
  // Keep all four edges on the image; a box at the screen edge would otherwise lose two sides.
  const inset = (v, max) => Math.round(Math.max(2, Math.min(max - 3, v)));
  for (const r of rects) { r.x0 = inset(r.x0, out.w); r.x1 = inset(r.x1, out.w); r.y0 = inset(r.y0, out.h); r.y1 = inset(r.y1, out.h); }
  return { crop, resize, rects, out };
}

const CAPTION_FONTS = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'];

/**
 * Caption text as ImageMagick reads it literally: it expands % escapes (including %[fx:...]
 * expressions) and reads a file for a leading @. Layer names come from the client's file.
 */
export function magickText(s) {
  const t = String(s).replace(/%/g, '%%');
  return t.startsWith('@') ? ' ' + t : t;
}

/** Writes the annotated crop with ImageMagick. Returns the crop plan used. */
export function annotate({ png, screen, boxes, caption, out, dashed }) {
  const size = pngSize(fs.readFileSync(png));
  const p = cropPlan(screen, boxes, size.w, size.h);
  const args = [png, '-crop', p.crop.w + 'x' + p.crop.h + '+' + p.crop.x + '+' + p.crop.y, '+repage'];
  if (p.resize > 1) args.push('-resize', p.out.w + 'x' + p.out.h + '!');
  args.push('-fill', 'none', '-stroke', '#E11D48', '-strokewidth', '4');
  const dash = dashed ? 'stroke-dasharray 14 8 ' : '';
  for (const r of p.rects) args.push('-draw', dash + 'rectangle ' + r.x0 + ',' + r.y0 + ' ' + r.x1 + ',' + r.y1);
  const font = CAPTION_FONTS.find((f) => fs.existsSync(f));
  if (caption && font) {
    args.push('-background', 'white', '-gravity', 'north', '-splice', '0x56', '-font', font, '-pointsize', '22', '-fill', '#111111', '-stroke', 'none', '-annotate', '+0+16', magickText(clipCaption(caption, CAPTION_MAX)));
  }
  args.push(out);
  execFileSync('magick', args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
  return p;
}

const SHEET_PER_PAGE = 9;

/**
 * Tiles every PNG in dir into contact sheets of up to nine, labelled with the file name, so
 * one look checks every screenshot. Writes out, or out-1.png, out-2.png... when there are more.
 */
export function contactSheet(dir, out) {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')).sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  if (!files.length) throw new Error('no PNG files in ' + dir);
  const font = CAPTION_FONTS.find((f) => fs.existsSync(f));
  const pages = [];
  for (let i = 0; i < files.length; i += SHEET_PER_PAGE) pages.push(files.slice(i, i + SHEET_PER_PAGE));
  const base = out.replace(/\.png$/i, '');
  const written = [];
  pages.forEach((page, n) => {
    const target = pages.length === 1 ? base + '.png' : base + '-' + (n + 1) + '.png';
    const args = ['montage'];
    if (font) args.push('-font', font, '-pointsize', '16');
    for (const f of page) {
      if (font) args.push('-label', magickText(f.replace(/\.png$/i, '')));
      args.push(path.join(dir, f));
    }
    args.push('-tile', '3x', '-geometry', '520x520+10+10', '-background', '#f2f2f2', target);
    execFileSync('magick', args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 });
    written.push(target);
  });
  return { sheets: written, shots: files.length };
}

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      a[k] = v;
    } else a._.push(t);
  }
  return a;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
function num(v, d, opts) {
  if (v === undefined) return d;
  const o = { min: 0, whole: true, ...(opts || {}) };
  const n = typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < o.min || (o.whole && !Number.isInteger(n))) {
    throw new Error('expected ' + (o.whole ? 'a whole number' : 'a number') + ' of at least ' + o.min + ', got ' + (v === true ? 'no value' : '"' + v + '"'));
  }
  return n;
}
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);
function need(a, keys) {
  for (const k of keys) if (!a[k] || a[k] === true) throw new Error('missing --' + k);
}

/** Uploads files with ClickUp MCP upload tickets; returns { shots, failed }. */
export async function uploadWithTickets(tickets, dir, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const shots = {};
  const failed = [];
  const root = fs.realpathSync(dir);
  for (const t of tickets) {
    try {
      const inside = (f) => f.startsWith(root + path.sep);
      const named = path.resolve(root, String(t.file));
      if (!inside(named)) throw new Error('file is outside ' + dir);
      // Again after realpath, so a symlink inside the folder cannot point at a file outside it.
      const file = fs.realpathSync(named);
      if (!inside(file)) throw new Error('file is outside ' + dir);
      const form = new FormData();
      const type = t.file.endsWith('.json') ? 'application/json' : 'image/png';
      form.append(t.multipart_field || 'attachment', new Blob([fs.readFileSync(file)], { type }), t.file);
      const res = await doFetch(t.upload_url, { method: 'POST', headers: { 'X-Upload-Ticket': t.upload_ticket }, body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error('HTTP ' + res.status + ' ' + JSON.stringify(body).slice(0, 200));
      shots[t.file.replace(/\.[a-z]+$/, '')] = { url: body.url, thumb: body.thumbnail_small || body.url, id: body.id };
    } catch (e) {
      failed.push({ file: t.file, error: e.message });
    }
  }
  return { shots, failed };
}

async function main(argv) {
  const a = parseArgs(argv);
  const cmd = a._[0];
  if (!cmd || a.help || cmd === 'help') {
    const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1);
    const header = src.slice(0, src.findIndex((l) => !l.startsWith('//')));
    process.stdout.write(header.map((l) => l.replace(/^\/\/ ?/, '')).join('\n') + '\n');
    return 0;
  }
  if (cmd === 'script') {
    if (a.like === true) throw new Error('--like needs the path of the earlier scan.json');
    const like = a.like ? readJson(a.like) : null;
    if (like) {
      if (!like.scope || !like.options) throw new Error('--like needs a joined scan.json');
      // Scans from before repeatMin was recorded cannot say what they used, so ask.
      const repeatKnown = like.options.repeatMin != null;
      const clash = ['page', 'frames', 'exclude-screens', 'fonts', 'min-font', 'exceptions', 'allow', 'unused-styles'].concat(repeatKnown ? ['repeat-min'] : []).filter((k) => k in a);
      if (clash.length) throw new Error('--like sets ' + clash.map((k) => '--' + k).join(', ') + ' from the earlier scan; drop them');
      if (!repeatKnown && !('repeat-min' in a)) throw new Error('the earlier scan does not record its --repeat-min; pass the value it was made with (default 3)');
    } else need(a, ['page']);
    const page = like ? like.scope.pageId : String(a.page).replace('-', ':');
    if (!NODE_ID.test(page)) throw new Error('--page must be a node id like 123:456');
    if ('frames' in a && !(list(a.frames) || []).length) throw new Error('--frames is empty; leave it out to scan the whole page');
    const frames = like ? like.scope.frames || null : list(a.frames) ? list(a.frames).map((f) => f.replace('-', ':')) : null;
    const exclude = like ? like.scope.excludeScreens || null : typeof a['exclude-screens'] === 'string' && a['exclude-screens'] ? a['exclude-screens'] : null;
    if (exclude) new RegExp(exclude, 'i');
    const options = like
      ? { minFont: like.options.minFont, repeatMin: like.options.repeatMin == null ? num(a['repeat-min'], 3, { min: 2 }) : like.options.repeatMin }
      : { minFont: num(a['min-font'], 12, { min: 1, whole: false }), repeatMin: num(a['repeat-min'], 3, { min: 2 }) };
    options.maxGroups = num(a['max-groups'], like ? like.options.maxGroups || 20 : 20, { min: 1 });
    options.maxExamples = num(a['max-examples'], 3, { min: 1 });
    // --like passes the earlier brand set even when it is empty, so nothing is inferred again.
    if (like) options.fonts = like.options.fonts || [];
    else if ((list(a.fonts) || []).length) options.fonts = list(a.fonts);
    // Scans from before these options existed listed every unused style and ignored nothing.
    if (like) {
      options.unusedStyles = like.options.unusedStyles || 'full';
      options.exceptions = like.options.exceptions || [];
    } else {
      const mode = a['unused-styles'] === undefined ? 'summary' : a['unused-styles'];
      if (mode !== 'summary' && mode !== 'full') throw new Error('--unused-styles is summary or full, got ' + (mode === true ? 'no value' : '"' + mode + '"'));
      options.unusedStyles = mode;
      options.exceptions = [];
      if (a.exceptions !== undefined) {
        if (a.exceptions === true) throw new Error('--exceptions needs a file path');
        const parsed = parseExceptions(fs.readFileSync(a.exceptions, 'utf8'));
        if (parsed.unparsed.length) {
          throw new Error(a.exceptions + ' has ' + parsed.unparsed.length + ' line(s) that are not "ignore <kind>: <pattern>": ' + parsed.unparsed.slice(0, 5).map((l) => JSON.stringify(l)).join(', ') + '. Turn each into an ignore line or delete it (run exceptions --file to see the parse).');
        }
        options.exceptions = parsed.exceptions;
      }
      if (a.allow !== undefined) {
        if (a.allow === true || !String(a.allow).trim()) throw new Error('--allow needs text to match');
        options.exceptions.push(...parseExceptions('ignore: ' + a.allow).exceptions);
      }
    }
    const part = num(a.part, 0);
    process.stdout.write(buildScanScript({ pageId: page, frames, excludeScreens: exclude, part, options }));
    return 0;
  }
  if (cmd === 'exceptions') {
    need(a, ['file']);
    const parsed = parseExceptions(fs.readFileSync(a.file, 'utf8'));
    process.stdout.write(JSON.stringify(parsed, null, 1) + '\n');
    return parsed.unparsed.length ? 1 : 0;
  }
  if (cmd === 'contact-sheet') {
    need(a, ['dir', 'out']);
    process.stdout.write(JSON.stringify(contactSheet(a.dir, a.out), null, 1) + '\n');
    return 0;
  }
  if (cmd === 'join') {
    need(a, ['out']);
    const files = a._.slice(1);
    const scan = joinParts(files.map(readJson));
    fs.writeFileSync(a.out, JSON.stringify(scan, null, 1));
    const total = scan.findings.reduce((n, f) => n + f.total, 0);
    process.stdout.write('scan.json: ' + scan.findings.length + ' rules, ' + total + ' hits, ' + Object.keys(scan.scope.screens).length + ' screens\n');
    return 0;
  }
  if (cmd === 'exists-script') {
    need(a, ['from']);
    const parts = existsParts(linkedIds(readJson(a.from), true));
    const part = num(a.part, 0);
    if (!parts[part]) throw new Error('part ' + part + ' asked for, but there are ' + parts.length);
    if (parts.length > 1) process.stderr.write('exists check has ' + parts.length + ' parts; this is part ' + part + '. Rerun with --part N for the others.\n');
    process.stdout.write(buildExistsScript(parts[part], part, parts.length));
    return 0;
  }
  if (cmd === 'report') {
    need(a, ['scan', 'file-key']);
    const scan = readJson(a.scan);
    if (!a.exists && !a['unchecked-links']) throw new Error('missing --exists (from exists-script --from ' + a.scan + '), or --unchecked-links for a private draft');
    if (a.exists) {
      const ex = existsMap(scan, list(a.exists).map(readJson));
      const missing = linkedIds(scan).filter((id) => ex.get(id) !== true);
      if (missing.length) {
        process.stderr.write('report links to ' + missing.length + ' node(s) that are missing or unchecked: ' + missing.slice(0, 10).join(', ') + '\nRescan, or rerun exists-script on this scan.\n');
        return 1;
      }
    }
    process.stdout.write(renderReport(scan, {
      fileKey: a['file-key'], fileName: a['file-name'], title: a.title, date: a.date, target: a.target,
      shots: a.shots ? readJson(a.shots) : {},
    }));
    return 0;
  }
  if (cmd === 'shots') {
    need(a, ['scan']);
    process.stdout.write(JSON.stringify(planShots(readJson(a.scan)), null, 2) + '\n');
    return 0;
  }
  if (cmd === 'annotate') {
    need(a, ['png', 'screen', 'boxes', 'out']);
    const [x, y, w, h] = String(a.screen).split(',').map(Number);
    const boxes = JSON.parse(a.boxes);
    const p = annotate({ png: a.png, screen: { x, y, w, h }, boxes, caption: a.caption === true ? '' : a.caption, out: a.out });
    process.stdout.write(JSON.stringify({ out: a.out, size: p.out }) + '\n');
    return 0;
  }
  if (cmd === 'annotate-all') {
    need(a, ['plan', 'renders', 'out']);
    fs.mkdirSync(a.out, { recursive: true });
    const wrote = [];
    const missing = new Set();
    const failed = [];
    for (const p of readJson(a.plan)) {
      const png = path.join(a.renders, p.screenId.replace(/:/g, '-') + '.png');
      if (!fs.existsSync(png)) { missing.add(p.screenId + ' (' + p.screenName + ')'); continue; }
      const out = path.join(a.out, p.key + '.png');
      try {
        if (!p.screenBbox) throw new Error('screen has no bounds (hidden or empty)');
        annotate({ png, screen: p.screenBbox, boxes: p.boxes, caption: p.caption, out, dashed: !!p.dashed });
        wrote.push(out);
      } catch (e) {
        failed.push({ key: p.key, error: e.message });
      }
    }
    process.stdout.write(JSON.stringify({ wrote, missingRenders: [...missing], failed }, null, 1) + '\n');
    return missing.size || failed.length ? 1 : 0;
  }
  if (cmd === 'upload') {
    need(a, ['tickets', 'dir', 'out']);
    const { shots, failed } = await uploadWithTickets(readJson(a.tickets), a.dir);
    const prev = fs.existsSync(a.out) ? readJson(a.out) : {};
    fs.writeFileSync(a.out, JSON.stringify({ ...prev, ...shots }, null, 1));
    process.stdout.write(JSON.stringify({ uploaded: Object.keys(shots), failed }, null, 1) + '\n');
    return failed.length ? 1 : 0;
  }
  if (cmd === 'recheck') {
    need(a, ['prev', 'curr']);
    const prev = readJson(a.prev);
    const exists = a.exists ? existsMap(prev, list(a.exists).map(readJson)) : new Map();
    const rows = compareScans(prev, readJson(a.curr), Object.fromEntries(exists));
    process.stdout.write(renderRecheck(rows, { fileKey: a['file-key'], fileName: a['file-name'], date: a.date, exists }));
    return 0;
  }
  throw new Error('unknown command: ' + cmd + ' (try --help)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    process.stderr.write('figma-audit: ' + e.message + '\n');
    process.exitCode = 1;
  });
}
