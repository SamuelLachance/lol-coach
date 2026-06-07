#!/usr/bin/env python3
"""Deprecated wrapper — use fetch_lolalytics_meta.py instead."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    cmd = [sys.executable, str(ROOT / "scripts" / "fetch_lolalytics_meta.py"), *sys.argv[1:]]
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
