#!/usr/bin/env bash
# ambiguity.sh — recall layer for the ambiguity lens (SPEC-v4-ambiguity.md §3).
# Usage: ambiguity.sh <code|prose|contract> <root> [--exclude <glob>]... [glob...]
#   code     globs filter source files; none = default source extensions
#   prose    globs filter markdown files; none = every *.md / *.mdx / *.mdc under root
#   contract globs filter the DOCS; schemas are always collected from all of root
# env: AMBIGUITY_MAX (default 500), AMBIGUITY_MAX_BYTES (per-file cap, default 1048576; larger files are
#      skipped by name), AMBIGUITY_ALL_SITES=1 (prose), AMBIGUITY_INCLUDE_TESTS=1 (code)
# Emits ONE JSON array on stdout and one machine-parseable summary line on stderr.
# Exits 0 ALWAYS; every failure prints [] plus a loud "NOTHING scanned" line (never a silent []).
# Deps: bash + node >= 18 (no fallback). The work lives in ambiguity/main.mjs.
set -uo pipefail

MODE="${1:-}"
case "$MODE" in
  code|prose|contract) ;;
  *) printf '[]\n'; printf "ambiguity.sh: unknown mode '%s' (code|prose|contract), NOTHING scanned\n" "$MODE" >&2; exit 0 ;;
esac

ROOT="${2:-}"
if [ -z "$ROOT" ] || [ ! -d "$ROOT" ]; then
  printf '[]\n'; printf 'ambiguity.sh: root not found: %s, NOTHING scanned\n' "$ROOT" >&2; exit 0
fi
shift 2

if ! command -v node >/dev/null 2>&1; then
  printf '[]\n'; printf 'ambiguity.sh: node not found, NOTHING scanned\n' >&2; exit 0
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$(node "$HERE/ambiguity/main.mjs" "$MODE" "$ROOT" "$@")"
RC=$?
if [ "$RC" -ne 0 ] || [ -z "$OUT" ]; then
  printf '[]\n'; printf 'ambiguity.sh: helper failed (exit %s), NOTHING scanned\n' "$RC" >&2; exit 0
fi
printf '%s\n' "$OUT"
exit 0
