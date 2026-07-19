#!/usr/bin/env bash
# variant-sweep.sh — deterministic sibling-recall for the Variant phase (T1.1, Project Zero
# variant analysis). Given a confirmed bug's snippet (or a literal pattern) + a root, extract
# the distinctive tokens and grep the repo for co-occurring SIBLING sites the reviewer should
# judge — the same mistake elsewhere. Recall only; the reviewer decides which are real.
# Usage: variant-sweep.sh <root> <pattern-or-file>
#   <pattern-or-file>: a path to a file whose contents are the seed, else a literal snippet.
# Emits ONE JSON array on stdout: [{"file":…,"line":…,"excerpt":…}]
# No tokens / missing root / no matches → []. Exits 0 ALWAYS. Deps: bash + POSIX utils.
set -uo pipefail

ROOT="${1:-.}"
SEED="${2:-}"

if [ ! -e "$ROOT" ] || [ -z "$SEED" ]; then printf '[]\n'; exit 0; fi

SEEDFILE=""
if [ -f "$SEED" ]; then SEEDFILE="$SEED"; SEEDTEXT="$(cat "$SEED" 2>/dev/null || true)"; else SEEDTEXT="$SEED"; fi
SEEDBASE=""
[ -n "$SEEDFILE" ] && SEEDBASE="$(basename "$SEEDFILE")"

# strip comments so a comment banner can't drown the seed's distinctive CODE tokens (fall back
# to the raw seed if stripping leaves nothing — e.g. a bare literal pattern has no comments).
SEEDCODE="$(printf '%s\n' "$SEEDTEXT" | sed -e 's://.*::' -e 's:/\*.*\*/::g' -e 's/^[[:space:]]*#.*//')"
printf '%s' "$SEEDCODE" | grep -qE '[A-Za-z_]' || SEEDCODE="$SEEDTEXT"

# distinctive tokens: identifiers >= 4 chars, minus language/generic stopwords, unique, cap 6.
STOP="const|let|var|function|return|await|async|import|export|from|this|true|false|null|undefined|string|number|boolean|void|type|interface|class|public|private|protected|static|extends|implements|value|data|result|error|props|state|param|params|args|item|items|index|length|object|array|Promise|then|catch|throw|new|for|while|switch|case|default|break|continue|else|typeof|instanceof|require|module|exports"
TOKENS="$(printf '%s\n' "$SEEDCODE" \
  | grep -oE '[A-Za-z_][A-Za-z0-9_]+' \
  | grep -vE "^(${STOP})$" \
  | awk 'length($0) >= 4 && !seen[$0]++' \
  | head -6)"

if [ -z "$TOKENS" ]; then printf '[]\n'; exit 0; fi
ALT="$(printf '%s\n' "$TOKENS" | paste -sd'|' -)"

list_files() {
  find "$ROOT" \
    \( -name node_modules -o -name .git -o -name dist -o -name build \
       -o -name .next -o -name coverage -o -name vendor \) -prune \
    -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \
       -o -name '*.mjs' -o -name '*.cjs' -o -name '*.py' -o -name '*.go' -o -name '*.rb' \
       -o -name '*.java' -o -name '*.php' -o -name '*.rs' -o -name '*.sh' \) -print 2>/dev/null
}

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\t'/ }"
  printf '%s' "$s"
}

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

while IFS= read -r F; do
  [ -f "$F" ] && [ -r "$F" ] || continue
  [ -n "$SEEDFILE" ] && [ "$(basename "$F")" = "$SEEDBASE" ] && continue   # don't return the seed itself
  REL="${F#"$ROOT"/}"; REL="${REL#./}"
  while IFS= read -r HIT; do
    [ -n "$HIT" ] || continue
    LN="${HIT%%:*}"
    TXT="${HIT#*:}"
    TXT="${TXT#"${TXT%%[![:space:]]*}"}"     # ltrim leading whitespace
    TXT="${TXT:0:200}"                         # cap excerpt length
    printf '{"file":"%s","line":%s,"excerpt":"%s"}\n' \
      "$(json_escape "$REL")" "$LN" "$(json_escape "$TXT")" >> "$TMP"
  done < <(grep -nE "$ALT" "$F" 2>/dev/null || true)
done < <(list_files)

if [ -s "$TMP" ]; then
  printf '[%s]\n' "$(head -n 300 "$TMP" | paste -sd, -)"
else
  printf '[]\n'
fi
exit 0
