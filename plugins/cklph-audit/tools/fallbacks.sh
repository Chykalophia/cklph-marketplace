#!/usr/bin/env bash
# fallbacks.sh: recall for the fallback lens. Finds SITES where a failure can turn into a
# plausible result: a catch that returns a default, a catch that logs and carries on, an empty
# catch, a promise .catch that resolves to a default, and a default (?? [], || {}) laid over an
# awaited call. omissions.sh asks which guard is missing; this asks which guard hides a failure.
# The reviewer judges each site; most defaults are fine when a caller can tell them apart.
# Usage: fallbacks.sh <root> [glob...]   (globs are root-relative filters; none means source
# files outside tests/, __tests__/, e2e/, scripts/ and *.test.* / *.spec.*)
# Emits ONE JSON array on stdout: [{"file":...,"line":...,"kind":"catch-default|catch-log-continue|swallowed|promise-default|default-over-failure","signal":...}]
# No matches, missing root or no source files print []. Exits 0 always, so it never crashes the
# reviewer. More than FALLBACKS_MAX sites (default 500) is cut and says so on stderr.
# Comments are stripped before matching. Deps: bash, awk and standard POSIX utils.
set -uo pipefail

ROOT="${1:-.}"
[ $# -gt 0 ] && shift
HAVE_GLOBS=$#
MAX="${FALLBACKS_MAX:-500}"

if [ ! -e "$ROOT" ]; then printf '[]\n'; exit 0; fi

list_files() {
  find "$ROOT" \
    \( -name node_modules -o -name .git -o -name dist -o -name build \
       -o -name .next -o -name coverage -o -name vendor -o -name .claude -o -name .worktrees \) -prune \
    -o -type f -print 2>/dev/null
}

AWK_PROG='
function codeonly(s,   t, i, n, out) {
  t = s
  gsub(/\/\*.*\*\//, "", t)
  n = length(t); out = ""; i = 1
  while (i <= n) {
    if (substr(t, i, 2) == "//" && (i == 1 || substr(t, i - 1, 1) != ":")) break
    if (PY && substr(t, i, 1) == "#") break
    out = out substr(t, i, 1); i++
  }
  return out
}
function jesc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); gsub(/\t/, " ", s); return s }
function trim(s) { gsub(/^[[:space:]]+/, "", s); gsub(/[[:space:]]+$/, "", s); return s }
function out(ln, k, sig) {
  printf "{\"file\":\"%s\",\"line\":%d,\"kind\":\"%s\",\"signal\":\"%s\"}\n", jesc(REL), ln, jesc(k), jesc(substr(trim(sig), 1, 120))
}
# The catch body: text after the opening brace up to its matching close, counting braces across
# up to 12 lines, so `{ err }` inside the body does not end it.
function catchbody(i,   k, t, b, d, j, ch, n) {
  t = code[i]; sub(/^.*catch[[:space:]]*(\([^)]*\))?[[:space:]]*\{/, "", t)
  b = ""; d = 1
  for (k = i; k <= NR && k <= i + 12; k++) {
    if (k > i) t = code[k]
    n = length(t)
    for (j = 1; j <= n; j++) {
      ch = substr(t, j, 1)
      if (ch == "{") d++
      else if (ch == "}") { d--; if (d == 0) return trim(b) }
      b = b ch
    }
    b = b " "
  }
  return trim(b)
}
function pybody(i,   k, b, t, ind, ind0) {
  match(code[i], /^[[:space:]]*/); ind0 = RLENGTH; b = ""
  for (k = i + 1; k <= NR && k <= i + 12; k++) {
    t = code[k]; if (trim(t) == "") continue
    match(t, /^[[:space:]]*/); ind = RLENGTH
    if (ind <= ind0) break
    b = b " " trim(t)
  }
  return trim(b)
}
{ raw[NR] = $0; code[NR] = codeonly($0) }
END {
  # A failure the caller or the user can see: rethrown, returned as a failure, sent as an HTTP
  # error, or shown in the UI.
  VISIBLE = "throw[[:space:]]|throw$|raise([[:space:]]|$)|reject\\(|failure\\(|return[[:space:]]+(err|error|e)[[:space:];]|ok:[[:space:]]*false|success:[[:space:]]*false|status\\([45]|status:[[:space:]]*[45][0-9][0-9]|NextResponse\\.json\\(|Response\\.json\\(|res\\.status\\(|new[[:space:]]+[A-Za-z]*Error\\(|setError|toast\\.(error|warning)|process\\.exit|notFound\\(|redirect\\("
  DEFAULT_RET = "return[[:space:]]*(\\[[[:space:]]*\\]|\\{[[:space:]]*\\}|null|undefined|false|0|\"\"|None|False|\\[\\]|\\{\\})?[[:space:]]*;?$"
  LOGGED = "console\\.(error|warn|log)|logger\\.[a-z]+\\(|log\\.(error|warn)|print\\(|logging\\.[a-z]+\\("
  for (i = 1; i <= NR; i++) {
    c = code[i]
    if (!PY && c ~ /catch[[:space:]]*(\([^)]*\))?[[:space:]]*\{/ && c !~ /\.catch\(/) {
      body = catchbody(i)
      if (body ~ VISIBLE) continue
      if (body == "") { out(i, "swallowed", raw[i]); continue }
      n = split(body, parts, /;[[:space:]]*/)
      last = trim(parts[n]); if (last == "" && n > 1) last = trim(parts[n - 1])
      if (last ~ DEFAULT_RET || body ~ /return[[:space:]]*(\[[[:space:]]*\]|\{[[:space:]]*\}|null|undefined|false)[[:space:]]*;?/) { out(i, "catch-default", body); continue }
      if (body ~ LOGGED) { out(i, "catch-log-continue", body); continue }
    }
    if (PY && c ~ /^[[:space:]]*except([[:space:]]|:)/) {
      body = pybody(i)
      if (body ~ VISIBLE) continue
      if (body == "pass" || body == "") { out(i, "swallowed", raw[i]); continue }
      if (body ~ /return[[:space:]]*(None|\[\]|\{\}|False|0|"")?[[:space:]]*$/) { out(i, "catch-default", body); continue }
      if (body ~ LOGGED) { out(i, "catch-log-continue", body); continue }
    }
    # A body parse (.json().catch) is normally validated next, so it is not a candidate.
    if (c !~ /\.json\(\)[[:space:]]*\.catch\(/ && c ~ /\.catch\([[:space:]]*(\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)?[[:space:]]*=>[[:space:]]*(\[[[:space:]]*\]|\{[[:space:]]*\}|null|undefined|false|0|""|\([[:space:]]*(\{[[:space:]]*\}|\[[[:space:]]*\])[[:space:]]*\))[[:space:]]*\)/) {
      out(i, "promise-default", raw[i]); continue
    }
    # The default must sit on the awaited call itself, (await x()) ?? [], not on an argument.
    if (c ~ /await[[:space:]][^;]*\)[[:space:]]*(\?\?|\|\|)[[:space:]]*(\[[[:space:]]*\]|\{[[:space:]]*\}|null|0|""|false)/) {
      out(i, "default-over-failure", raw[i]); continue
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
      *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.py) ;;
      *) continue ;;
    esac
    # A default in a test or a one-off script is not a production failure; name them in globs to include.
    case "/$REL" in
      */tests/*|*/test/*|*/__tests__/*|*/e2e/*|*/scripts/*|*.test.*|*.spec.*) continue ;;
    esac
  fi
  case "$REL" in *.py) PY=1 ;; *) PY=0 ;; esac
  awk -v REL="$REL" -v PY="$PY" "$AWK_PROG" "$F" >> "$TMP" 2>/dev/null || true
done < <(list_files)

TOTAL=$(wc -l < "$TMP" | tr -d ' ')
if [ "$TOTAL" -gt "$MAX" ]; then
  printf 'fallbacks.sh: %s site(s), truncated to %s (raise FALLBACKS_MAX to see all)\n' "$TOTAL" "$MAX" >&2
fi
if [ -s "$TMP" ]; then
  printf '[%s]\n' "$(head -n "$MAX" "$TMP" | paste -sd, -)"
else
  printf '[]\n'
fi
exit 0
