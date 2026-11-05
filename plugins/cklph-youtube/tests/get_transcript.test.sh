#!/usr/bin/env bash
# Offline tests for get_transcript.py: ID parsing, VTT parsing, formatting, and where dependencies
# get installed (private venv only). No network. Run: bash plugins/cklph-youtube/tests/get_transcript.test.sh
set -euo pipefail
cd "$(dirname "$0")"
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v test_get_transcript 2>&1
