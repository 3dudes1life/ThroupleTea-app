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
import os
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "live-data" / "content.json"
BUNDLED_OUT = ROOT / "www" / "data" / "fallback.json"
RSS_URL = "https://anchor.fm/s/1087008c4/podcast/rss"
EPISODE_ARCHIVE_URL = "https://throupletea.com/episodes/"
YOUTUBE_FEED_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=UCswzye8bcm8bByqLlW0QaFQ"
USER_AGENT = "ThroupleTeaAppDataBot/1.0 (+https://throupletea.com)"

def fetch(url: str, attempts: int = 3) -> bytes:
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except Exception as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(attempt)
    raise last_error or RuntimeError(f"Unable to fetch {url}")

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

def _parse_rss_unprotected(cards: list[dict]) -> list[dict]:
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

def parse_rss(cards: list[dict]) -> list[dict]:
    try:
        return _parse_rss_unprotected(cards)
    except Exception as exc:
        print(f"Podcast RSS warning: {exc}")
        return []

def _published_iso(entry: dict) -> str:
    timestamp = entry.get("timestamp") or entry.get("release_timestamp")
    if timestamp:
        try:
            return dt.datetime.fromtimestamp(float(timestamp), tz=dt.timezone.utc).isoformat()
        except Exception:
            pass
    upload_date = str(entry.get("upload_date") or "")
    if len(upload_date) == 8 and upload_date.isdigit():
        try:
            return dt.datetime.strptime(upload_date, "%Y%m%d").replace(tzinfo=dt.timezone.utc).isoformat()
        except Exception:
            pass
    return str(entry.get("published") or "")

def _best_thumbnail(entry: dict, kind: str) -> str:
    thumbnails = entry.get("thumbnails") or []
    if isinstance(thumbnails, list) and thumbnails:
        usable = [thumb for thumb in thumbnails if isinstance(thumb, dict) and thumb.get("url")]
        if usable:
            if kind == "short":
                def portrait_score(thumb):
                    width = float(thumb.get("width") or 1)
                    height = float(thumb.get("height") or 1)
                    return abs((width / height) - (9 / 16))
                return min(usable, key=portrait_score).get("url", "")
            return max(
                usable,
                key=lambda thumb: float(thumb.get("width") or 0) * float(thumb.get("height") or 0)
            ).get("url", "")
    return str(entry.get("thumbnail") or "")

def _ensure_ytdlp() -> None:
    """Install or upgrade yt-dlp in the current Python environment."""
    try:
        import yt_dlp  # noqa: F401
        return
    except ImportError:
        pass

    print("Installing yt-dlp for the YouTube catalog refresh...")
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "--quiet", "--upgrade", "yt-dlp"],
        check=True,
        timeout=240,
    )

def _ytdlp_channel_tab(tab: str, kind: str, limit: int) -> list[dict]:
    _ensure_ytdlp()

    candidates = [
        f"https://www.youtube.com/channel/UCswzye8bcm8bByqLlW0QaFQ/{tab}",
        f"https://www.youtube.com/@ThroupleTea/{tab}",
    ]
    last_error = ""

    for url in candidates:
        command = [
            sys.executable, "-m", "yt_dlp",
            "--flat-playlist",
            "--dump-single-json",
            "--playlist-end", str(limit),
            "--no-warnings",
            "--ignore-errors",
            "--extractor-retries", "3",
            "--socket-timeout", "30",
            url,
        ]
        result = subprocess.run(command, capture_output=True, text=True, timeout=300)
        if result.returncode != 0 or not result.stdout.strip():
            last_error = result.stderr.strip() or f"yt-dlp failed for {url}"
            continue

        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            last_error = f"Invalid yt-dlp JSON for {url}: {exc}"
            continue

        videos = []
        for entry in data.get("entries") or []:
            if not isinstance(entry, dict):
                continue

            video_id = str(entry.get("id") or "")
            if not video_id:
                continue

            duration = entry.get("duration")
            try:
                duration_seconds = int(float(duration)) if duration is not None else 0
            except Exception:
                duration_seconds = 0

            videos.append({
                "id": video_id,
                "title": str(entry.get("title") or "A Little Throuple Tea"),
                "published": _published_iso(entry),
                "thumbnail": _best_thumbnail(entry, kind) or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "kind": kind,
                "durationSeconds": duration_seconds,
            })

        if videos:
            return videos

        last_error = f"No {kind} entries returned for {url}"

    raise RuntimeError(last_error or f"Unable to load YouTube {tab} tab")

def _oembed_kind(video_id: str, title_value: str) -> str:
    """Use YouTube oEmbed dimensions to distinguish vertical Shorts."""
    try:
        url = (
            "https://www.youtube.com/oembed"
            f"?url=https://www.youtube.com/shorts/{video_id}&format=json"
        )
        data = json.loads(fetch(url).decode("utf-8", errors="replace"))
        width = float(data.get("width") or 0)
        height = float(data.get("height") or 0)
        if height > width and height > 0:
            return "short"
    except Exception:
        pass

    return "short" if re.search(r"(^|\s)#?shorts?(\s|$)", title_value, flags=re.I) else "episode"

