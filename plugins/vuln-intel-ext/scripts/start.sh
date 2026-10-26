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

exec node dist/index.js
