#!/usr/bin/env node
// copy-lint: find the wording giveaways of AI-written copy on live pages or in source files.
//
// Usage:
//   copy-lint.mjs <url|file>... [--exceptions <file>] [--json] [--raw] [--repeat-min <n>]
//
//   <url|file>     http(s) URLs, or .md, .mdx, .html or .txt files. Pass several pages of one
//                  site to find blocks repeated across them.
//   --exceptions   exceptions file (default: .cklph/design-exceptions.json when it exists)
//   --json         print the filtered findings as JSON instead of a report
//   --raw          print the unfiltered findings for lint-filter.mjs --tool copy
//   --repeat-min   pages a block must appear on to count as repeated (default 3)
//
// Pages are read as served HTML, so text that only appears after JavaScript runs is missed.
// The site header, nav and footer are skipped, since every page shares them.
// No AI model and no network beyond fetching the pages you name.
//
// Exit codes: 0 nothing that blocks, 2 findings to check, 1 a source could not be read.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyExceptions, loadExceptions, normalize, report } from './lint-filter.mjs';

// The lists come from the voice style guide used on the Chykalophia sites, plus the copy
// buzzwords in cklph-os frontend-ui ai-tells.md.
export const AI_WORDS = [
  'delve', 'delves', 'delving', 'leverage', 'leverages', 'leveraging', 'seamless', 'seamlessly',
  'robust', 'unlock', 'unlocks', 'unlocking', 'elevate', 'elevates', 'elevating', 'crucial',
  'vital', 'comprehensive', 'furthermore', 'moreover', 'empower', 'empowers', 'empowering',
  'streamline', 'streamlines', 'streamlined', 'foster', 'fosters', 'holistic', 'pivotal',
  'harness', 'harnessing', 'myriad', 'actionable', 'transformative', 'resonate', 'resonates',
  'testament', 'underscore', 'underscores', 'supercharge', 'world-class', 'enterprise-grade',
  'cutting-edge', 'game-changer', 'game-changing', 'next-level', 'synergy', 'tapestry',
];
export const SIGNPOSTS = [
  "here's the thing", 'here is the thing', 'the short answer:', 'what this means for you',
  'note the wording', 'the honest part', 'bottom line', 'in short,', 'put simply',
  "let's look at", "let's dive", 'dive into', 'picture this', 'imagine a world', 'spoiler:',
  'at the end of the day', "it's worth noting", 'it is worth noting', 'in today\'s',
];
export const INTENSIFIERS = ['quietly', 'silently', 'genuinely', 'truly', 'honestly', 'incredibly'];
const STIFF = /\b(it is|do not|does not|you will|that is|we are|you are|we have|is not|are not|cannot|we will|there is)\b/gi;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', mdash: '—', ndash: '–', hellip: '...' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const clean = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * Pull headings, text blocks and link or button labels out of a page's HTML.
 * @param {string} html
 * @returns {{headings: string[], blocks: string[], labels: string[]}}
 */
export function fromHtml(html) {
  let body = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of ['head', 'script', 'style', 'noscript', 'svg', 'template', 'header', 'nav', 'footer']) {
    body = body.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'), ' ');
  }
  const headings = [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => clean(m[2])).filter(Boolean);
  const labels = [...body.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => clean(m[2])).filter((t) => t && t.split(' ').length <= 8);
  const blocks = body
    .replace(/<\/?(p|li|h[1-6]|div|section|article|td|th|blockquote|dd|dt|figcaption|summary|details|br|tr|ul|ol)\b[^>]*>/gi, '\n')
    .split('\n').map(clean).filter(Boolean);
  return { headings, blocks, labels };
}

/**
 * Pull headings and paragraphs out of Markdown or MDX. Code, frontmatter and JSX tags are skipped.
 * @param {string} text
 * @returns {{headings: string[], blocks: string[], labels: string[]}}
 */
