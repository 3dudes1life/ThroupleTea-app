#!/usr/bin/env python3
"""Refresh live app JSON from the existing podcast RSS, website archive, and YouTube Atom feed.

This only publishes DATA. It never changes the website and never downloads new app code.
"""
from __future__ import annotations
import datetime as dt
import difflib
import email.utils
import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "live-data" / "content.json"
RSS_URL = "https://anchor.fm/s/1087008c4/podcast/rss"
EPISODE_ARCHIVE_URL = "https://throupletea.com/episodes/"
YOUTUBE_FEED_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=UCswzye8bcm8bByqLlW0QaFQ"
USER_AGENT = "ThroupleTeaAppDataBot/1.0 (+https://throupletea.com)"

def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()

def text(node, name: str, namespaces=None) -> str:
    found = node.find(name, namespaces or {})
    return (found.text or "").strip() if found is not None and found.text else ""

def clean_html(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(value)).strip()

def normalize(value: str) -> str:
    value = html.unescape(value or "").lower()
    value = re.sub(r"[^\w\s]", " ", value, flags=re.UNICODE)
    return re.sub(r"\s+", " ", value).strip()

def iso_date(value: str) -> str:
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        return parsed.astimezone(dt.timezone.utc).isoformat()
    except Exception:
        return value or ""

class ArchiveParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_card = False
        self.depth = 0
        self.current = None
        self.capture = None
        self.cards = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "").split()
        if tag == "a" and "archive-card" in classes:
            self.in_card = True
            self.depth = 1
            self.current = {"href": attrs.get("href", ""), "title": "", "summary": "", "label": "", "image": ""}
            return
        if not self.in_card:
            return
        self.depth += 1
        if tag == "img" and not self.current["image"]:
            self.current["image"] = attrs.get("src", "")
        if tag == "h2":
            self.capture = "title"
        elif tag == "p":
            self.capture = "summary"
        elif "card-label" in classes:
            self.capture = "label"

    def handle_endtag(self, tag):
        if not self.in_card:
            return
        if tag in {"h2", "p", "div"}:
            self.capture = None
        self.depth -= 1
        if tag == "a" and self.depth == 0:
            self.cards.append(self.current)
            self.current = None
            self.in_card = False

    def handle_data(self, data):
        if self.in_card and self.capture:
            self.current[self.capture] += data

def parse_archive() -> list[dict]:
    try:
        parser = ArchiveParser()
        parser.feed(fetch(EPISODE_ARCHIVE_URL).decode("utf-8", errors="replace"))
        for card in parser.cards:
            for key in ("title", "summary", "label"):
                card[key] = re.sub(r"\s+", " ", card[key]).strip()
            card["url"] = urllib.parse.urljoin(EPISODE_ARCHIVE_URL, card["href"])
        return parser.cards
    except Exception as exc:
        print(f"Archive fetch warning: {exc}")
        return []

def best_archive_match(title: str, cards: list[dict]) -> dict | None:
    target = normalize(title)
    exact = next((c for c in cards if normalize(c["title"]) == target), None)
    if exact:
        return exact
    scored = [(difflib.SequenceMatcher(None, target, normalize(c["title"])).ratio(), c) for c in cards]
    score, card = max(scored, default=(0, None), key=lambda pair: pair[0])
    return card if score >= 0.72 else None

def parse_rss(cards: list[dict]) -> list[dict]:
    root = ET.fromstring(fetch(RSS_URL))
    channel = root.find("channel")
    ns = {"itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd"}
    result = []
    for index, item in enumerate(channel.findall("item") if channel is not None else [], start=1):
        title_value = text(item, "title")
        guid = text(item, "guid") or f"episode-{index}"
        enclosure = item.find("enclosure")
        image = item.find("itunes:image", ns)
        match = best_archive_match(title_value, cards)
        web_url = match["url"] if match else text(item, "link")
        slug = ""
        if match:
            slug = match["href"].strip("/").split("/")[-1]
        if not slug:
            slug = re.sub(r"[^a-z0-9]+", "-", title_value.lower()).strip("-")
        description = text(item, "description")
        result.append({
            "id": slug or re.sub(r"[^a-z0-9]+", "-", guid.lower()).strip("-"),
            "title": title_value,
            "label": match.get("label", "") if match else "",
            "summary": (match.get("summary", "") if match else "") or clean_html(description),
            "image": (image.attrib.get("href", "") if image is not None else "") or (match.get("image", "") if match else ""),
            "webUrl": web_url,
            "audioUrl": enclosure.attrib.get("url", "") if enclosure is not None else "",
            "date": iso_date(text(item, "pubDate")),
            "duration": text(item, "itunes:duration", ns),
            "season": int(text(item, "itunes:season", ns)) if text(item, "itunes:season", ns).isdigit() else None,
            "episode": int(text(item, "itunes:episode", ns)) if text(item, "itunes:episode", ns).isdigit() else None,
        })
    return result[:60]

def parse_youtube() -> list[dict]:
    root = ET.fromstring(fetch(YOUTUBE_FEED_URL))
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }
    videos = []
    for entry in root.findall("atom:entry", ns):
        video_id = text(entry, "yt:videoId", ns)
        title_value = text(entry, "atom:title", ns)
        published = text(entry, "atom:published", ns)
        media_group = entry.find("media:group", ns)
        thumbnail = ""
        if media_group is not None:
            thumb = media_group.find("media:thumbnail", ns)
            if thumb is not None:
                thumbnail = thumb.attrib.get("url", "")
        videos.append({
            "id": video_id,
            "title": title_value,
            "published": published,
            "thumbnail": thumbnail or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "url": f"https://www.youtube.com/watch?v={video_id}",
        })
    return videos[:20]

def main():
    cards = parse_archive()
    existing = {}
    if OUT.exists():
        try:
            existing = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            pass
    episodes = parse_rss(cards)
    videos = parse_youtube()
    payload = {
        "schemaVersion": 1,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": "rss+website+youtube",
        "episodes": episodes or existing.get("episodes", []),
        "videos": videos or existing.get("videos", []),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(payload['episodes'])} episodes and {len(payload['videos'])} videos to {OUT}")

if __name__ == "__main__":
    import urllib.parse
    main()
