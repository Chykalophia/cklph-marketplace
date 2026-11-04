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
# The same marker repeated is fine; the payload may follow it.
#
# Env: CKLPH_MARKERS_FILE overrides the table location (tests use it).

set -uo pipefail
DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TABLE="${CKLPH_MARKERS_FILE:-$DIR/../skills/flow/markers.md}"
[ -r "$TABLE" ] || { echo "marker.sh: can't read marker table: $TABLE" >&2; exit 3; }

awk '
  # Pass 1: the table. Second cell of a row holds `## <MARKER>`, `## <MARKER>: <...>` or `## <MARKER> (<n>)`.
  FNR == NR {
    if ($0 !~ /^\|/) next
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
      if (match(line, /^ {0,3}(```+|~~~+)/)) { f = substr(line, RSTART, RLENGTH); gsub(/ /, "", f); fence = f; next }
    } else {
      if (match(line, /^ {0,3}(```+|~~~+)[ \t]*$/)) {
        f = substr(line, RSTART, RLENGTH); gsub(/[ \t]/, "", f)
        if (substr(f, 1, 1) == substr(fence, 1, 1) && length(f) >= length(fence)) fence = ""
      }
      next
    }
    if (line !~ /^## /) next
    sub(/[ \t]+$/, "", line)
    s = substr(line, 4)
    for (b in kinds) {
      k = kinds[b]; hit = 0
      if (k == "plain" && s == b) hit = 1
      else if (k == "colon" && index(s, b ": ") == 1 && length(s) > length(b) + 2) hit = 1
      else if (k == "count" && index(s, b " (") == 1 && substr(s, length(b) + 3) ~ /^[0-9]+\)$/) hit = 1
      if (hit) { if (!(b in seen)) { seen[b] = 1; distinct++; order = order "\n  " line }; last = line; break }
    }
  }
  END {
    if (n == 0) { print "marker.sh: no markers found in the table" > "/dev/stderr"; exit 3 }
    if (distinct == 0) { print "marker.sh: no marker in the output" > "/dev/stderr"; exit 1 }
    if (distinct > 1)  { print "marker.sh: conflicting markers outside code:" order > "/dev/stderr"; exit 2 }
    print last
  }
' "$TABLE" -
