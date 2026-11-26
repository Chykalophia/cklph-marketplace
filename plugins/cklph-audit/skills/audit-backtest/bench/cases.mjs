// cases.mjs: the benchmark case list, built from the fixtures layout, plus neutral staging.
//
// A case is one fixture file. Its ground truth comes from its folder (should-flag = vulnerable,
// should-not-flag = safe), and fixtures/safe-lookalikes.json marks the safe ones that look
// vulnerable. Staging copies a case into a fresh directory with the label header removed and a
// neutral file name, so no path or comment tells the reviewer the verdict.
import fs from 'node:fs';
import path from 'node:path';

// Lenses whose fixtures are one self-contained source file each. Others (ambiguity, sca, docs-drift,
// agent-config, supply-chain, container, iac, k8s) need their folder layout or a tool root.
export const DEFAULT_LENSES = ['security', 'web-auth', 'client-side', 'data-isolation', 'llm', 'messaging', 'availability', 'architecture', 'omission'];

const GROUNDS = { 'should-flag': 'vulnerable', 'should-not-flag': 'safe' };

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** Read fixtures/safe-lookalikes.json into a Map of fixtures-relative file -> entry. */
export function loadLookalikes(pluginRoot) {
  const p = path.join(pluginRoot, 'fixtures', 'safe-lookalikes.json');
  const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
  return new Map((doc.cases ?? []).map(c => [c.file, c]));
}

/** Every benchmark case for the given lenses, sorted by id. */
export function listCases(pluginRoot, { lenses = DEFAULT_LENSES } = {}) {
  const fixtures = path.join(pluginRoot, 'fixtures');
  const lookalikes = loadLookalikes(pluginRoot);
  const cases = [];
  for (const lens of lenses) {
    for (const [folder, ground] of Object.entries(GROUNDS)) {
      for (const abs of walk(path.join(fixtures, lens, folder))) {
        const file = path.relative(fixtures, abs).split(path.sep).join('/');
        const entry = lookalikes.get(file);
        cases.push({ id: file, lens, file, ground, lookalike: Boolean(entry), class: entry?.class ?? null });
      }
    }
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

const COMMENT = [
  { exts: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'], line: /^\s*\/\// },
  { exts: ['.sql'], line: /^\s*--/ },
  { exts: ['.py', '.yml', '.yaml', '.tf', '.toml', '.sh'], line: /^\s*#/ },
];
const LABEL = /FIXTURE|Expected verdict|should-(?:not-)?flag|\b(?:PRECISION|RECALL)\b|lookalike|\bTwin\b|\bplanted\b/i;

/** Remove the leading label comment block (the FIXTURE header) from a fixture's source. */
export function neutralize(src, file) {
  const ext = path.extname(file.replace(/\.example(?=\.)/, ''));
  if (ext === '.md') {
    const m = /^\s*<!--[\s\S]*?-->\s*\n?/.exec(src);
    return m && LABEL.test(m[0]) ? src.slice(m[0].length) : src;
  }
  const style = COMMENT.find(c => c.exts.includes(ext));
  if (!style) return src;
  const lines = src.split('\n');
  let i = 0;
  while (i < lines.length && style.line.test(lines[i])) i++;
  return LABEL.test(lines.slice(0, i).join('\n')) ? lines.slice(i).join('\n').replace(/^\s*\n/, '') : src;
}

/** A file name that keeps the extension and drops everything else in the fixture's name. */
export function neutralName(file) {
  const ext = path.extname(file.replace(/\.example(?=\.)/, ''));
  if (ext === '.md') return 'README.md';
  if (ext === '.sql') return 'schema.sql';
  return `handler${ext}`;
}

/** Copy one case into <dest>/src/<neutral name>, label header removed. Returns the written path. */
export function stageCase(pluginRoot, c, dest) {
  const src = fs.readFileSync(path.join(pluginRoot, 'fixtures', c.file), 'utf8');
  const out = path.join(dest, 'src', neutralName(c.file));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, neutralize(src, c.file));
  return out;
}

export const LABEL_PATTERN = LABEL;
