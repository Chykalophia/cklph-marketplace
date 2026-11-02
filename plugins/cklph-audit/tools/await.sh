#!/usr/bin/env bash
# await.sh — floating-promise / missing-await detection for the correctness lens.
# Runs the repo's ESLint (no-floating-promises) + tsc. Emits JSON lines. Degrades gracefully.
#
# Projects: the nearest tsconfig.json at or above the target; when there is none (a monorepo
# root, say), every tsconfig.json up to 4 levels below it (max $AWAIT_MAX_PROJECTS, default 6).
# When the repo's ESLint config does not enable @typescript-eslint/no-floating-promises, a typed
# lint with only the promise rules runs per project, using the project's own typescript-eslint.
# AWAIT_TYPED_FALLBACK=0 turns that off.
set -uo pipefail
TARGET="${1:-.}"
ORIG="$(pwd)"
MAX_PROJECTS="${AWAIT_MAX_PROJECTS:-6}"

if ! command -v npx >/dev/null 2>&1; then
  echo "tool not installed: npx (Node.js) — needed for eslint + tsc." >&2
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
case "$TARGET" in /*) TARGET_ABS="$TARGET" ;; *) TARGET_ABS="$ORIG/$TARGET" ;; esac

# ── projects (directories holding a tsconfig.json) ───────────────────────────
PROJECTS=()
P="$SEARCH_ABS"
while [ -n "$P" ] && [ ! -f "$P/tsconfig.json" ] && [ "$P" != "/" ]; do P="$(dirname "$P")"; done
if [ -n "$P" ] && [ -f "$P/tsconfig.json" ]; then
  PROJECTS+=("$P")
  SCOPE_BELOW=0
elif [ -n "$SEARCH_ABS" ]; then
  while IFS= read -r cfg; do
    [ "${#PROJECTS[@]}" -ge "$MAX_PROJECTS" ] && { echo "note: more than $MAX_PROJECTS tsconfig.json projects below $TARGET — only the first $MAX_PROJECTS were checked (AWAIT_MAX_PROJECTS raises the cap)." >&2; break; }
    PROJECTS+=("$(dirname "$cfg")")
  done < <(find "$SEARCH_ABS" -maxdepth 4 \( -name node_modules -o -name .next -o -name dist -o -name build -o -name .git \) -prune -o -name tsconfig.json -type f -print 2>/dev/null | sort)
  SCOPE_BELOW=1
fi

# ── ESLint with the repo's own config ────────────────────────────────────────
ESLINT_JSON="$(npx --no-install eslint --format json "$TARGET" 2>/dev/null)"
if [ -n "$ESLINT_JSON" ] && command -v node >/dev/null 2>&1; then
  emit_promise_hits eslint <<<"$ESLINT_JSON"
fi

# Does the repo config turn the rule on? Ask ESLint for the resolved config of one TS file.
rule_enabled() { # $1 = project dir
  local sample
  sample="$(find "$1" \( -name node_modules -o -name .next -o -name dist -o -name build \) -prune -o \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.d.ts' -type f -print 2>/dev/null | head -n 1)"
  [ -n "$sample" ] || return 1
  (cd "$1" && npx --no-install eslint --print-config "$sample" 2>/dev/null) \
    | node -e 'let c={}; try { c=JSON.parse(require("fs").readFileSync(0,"utf8")); } catch {} const r=(c.rules||{})["@typescript-eslint/no-floating-promises"]; const s=Array.isArray(r)?r[0]:r; process.exit(s===undefined||s===0||s==="off"?1:0)'
}

# typescript-eslint is often not hoisted (pnpm), so also resolve it from the project's eslint deps.
resolve_tseslint() { # $1 = project dir; prints a file:// URL or nothing
  node -e '
    const path = require("path"); const P = process.argv[1];
    const tryR = (n, ps) => { try { return require.resolve(n, { paths: ps }); } catch { return null; } };
    let hit = tryR("typescript-eslint", [P]);
    if (!hit) {
      let pkg = {}; try { pkg = require(path.join(P, "package.json")); } catch {}
      for (const d of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(d => /eslint/.test(d))) {
        const pj = tryR(d + "/package.json", [P]);
        if (pj && (hit = tryR("typescript-eslint", [path.dirname(pj)]))) break;
      }
    }
    if (hit) process.stdout.write(require("url").pathToFileURL(hit).href);' "$1" 2>/dev/null
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
  command -v node >/dev/null 2>&1 || { echo "await.sh: node not found — typed promise lint NOT run in $PROJ." >&2; continue; }
  if rule_enabled "$PROJ"; then continue; fi
  TSE="$(resolve_tseslint "$PROJ")"
  if [ -z "$TSE" ]; then
    echo "tool not installed (or rule off): eslint with @typescript-eslint/no-floating-promises in $PROJ, and typescript-eslint is not resolvable there for a typed fallback — floating promises NOT checked." >&2
    continue
  fi
  CFG="$WORK/eslint-promises-$RANDOM.config.mjs"
  cat > "$CFG" <<EOF
import tseslint from "$TSE";
export default [{
  files: ["**/*.{ts,tsx,mts,cts}"],
  ignores: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/*.d.ts"],
  languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true, tsconfigRootDir: "$PROJ" } },
  plugins: { "@typescript-eslint": tseslint.plugin },
  linterOptions: { reportUnusedDisableDirectives: "off" },
  rules: { "@typescript-eslint/no-floating-promises": "error", "@typescript-eslint/no-misused-promises": "error" },
}];
EOF
  if [ "$SCOPE_BELOW" = "1" ]; then LINT_TARGET="."; else LINT_TARGET="$TARGET_ABS"; fi
  OUT="$(cd "$PROJ" && npx --no-install eslint -c "$CFG" --format json "$LINT_TARGET" 2> "$WORK/typed.err")"
  if [ -z "$OUT" ]; then
    echo "await.sh: typed promise lint in $PROJ produced no output: $(head -c 300 "$WORK/typed.err") — floating promises NOT checked there." >&2
  else
    echo "note: repo eslint config does not enable no-floating-promises in $PROJ — ran a typed fallback lint with only the promise rules." >&2
    emit_promise_hits eslint-typed <<<"$OUT"
  fi
done
exit 0
