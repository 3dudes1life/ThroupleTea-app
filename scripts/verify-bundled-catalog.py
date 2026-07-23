#!/usr/bin/env python3
from pathlib import Path
import json
import sys

root = Path(__file__).resolve().parents[1]
catalog = root / "www" / "data" / "fallback.json"

try:
    data = json.loads(catalog.read_text(encoding="utf-8"))
except Exception as exc:
    print(f"❌ Bundled catalog could not be read: {exc}")
    sys.exit(1)

videos = data.get("videos", [])
shorts = sum(1 for video in videos if video.get("kind") == "short")
full = sum(1 for video in videos if video.get("kind") == "episode")

print(f"📺 Bundled catalog: {shorts} Shorts + {full} full videos")

if len(videos) < 5:
    print("❌ The bundled Watch catalog is too small for release.")
    print("Run scripts/update-live-data.py again while connected to the internet.")
    sys.exit(1)

print("✅ Healthy YouTube catalog will be bundled into the iOS app.")
