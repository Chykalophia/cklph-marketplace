// figma-audit-collect.js: the Figma-side half of the audit scan.
//
// Not a module. figma-audit.mjs pastes it into the use_figma script after the
// rules, then calls collect(PARAMS). It needs the `figma` global, so it only runs
// inside use_figma or the tests' mock. Read-only: it never changes the file.

const SCREEN_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);
// Containers that hold screens rather than being one.
const WRAPPER_TYPES = new Set(['SECTION', 'GROUP']);
const PLAIN_ID = /^\d+:\d+$/;

const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

function paints(list) {
  if (!Array.isArray(list)) return [];
  return list.map((p) => ({
    type: p.type,
    visible: p.visible !== false,
    opacity: p.opacity == null ? 1 : p.opacity,
    hex: p.type === 'SOLID' && p.color ? hex(p.color) : null,
    bound: !!(p.boundVariables && p.boundVariables.color),
  }));
}

function paintVarIds(list) {
  if (!Array.isArray(list)) return [];
  return list.map((p) => p.boundVariables && p.boundVariables.color && p.boundVariables.color.id).filter(Boolean);
}

function boundVarIds(node) {
  const out = [];
  const bv = node.boundVariables || {};
  for (const v of Object.values(bv)) {
    for (const a of Array.isArray(v) ? v : [v]) if (a && a.id) out.push(a.id);
  }
  return out;
}

const styled = (id) => typeof id === 'symbol' || (typeof id === 'string' && id.length > 0);

async function collect(params) {
  const page = await figma.getNodeByIdAsync(params.pageId);
  if (!page || page.type !== 'PAGE') throw new Error('Not a page id: ' + params.pageId);
  await figma.setCurrentPageAsync(page);
  // Hidden layers inside instances are variant toggles, never reported, so skip loading them.
  // Restored after the walk, in case use_figma reuses this context for the next script.
  const skipBefore = figma.skipInvisibleInstanceChildren;
  figma.skipInvisibleInstanceChildren = true;
  try {
    return await scan(page, params);
  } finally {
    figma.skipInvisibleInstanceChildren = skipBefore;
  }
}

