#!/bin/bash
# Reference parser for the cklph-os marker contract (skills/flow/markers.md).
#
# Usage:  marker.sh < step-output.txt
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
# Byte-exact (LC_ALL=C) and POSIX awk only (no regex intervals), so mawk, gawk and BWK awk agree.
#
# Env: CKLPH_MARKERS_FILE overrides the table location (tests use it).

set -uo pipefail
DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TABLE="${CKLPH_MARKERS_FILE:-$DIR/../skills/flow/markers.md}"
[ -r "$TABLE" ] || { echo "marker.sh: can't read marker table: $TABLE" >&2; exit 3; }

LC_ALL=C awk '
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
    next
  }
  # Pass 2: the step output.
  {
    line = $0
    if (fence == "") {
      if (match(line, /^ ? ? ?(```+|~~~+)/)) { f = substr(line, RSTART, RLENGTH); gsub(/ /, "", f); fence = f; next }
    } else {
      if (match(line, /^ ? ? ?(```+|~~~+)[ \t]*$/)) {
        f = substr(line, RSTART, RLENGTH); gsub(/[ \t]/, "", f)
        if (substr(f, 1, 1) == substr(fence, 1, 1) && length(f) >= length(fence)) fence = ""
      }
      next
    }
    if (line !~ /^## /) next
    sub(/[ \t]+$/, "", line)
    s = substr(line, 4)
    key = ""
    for (b in kinds) {                       # exact match first
      k = kinds[b]
      if ((k == "plain" && s == b) ||
          (k == "colon" && index(s, b ": ") == 1 && length(s) > length(b) + 2) ||
          (k == "count" && index(s, b " (") == 1 && substr(s, length(b) + 3) ~ /^[0-9]+\)$/)) { key = b; break }
    }
    if (key == "") for (b in kinds) if (index(s, b) == 1) { key = "near-miss: " s; break }
    if (key != "") { if (!(key in seen)) { seen[key] = 1; distinct++; order = order "\n  " line }; last = line; lastkey = key }
  }
  END {
    if (n == 0) { print "marker.sh: no markers found in the table" > "/dev/stderr"; exit 3 }
    if (distinct == 0) { print "marker.sh: no marker in the output" > "/dev/stderr"; exit 1 }
    if (distinct > 1 || lastkey ~ /^near-miss: /) { print "marker.sh: conflicting or malformed markers outside code:" order > "/dev/stderr"; exit 2 }
    print last
  }
' "$TABLE" -
