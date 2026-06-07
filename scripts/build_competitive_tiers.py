#!/usr/bin/env python3
"""Build competitive_tiers.json — delegates to gol.gg pro fetch."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FETCH = ROOT / "scripts" / "fetch_golgg_pro_tiers.py"


def main() -> None:
    subprocess.run([sys.executable, str(FETCH)], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
