#!/usr/bin/env python3
"""Build manifest.json from video-list.txt (no transcripts required)."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIST_PATH = ROOT / "data" / "transcripts" / "kazewalol" / "video-list.txt"
OUT_PATH = ROOT / "data" / "transcripts" / "kazewalol" / "manifest.json"


def main() -> None:
    if not LIST_PATH.exists():
        raise SystemExit(f"Missing {LIST_PATH}")

    raw = LIST_PATH.read_bytes()
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        text = raw.decode("utf-16", errors="replace")
    else:
        text = raw.decode("utf-8", errors="replace")
    manifest: list[dict] = []
    for i, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("WARNING"):
            continue
        parts = line.split("|", 2)
        if len(parts) < 2:
            continue
        vid, title = parts[0], parts[1]
        upload = parts[2] if len(parts) > 2 else ""
        manifest.append(
            {
                "index": i,
                "id": vid,
                "title": title.strip(),
                "uploadDate": upload,
                "url": f"https://www.youtube.com/watch?v={vid}",
                "status": "titles_only",
                "language": None,
                "generated": None,
                "file": None,
                "error": None,
            }
        )

    OUT_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(manifest)} entries -> {OUT_PATH}")


if __name__ == "__main__":
    main()
