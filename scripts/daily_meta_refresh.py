#!/usr/bin/env python3
"""Daily meta refresh: lane rates, builds, beatdown analysis, pro tiers → champions.json."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"


def run(script: str, *extra: str) -> None:
    cmd = [sys.executable, str(SCRIPTS / script), *extra]
    print(">", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> None:
    run("fetch_lolalytics_meta.py", "--force")
    run("apply_lolalytics_meta.py")
    run("build_beatdown_tiers.py")
    run("apply_beatdown_tiers.py")
    run("fetch_golgg_pro_tiers.py")
    run("apply_competitive_tiers.py")
    run("build_champions_index.py")
    print("Daily meta refresh complete.")


if __name__ == "__main__":
    main()
