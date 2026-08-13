#!/usr/bin/env bash
# Install the cklph-diagram skill, or package it for upload.
#
#   ./install.sh                 install to ~/.claude/skills/cklph-diagram
#   ./install.sh --bundle        build cklph-diagram.skill for claude.ai upload
#   ./install.sh --dir <path>    install somewhere else
#   ./install.sh --uninstall     remove an installed copy
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

while [ $# -gt 0 ]; do
  case "$1" in
    --bundle)    MODE="bundle"; shift ;;
    --uninstall) MODE="uninstall"; shift ;;
    --dir)       DEST="$2/${NAME}"; shift 2 ;;
    -h|--help)   sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
    ( cd "$tmp" && zip -qr "$OLDPWD/$OUT" "$NAME" )
    rm -rf "$tmp"
    echo "built $OUT ($(du -h "$OUT" | cut -f1))"
    echo "Upload it in claude.ai under Settings > Capabilities > Skills."
    ;;

  install)
    if [ -d "$DEST" ]; then
      echo "Replacing existing install at $DEST"
      rm -rf "$DEST"
    fi
    mkdir -p "$(dirname "$DEST")"
    cp -R "$SRC" "$DEST"
    find "$DEST" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true

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
