#!/usr/bin/env bash
set -e
PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$PLUGIN_DIR"

if [ ! -d "node_modules" ]; then
  echo "[vuln-intel-ext] First run: installing dependencies..." >&2
  npm install 2>&1 >&2 || {
    echo "[vuln-intel-ext] npm install failed. Try running manually: cd $PLUGIN_DIR && npm install" >&2
    exit 1
  }
fi

exec node dist/index.js
