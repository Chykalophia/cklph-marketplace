// main.mjs: entry point behind tools/ambiguity.sh (SPEC-v4-ambiguity.md §3.1-§3.3).
//   node main.mjs <code|prose|contract> <root> [--exclude <glob>]... [glob...]
// Owns: CLI parse, walk, per-mode file selection, dynamic import of ONLY the requested mode's
// module (a half-edited prose.mjs cannot break a contract run), sort, AMBIGUITY_MAX cap, the JSON
// array on stdout and every stderr summary line. Mode modules are pure functions over {file,text}.
// Exit 0 with output on success; on an internal error, exit 1 with NO stdout, so the wrapper
// reports `helper failed (exit 1), NOTHING scanned` instead of a silent `[]`.
import fs from 'node:fs';
import path from 'node:path';
import { globMatch, isTestPath, sortRecords, walk } from './common.mjs';

const MODULES = { code: 'code.mjs', prose: 'prose.mjs', contract: 'contract.mjs' };
const SCHEMA_EXT = /\.(js|mjs|cjs|ts|tsx|json)$/;
const DOC_EXT = /\.(mdx?|mdc)$/i;   // .mdc = Cursor rules (markdown with front matter; §15)
const SRC_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|php|rs|sh|yaml|yml|toml)$|(^|\/)[^/]*\.env\.(example|sample)$/;
const NEVER_SRC = /(^|\/)\.env$|\.min\.js$|\.d\.ts$|(^|\/)([^/]*-lock\.(json|ya?ml)|[^/]*\.lock|go\.sum|bun\.lockb)$/;
const NEVER_SCHEMA = /\.min\.js$|(^|\/)[^/]*-lock\.json$/;
const HISTORY_SKIP =/^(CHANGELOG[^/]*|HISTORY\.md|LICENSE[^/]*|NOTICE[^/]*)$/;
const MARKER = /(^|\/)(\.claude-plugin\/plugin\.json|package\.json|pyproject\.toml|go\.mod)$/;

const say = line => process.stderr.write(`${line}\n`);
// a file name with a control char (a newline could forge a summary line) is printed JSON-quoted
const shown = f => (/[\u0000-\u001f\u007f]/.test(f) ? JSON.stringify(f) : f);
const base = f => f.slice(f.lastIndexOf('/') + 1);

function parseArgs(argv) {
  const [mode, root, ...rest] = argv;
  const excludes = [], globs = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--exclude') { if (i + 1 < rest.length) excludes.push(rest[++i]); }
    else if (rest[i].startsWith('--exclude=')) excludes.push(rest[i].slice('--exclude='.length));
    else globs.push(rest[i]);
  }
  return { mode, root, excludes, globs };
}

function maxRecords() {
  const n = Number(process.env.AMBIGUITY_MAX);
  return Number.isInteger(n) && n > 0 ? n : 500;
}
// per-file size cap (bytes): a committed bundle must not stall a review job (§15)
function maxBytes() {
  const n = Number(process.env.AMBIGUITY_MAX_BYTES);
  return Number.isInteger(n) && n > 0 ? n : 1024 * 1024;
}

