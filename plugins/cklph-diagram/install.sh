#!/usr/bin/env bash
# Install the cklph-diagram skill, or package it for upload.
#
#   ./install.sh                 install to ~/.claude/skills/cklph-diagram
#   ./install.sh --bundle        build cklph-diagram.skill for claude.ai upload
#   ./install.sh --dir <path>    install somewhere else
#   ./install.sh --uninstall     remove an installed copy
#   ./install.sh --brands-from installed|repo
#                                which copy wins when a brand file differs
#
# Client brands are git-ignored and can be onboarded straight into the
# installed copy, so a reinstall never deletes one: brand files that exist only
# in the installed copy are carried over, and a brand file that differs between
# the two copies stops the install until --brands-from says which one wins.
#
# The skill folder is self-contained: SKILL.md, references/ (including the brand
# registry) and scripts/ all travel together, so the brand gate and the a11y
# lint work from an installed copy with no repo present.
set -euo pipefail

cd "$(dirname "$0")"

# Every python3 call below imports colorlib, which writes a __pycache__ next to
# the source. The install already prunes those after copying, but the final
# "does the installed copy work?" check runs inside $DEST and would recreate one
# -- so every install shipped a stale .pyc. Suppress bytecode instead of racing
# the cleanup.
export PYTHONDONTWRITEBYTECODE=1

SRC="skills/cklph-diagram"
NAME="cklph-diagram"
DEST="${HOME}/.claude/skills/${NAME}"
MODE="install"
BRANDS_FROM=""

while [ $# -gt 0 ]; do
  case "$1" in
    --bundle)    MODE="bundle"; shift ;;
    --uninstall) MODE="uninstall"; shift ;;
    --dir)       DEST="$2/${NAME}"; shift 2 ;;
    --brands-from)
      case "${2:-}" in installed|repo) BRANDS_FROM="$2" ;; *) echo "--brands-from takes 'installed' or 'repo'" >&2; exit 2 ;; esac
      shift 2 ;;
    -h|--help)   sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

[ -f "$SRC/SKILL.md" ] || { echo "run this from the repo root" >&2; exit 1; }

# --- preflight -------------------------------------------------------------
# Never install a skill whose own brand registry does not pass. An installed
# copy that fails AA is worse than no copy: it looks authoritative.
echo "Validating SKILL.md frontmatter..."
python3 - "$SRC/SKILL.md" << 'PYCHK' || exit 1
import re, sys, pathlib
# Frontmatter limits are enforced at upload time. Catching them here turns a
# rejected upload into a one-line local error.
LIMITS = {"name": 64, "description": 1024}
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
parts = text.split("---", 2)
if len(parts) < 3:
    sys.exit("FAILED: SKILL.md has no YAML frontmatter")
fm = parts[1]
bad = False
for field, limit in LIMITS.items():
    m = re.search(rf"^{field}:\s*(.+?)(?=\n[a-z_]+:|\Z)", fm, re.S | re.M)
    if not m:
        print(f"FAILED: frontmatter is missing '{field}'")
        bad = True
        continue
    value = m.group(1).strip()
    if len(value) > limit:
        print(f"FAILED: '{field}' is {len(value)} chars, limit is {limit} "
              f"(over by {len(value) - limit})")
        bad = True
    else:
        print(f"  {field}: {len(value)}/{limit}")
if bad:
    sys.exit(1)
PYCHK

echo "Checking the brand registry before installing..."
if ! python3 "$SRC/scripts/brand-tokens.py" --list >/dev/null 2>&1; then
  echo "FAILED: the brand registry will not load. Not installing." >&2
  exit 1
fi
for slug in $(python3 "$SRC/scripts/brand-tokens.py" --list 2>/dev/null \
              | awk '$1=="live"{print $2}'); do
  python3 "$SRC/scripts/brand-tokens.py" "$slug" --check >/dev/null \
    || { echo "FAILED: brand '$slug' does not pass AA. Not installing." >&2; exit 1; }
done
echo "  registry ok"

