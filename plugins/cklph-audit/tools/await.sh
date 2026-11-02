#!/usr/bin/env bash
# await.sh — floating-promise / missing-await detection for the correctness lens.
# Runs the repo's ESLint (no-floating-promises) + tsc. Emits JSON lines. Degrades gracefully.
#
# Projects: the nearest tsconfig.json at or above the target; when there is none (a monorepo
# root, say), every tsconfig.json up to 4 levels below it (max $AWAIT_MAX_PROJECTS, default 6;
# node_modules, .next, dist and build are skipped).
# When the repo's ESLint config does not enable @typescript-eslint/no-floating-promises for the
# target, a typed lint with only the promise rules runs per project, using the project's own
# typescript-eslint (or @typescript-eslint/parser + eslint-plugin). Test files are excluded from
# that fallback. AWAIT_TYPED_FALLBACK=0 turns it off.
set -uo pipefail
TARGET="${1:-.}"
ORIG="$(pwd)"
MAX_PROJECTS="${AWAIT_MAX_PROJECTS:-6}"
case "$MAX_PROJECTS" in ''|*[!0-9]*) echo "await.sh: AWAIT_MAX_PROJECTS='$MAX_PROJECTS' is not a whole number — using 6." >&2; MAX_PROJECTS=6 ;; esac

if ! command -v npx >/dev/null 2>&1; then
  echo "tool not installed: npx (Node.js) — needed for eslint + tsc." >&2
  exit 0
fi
if ! command -v node >/dev/null 2>&1; then
  echo "await.sh: node not found — eslint findings NOT collected and the typed promise lint NOT run." >&2
  exit 0
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cklph-await.XXXXXX")" || { echo "await.sh: mktemp failed — nothing checked." >&2; exit 0; }
trap 'rm -rf "$WORK"' EXIT

emit_promise_hits() { # $1 = tool label; ESLint JSON on stdin
  node -e '
    let data = []; try { data = JSON.parse(require("fs").readFileSync(0,"utf8")); } catch (e) { process.stderr.write("await.sh: eslint output is not valid JSON (" + e.message + ") — eslint findings NOT collected.\n"); }
    for (const f of data) for (const m of (f.messages || [])) {
      if (/no-floating-promises|no-misused-promises|require-await/.test(m.ruleId || "")) {
        process.stdout.write(JSON.stringify({
          tool: process.argv[1], rule: m.ruleId,
          severity: /no-floating-promises/.test(m.ruleId) ? "high" : "medium",
          file: f.filePath, line: m.line, message: m.message,
          rationale: "Floating/misused promise — verify it is truly unawaited, not fire-and-forget by design, and that a rejection is handled"
        }) + "\n");
      }
    }' "$1"
}

# The target may be a file or a glob (unit paths often are): start from its nearest existing dir.
SEARCH="$TARGET"
while [ ! -d "$SEARCH" ] && [ "$SEARCH" != "/" ] && [ "$SEARCH" != "." ]; do SEARCH="$(dirname -- "$SEARCH")"; done
SEARCH_ABS="$(cd -- "$SEARCH" 2>/dev/null && pwd)" || SEARCH_ABS=""
if [ -z "$SEARCH_ABS" ] || [ "$SEARCH_ABS" = "/" ]; then
  echo "await.sh: target $TARGET does not resolve to a directory below / — nothing checked." >&2
  exit 0
