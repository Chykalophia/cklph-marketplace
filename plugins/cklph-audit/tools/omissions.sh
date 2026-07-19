#!/usr/bin/env bash
# omissions.sh — negative-space recall for the omission lens (T2.3).
# Flags external-input / IO / branch SITES that lack a nearby guard (validation for
# inputs, error-handling for IO, a non-empty body for a catch branch) — the recall
# pass; the reviewer judges which missing dimension actually matters.
# Usage: omissions.sh <root> [glob...]   (globs are root-relative filters; none → source exts)
# Emits ONE JSON array on stdout: [{"file":…,"line":…,"kind":"external-input|io|branch","signal":…}]
# No matches / missing root / no tokens → []. Exits 0 ALWAYS — never crashes the reviewer.
# Reasons from CODE, not comments (comments are stripped before matching, like the engine's
# stripComments). Deps: bash + awk + standard POSIX utils. Degrades gracefully.
set -uo pipefail

ROOT="${1:-.}"
[ $# -gt 0 ] && shift        # remaining "$@" = optional root-relative globs
HAVE_GLOBS=$#

if [ ! -e "$ROOT" ]; then printf '[]\n'; exit 0; fi

list_files() {
  find "$ROOT" \
    \( -name node_modules -o -name .git -o -name dist -o -name build \
       -o -name .next -o -name coverage -o -name vendor \) -prune \
    -o -type f -print 2>/dev/null
}

AWK_PROG='
function codeonly(s,   t) {          # strip comments so a reassuring comment cannot mask an omission
  t = s
  gsub(/\/\*.*\*\//, "", t)          # inline /* ... */
  gsub(/\/\/.*/, "", t)              # // to end-of-line (crude but fine for matching)
  return t
}
function jesc(s) {
  gsub(/\\/, "\\\\", s)
  gsub(/"/, "\\\"", s)
  gsub(/\t/, " ", s)
  return s
}
function trim(s) {
  gsub(/^[[:space:]]+/, "", s); gsub(/[[:space:]]+$/, "", s); return s
}
function mitigated(i, re,   k, lo, hi) {   # is a guard present in a small window around line i?
  lo = i - 3; if (lo < 1) lo = 1
  hi = i + 8; if (hi > NR) hi = NR
  for (k = lo; k <= hi; k++) if (code[k] ~ re) return 1
  return 0
}
function out(ln, k, sig) {
  printf "{\"file\":\"%s\",\"line\":%d,\"kind\":\"%s\",\"signal\":\"%s\"}\n", jesc(REL), ln, jesc(k), jesc(sig)
}
{ raw[NR] = $0; code[NR] = codeonly($0) }
END {
  INPUT = "req\\.(body|query|params|headers|cookies)|request\\.(json|formData|text)|process\\.(env|argv)|searchParams|JSON\\.parse\\(|process\\.stdin|event\\.body"
  VALID = "parse\\(|safeParse|zod|validate|schema|assert|typeof[[:space:]]|instanceof[[:space:]]|isNaN|Number\\.is|sanitize|escape\\(|if[[:space:]]*\\([[:space:]]*!|guard|\\?\\?|Joi\\.|yup\\."
  IO    = "fetch\\(|axios|readFile|writeFile|\\.query\\(|\\.execute\\(|execSync|spawn\\(|\\.rpc\\(|createWriteStream|createReadStream"
  ERRP  = "try[[:space:]]*\\{|try[[:space:]]*$|catch|\\.catch\\(|throw[[:space:]]|reject|finally|[Rr]esult|if[[:space:]]*\\([^)]*err"
  CATCH = "catch[[:space:]]*(\\([^)]*\\))?[[:space:]]*\\{"
  for (i = 1; i <= NR; i++) {
    c = code[i]
    if (c ~ CATCH) {                 # branch: a catch that swallows (empty / brace-only body)
      empty = 1
      for (k = i + 1; k <= NR && k <= i + 4; k++) {
        t = trim(code[k]); if (t == "") continue
        if (t ~ /^\}/) break
        empty = 0; break
      }
      if (empty) { out(i, "branch", "empty/swallowed catch block"); continue }
    }
    if (match(c, INPUT)) {           # external input crossing in with no nearby validation
      sig = trim(substr(c, RSTART, RLENGTH))
      if (!mitigated(i, VALID)) { out(i, "external-input", sig); continue }
    }
    if (match(c, IO)) {              # IO call with no nearby error handling
      sig = trim(substr(c, RSTART, RLENGTH))
      if (!mitigated(i, ERRP)) { out(i, "io", sig); continue }
    }
  }
}'

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

while IFS= read -r F; do
  [ -f "$F" ] && [ -r "$F" ] || continue
  REL="${F#"$ROOT"/}"; REL="${REL#./}"
  if [ "$HAVE_GLOBS" -gt 0 ]; then
    keep=0
    for G in "$@"; do case "$REL" in $G) keep=1; break ;; esac; done
    [ "$keep" = 1 ] || continue
  else
    case "$REL" in
      *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.py|*.go|*.rb|*.java|*.php|*.rs|*.sh) ;;
      *) continue ;;
    esac
  fi
  awk -v REL="$REL" "$AWK_PROG" "$F" >> "$TMP" 2>/dev/null || true
done < <(list_files)

if [ -s "$TMP" ]; then
  printf '[%s]\n' "$(head -n 500 "$TMP" | paste -sd, -)"
else
  printf '[]\n'
fi
exit 0