case "$MODE" in
  uninstall)
    if [ -d "$DEST" ]; then rm -rf "$DEST"; echo "removed $DEST"; else echo "nothing at $DEST"; fi
    ;;

  bundle)
    # A .skill file is a zip with the skill directory at its root.
    OUT="${NAME}.skill"
    rm -f "$OUT"
    tmp="$(mktemp -d)"
    cp -R "$SRC" "$tmp/${NAME}"
    find "$tmp" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
    # claude.ai rejects an upload with more than 200 files. The inherited
    # example diagrams ship in three variants (light, dark, full) and are layout
    # reading only, never the copy path, so the bundle keeps one per type: the
    # light example. Every template, reference and script still ships.
    find "$tmp/${NAME}/assets" \( -name 'example-*-dark.html' -o -name 'example-*-full.html' \) -delete
    MAX_FILES=200
    count="$(find "$tmp/${NAME}" -type f | wc -l | tr -d ' ')"
    if [ "$count" -gt "$MAX_FILES" ]; then
      echo "FAILED: bundle has $count files; claude.ai accepts at most $MAX_FILES." >&2
      rm -rf "$tmp"; exit 1
    fi
    ( cd "$tmp" && zip -qr "$OLDPWD/$OUT" "$NAME" )
    rm -rf "$tmp"
    echo "built $OUT ($(du -h "$OUT" | cut -f1), $count files, limit $MAX_FILES)"
    echo "Upload it in claude.ai under Settings > Capabilities > Skills."
    ;;

  install)
    keep=""
    kept_only=""
    if [ -d "$DEST" ]; then
      ib="$DEST/references/brands"
      rb="$SRC/references/brands"
      only=""
      differ=""
      for f in "$ib"/*.md; do
        [ -e "$f" ] || continue
        b="$(basename "$f")"
        if [ ! -e "$rb/$b" ]; then
          only="$only $b"
        elif ! cmp -s "$f" "$rb/$b"; then
          differ="$differ $b"
        fi
      done
      if [ -n "$differ" ] && [ -z "$BRANDS_FROM" ]; then
        echo "REFUSED: these brand files differ between the installed copy and the repo:" >&2
        for b in $differ; do echo "  $b   (diff \"$ib/$b\" \"$rb/$b\")" >&2; done
        echo "Reinstalling would overwrite one of them. Compare, then rerun with" >&2
        echo "  --brands-from installed   (keep the installed copy's version)" >&2
        echo "  --brands-from repo        (use the repo's version)" >&2
        exit 1
      fi
      keep="$(mktemp -d)"
      for b in $only; do cp -p "$ib/$b" "$keep/$b"; done
      if [ "$BRANDS_FROM" = "installed" ]; then
        for b in $differ; do cp -p "$ib/$b" "$keep/$b"; done
      fi
      kept_only="$only"
      # Licensed font files (git-ignored, like client brands) get the same care:
      # one that exists only in the installed copy survives the reinstall.
      if [ -d "$ib/fonts" ]; then
        while IFS= read -r f; do
          rel="${f#$ib/fonts/}"
          if [ ! -e "$rb/fonts/$rel" ]; then
            mkdir -p "$keep/fonts/$(dirname "$rel")"
            cp -p "$f" "$keep/fonts/$rel"
            kept_only="$kept_only fonts/$rel"
          fi
        done < <(find "$ib/fonts" -type f)
      fi
      echo "Replacing existing install at $DEST"
      rm -rf "$DEST"
    fi
    mkdir -p "$(dirname "$DEST")"
    cp -R "$SRC" "$DEST"
    find "$DEST" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
    if [ -n "$keep" ]; then
      for f in "$keep"/*.md; do
        [ -e "$f" ] || continue
        cp -p "$f" "$DEST/references/brands/"
      done
      if [ -d "$keep/fonts" ]; then
        mkdir -p "$DEST/references/brands/fonts"
        cp -Rp "$keep/fonts/." "$DEST/references/brands/fonts/"
      fi
      rm -rf "$keep"
      if [ -n "$kept_only" ]; then
        echo "Kept brand(s) that exist only in the installed copy:$kept_only"
        echo "  They are not in the repo. To keep a backup there (git-ignored):"
        echo "  cp \"$DEST/references/brands/<file>\" \"$SRC/references/brands/\""
      fi
    fi

    # Prove the installed copy stands on its own, with no repo in sight.
    if ( cd "$DEST" && python3 scripts/brand-tokens.py --list >/dev/null 2>&1 ); then
      echo "installed to $DEST"
      echo
      ( cd "$DEST" && python3 scripts/brand-tokens.py --list )
      echo
      echo "Ask Claude for a diagram to use it:"
      echo "  \"architecture diagram of the ingest pipeline\""
      echo
      echo "To add a client brand, copy references/brands/_template.md and run"
      echo "brand onboarding — see references/brand-onboarding.md."
    else
      echo "FAILED: the installed copy cannot load its own registry." >&2
      exit 1
    fi
    ;;
esac