async function scan(page, params) {
  const audit = createAudit(params.options || {});
  const mainCache = new Map();
  const detachCache = new Map();

  async function mainOf(inst) {
    let m = null;
    try { m = await inst.getMainComponentAsync(); } catch (e) { m = null; }
    if (!m) return null;
    if (mainCache.has(m.id)) return mainCache.get(m.id);
    let pageName = null;
    let p = m.parent;
    while (p) { if (p.type === 'PAGE') { pageName = p.name; break; } p = p.parent; }
    // A local main with no page was deleted; its instances still render, but it cannot be opened.
    const deleted = !m.remote && !pageName;
    const info = { id: m.id, name: m.name, setName: m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name : null, pageName, remote: !!m.remote || deleted, deleted };
    mainCache.set(m.id, info);
    return info;
  }

  async function detachedName(info) {
    if (!info) return null;
    const ref = info.type === 'local' ? info.componentId : info.componentKey;
    if (detachCache.has(ref)) return detachCache.get(ref);
    let name = info.type === 'library' ? 'a library component' : 'a deleted component';
    if (info.type === 'local') {
      const c = await figma.getNodeByIdAsync(info.componentId);
      if (c) name = c.parent && c.parent.type === 'COMPONENT_SET' ? c.parent.name + ' / ' + c.name : c.name;
    }
    detachCache.set(ref, name);
    return name;
  }

  async function walk(node, ctx) {
    const isScreen = ctx.depth === 0;
    const b = node.absoluteBoundingBox;
    const fact = {
      id: node.id, name: node.name, type: node.type,
      visible: node.visible !== false,
      x: node.x, y: node.y, w: node.width, h: node.height,
      bbox: b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null,
      screen: ctx.screen, section: ctx.section, path: ctx.path.concat(node.name), ancestorIds: ctx.ancestors,
      isScreen, parentIsScreen: ctx.depth === 1,
      via: ctx.via,
      text: null, fills: [], fillStyled: false, strokes: [], strokeStyled: false,
      missingFont: false, detachedFrom: null, layoutMode: node.layoutMode || null,
      inferredLayout: null, visibleChildren: 0, main: null, varIds: boundVarIds(node),
      sizingH: node.layoutSizingHorizontal || null, sizingV: node.layoutSizingVertical || null,
      parentAuto: !!(node.parent && node.parent.layoutMode && node.parent.layoutMode !== 'NONE' && node.layoutPositioning !== 'ABSOLUTE'),
    };
    if ('fills' in node && node.type !== 'TEXT') {
      fact.fills = typeof node.fills === 'symbol' ? [] : paints(node.fills);
      fact.fillStyled = styled(node.fillStyleId);
      fact.varIds.push(...(typeof node.fills === 'symbol' ? [] : paintVarIds(node.fills)));
    }
    if ('strokes' in node) {
      fact.strokes = paints(node.strokes);
      fact.strokeStyled = styled(node.strokeStyleId);
      fact.varIds.push(...paintVarIds(node.strokes));
    }
    if (node.type === 'TEXT' && fact.visible) {
      const segs = node.getStyledTextSegments(['fontName', 'fontSize', 'textStyleId', 'fills', 'fillStyleId']);
      fact.text = {
        chars: node.characters.slice(0, 200),
        segments: segs.map((s) => ({ family: s.fontName && s.fontName.family, size: s.fontSize, textStyleId: s.textStyleId, fills: paints(s.fills), fillStyled: styled(s.fillStyleId) })),
      };
      for (const s of segs) fact.varIds.push(...paintVarIds(s.fills));
      fact.missingFont = !!node.hasMissingFont;
    }
    if (node.type === 'INSTANCE') fact.main = await mainOf(node);
    if (node.type === 'FRAME' && fact.visible) {
      fact.detachedFrom = await detachedName(node.detachedInfo);
      // use_figma has returned null here for every frame tried, so null means "unknown", not "no layout fits".
      if (node.layoutMode === 'NONE' && node.inferredAutoLayout && node.inferredAutoLayout.layoutMode) {
        fact.inferredLayout = node.inferredAutoLayout.layoutMode;
      }
    }
    const kids = 'children' in node ? node.children : [];
    fact.visibleChildren = kids.filter((c) => c.visible !== false).length;
    fact.childNames = kids.slice(0, 12).map((c) => c.name);
    audit.visit(fact);
    if (!fact.visible) return;

    // Blame the nearest component (a Button inside a Card is fixed in Button), but link the
    // outermost instance: ids of layers inside instances are not linkable.
    let via = ctx.via;
    if (node.type === 'INSTANCE' && fact.main) {
      const m = fact.main;
      via = { id: m.id, name: m.setName ? m.setName + ' › ' + m.name : m.name, remote: m.remote, deleted: m.deleted, copyId: node.id, instanceId: ctx.via ? ctx.via.instanceId : node.id };
    }
    const screen = isScreen ? { id: node.id, name: node.name } : ctx.screen;
    for (const c of kids) {
      await walk(c, {
        depth: ctx.depth + 1,
        screen,
        section: ctx.depth === 0 ? (PLAIN_ID.test(c.id) ? { id: c.id, name: c.name } : { id: node.id, name: node.name }) : ctx.section,
        path: isScreen ? [node.name] : fact.path,
        ancestors: ctx.ancestors.concat(node.id),
        via,
      });
    }
  }

  const screens = [];
  const excluded = [];
  const skipped = [];
  const seen = new Set();
  const skip = params.excludeScreens ? new RegExp(params.excludeScreens, 'i') : null;
  const addScreens = (n) => {
    if (WRAPPER_TYPES.has(n.type)) n.children.forEach(addScreens);
    else if (SCREEN_TYPES.has(n.type)) {
      // A section and a screen inside it can both be passed; scan each screen once.
      if (seen.has(n.id)) return;
      seen.add(n.id);
      (skip && skip.test(n.name) ? excluded : screens).push(n);
    }
    else skipped.push(n.name + ' (' + n.type.toLowerCase() + ')');
  };
  if (params.frames && params.frames.length) {
    for (const id of params.frames) {
      const n = await figma.getNodeByIdAsync(id);
      if (!n) throw new Error('Frame not found: ' + id);
      let p = n.parent;
      while (p && p.type !== 'PAGE') p = p.parent;
      if (!p || p.id !== page.id) throw new Error('Frame ' + id + ' is not on the page ' + page.name);
      if (!SCREEN_TYPES.has(n.type) && !WRAPPER_TYPES.has(n.type)) throw new Error('Frame ' + id + ' is a ' + n.type + ', not a screen');
      addScreens(n);
    }
  } else {
    page.children.forEach(addScreens);
  }
  // A passed frame inside another passed screen would be walked twice; keep the outer one.
  const nested = (n) => { for (let p = n.parent; p; p = p.parent) if (seen.has(p.id)) return true; return false; };
  const outer = screens.filter((n) => !nested(n));
  screens.length = 0;
  screens.push(...outer);
  if (!screens.length) throw new Error('No screens to scan on ' + page.name + (excluded.length ? '; --exclude-screens removed all ' + excluded.length : '') + (skipped.length ? '; skipped ' + skipped.slice(0, 5).join(', ') : ''));
  for (const s of screens) await walk(s, { depth: 0, screen: null, section: null, path: [], ancestors: [], via: null });

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variableCollectionOf = {};
  for (const c of collections) for (const v of c.variableIds) variableCollectionOf[v] = c.id;
  const styles = await figma.getLocalTextStylesAsync();
  const result = audit.finish({
    collections: collections.map((c) => ({ id: c.id, name: c.name, variableCount: c.variableIds.length })),
    variableCollectionOf,
    textStyles: styles.map((s) => ({ id: s.id, name: s.name, family: s.fontName && s.fontName.family })),
  });
  result.scope = {
    pageId: page.id,
    pageName: page.name,
    frames: params.frames || null,
    excludeScreens: params.excludeScreens || null,
    excluded: excluded.map((s) => s.name),
    skipped,
    screens: Object.fromEntries(screens.map((s) => {
      const b = s.absoluteBoundingBox;
      return [s.id, { name: s.name, bbox: b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null }];
    })),
  };
  // use_figma refuses a return value over 48,000 bytes, so the result always comes back in
  // hashed chunks small enough to survive JSON string escaping. figma-audit.mjs join rebuilds it.
  const json = JSON.stringify(result);
  const bounds = chunkBounds(json, params.chunkBytes || 44000);
  const part = params.part || 0;
  if (part >= bounds.length) throw new Error('part ' + part + ' asked for, but the scan has ' + bounds.length + ' parts');
  return { figmaAudit: 1, part, parts: bounds.length, hash: fnv1a(json), chunk: json.slice(bounds[part][0], bounds[part][1]) };
}
