#!/usr/bin/env python3
"""Download YouTube transcripts for an entire channel (resume-safe)."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from youtube_transcript_api import NoTranscriptFound, TranscriptsDisabled, YouTubeTranscriptApi

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "data" / "transcripts" / "kazewalol"
DEFAULT_CHANNEL = "https://www.youtube.com/@kazewalol/videos"
VIDEO_LIST = DEFAULT_OUT / "video-list.txt"


def slugify(text: str, max_len: int = 80) -> str:
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text.lower())
    text = re.sub(r"[\s_-]+", "-", text).strip("-")
    return text[:max_len] or "video"


def list_channel_videos(channel_url: str) -> list[dict]:
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--flat-playlist",
        "--print",
        "%(id)s|%(title)s|%(upload_date)s",
        channel_url,
    ]
    out = subprocess.check_output(cmd, text=True, encoding="utf-8", errors="replace")
    videos: list[dict] = []
    for i, line in enumerate(out.strip().splitlines(), start=1):
        if not line.strip() or line.startswith("WARNING"):
            continue
        parts = line.split("|", 2)
        if len(parts) < 2:
            continue
        vid, title = parts[0], parts[1]
        upload = parts[2] if len(parts) > 2 else ""
        videos.append({"id": vid, "title": title.strip(), "index": i, "uploadDate": upload})
    return videos


def load_video_list(path: Path) -> list[dict]:
    videos: list[dict] = []
    for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("WARNING"):
            continue
        parts = line.split("|", 2)
        if len(parts) < 2:
            continue
        videos.append(
            {
                "id": parts[0],
                "title": parts[1].strip(),
                "index": i,
                "uploadDate": parts[2] if len(parts) > 2 else "",
            }
        )
    return videos


def pick_transcript_api(video_id: str):
    api = YouTubeTranscriptApi()
    transcript_list = api.list(video_id)
    for lang in ("fr", "fr-FR", "en", "en-US"):
        try:
            t = transcript_list.find_transcript([lang])
            return t.fetch(), t.language_code, t.is_generated
        except NoTranscriptFound:
            continue
    try:
        t = transcript_list.find_generated_transcript(["fr", "en"])
        return t.fetch(), t.language_code, True
    except NoTranscriptFound:
        pass
    for t in transcript_list:
        return t.fetch(), t.language_code, t.is_generated
    raise NoTranscriptFound(video_id)


def vtt_to_lines(vtt_text: str) -> str:
    lines: list[str] = []
    seen: set[str] = set()
    ts_re = re.compile(r"^(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})")
    for raw in vtt_text.splitlines():
        line = raw.strip()
        if not line or line == "WEBVTT" or line.startswith("Kind:") or line.startswith("Language:"):
            continue
        if ts_re.match(line) or "-->" in line:
            continue
        if line.isdigit():
            continue
        line = re.sub(r"<[^>]+>", "", line).strip()
        if not line or line in seen:
            continue
        seen.add(line)
        lines.append(line)
    return "\n".join(f"[{i + 1:02d}] {t}" for i, t in enumerate(lines))


def download_subtitle_ytdlp(
    video_id: str,
    out_dir: Path,
    cookies_browser: str | None,
    sleep_requests: float,
) -> tuple[str, str, bool] | None:
    tmp_base = out_dir / f"_tmp-{video_id}"
    for vtt in out_dir.glob(f"_tmp-{video_id}.*.vtt"):
        vtt.unlink(missing_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--extractor-args",
        "youtube:player_client=android",
        "--write-auto-subs",
        "--write-subs",
        "--sub-langs",
        "fr,en",
        "--skip-download",
        "--sub-format",
        "vtt",
        "--sleep-requests",
        str(sleep_requests),
        "-o",
        str(tmp_base),
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    if cookies_browser:
        cmd.insert(-1, f"--cookies-from-browser={cookies_browser}")

    for attempt in range(3):
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
            break
        except subprocess.CalledProcessError as exc:
            err = (exc.stderr or "") + (exc.stdout or "")
            if "429" in err and attempt < 2:
                time.sleep(8 * (attempt + 1))
                continue
            return None

    for lang in ("fr", "en"):
        matches = sorted(out_dir.glob(f"_tmp-{video_id}.{lang}*.vtt"))
        if matches:
            body = vtt_to_lines(matches[0].read_text(encoding="utf-8", errors="replace"))
            for m in out_dir.glob(f"_tmp-{video_id}*"):
                m.unlink(missing_ok=True)
            if body.strip():
                return body, lang, True
    for m in out_dir.glob(f"_tmp-{video_id}*"):
        m.unlink(missing_ok=True)
    return None


def fetch_transcript(
    video_id: str,
    out_dir: Path,
    cookies_browser: str | None,
    sleep_requests: float,
) -> tuple[str, str, bool]:
    sub = download_subtitle_ytdlp(video_id, out_dir, cookies_browser, sleep_requests)
    if sub:
        return sub
    segments, lang, generated = pick_transcript_api(video_id)
    return segments_to_text(segments), lang, generated


def format_timestamp(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def segments_to_text(segments) -> str:
    lines = []
    for seg in segments:
        ts = format_timestamp(seg.start)
        text = seg.text.replace("\n", " ").strip()
        if text:
            lines.append(f"[{ts}] {text}")
    return "\n".join(lines)


def load_manifest(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {e["id"]: e for e in data if e.get("id")}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--channel", default=DEFAULT_CHANNEL)
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument(
        "--cookies-from-browser",
        default="",
        help="Browser for cookies (edge, chrome, firefox). Helps when YouTube blocks IP.",
    )
    parser.add_argument("--sleep", type=float, default=2.5, help="Delay between videos (seconds)")
    parser.add_argument("--sleep-requests", type=float, default=1.5, help="yt-dlp sleep between HTTP requests")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.json"
    cookies = args.cookies_from_browser.strip() or None

    if VIDEO_LIST.exists() and not args.force:
        raw = VIDEO_LIST.read_bytes()
        if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
            text = raw.decode("utf-16", errors="replace")
        else:
            text = raw.decode("utf-8", errors="replace")
        videos = []
        for i, line in enumerate(text.splitlines(), start=1):
            line = line.strip()
            if not line or line.startswith("WARNING"):
                continue
            parts = line.split("|", 2)
            if len(parts) < 2:
                continue
            videos.append(
                {
                    "id": parts[0],
                    "title": parts[1].strip(),
                    "index": i,
                    "uploadDate": parts[2] if len(parts) > 2 else "",
                }
            )
        print(f"Loaded {len(videos)} videos from {VIDEO_LIST.name}")
    else:
        videos = list_channel_videos(args.channel)
        VIDEO_LIST.write_text(
            "\n".join(f"{v['id']}|{v['title']}|{v.get('uploadDate', '')}" for v in videos),
            encoding="utf-8",
        )
    if args.limit:
        videos = videos[: args.limit]

    existing = {} if args.force else load_manifest(manifest_path)
    manifest: list[dict] = []
    combined_parts = [
        "# Transcripts — KazewaLoL (chaîne complète)\n",
        f"Source: {args.channel}\n",
        f"Videos: {len(videos)}\n",
        "---\n",
    ]

    ok = skipped = failed = 0
    for video in videos:
        vid = video["id"]
        title = video["title"]
        idx = video["index"]

        if not args.force and vid in existing and existing[vid].get("status") == "ok":
            entry = existing[vid]
            manifest.append(entry)
            skipped += 1
            if entry.get("file"):
                body = (out_dir / entry["file"]).read_text(encoding="utf-8")
                combined_parts.append(f"\n## {idx}. {title}\n\nURL: https://www.youtube.com/watch?v={vid}\n\n")
                combined_parts.append(body.split("---\n\n", 1)[-1] if "---\n\n" in body else body)
                combined_parts.append("\n\n---\n")
            continue

        safe = title.encode("cp1252", errors="replace").decode("cp1252")
        print(f"[{idx}/{len(videos)}] {safe} ({vid})")

        entry = {
            "index": idx,
            "id": vid,
            "title": title,
            "uploadDate": video.get("uploadDate"),
            "url": f"https://www.youtube.com/watch?v={vid}",
            "status": "ok",
            "language": None,
            "generated": None,
            "file": None,
            "error": None,
        }

        try:
            body, lang, generated = fetch_transcript(vid, out_dir, cookies, args.sleep_requests)
            filename = f"{idx:04d}-{slugify(title)}.md"
            filepath = out_dir / filename
            md = (
                f"# {title}\n\n"
                f"- Video: https://www.youtube.com/watch?v={vid}\n"
                f"- Index: {idx}\n"
                f"- Transcript lang: {lang}{' (auto)' if generated else ''}\n\n"
                f"---\n\n{body}\n"
            )
            filepath.write_text(md, encoding="utf-8")
            entry.update({"language": lang, "generated": generated, "file": filename})
            combined_parts.append(f"\n## {idx}. {title}\n\nURL: https://www.youtube.com/watch?v={vid}\n\n{body}\n\n---\n")
            ok += 1
        except TranscriptsDisabled:
            entry["status"] = "disabled"
            entry["error"] = "transcripts disabled"
            failed += 1
        except NoTranscriptFound:
            entry["status"] = "missing"
            entry["error"] = "no transcript"
            failed += 1
        except Exception as exc:  # noqa: BLE001
            entry["status"] = "error"
            entry["error"] = str(exc)[:500]
            failed += 1
            print(f"  -> {entry['error'][:120]}")

        manifest.append(entry)
        if idx % 5 == 0:
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        time.sleep(args.sleep)

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "channel-full-transcript.md").write_text("".join(combined_parts), encoding="utf-8")

    total_ok = sum(1 for e in manifest if e.get("status") == "ok")
    print(f"\nDone: ok={total_ok} skipped={skipped} failed={failed} total={len(videos)}")
    if failed and not cookies:
        print("Tip: retry with --cookies-from-browser edge if YouTube blocks your IP.")
    print(f"Output: {out_dir}")
    return 0 if total_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
