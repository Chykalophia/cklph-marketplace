#!/usr/bin/env bash
set -e
PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$PLUGIN_DIR"

if [ ! -d "node_modules" ]; then
  echo "[vuln-intel-ext] First run: installing dependencies..." >&2
  # npm ci, not npm install: install exactly the committed package-lock.json (fails instead of
  # re-resolving ^ ranges when lock and manifest disagree). --omit=dev: dist/ is prebuilt, so the
  # TypeScript toolchain is not needed at runtime. Install scripts stay ENABLED on purpose:
  # better-sqlite3 needs its native build step, so --ignore-scripts would leave it unloadable.
  npm ci --omit=dev >&2 2>&1 || {   # all npm output to stderr: stdout is the MCP channel
    echo "[vuln-intel-ext] npm ci failed. Try running manually: cd $PLUGIN_DIR && npm ci --omit=dev" >&2
    exit 1
  }
fi

# node_modules can exist without the native binding: a plugin installer that copies node_modules or
# installs with scripts disabled leaves better-sqlite3 unbuilt, and the dir check above then skips
# the install forever ("Could not locate the bindings file", server never starts). Check that the
# binding actually loads, and rebuild it once if not.
if ! node -e 'new (require("better-sqlite3"))(":memory:").close()' >/dev/null 2>&1; then
  echo "[vuln-intel-ext] better-sqlite3 native binding missing or unloadable: rebuilding..." >&2
  npm rebuild better-sqlite3 >&2 2>&1 && node -e 'new (require("better-sqlite3"))(":memory:").close()' >&2 2>&1 || {
    echo "[vuln-intel-ext] better-sqlite3 could not be built for Node $(node --version). Needs Node 20.x or 22.x-26.x and a C compiler; try: cd $PLUGIN_DIR && npm rebuild better-sqlite3" >&2
    exit 1
  }
fi

exec node dist/index.js
