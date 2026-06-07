#!/usr/bin/env python3
"""Download Kazewa transcripts → extract knowledge → update site."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"


def run(name: str, *args: str) -> None:
    cmd = [sys.executable, str(SCRIPTS / name), *args]
    print(">", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> None:
    run("download_kazewa_transcripts.py", *sys.argv[1:])
    run("extract_kazewa_knowledge.py")
    run("apply_kazewa_knowledge.py")
    print("Kazewa pipeline complete.")


if __name__ == "__main__":
    main()
