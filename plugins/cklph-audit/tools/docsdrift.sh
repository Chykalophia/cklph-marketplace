#!/usr/bin/env bash
# docsdrift.sh — docs-vs-reality drift detection for the docs-drift lens (recall layer).
# Usage: docsdrift.sh <repo-root> <doc>...
# Extracts backtick-quoted path-like tokens (contains / or a file extension), pnpm|npm|yarn
# run script names, and bare dir refs (src/) from each doc; checks paths/globs against
# <repo-root> and scripts/packages against <repo-root>/package.json. Emits ONE JSON array:
#   [{"doc":…,"line":…,"token":…,"kind":"path|script|package","exists":true|false}]
# Missing docs / no tokens → []. Exits 0 ALWAYS — this tool never crashes the reviewer.
# Deps: bash + standard POSIX utils only. jq NOT assumed; node used for package.json
# parsing when present, sed fallback otherwise. Degrades gracefully.
set -uo pipefail

ROOT="${1:-.}"
[ $# -gt 0 ] && shift

PKG="$ROOT/package.json"
ENTRIES=""

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

emit() { # doc line token kind exists(true|false)
  local e
  e="{\"doc\":\"$(json_escape "$1")\",\"line\":$2,\"token\":\"$(json_escape "$3")\",\"kind\":\"$4\",\"exists\":$5}"
  if [ -n "$ENTRIES" ]; then ENTRIES="$ENTRIES,$e"; else ENTRIES="$e"; fi
}

# --- package.json: script names + dependency lookup (node preferred, sed fallback) -----
SCRIPTS=""
if [ -f "$PKG" ]; then
  if command -v node >/dev/null 2>&1; then
    SCRIPTS="$(node -e 'try{const p=require(process.argv[1]);process.stdout.write(Object.keys(p.scripts||{}).join("\n"))}catch(e){}' "$PKG" 2>/dev/null)"
  else
    # dependency-free fallback: quoted keys inside the "scripts" block
    SCRIPTS="$(sed -n '/"scripts"[[:space:]]*:/,/}/p' "$PKG" 2>/dev/null | sed -n 's/^[[:space:]]*"\([^"]*\)"[[:space:]]*:.*/\1/p' | grep -v '^scripts$')"
  fi
fi

script_exists() { [ -n "$SCRIPTS" ] && printf '%s\n' "$SCRIPTS" | grep -qFx -- "$1"; }

dep_exists() { # npm package present in any dependency block?
  [ -f "$PKG" ] || return 1
  if command -v node >/dev/null 2>&1; then
    node -e 'try{const p=require(process.argv[1]);const d=Object.assign({},p.dependencies,p.devDependencies,p.peerDependencies,p.optionalDependencies);process.exit(d[process.argv[2]]?0:1)}catch(e){process.exit(1)}' "$PKG" "$1" 2>/dev/null
  else
    grep -qF "\"$1\"" "$PKG" 2>/dev/null
  fi
}

path_exists() { # repo-root-relative; tolerates leading ./ or /; globs via compgen
  local p="$1"
  p="${p#./}"; p="${p#/}"
  [ -n "$p" ] || return 1
  [ -e "$ROOT/$p" ] && return 0
  case "$p" in
    *\**|*\?*) compgen -G "$ROOT/$p" >/dev/null 2>&1 && return 0 ;;
  esac
  return 1
}

bool() { if "$@"; then printf 'true'; else printf 'false'; fi; }

# --- scan each doc, line by line --------------------------------------------------------
for DOC in "$@"; do
  [ -f "$DOC" ] && [ -r "$DOC" ] || continue # missing doc → contributes nothing
  N=0
  while IFS= read -r LINE || [ -n "$LINE" ]; do
    N=$((N+1))

    # 1) script names — "pnpm|npm|yarn run <name>", backticked or bare
    CMDS="$(printf '%s\n' "$LINE" | grep -oE '(pnpm|npm|yarn)[[:space:]]+run[[:space:]]+[A-Za-z0-9:._-]+' || true)"
    while IFS= read -r C; do
      [ -n "$C" ] || continue
      NAME="${C##*[[:space:]]}"
      emit "$DOC" "$N" "$NAME" "script" "$(bool script_exists "$NAME")"
    done <<<"$CMDS"

    # 2) backtick-quoted tokens → package (@scope/name) | path (has / or an extension)
    TOKS="$(printf '%s\n' "$LINE" | grep -oE '`[^`]+`' | sed 's/`//g' || true)"
    while IFS= read -r T; do
      [ -n "$T" ] || continue
      case "$T" in
        *" "*|*"://"*|*'$'*) continue ;; # commands, URLs, templated paths — not checkable
      esac
      if printf '%s\n' "$T" | grep -qE '^@[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'; then
        emit "$DOC" "$N" "$T" "package" "$(bool dep_exists "$T")"
      elif [ "${T#*/}" != "$T" ]; then # contains /
        emit "$DOC" "$N" "$T" "path" "$(bool path_exists "$T")"
      elif printf '%s\n' "$T" | grep -qE '^\.[A-Za-z0-9]+$'; then
        # bare dot token: a real dotfile (.env) is worth recording; a prose extension
        # mention (".ts files") is near-certain noise — emit only when it resolves
        path_exists "$T" && emit "$DOC" "$N" "$T" "path" "true"
      elif printf '%s\n' "$T" | grep -qE '^[A-Za-z0-9@_-][A-Za-z0-9._-]*\.[A-Za-z][A-Za-z0-9]{0,7}$'; then
        emit "$DOC" "$N" "$T" "path" "$(bool path_exists "$T")"
      fi
    done <<<"$TOKS"

    # 3) bare dir refs (src/) — whole words ending in /, outside backticks, URLs stripped
    BARE="$(printf '%s\n' "$LINE" \
      | sed -e 's/`[^`]*`//g' -e 's|[A-Za-z]*://[^[:space:]]*||g' \
      | tr -s ' \t' '\n' \
      | sed -e "s/^[[({<\"']*//" -e "s/[])}>\"',.;:!?]*\$//" \
      | grep -E '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*/$' || true)"
    while IFS= read -r T; do
      [ -n "$T" ] || continue
      emit "$DOC" "$N" "$T" "path" "$(bool path_exists "$T")"
    done <<<"$BARE"
  done < "$DOC"
done

printf '[%s]\n' "$ENTRIES"
exit 0
