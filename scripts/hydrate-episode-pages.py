#!/usr/bin/env python3
"""Hydrate full episode descriptions from the bundled episode pages.

The native episode cards intentionally use short summaries. The full show notes
already live in www/episodes/<episode-id>/index.html, so this script copies that
complete text into each catalog episode's `description` field without touching
its short `summary`. It works offline; `--network` is only a fallback for a
missing local page.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "live-data" / "content.json"
FALLBACK = ROOT / "www" / "data" / "fallback.json"
EPISODE_PAGES = ROOT / "www" / "episodes"


def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def clean_fragment(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", " ", value, flags=re.I)
    value = re.sub(r"<style\b[^>]*>[\s\S]*?</style>", " ", value, flags=re.I)
    value = re.sub(r"<h2\b[^>]*>\s*About this episode\s*</h2>", "", value, flags=re.I)
    value = re.sub(r"<\s*br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"<li\b[^>]*>", "\n• ", value, flags=re.I)
    value = re.sub(r"</\s*(p|div|li|h[1-6]|section|article|blockquote)\s*>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = value.replace("\xa0", " ")
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n[ \t]+", "\n", value)
    value = re.sub(r"[ \t]{2,}", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def local_description(episode_id: str) -> str:
    page = EPISODE_PAGES / episode_id / "index.html"
    if not page.exists():
        return ""
    document = page.read_text(encoding="utf-8", errors="ignore")
    match = re.search(
        r'<article\b[^>]*class=["\'][^"\']*\bepisode-copy\b[^"\']*["\'][^>]*>([\s\S]*?)</article>',
        document,
        flags=re.I,
    )
    return clean_fragment(match.group(1)) if match else ""


def fetch(url: str) -> str:
    result = subprocess.run(
        [
            "curl", "-fL", "--retry", "2", "--connect-timeout", "15", "--max-time", "35",
            "-A", "Mozilla/5.0 A Little Throuple Tea App", url,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout if result.returncode == 0 else ""


def remote_description(url: str) -> str:
    if not url.startswith("http"):
        return ""
    document = fetch(url)
    if not document:
        return ""
    match = re.search(
        r'<article\b[^>]*class=["\'][^"\']*\bepisode-copy\b[^"\']*["\'][^>]*>([\s\S]*?)</article>',
        document,
        flags=re.I,
    )
    return clean_fragment(match.group(1)) if match else ""


def longest(*values: object) -> str:
    candidates = [str(value or "").strip() for value in values if str(value or "").strip()]
    return max(candidates, key=len, default="")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", action="store_true", help="Fetch a missing episode page from webUrl.")
    args = parser.parse_args()

    catalog = load(LIVE) or load(FALLBACK)
    episodes = catalog.get("episodes", [])
    if not isinstance(episodes, list) or not episodes:
        raise SystemExit("❌ No episodes found in the bundled catalog.")

    local_found = network_found = upgraded = rich = 0
    missing: list[str] = []

    for episode in episodes:
        episode_id = str(episode.get("id") or "").strip()
        summary = str(episode.get("summary") or "").strip()
        previous = longest(episode.get("description"), summary)
        full = local_description(episode_id)

        if full:
            local_found += 1
        elif args.network:
            full = remote_description(str(episode.get("webUrl") or ""))
            if full:
                network_found += 1

        best = longest(full, previous, summary)
        if len(best) > len(previous) + 40:
            upgraded += 1
        episode["description"] = best

        if len(best) > len(summary) + 40:
            rich += 1
        else:
            missing.append(episode_id or str(episode.get("title") or "unknown"))

    catalog["schemaVersion"] = max(int(catalog.get("schemaVersion") or 0), 6)
    catalog["descriptionSource"] = "bundled-episode-pages"
    payload = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    LIVE.write_text(payload, encoding="utf-8")
    FALLBACK.write_text(payload, encoding="utf-8")

    print(f"📄 Bundled episode pages found: {local_found}/{len(episodes)}")
    if args.network:
        print(f"🌐 Network fallbacks found: {network_found}")
    print(f"✅ Descriptions upgraded this run: {upgraded}")
    print(f"📖 Full descriptions bundled: {rich}/{len(episodes)}")

    if missing:
        print("❌ Episodes still missing full descriptions:")
        for item in missing:
            print(f"   - {item}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