export function fromMarkdown(text) {
  const src = text.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/```[\s\S]*?```/g, '\n');
  const headings = [];
  const blocks = [];
  for (const para of src.split(/\n\s*\n/)) {
    const lines = para.split('\n').filter((l) => !/^\s*(import|export)\s/.test(l));
    for (const line of lines) {
      const h = line.match(/^#{1,6}\s+(.*)$/);
      if (h) headings.push(mdText(h[1]));
    }
    const prose = mdText(lines.map((l) => l.replace(/^#{1,6}\s+/, '')).join(' '));
    if (prose) blocks.push(prose);
  }
  return { headings: headings.filter(Boolean), blocks, labels: [] };
}
const mdText = (s) => s
  .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[*_`>|]/g, ' ')
  .replace(/^\s*[-+]\s+/gm, '')
  .replace(/\s+/g, ' ').trim();

// A reframe heading sets up a straw man and knocks it down: "Partners, not vendors",
// "Not a feature. A platform.", "It's not X, it's Y".
const REFRAME = [
  /,\s+not\s+(a|an|the|just|your|our)?\s*[a-z]/i,
  /^(it'?s\s+|this\s+is\s+)?not\s+[^.?!]{1,40}[.?!]\s+\S/i,
  /\bnot\s+(just\s+)?[^,.;]{1,40}[,.;]\s*(but|it'?s|they'?re|we'?re)\s/i,
];
export const isReframe = (h) => REFRAME.some((re) => re.test(h));

const words = (s) => s.split(/\s+/).filter(Boolean).length;
const snip = (s, at = 0, n = 70) => {
  const start = Math.max(0, at - 25);
  return `${start > 0 ? '...' : ''}${s.slice(start, start + n).trim()}${start + n < s.length ? '...' : ''}`;
};
function countWords(blocks, list) {
  const hits = new Map();
  for (const b of blocks) {
    for (const w of list) {
      const re = new RegExp(`(^|[^a-z-])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z-])`, 'gi');
      for (const m of b.matchAll(re)) {
        const e = hits.get(w) ?? { n: 0, sample: snip(b, m.index) };
        e.n++;
        hits.set(w, e);
      }
    }
  }
  return hits;
}

/**
 * Check one source. Each finding has gate, grade (FAIL or WARN), evidence and fix.
 * @param {string} name a short label for the source, shown in every finding
 * @param {{headings: string[], blocks: string[], labels: string[]}} doc
 */
export function checkDoc(name, doc) {
  const out = [];
  const add = (gate, grade, evidence, fix) => out.push({ gate, grade, evidence: `[${name}] ${evidence}`, fix });
  const prose = doc.blocks;

  const reframes = [...new Set(doc.headings.filter(isReframe))];
  if (reframes.length >= 2) {
    add('reframe-heading', 'FAIL', `${reframes.length} headings use the "X, not Y" shape: ${reframes.slice(0, 4).map((h) => `"${h}"`).join('; ')}`,
      'Keep at most one, where it is the page\'s real point. State the others plainly.');
  }

  for (const [w, { n, sample }] of countWords(prose, AI_WORDS)) {
    add('ai-vocabulary', 'FAIL', `"${w}" x${n}: ${sample}`, 'Say what it does with a specific verb and noun.');
  }
  for (const [w, { n, sample }] of countWords(prose.map((b) => b.toLowerCase()), SIGNPOSTS)) {
    add('signpost', 'FAIL', `"${w}" x${n}: ${sample}`, 'Cut the label and say the thing.');
  }

  const dashed = prose.filter((b) => /[—–]/.test(b));
  if (dashed.length) {
    const n = dashed.reduce((a, b) => a + (b.match(/[—–]/g) ?? []).length, 0);
    add('dash-in-prose', 'FAIL', `${n} em or en dashes, e.g. ${snip(dashed[0], dashed[0].search(/[—–]/))}`,
      'Use a comma, a period or a new sentence. Number ranges use "to".');
  }

  const total = prose.reduce((a, b) => a + words(b), 0);
  const intense = [...countWords(prose, INTENSIFIERS)];
  const nIntense = intense.reduce((a, [, e]) => a + e.n, 0);
  if (nIntense >= 3) {
    add('intensifier', 'WARN', `${nIntense} intensifiers (${intense.map(([w, e]) => `${w} x${e.n}`).join(', ')})`,
      'Cut each one unless the sentence breaks without it.');
  }

  const stiff = prose.flatMap((b) => [...b.matchAll(STIFF)].map((m) => m[0].toLowerCase()));
  if (stiff.length >= 5 && total && (stiff.length / total) * 1000 >= 4) {
    add('stiff-english', 'WARN', `${stiff.length} uncontracted forms in ${total} words (e.g. "${stiff.slice(0, 3).join('", "')}")`,
      'Use contractions the way a person speaks. Keep a full form only for emphasis.');
  }

  const bang = /[a-z]!(\s|$)/i;
  const bangs = prose.filter((b) => bang.test(b));
  if (bangs.length) add('exclamation', 'WARN', `${bangs.length} blocks with "!", e.g. ${snip(bangs[0], bangs[0].search(bang))}`, 'End on a period.');

  const byLabel = new Map();
  for (const l of doc.labels) byLabel.set(l.toLowerCase(), (byLabel.get(l.toLowerCase()) ?? 0) + 1);
  for (const [l, n] of byLabel) {
    if (n >= 5) add('repeated-cta', 'WARN', `"${l}" appears ${n} times`, 'One clear primary action per screen is enough. Vary or cut the repeats.');
  }
  return out;
}

/**
 * Find blocks of 12 or more words that appear on at least `min` sources, one finding per block.
 * Exceptions apply per block, so `groupRepeats` merges them for the report only afterwards.
 * @param {{name: string, doc: {blocks: string[]}}[]} docs
 */
export function checkRepeats(docs, min = 3) {
  if (docs.length < min) return [];
  const seen = new Map();
  for (const { name, doc } of docs) {
    const mine = new Map(doc.blocks.filter((x) => words(x) >= 12).map((x) => [x.toLowerCase(), x]));
    for (const [key, text] of mine) {
      const e = seen.get(key) ?? { text, names: [] };
      e.names.push(name);
      seen.set(key, e);
    }
  }
  return [...seen.values()].filter((e) => e.names.length >= min).map((e) => ({
    gate: 'repeated-block',
    grade: 'WARN',
    evidence: `on ${e.names.length} pages (${e.names.join(', ')}): "${snip(e.text, 0, 200)}"`,
    fix: REPEAT_FIX,
  }));
}
const REPEAT_FIX = 'A section on many pages reads as filler. Keep it where it does the most work and link to it, or write it for each page.';

/**
 * Merge kept repeated-block findings that share the same pages into one, since they are
 * usually one repeated section. Other findings pass through unchanged.
 * @param {{rule: string, text: string}[]} kept normalized findings
 */
export function groupRepeats(kept) {
  const out = [];
  const groups = new Map();
  for (const f of kept) {
    const m = f.rule === 'repeated-block' && f.text.match(/^on (\d+) pages \((.*?)\): "(.*)"$/s);
    if (!m) { out.push(f); continue; }
    const g = groups.get(m[2]);
    if (g) { g.n++; continue; }
    const entry = { ...f, n: 1, pages: Number(m[1]), names: m[2].split(', '), first: m[3] };
    groups.set(m[2], entry);
    out.push(entry);
  }
  return out.map((f) => {
    if (!f.names) return f;
    const { n, pages, names, first, ...rest } = f;
    const list = `${names.slice(0, 5).join(', ')}${names.length > 5 ? ', ...' : ''}`;
    return { ...rest, text: `${n} block${n > 1 ? 's' : ''} on ${pages} pages (${list}), first: "${first.slice(0, 90)}${first.length > 90 ? '...' : ''}"` };
  });
}

async function load(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; cklph-copy-lint)' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
    const u = new URL(src);
    return { name: u.pathname === '/' ? u.host : u.pathname, doc: fromHtml(await res.text()) };
  }
  const text = readFileSync(src, 'utf8');
  const ext = extname(src).toLowerCase();
  return { name: src, doc: ext === '.html' || ext === '.htm' ? fromHtml(text) : fromMarkdown(text) };
}

async function main(argv) {
  const sources = [];
  let file = null;
  let json = false;
  let raw = false;
  let min = 3;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--exceptions') file = argv[++i];
    else if (a === '--json') json = true;
    else if (a === '--raw') raw = true;
    else if (a === '--repeat-min') min = Number(argv[++i]);
    else if (a === '-h' || a === '--help') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 18).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
      return 0;
    } else if (a.startsWith('-')) { console.error(`copy-lint: unknown option ${a}`); return 1; }
    else sources.push(a);
  }
  if (!sources.length || !(min >= 2)) { console.error('usage: copy-lint.mjs <url|file>... [--exceptions <file>] [--json] [--raw] [--repeat-min <n>]'); return 1; }
  let docs;
  try {
    docs = await Promise.all(sources.map(load));
  } catch (e) {
    console.error(`copy-lint: ${e.message}`);
    return 1;
  }
  const empty = docs.filter((d) => !d.doc.blocks.length);
  if (empty.length) { console.error(`copy-lint: no text found in ${empty.map((d) => d.name).join(', ')}`); return 1; }
  const findings = [...docs.flatMap((d) => checkDoc(d.name, d.doc)), ...checkRepeats(docs, min)];
  if (raw) { console.log(JSON.stringify({ findings }, null, 1)); return findings.some((f) => f.grade === 'FAIL') ? 2 : 0; }
  try {
    const result = applyExceptions(normalize('copy', { findings }), loadExceptions(file));
    result.kept = groupRepeats(result.kept);
    console.log(json ? JSON.stringify(result, null, 1) : report(result));
    return result.kept.some((f) => f.blocking) ? 2 : 0;
  } catch (e) {
    console.error(`copy-lint: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main(process.argv.slice(2));
