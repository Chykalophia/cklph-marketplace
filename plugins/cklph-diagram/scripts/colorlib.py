#!/usr/bin/env python3
"""Forwarder. The real colorlib.py lives inside the skill, which must be
self-contained when installed on its own. Kept here so repo-root muscle
memory and CI paths keep working -- there is only ever one copy."""
import runpy
import sys
from pathlib import Path

_real = Path(__file__).resolve().parent.parent / "skills/cklph-diagram/scripts/colorlib.py"
sys.path.insert(0, str(_real.parent))
runpy.run_path(str(_real), run_name="__main__")