def _atom_fallback() -> list[dict]:
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

        kind = _oembed_kind(video_id, title_value)
        videos.append({
            "id": video_id,
            "title": title_value,
            "published": published,
            "thumbnail": thumbnail or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "kind": kind,
            "durationSeconds": 0,
        })
    return videos

def parse_youtube() -> list[dict]:
    full_videos = []
    shorts = []

    try:
        full_videos = _ytdlp_channel_tab("videos", "episode", 75)
    except Exception as exc:
        print(f"Full-video catalog warning: {exc}")

    try:
        shorts = _ytdlp_channel_tab("shorts", "short", 75)
    except Exception as exc:
        print(f"Shorts catalog warning: {exc}")

    combined = full_videos + shorts

    # Always merge in the latest Atom items so today's uploads appear even if
    # YouTube temporarily blocks one of the channel-tab requests.
    try:
        combined.extend(_atom_fallback())
    except Exception as exc:
        print(f"YouTube Atom fallback warning: {exc}")

    deduped = {}
    for video in combined:
        if not video.get("id"):
            continue
        current = deduped.get(video["id"])
        if current is None:
            deduped[video["id"]] = video
            continue

        # Prefer the richer entry with a duration and explicit tab kind.
        current_score = int(bool(current.get("durationSeconds"))) + int(current.get("kind") in {"short", "episode"})
        new_score = int(bool(video.get("durationSeconds"))) + int(video.get("kind") in {"short", "episode"})
        if new_score > current_score:
            deduped[video["id"]] = video

    videos = list(deduped.values())
    videos.sort(key=lambda video: video.get("published") or "", reverse=True)

    short_count = sum(1 for video in videos if video.get("kind") == "short")
    episode_count = sum(1 for video in videos if video.get("kind") == "episode")
    print(f"Loaded {short_count} Shorts and {episode_count} full videos from YouTube.")
    return videos

def _catalog_from_file(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
        return loaded if isinstance(loaded, dict) else {}
    except Exception as exc:
        print(f"Saved catalog warning for {path}: {exc}")
        return {}

def _best_existing_catalog() -> dict:
    catalogs = [_catalog_from_file(OUT), _catalog_from_file(BUNDLED_OUT)]
    best_episodes = max(
        (catalog.get("episodes", []) for catalog in catalogs),
        key=len,
        default=[],
    )
    best_videos = max(
        (catalog.get("videos", []) for catalog in catalogs),
        key=len,
        default=[],
    )
    return {
        "episodes": best_episodes,
        "videos": best_videos,
    }

def _merge_episode_metadata(fresh: list[dict], existing: list[dict]) -> list[dict]:
    if not fresh:
        return existing

    by_id = {item.get("id"): item for item in existing if item.get("id")}
    by_title = {
        normalize(item.get("title", "")): item
        for item in existing
        if item.get("title")
    }

    merged = []
    for episode in fresh:
        previous = by_id.get(episode.get("id")) or by_title.get(normalize(episode.get("title", ""))) or {}
        result = dict(episode)
        for key in ("label", "summary", "image", "webUrl"):
            if not result.get(key) and previous.get(key):
                result[key] = previous[key]
        merged.append(result)
    return merged

def main():
    existing = _best_existing_catalog()

    # Each source is isolated. A temporary outage in one source never prevents
    # the others from refreshing or the saved catalog from being preserved.
    cards = parse_archive()
    fresh_episodes = parse_rss(cards)
    fresh_videos = parse_youtube()

    episodes = _merge_episode_metadata(fresh_episodes, existing.get("episodes", []))
    videos = fresh_videos

    existing_videos = existing.get("videos", [])
    if len(videos) < 5 and len(existing_videos) > len(videos):
        print(
            f"Catalog safeguard: preserving {len(existing_videos)} saved videos "
            f"instead of accepting {len(videos)}."
        )
        videos = existing_videos

    if not episodes:
        episodes = existing.get("episodes", [])
    if not videos:
        videos = existing_videos

    payload = {
        "schemaVersion": 3,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": "resilient-rss+website+youtube-tabs+atom",
        "sourceStatus": {
            "websiteArchive": "fresh" if cards else "saved-metadata",
            "podcastRss": "fresh" if fresh_episodes else "saved",
            "youtube": "fresh" if fresh_videos else "saved",
        },
        "episodes": episodes,
        "videos": videos,
    }

    for destination in (OUT, BUNDLED_OUT):
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            f"Wrote {len(payload['episodes'])} episodes and "
            f"{len(payload['videos'])} videos to {destination}"
        )

if __name__ == "__main__":
    import urllib.parse
    main()
