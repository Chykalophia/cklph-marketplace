#!/usr/bin/env bash
# fallbacks.sh: recall for the fallback lens. Finds SITES where a failure can turn into a
# plausible result: a catch that returns a default, a catch that logs and carries on, an empty
# catch, a promise .catch that resolves to a default or only logs, and a default (?? [], || {})
# laid over an awaited call's null result. omissions.sh asks which guard is missing; this asks which guard hides a failure.
# The reviewer judges each site; most defaults are fine when a caller can tell them apart.
# Usage: fallbacks.sh <root> [glob...]   (globs are root-relative filters over the source files;
# none means every source file outside tests/, __tests__/, e2e/, a top-level scripts/ and
# *.test.* / *.spec.*. Minified files, source maps and public/ are never read.)
# Emits ONE JSON array on stdout: [{"file":...,"line":...,"kind":"catch-default|catch-log-continue|swallowed|promise-default|default-over-failure","signal":...}]
# No matches, missing root or no source files print []. Exits 0 always, so it never crashes the
# reviewer. More than FALLBACKS_MAX sites (default 500) is cut and says so on stderr.
# Comments are stripped before matching. Deps: bash, awk and standard POSIX utils.
set -uo pipefail

ROOT="${1:-.}"
[ "$ROOT" != "/" ] && ROOT="${ROOT%/}"
[ $# -gt 0 ] && shift
HAVE_GLOBS=$#
MAX="${FALLBACKS_MAX:-500}"

if [ ! -e "$ROOT" ]; then printf '[]\n'; exit 0; fi

list_files() {
  find "$ROOT" \
    \( -name node_modules -o -name .git -o -name dist -o -name build \
       -o -name .next -o -name coverage -o -name vendor -o -name .claude -o -name .worktrees \
       -o -name public \) -prune \
    -o -type f -print 2>/dev/null
}

AWK_PROG='
# The position of a // line comment, skipping the // of a URL scheme (https://).
function linecmt(t,   off, p) {
  off = 0
  while ((p = index(substr(t, off + 1), "//")) > 0) {
    p += off
    if (p == 1 || substr(t, p - 1, 1) != ":") return p
    off = p + 1
  }
  return 0
}
# Code with comments removed. Block comments carry across lines (INBLK). Built with index(),
# not char by char, so a long minified line stays linear.
function codeonly(s,   t, b, l, o) {
  t = s; o = ""
  while (t != "") {
    if (INBLK) {
      b = index(t, "*/"); if (!b) return o
      t = substr(t, b + 2); INBLK = 0; continue
    }
    if (PY) { l = index(t, "#"); b = 0 } else { l = linecmt(t); b = index(t, "/*") }
    if (!l && !b) return o t
    if (l && (!b || l < b)) return o substr(t, 1, l - 1)
    o = o substr(t, 1, b - 1); t = substr(t, b + 2); INBLK = 1
  }
  return o
}
function jesc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); gsub(/[[:cntrl:]]/, " ", s); return s }
function trim(s) { gsub(/^[[:space:]]+/, "", s); gsub(/[[:space:]]+$/, "", s); return s }
function out(ln, k, sig) {
  printf "{\"file\":\"%s\",\"line\":%d,\"kind\":\"%s\",\"signal\":\"%s\"}\n", jesc(REL), ln, jesc(k), jesc(substr(trim(sig), 1, 120))
}
# The block body after the opening brace that `t` starts just past, up to its matching close,
# counting braces outside string literals across up to 12 lines, so `{ err }` or "{" inside
# the body does not end it.
function blockbody(i, t,   k, b, d, j, ch, n, q, prev) {
  b = ""; d = 1; q = ""
  for (k = i; k <= NR && k <= i + 12; k++) {
    if (k > i) t = code[k]
    n = length(t); prev = ""
    for (j = 1; j <= n; j++) {
      ch = substr(t, j, 1)
      if (q != "") { if (ch == q && prev != "\\") q = ""; b = b ch; prev = ch; continue }
      if (ch == "\"" || ch == SQ || ch == "`") q = ch
      else if (ch == "{") d++
      else if (ch == "}") { d--; if (d == 0) return trim(b) }
      b = b ch; prev = ch
    }
    b = b " "
  }
  return trim(b)
}
function pybody(i,   k, b, t, ind, ind0, same) {
  same = code[i]; sub(/^[[:space:]]*except[^:]*:/, "", same)
  if (trim(same) != "") return trim(same)
  match(code[i], /^[[:space:]]*/); ind0 = RLENGTH; b = ""
  for (k = i + 1; k <= NR && k <= i + 12; k++) {
    t = code[k]; if (trim(t) == "") continue
    match(t, /^[[:space:]]*/); ind = RLENGTH
    if (ind <= ind0) break
    b = b " " trim(t)
  }
  return trim(b)
}
# What a body does with the failure: "" when it stays visible, else the site kind.
function judge(body,   n, last, parts) {
  if (body ~ VISIBLE) return ""
  if (body == "" || body == "pass") return "swallowed"
  n = split(body, parts, /;[[:space:]]*/)
  last = trim(parts[n]); if (last == "" && n > 1) last = trim(parts[n - 1])
  if (last ~ DEFAULT_RET || body ~ /return[[:space:]]*(\[[[:space:]]*\]|\{[[:space:]]*\}|null|undefined|false|None)[[:space:]]*;?/) return "catch-default"
  # A success-status response carrying an empty default: json([]), json({ items: [] }), send(null).
  if (body ~ /(json|send)\([[:space:]]*(\[[[:space:]]*\]|null|\{[^}]*:[[:space:]]*(\[[[:space:]]*\]|null|0|false))/) return "catch-default"
  if (body ~ LOGGED) return "catch-log-continue"
  return ""
}
{ sub(/\r$/, ""); raw[NR] = $0; code[NR] = codeonly($0) }
END {
  # A failure the caller or the user can see: rethrown, returned as a failure, sent with a 4xx or
  # 5xx status, or shown in the UI. A JSON response alone is not enough: a 200 with [] hides it.
  VISIBLE = "throw[[:space:]]|throw$|raise([[:space:]]|$)|reject\\(|failure\\(|return[[:space:]]+(err|error|e)[[:space:];]|ok:[[:space:]]*false|success:[[:space:]]*false|status\\([45]|status:[[:space:]]*[45][0-9][0-9]|new[[:space:]]+[A-Za-z]*Error\\(|setError|toast\\.(error|warning)|process\\.exit|notFound\\(|redirect\\("
  DEFAULT_RET = "return[[:space:]]*(\\[[[:space:]]*\\]|\\{[[:space:]]*\\}|null|undefined|false|0|\"\"|None|False|\\[\\]|\\{\\})?[[:space:]]*;?$"
  LOGGED = "console\\.(error|warn|log)|logger\\.[a-z]+\\(|log\\.(error|warn)|print\\(|logging\\.[a-z]+\\("
  CATCH_OPEN = "catch[[:space:]]*(\\([^)]*\\))?[[:space:]]*\\{"
  for (i = 1; i <= NR; i++) {
    c = code[i]
    if (!PY && c !~ /\.catch\(/) {
      t = ""
      if (c ~ CATCH_OPEN) { t = c; sub("^.*" CATCH_OPEN, "", t); start = i }
      else if (c ~ /catch[[:space:]]*\([^)]*\)[[:space:]]*$/ && code[i + 1] ~ /^[[:space:]]*\{/) { t = code[i + 1]; sub(/^[[:space:]]*\{/, "", t); start = i + 1 }
      if (start) {
        body = blockbody(start, t); start = 0; k = judge(body)
        if (k != "") { out(i, k, k == "swallowed" ? raw[i] : body); continue }
      }
    }
    if (PY && c ~ /^[[:space:]]*except([[:space:]]|:)/) {
      k = judge(pybody(i))
      if (k != "") { out(i, k, k == "swallowed" ? raw[i] : pybody(i)); continue }
    }
    # A body parse (.json().catch) is normally validated next, so it is not a candidate.
    if (c !~ /\.json\(\)[[:space:]]*\.catch\(/) {
      if (c ~ /\.catch\([[:space:]]*(\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)?[[:space:]]*=>[[:space:]]*(\[[[:space:]]*\]|\{[[:space:]]*\}|null|undefined|false|0|""|\([[:space:]]*(\{[[:space:]]*\}|\[[[:space:]]*\])[[:space:]]*\))[[:space:]]*\)/ \
          || c ~ /\.catch\([[:space:]]*(console\.(error|warn|log)|noop|_\.noop)[[:space:]]*\)/) {
        out(i, "promise-default", raw[i]); continue
      }
      if (c ~ /\.catch\([[:space:]]*(\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)?[[:space:]]*=>[[:space:]]*\{/) {
        t = c; sub(/^.*\.catch\([[:space:]]*(\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)?[[:space:]]*=>[[:space:]]*\{/, "", t)
        if (judge(blockbody(i, t)) != "") { out(i, "promise-default", raw[i]); continue }
      }
    }
    # A default on the awaited call itself, (await x()) ?? []. The await throws on a rejection, so
    # this hides only a null or undefined result: trace whether x() turns its own failure into one.
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
  case "$REL" in
    *.min.*|*.map|*.bundle.*) continue ;;
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.py) ;;
    *) continue ;;
  esac
  if [ "$HAVE_GLOBS" -gt 0 ]; then
    # `**/` may match no folder at all, so `src/**/*.ts` also takes `src/a.ts`.
    keep=0
    for G in "$@"; do
      G1="${G#\*\*/}"; G2="${G//\/\*\*\///}"
      case "$REL" in $G|$G1|$G2) keep=1; break ;; esac
    done
    [ "$keep" = 1 ] || continue
  else
    # A default in a test or a top-level script is not a production failure; name them in globs to include.
    case "/$REL" in
      /scripts/*|*/tests/*|*/__tests__/*|*/e2e/*|*.test.*|*.spec.*) continue ;;
    esac
  fi
  case "$REL" in *.py) PY=1 ;; *) PY=0 ;; esac
  awk -v REL="$REL" -v PY="$PY" -v SQ="'" "$AWK_PROG" "$F" >> "$TMP" 2>/dev/null || true
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