fi
case "$TARGET" in /*) TARGET_ABS="$TARGET" ;; *) TARGET_ABS="$ORIG/$TARGET" ;; esac

# ── projects (directories holding a tsconfig.json) ───────────────────────────
PROJECTS=()
P="$SEARCH_ABS"
while [ ! -f "$P/tsconfig.json" ] && [ "$P" != "/" ]; do P="$(dirname "$P")"; done
if [ -f "$P/tsconfig.json" ]; then
  PROJECTS+=("$P")
  SCOPE_BELOW=0
else
  while IFS= read -r cfg; do
    [ "${#PROJECTS[@]}" -ge "$MAX_PROJECTS" ] && { echo "note: more than $MAX_PROJECTS tsconfig.json projects below $TARGET — only the first $MAX_PROJECTS were checked (AWAIT_MAX_PROJECTS raises the cap)." >&2; break; }
    PROJECTS+=("$(dirname "$cfg")")
  done < <(find "$SEARCH_ABS" -maxdepth 4 \( -name node_modules -o -name .next -o -name dist -o -name build -o -name .git \) -prune -o -name tsconfig.json -type f -print 2>/dev/null | sort)
  SCOPE_BELOW=1
fi

# ── ESLint with the repo's own config ────────────────────────────────────────
ESLINT_JSON="$(npx --no-install eslint --format json "$TARGET" 2> "$WORK/repo-eslint.err")"
if [ -n "$ESLINT_JSON" ]; then
  emit_promise_hits eslint <<<"$ESLINT_JSON"
else
  echo "await.sh: the repo's eslint produced no output for $TARGET: $(head -c 200 "$WORK/repo-eslint.err") — its findings NOT collected (the typed fallback below may still run)." >&2
fi

# Does the repo config turn the rule on for this target? Ask ESLint for the resolved config of a
# TypeScript file inside the target (per-file overrides can differ), else one in the project.
rule_enabled() { # $1 = project dir, $2 = directory to sample from
  local sample
  sample="$(find "$2" \( -name node_modules -o -name .next -o -name dist -o -name build \) -prune -o \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.d.ts' -type f -print 2>/dev/null | head -n 1)"
  [ -n "$sample" ] || sample="$(find "$1" \( -name node_modules -o -name .next -o -name dist -o -name build \) -prune -o \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.d.ts' -type f -print 2>/dev/null | head -n 1)"
  [ -n "$sample" ] || return 1
  (cd "$1" && npx --no-install eslint --print-config "$sample" 2>/dev/null) \
    | node -e 'let c={}; try { c=JSON.parse(require("fs").readFileSync(0,"utf8")); } catch {} const r=(c.rules||{})["@typescript-eslint/no-floating-promises"]; const s=Array.isArray(r)?r[0]:r; process.exit(s===undefined||s===0||s==="off"?1:0)'
}

# typescript-eslint is often not hoisted (pnpm), so also resolve through the project's eslint
# deps. Prints JSON {tse} for the unified package, or {parser, plugin} for the split packages.
resolve_tseslint() { # $1 = project dir
  node -e '
    const path = require("path"); const { pathToFileURL } = require("url"); const P = process.argv[1];
    const tryR = (n, ps) => { try { return require.resolve(n, { paths: ps }); } catch { return null; } };
    let pkg = {}; try { pkg = require(path.join(P, "package.json")); } catch {}
    const bases = [P];
    for (const d of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(d => /eslint/.test(d))) {
      const pj = tryR(d + "/package.json", [P]);
      if (pj) bases.push(path.dirname(pj));
    }
    const find = (n) => { for (const b of bases) { const h = tryR(n, [b]); if (h) return pathToFileURL(h).href; } return null; };
    const tse = find("typescript-eslint");
    if (tse) { process.stdout.write(JSON.stringify({ tse })); process.exit(0); }
    const parser = find("@typescript-eslint/parser"), plugin = find("@typescript-eslint/eslint-plugin");
    if (parser && plugin) process.stdout.write(JSON.stringify({ parser, plugin }));' "$1" 2>/dev/null
}

if [ "${#PROJECTS[@]}" -eq 0 ]; then
  echo "note: no tsconfig.json at, above or below $TARGET — 'tsc --noEmit' and the typed promise lint not run." >&2
  exit 0
fi

for PROJ in "${PROJECTS[@]}"; do
  # tsc is the exact backstop; surface that it ran (compile errors often hide await bugs).
  if ! (cd "$PROJ" && npx --no-install tsc --noEmit >/dev/null 2>&1); then
    echo "note: 'tsc --noEmit' (in $PROJ) reported errors — run it directly; type errors frequently mask missing awaits." >&2
  else
    echo "note: 'tsc --noEmit' clean in $PROJ." >&2
  fi

  [ "${AWAIT_TYPED_FALLBACK:-1}" = "0" ] && continue
  if [ "$SCOPE_BELOW" = "1" ]; then LINT_TARGET="."; SAMPLE_DIR="$PROJ"; else LINT_TARGET="$TARGET_ABS"; SAMPLE_DIR="$SEARCH_ABS"; fi
  if rule_enabled "$PROJ" "$SAMPLE_DIR"; then continue; fi
  MODS="$(resolve_tseslint "$PROJ")"
  if [ -z "$MODS" ]; then
    echo "tool not installed (or rule off): eslint with @typescript-eslint/no-floating-promises in $PROJ, and typescript-eslint is not resolvable there for a typed fallback — floating promises NOT checked." >&2
    continue
  fi
  CFG="$WORK/eslint-promises-$RANDOM.config.mjs"
  # Module paths and the project root go in as JSON strings, so quotes or backslashes can't break it.
  node -e '
    const [cfg, mods, proj] = process.argv.slice(1);
    const m = JSON.parse(mods);
    const head = m.tse
      ? ["import tseslint from " + JSON.stringify(m.tse) + ";", "const parser = tseslint.parser, plugin = tseslint.plugin;"]
      : ["import * as parserMod from " + JSON.stringify(m.parser) + ";", "import * as pluginMod from " + JSON.stringify(m.plugin) + ";",
         "const parser = parserMod.default ?? parserMod, plugin = pluginMod.default ?? pluginMod;"];
    require("fs").writeFileSync(cfg, head.concat([
      "export default [{",
      "  files: [\"**/*.{ts,tsx,mts,cts}\"],",
      "  ignores: [\"**/*.test.*\", \"**/*.spec.*\", \"**/__tests__/**\", \"**/*.d.ts\"],",
      "  languageOptions: { parser, parserOptions: { projectService: true, tsconfigRootDir: " + JSON.stringify(proj) + " } },",
      "  plugins: { \"@typescript-eslint\": plugin },",
      "  linterOptions: { reportUnusedDisableDirectives: \"off\" },",
      "  rules: { \"@typescript-eslint/no-floating-promises\": \"error\", \"@typescript-eslint/no-misused-promises\": \"error\" },",
      "}];", ""]).join("\n"));' "$CFG" "$MODS" "$PROJ"
  # ESLint 8 reads a flat config only when asked to.
  OUT="$(cd "$PROJ" && ESLINT_USE_FLAT_CONFIG=true npx --no-install eslint -c "$CFG" --format json "$LINT_TARGET" 2> "$WORK/typed.err")"
  if [ -z "$OUT" ]; then
    echo "await.sh: typed promise lint in $PROJ produced no output: $(head -c 300 "$WORK/typed.err") — floating promises NOT checked there." >&2
  else
    echo "note: repo eslint config does not enable no-floating-promises in $PROJ — ran a typed fallback lint with only the promise rules (test files excluded)." >&2
    emit_promise_hits eslint-typed <<<"$OUT"
  fi
done
exit 0
