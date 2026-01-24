#!/usr/bin/env python3
"""
Usage:
  python rank_queue.py path/to/data.json equeue

Output:
  numVotes - title - description
"""

import json
import argparse
from datetime import datetime, timezone

def parse_when(when_str: str) -> float:
    """Parse ISO timestamp -> unix seconds (for tie-breaking)."""
    if not when_str or not isinstance(when_str, str):
        return 0.0
    try:
        # Handles "2025-03-24T08:38:20.857Z"
        dt = datetime.fromisoformat(when_str.replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception:
        return 0.0

def rank_queue(data: dict, queue_name: str):
    media = data.get("media", {})
    results = []

    for key, entry in media.items():
        consumptions = entry.get("consumptions", [])
        if isinstance(consumptions, list) and len(consumptions) > 0:
            continue  # exclude consumed items

        qv = entry.get("queue-votes", {})
        if not isinstance(qv, dict):
            continue

        votes = qv.get(queue_name, [])
        if not isinstance(votes, list) or len(votes) == 0:
            continue

        meta = entry.get("meta", {}) if isinstance(entry.get("meta", {}), dict) else {}
        title = meta.get("title") or key
        description = meta.get("description") or ""

        latest_when = max((parse_when(v.get("when")) for v in votes if isinstance(v, dict)), default=0.0)

        results.append({
            "numVotes": len(votes),
            "title": title,
            "description": description,
            "latest_when": latest_when,  # tie-breaker
        })

    # Sort by vote count descending, then latest vote descending, then title
    results.sort(key=lambda x: (-x["numVotes"], -x["latest_when"], x["title"].lower()))
    return results

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json_path", help="Path to your JSON file")
    ap.add_argument("queue_name", help="Queue category name (e.g. equeue, watchlist, books)")
    args = ap.parse_args()

    with open(args.json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    ranked = rank_queue(data, args.queue_name)

    if not ranked:
        print(f'No unconsumed items found in queue "{args.queue_name}".')
        return

    for item in ranked:
        desc = f" - {item['description']}" if item["description"] else ""
        print(f"{item['numVotes']} - {item['title']}{desc}")

if __name__ == "__main__":
    main()
