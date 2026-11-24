#!/usr/bin/env python3
"""Fetch the Bitili news intelligence RSS feed and store a static snapshot.

The homepage is served as a static site, so fetching this feed at build time
(rather than in the browser) avoids cross-origin restrictions and keeps the
news section fast. The page falls back to the live feed when the snapshot is
unavailable or out of date.
"""

import datetime
import json
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

FEED_URL = (
    "https://platform.bitili.com/api/v1/news-intelligence/rss.xml"
    "?period=7&minRelevance=50"
)
MAX_ITEMS = 15
OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "news.json"


def text(element, tag):
    child = element.find(tag)
    return (child.text or "").strip() if child is not None else ""


def fetch():
    request = urllib.request.Request(
        FEED_URL,
        headers={
            "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
            "User-Agent": "bitili-homepage/1.0 (+https://bitili.com)",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def parse(raw):
    root = ET.fromstring(raw)
    items = []
    for item in root.findall("./channel/item")[:MAX_ITEMS]:
        items.append(
            {
                "title": text(item, "title"),
                "link": text(item, "link"),
                "description": text(item, "description"),
                "pubDate": text(item, "pubDate"),
                "categories": [
                    (category.text or "").strip()
                    for category in item.findall("category")
                ],
            }
        )
    return [item for item in items if item["title"] and item["link"]]


def main():
    items = parse(fetch())
    if not items:
        raise SystemExit("Feed returned no items; keeping the existing snapshot.")

    payload = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "source": FEED_URL,
        "items": items,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(items)} stories to {OUTPUT}")


if __name__ == "__main__":
    main()