async function main() {
  const { mode, root, excludes, globs } = parseArgs(process.argv.slice(2));
  if (!Object.hasOwn(MODULES, mode ?? '')) {
    process.stdout.write('[]\n');
    say(`ambiguity.sh: unknown mode '${mode ?? ''}' (code|prose|contract), NOTHING scanned`);
    return;
  }
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    process.stdout.write('[]\n');
    say(`ambiguity.sh: root not found: ${root ?? ''}, NOTHING scanned`);
    return;
  }

  const skip = (file, reason) => say(`ambiguity.sh: skipped ${shown(file)}: ${reason}`);
  const all = walk(root, skip, dir => say(`ambiguity.sh: pruned ${shown(dir)}/ (generated output)`));
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const cap = maxBytes();
  // onSkip(file, reason): docs and source files report a `skipped` line (a reviewer must know that
  // file was not read); contract-mode schema candidates pass their own collector instead (§15 SCHEMA-CAP)
  const read = (file, onSkip = skip) => {
    try {
      const abs = path.join(root, file);
      const size = fs.statSync(abs).size;
      if (size > cap) { onSkip(file, `too large (${size} bytes > ${cap})`, 'size'); return null; }
      return { file, text: decoder.decode(fs.readFileSync(abs)).replace(/\r/g, '') };
    } catch (e) { onSkip(file, e.code === 'ERR_ENCODING_INVALID_ENCODED_DATA' ? 'not valid UTF-8' : e.code || e.message, 'read'); return null; }
  };
  const readAll = (files, onSkip) => files.map(f => read(f, onSkip)).filter(Boolean);
  const excluded = f => excludes.length > 0 && globMatch(f, excludes);
  const historySkip = f => HISTORY_SKIP.test(base(f));

  const mod = await import(new URL(`./${MODULES[mode]}`, import.meta.url));
  let result, skippedTests = 0;
  if (mode === 'contract') {
    const docs = all.filter(f => !historySkip(f) && !excluded(f)
      && (globs.length ? globMatch(f, globs) && (DOC_EXT.test(f) || SCHEMA_EXT.test(f)) : DOC_EXT.test(f)));
    // lockfiles and minified bundles are never schemas (a hand-written .d.ts can be: H3 literal unions).
    // A schema candidate that cannot be read is NOT an unread doc: it gets one informational line per
    // cause, never `skipped` (§15 SCHEMA-CAP).
    const schemas = all.filter(f => SCHEMA_EXT.test(f) && !isTestPath(f) && !NEVER_SCHEMA.test(f));
    const notHarvested = { size: [], read: [] };
    const noteOnce = (f, cause) => { const n = shown(f); if (!notHarvested[cause].includes(n)) notHarvested[cause].push(n); };
    const schemaFiles = readAll(schemas, (f, _reason, cause) => noteOnce(f, cause));
    // a glob-matched code/JSON file read as a doc (§3.5 D6) is not an unread prose doc either: a big
    // openapi.json under 'docs/**' joins the informational schema lines (once), while a markdown doc
    // that cannot be read still gets `skipped` and still fails contract-check (§15 DOC-CAP)
    const docFiles = readAll(docs, (f, reason, cause) => (DOC_EXT.test(f) ? skip(f, reason) : noteOnce(f, cause)));
    const names = l => l.slice(0, 10).join(', ') + (l.length > 10 ? ', …' : '');
    if (notHarvested.size.length) say(`ambiguity.sh contract: ${notHarvested.size.length} schema candidate(s) over the size cap not harvested: ${names(notHarvested.size)}`);
    if (notHarvested.read.length) say(`ambiguity.sh contract: ${notHarvested.read.length} schema candidate(s) unreadable, not harvested: ${names(notHarvested.read)}`);
    result = mod.scanContract({ schemaFiles, docFiles, packageMarkers: all.filter(f => MARKER.test(f)) });
    if (result?.stats?.enums && !result.stats.docs) say('ambiguity.sh contract: 0 docs selected or readable, NOTHING scanned');
  } else if (mode === 'prose') {
    const docs = all.filter(f => DOC_EXT.test(f) && !historySkip(f) && !excluded(f) && (!globs.length || globMatch(f, globs)));
    result = mod.scanProse(readAll(docs), { allSites: process.env.AMBIGUITY_ALL_SITES === '1' });
    if (!result?.stats?.notImplemented && !result?.stats?.files) say('ambiguity.sh prose: 0 docs selected or readable, NOTHING scanned');
  } else {
    const includeTests = process.env.AMBIGUITY_INCLUDE_TESTS === '1';
    const src = [];
    for (const f of all) {
      if (NEVER_SRC.test(f) || excluded(f)) continue;
      if (!(globs.length ? globMatch(f, globs) : SRC_EXT.test(f))) continue;
      if (!includeTests && isTestPath(f)) { skippedTests++; continue; }
      src.push(f);
    }
    result = mod.scanCode(readAll(src));
  }

  const stats = result?.stats ?? {};
  if (stats.notImplemented) {
    process.stdout.write('[]\n');
    say(`ambiguity.sh: ${mode} mode not implemented, NOTHING scanned`);
    return;
  }
  let records = sortRecords(result?.records ?? []);
  const max = maxRecords();
  if (records.length > max) {
    say(`ambiguity.sh: ${records.length} record(s), truncated to ${max}`);
    records = records.slice(0, max);
  }
  process.stdout.write(JSON.stringify(records) + '\n');

  const E = records.length;
  if (mode === 'prose') say(`ambiguity.sh prose: files=${stats.files} sentences=${stats.sentences} normative=${stats.normative} emitted=${E}`);
  else if (mode === 'code') say(`ambiguity.sh code: files=${stats.files} skippedTests=${skippedTests} emitted=${E}`);
  else if (!stats.enums) say(`ambiguity.sh contract: no schema enums found under ${root}, contract check NOT run`);
  else say(`ambiguity.sh contract: enums=${stats.enums} fields=[${(stats.fields ?? []).join(',')}] docs=${stats.docs} emitted=${E}`);
}

main().catch(e => {
  say(`ambiguity.sh: internal error: ${e && e.stack ? e.stack.split('\n')[0] : e}`);
  process.exitCode = 1;
});
