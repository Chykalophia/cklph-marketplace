#!/bin/bash
# Reference parser for the cklph-os marker contract (skills/flow/markers.md).
#
# Usage:  marker.sh [--emitter <name>] < step-output.txt
#   --emitter  only markers from table rows whose first cell has <name> as a whole backticked
#              token (a phase: challenge, review, verify, plan…; or an agent) are valid; another
#              row's marker counts as a conflict
#   exit 0  prints the verdict line (e.g. "## REVIEW CLEAN", "## TASK BLOCKED: no access")
#   exit 1  no marker: the step failed
#   exit 2  two different markers outside code: the step failed, re-run it (fail closed)
#   exit 3  can't read the marker table
#
# The marker list is read from markers.md's table at run time, so markers.md stays the only list.
# Rules (markers.md, "Parsing rules"): a marker line starts with "## " and matches a table row
# exactly; only rows written with ": <...>" take a ": text" suffix and only rows written with
# " (<n>)" take a count. Lines inside fenced code blocks (``` or ~~~, any length) never count.
# The same marker repeated is fine; the payload may follow it. A near-miss (a line that starts with
# "## <MARKER>" but doesn't match the row, e.g. "## ISSUES FOUND:" or a bare "## TASK BLOCKED") counts
# as a conflicting verdict: exit 2. Only rows under the table's "## Markers" heading are read.
# Formatting variants of a marker (### / **…** / other case / extra spaces / trailing : or .) are
# near-misses too. CRLF line endings are accepted. A backtick line whose info string holds a backtick
# (an inline code span) doesn't open a fence. Counts must be 1 or more.
# Byte-exact (LC_ALL=C) and POSIX awk only (no regex intervals), so mawk, gawk and BWK awk agree.
#
# Env: CKLPH_MARKERS_FILE overrides the table location (tests use it).

set -uo pipefail
DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TABLE="${CKLPH_MARKERS_FILE:-$DIR/../skills/flow/markers.md}"
[ -r "$TABLE" ] || { echo "marker.sh: can't read marker table: $TABLE" >&2; exit 3; }
EMITTER=""
if [ "${1:-}" = "--emitter" ]; then [ -n "${2:-}" ] || { echo "usage: marker.sh [--emitter <name>] < output" >&2; exit 3; }; EMITTER="$2"; shift 2; fi
[ $# -eq 0 ] || { echo "usage: marker.sh [--emitter <name>] < output" >&2; exit 3; }

LC_ALL=C awk -v emitter="$EMITTER" '
  # Pass 1: the table under "## Markers". Second cell: `## <MARKER>`, `## <MARKER>: <...>` or `## <MARKER> (<n>)`.
  FNR == NR {
    if ($0 ~ /^## /) { intable = ($0 ~ /^## Markers[ \t]*$/); next }
    if (!intable || $0 !~ /^\|/) next
    if (!match($0, /`## [^`]+`/)) next
    m = substr($0, RSTART + 4, RLENGTH - 5)
    kind = "plain"
    if (m ~ /: <[^>]*>$/)      { sub(/: <[^>]*>$/, "", m); kind = "colon" }
    else if (m ~ / \(<n>\)$/)  { sub(/ \(<n>\)$/, "", m);  kind = "count" }
    kinds[m] = kind; n++
    split($0, cell, "|")
    if (emitter == "") own[m] = 1
    else { c = cell[2]; while (match(c, /`[^`]+`/)) { if (substr(c, RSTART + 1, RLENGTH - 2) == emitter) own[m] = 1; c = substr(c, RSTART + RLENGTH) } }
    next
  }
  # Pass 2: the step output.
  {
    line = $0; key = ""
    sub(/\r$/, "", line)
    if (fence == "") {
      if (match(line, /^ ? ? ?(```+|~~~+)/)) {
        f = substr(line, RSTART, RLENGTH); rest = substr(line, RSTART + RLENGTH); gsub(/ /, "", f)
        if (!(substr(f, 1, 1) == "`" && index(rest, "`") > 0)) { fence = f; next }
      }
    } else {
      if (match(line, /^ ? ? ?(```+|~~~+)[ \t]*$/)) {
        f = substr(line, RSTART, RLENGTH); gsub(/[ \t]/, "", f)
        if (substr(f, 1, 1) == substr(fence, 1, 1) && length(f) >= length(fence)) fence = ""
      }
      next
    }
    sub(/[ \t]+$/, "", line)
    if (line !~ /^## /) {
      # Formatting variants: a heading-ish line (first non-space char # or *) that normalizes to a marker.
      if (line !~ /^[ \t]*[#*]/) next
      v = toupper(line)
      sub(/^[ \t]*[#* \t]*/, "", v); sub(/[* \t]*$/, "", v); sub(/[.:!]$/, "", v); gsub(/[ \t]+/, " ", v)
      for (b in kinds) if (v == b || index(v, b " (") == 1 || index(v, b ": ") == 1) { key = "near-miss: " line; break }
      if (key != "") { if (!(key in seen)) { seen[key] = 1; distinct++; order = order "\n  " line }; last = line; lastkey = key }
      key = ""; next
    }
    s = substr(line, 4)
    key = ""
    for (b in kinds) {                       # exact match first
      k = kinds[b]
      if ((k == "plain" && s == b) ||
          (k == "colon" && index(s, b ": ") == 1 && length(s) > length(b) + 2) ||
          (k == "count" && index(s, b " (") == 1 && substr(s, length(b) + 3) ~ /^[1-9][0-9]*\)$/)) { key = b; break }
    }
    if (key != "" && !(key in own)) key = "wrong emitter: " s
    if (key == "") {
      v = toupper(s); gsub(/[ \t]+/, " ", v); sub(/^ /, "", v); sub(/[.:!*]+$/, "", v)
      for (b in kinds) if (v == b || index(v, b " (") == 1 || index(v, b ": ") == 1) { key = "near-miss: " s; break }
    }
    if (key == "") for (b in kinds) if (index(s, b) == 1) { key = "near-miss: " s; break }
    if (key != "") { if (!(key in seen)) { seen[key] = 1; distinct++; order = order "\n  " line }; last = line; lastkey = key }
  }
  END {
    if (n == 0) { print "marker.sh: no markers found in the table" > "/dev/stderr"; exit 3 }
    if (distinct == 0) { print "marker.sh: no marker in the output" > "/dev/stderr"; exit 1 }
    if (distinct > 1 || lastkey ~ /^(near-miss|wrong emitter): /) { print "marker.sh: conflicting or malformed markers outside code:" order > "/dev/stderr"; exit 2 }
    print last
  }
' "$TABLE" -
