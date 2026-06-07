#!/usr/bin/env python3
"""Pipeline complet : transcripts Kaze → MD → couleurs MTG → site."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = [
    "process_kaze_transcripts.py",
    "build_mtg_colors.py",
    "apply_kaze_database.py",
]


def main() -> None:
    for name in SCRIPTS:
        path = ROOT / "scripts" / name
        print(f"\n=== {name} ===")
        r = subprocess.run([sys.executable, str(path)], cwd=ROOT)
        if r.returncode != 0:
            raise SystemExit(r.returncode)
    print("\nPipeline Kaze terminé.")


if __name__ == "__main__":
    main()
