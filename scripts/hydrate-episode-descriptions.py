#!/usr/bin/env python3
from pathlib import Path
import html
import json
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "live-data" / "content.json"
FALLBACK = ROOT / "www" / "data" / "fallback.json"

CONTENT = "{http://purl.org/rss/1.0/modules/content/}encoded"
ITUNES_SUMMARY = "{http://www.itunes.com/dtds/podcast-1.0.dtd}summary"

def clean_html(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<\s*br\s*/?\s*>", "\n", value, flags=re.I)
    value = re.sub(r"</\s*p\s*>", "\n\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = value.replace("\xa0", " ")
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n[ \t]+", "\n", value)
    value = re.sub(r"[ \t]{2,}", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()

def child_text(item, tag):
    node = item.find(tag)
    return (node.text or "").strip() if node is not None and node.text else ""

def normalize_title(value):
    value = html.unescape(value or "")
    value = re.sub(r"[\W_]+", " ", value.lower(), flags=re.UNICODE)
    return " ".join(value.split())

def read_catalog(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}

def choose_longer(*values):
    candidates = [str(value or "").strip() for value in values if str(value or "").strip()]
    return max(candidates, key=len, default="")

def main():
    if len(sys.argv) < 2:
        print("❌ Pass the downloaded RSS XML file.")
        return 1

    rss_path = Path(sys.argv[1])
    if not rss_path.exists():
        print(f"❌ RSS file not found: {rss_path}")
        return 1

    root = ET.fromstring(rss_path.read_bytes())
    rss_items = {}

    for item in root.findall(".//item"):
        title = child_text(item, "title")
        description = clean_html(child_text(item, "description"))
        encoded = clean_html(child_text(item, CONTENT))
        itunes_summary = clean_html(child_text(item, ITUNES_SUMMARY))
        richest = choose_longer(encoded, itunes_summary, description)
        if title and richest:
            rss_items[normalize_title(title)] = richest

    catalogs = [read_catalog(LIVE), read_catalog(FALLBACK)]
    catalog = max(catalogs, key=lambda data: len(data.get("episodes", [])), default={})
    episodes = catalog.get("episodes", [])

    updated = 0
    rich = 0
    for episode in episodes:
        title_key = normalize_title(episode.get("title", ""))
        rss_description = rss_items.get(title_key, "")
        previous = episode.get("description", "")
        best = choose_longer(rss_description, previous, episode.get("summary", ""))
        if best and best != previous:
            episode["description"] = best
            updated += 1
        if len(episode.get("description", "")) > len(episode.get("summary", "")) + 40:
            rich += 1

    catalog["schemaVersion"] = max(int(catalog.get("schemaVersion", 0) or 0), 4)
    catalog["descriptionSource"] = "local-rss-richest-field"

    text = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    for destination in (LIVE, FALLBACK):
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(text, encoding="utf-8")

    print(f"✅ RSS matched {len(rss_items)} episode descriptions.")
    print(f"✅ Updated {updated} episode descriptions.")
    print(f"📖 {rich} episodes now have descriptions richer than their card summaries.")

    if not rich:
        print("⚠️ RSS did not contain richer descriptions than the existing summaries.")
        return 2
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
