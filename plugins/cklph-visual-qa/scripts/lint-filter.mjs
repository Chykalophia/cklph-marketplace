#!/usr/bin/env node
// lint-filter: apply a site's design exceptions to a detector's JSON output, then report.
//
// Usage:
//   lint-filter.mjs --tool impeccable|hallmark [--exceptions <file>] [--json] < findings.json
//
// Reads impeccable's `detect --json` array or Hallmark's `sloplint --json` object on stdin.
// Findings whose rule is listed in the exceptions file are moved to an "excused" list with
// the reason from the file. The default exceptions file is .cklph/design-exceptions.json in
// the current directory, used only when it exists.
//
// Exit codes: 0 nothing that blocks, 2 blocking findings remain, 1 bad input.
// Blocking means a Hallmark FAIL or an impeccable "quality" finding. Taste findings
// (impeccable "slop", Hallmark REFLEX and WARN) are reported but never block.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TOOLS = ['impeccable', 'hallmark'];
export const DEFAULT_EXCEPTIONS = '.cklph/design-exceptions.json';

/**
 * Parse and validate an exceptions file's text. Every entry needs a tool, a rule and a reason.
 * An optional `match` narrows the entry to findings whose text contains it.
 * @param {string} text
 * @returns {{tool: string, rule: string, reason: string, match?: string}[]}
 */
export function parseExceptions(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data?.exceptions) ? data.exceptions : null;
  if (!list) throw new Error('exceptions file needs an "exceptions" array');
  return list.map((e, i) => {
    const where = `exceptions[${i}]`;
    if (!TOOLS.includes(e?.tool)) throw new Error(`${where}: tool must be one of ${TOOLS.join(', ')}`);
    if (typeof e.rule !== 'string' || !e.rule.trim()) throw new Error(`${where}: rule is required`);
    if (typeof e.reason !== 'string' || !e.reason.trim()) throw new Error(`${where}: a reason is required, so every exception is on the record`);
    if (e.match !== undefined && (typeof e.match !== 'string' || !e.match)) throw new Error(`${where}: match must be a non-empty string`);
    return { tool: e.tool, rule: e.rule.trim(), reason: e.reason.trim(), ...(e.match ? { match: e.match } : {}) };
  });
}

/**
 * Turn one detector's raw JSON into a common finding shape.
 * @param {'impeccable'|'hallmark'} tool
 * @param {unknown} raw
 * @returns {{tool: string, rule: string, level: string, blocking: boolean, text: string, fix: string}[]}
 */
export function normalize(tool, raw) {
  if (tool === 'impeccable') {
    if (!Array.isArray(raw)) throw new Error('impeccable output should be a JSON array');
    return raw.map((f) => ({
      tool,
      rule: String(f.antipattern ?? ''),
      level: String(f.category ?? 'quality'),
      blocking: f.category !== 'slop',
      text: [f.selector, f.snippet].filter(Boolean).join(' | '),
      fix: String(f.description ?? ''),
    }));
  }
  if (tool === 'hallmark') {
    if (!Array.isArray(raw?.findings)) throw new Error('hallmark output should be an object with a findings array');
    return raw.findings.map((f) => ({
      tool,
      rule: String(f.gate ?? ''),
      level: String(f.grade ?? ''),
      blocking: f.grade === 'FAIL',
      text: String(f.evidence ?? ''),
      fix: String(f.fix ?? ''),
    }));
  }
  throw new Error(`unknown tool: ${tool}`);
}

/**
 * Split findings into kept and excused.
 * @returns {{kept: object[], excused: {finding: object, reason: string}[]}}
 */
export function applyExceptions(findings, exceptions) {
  const kept = [];
  const excused = [];
  for (const f of findings) {
    const hit = exceptions.find((e) => e.tool === f.tool && e.rule === f.rule && (!e.match || f.text.includes(e.match)));
    if (hit) excused.push({ finding: f, reason: hit.reason });
    else kept.push(f);
  }
  return { kept, excused };
}

function report({ kept, excused }) {
  const lines = [];
  const blocking = kept.filter((f) => f.blocking);
  const taste = kept.filter((f) => !f.blocking);
  const show = (f) => `  [${f.tool} ${f.rule} ${f.level}] ${f.text}${f.fix ? `\n      fix: ${f.fix.slice(0, 160)}` : ''}`;
  if (blocking.length) lines.push(`Check and fix or dismiss (${blocking.length}):`, ...blocking.map(show));
  if (taste.length) lines.push(`Taste, for a person to judge (${taste.length}):`, ...taste.map(show));
  if (excused.length) {
    const byRule = new Map();
    for (const { finding, reason } of excused) {
      const key = `${finding.tool} ${finding.rule}`;
      byRule.set(key, { reason, n: (byRule.get(key)?.n ?? 0) + 1 });
    }
    lines.push(`Excused by the site's exceptions (${excused.length}):`);
    for (const [key, { reason, n }] of byRule) lines.push(`  [${key}] x${n}: ${reason}`);
  }
  lines.push(`${blocking.length} to check, ${taste.length} taste, ${excused.length} excused.`);
  return lines.join('\n');
}

function main(argv) {
  let tool = null;
  let file = null;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tool') tool = argv[++i];
    else if (argv[i] === '--exceptions') file = argv[++i];
    else if (argv[i] === '--json') json = true;
    else { console.error(`lint-filter: unknown argument ${argv[i]}`); return 1; }
  }
  if (!TOOLS.includes(tool)) { console.error('usage: lint-filter.mjs --tool impeccable|hallmark [--exceptions <file>] [--json] < findings.json'); return 1; }
  try {
    let exceptions = [];
    const path = file ?? (existsSync(DEFAULT_EXCEPTIONS) ? DEFAULT_EXCEPTIONS : null);
    if (path) exceptions = parseExceptions(readFileSync(path, 'utf8'));
    const result = applyExceptions(normalize(tool, JSON.parse(readFileSync(0, 'utf8'))), exceptions);
    console.log(json ? JSON.stringify(result, null, 1) : report(result));
    return result.kept.some((f) => f.blocking) ? 2 : 0;
  } catch (e) {
    console.error(`lint-filter: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
