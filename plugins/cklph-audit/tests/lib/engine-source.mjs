// engine-source.mjs: read engine literals out of workflows/audit.workflow.js SOURCE TEXT, so tests
// and checks compare against the engine itself, never a hand copy (SPEC-v4-ambiguity.md §3.1).
// Dev-only (tests/lib/ is not picked up by `node --test tests/*.test.mjs`).
//
// Each parser throws on a missing or unparseable literal; none ever returns an empty default.

// Parse the body of a `[ 'a', 'b' ]` literal: single-quoted strings, commas and whitespace only.
function parseArray(body, what) {
  const values = [];
  const rest = body.replace(/'((?:[^'\\\n]|\\.)*)'/g, (_, s) => { values.push(s.replace(/\\(.)/g, '$1')); return ''; });
  if (rest.replace(/[\s,]/g, '') !== '') throw new Error(`engine-source: ${what} is not a plain array of single-quoted strings`);
  if (!values.length) throw new Error(`engine-source: ${what} is empty`);
  return values;
}

function constArray(src, name) {
  const m = new RegExp(`\\bconst\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(String(src));
  if (!m) throw new Error(`engine-source: no \`const ${name} = [...]\` literal in the engine source`);
  return parseArray(m[1], name);
}

// AMBIGUITY_PROSE_DEFAULT = { policy: [...], instructions: [...] } → { policy, instructions }
export function parseProseDefault(src) {
  const m = /\bconst\s+AMBIGUITY_PROSE_DEFAULT\s*=\s*\{([\s\S]*?)\n?\}/.exec(String(src));
  if (!m) throw new Error('engine-source: no `const AMBIGUITY_PROSE_DEFAULT = {...}` literal in the engine source');
  const out = {};
  for (const key of ['policy', 'instructions']) {
    const k = new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*)\\]`).exec(m[1]);
    if (!k) throw new Error(`engine-source: AMBIGUITY_PROSE_DEFAULT has no \`${key}: [...]\``);
    out[key] = parseArray(k[1], `AMBIGUITY_PROSE_DEFAULT.${key}`);
  }
  return out;
}

export const parseExcludeDefault = src => constArray(src, 'AMBIGUITY_EXCLUDE_DEFAULT');
export const parseLensHints = src => constArray(src, 'LENS_HINTS');
