#!/usr/bin/env python3
import os
import json
import glob
import requests
import time
import logging
from urllib.parse import quote
import argparse

# --- CONFIGURATION ---

# Base URLs for fallback keys
TRAKT_MOVIE_BASE = "https://trakt.tv/movies"
TRAKT_EPISODE_BASE = "https://trakt.tv/shows"

# The name of the queue used for watchlists
WATCHLIST_QUEUE = "watchlist"

# Delay between HTTP requests (in seconds) to be nice to the APIs
QUERY_DELAY = 0.5

# Cache file for Wikidata API responses (for both SPARQL and wbsearchentities)
CACHE_FILENAME = "wikidata_cache.json"

# Global cache dictionary.
wikidata_cache = {}

# Global flag for interactive mode
INTERACTIVE_MODE = True

# --- LOGGING CONFIGURATION ---
logging.basicConfig(
    level=logging.INFO,  # Set to INFO; DEBUG messages won't be shown by default.
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

# --- CACHE FUNCTIONS ---

def load_cache():
    global wikidata_cache
    if os.path.exists(CACHE_FILENAME):
        try:
            with open(CACHE_FILENAME, "r", encoding="utf-8") as f:
                wikidata_cache = json.load(f)
            logger.info(f"Loaded cache with {len(wikidata_cache)} entries.")
        except Exception as e:
            logger.error(f"Error loading cache: {e}")
            wikidata_cache = {}
    else:
        wikidata_cache = {}
        logger.info("No cache file found; starting with an empty cache.")

def save_cache():
    try:
        with open(CACHE_FILENAME, "w", encoding="utf-8") as f:
            json.dump(wikidata_cache, f, indent=2, ensure_ascii=False)
        logger.debug(f"Saved cache with {len(wikidata_cache)} entries.")
    except Exception as e:
        logger.error(f"Error saving cache: {e}")

def auto_save_cache():
    """Helper to save the cache immediately."""
    save_cache()

# --- INTERACTIVE FUNCTIONS ---

def interactive_choose_from_results(query, results):
    """
    When multiple results are returned, show them and let the user choose.
    Returns the chosen result dict or None.
    """
    logger.info(f"\nResults for query '{query}':")
    for i, r in enumerate(results):
        label = r.get("label", "N/A")
        desc = r.get("description", "")
        logger.info(f"  [{i}] id: {r.get('id')}  label: {label}  description: {desc}")
    selection = input("Enter the number of the correct result (or press Enter for none): ").strip()
    if selection == "":
        logger.debug("No selection made by the user.")
        return None
    try:
        index = int(selection)
        if 0 <= index < len(results):
            logger.debug(f"User selected result index {index}.")
            return results[index]
        else:
            logger.warning("Invalid selection index; no result will be used.")
    except Exception as e:
        logger.error(f"Error processing input: {e}")
    return None

def prompt_manual_entry(fallback_url):
    """
    Prompt the user once to manually enter a Wikidata entity ID.
    The prompt shows the fallback URL that will be used if nothing is entered.
    Returns the entity info dict if provided, or None if left blank.
    """
    prompt = (f"No Wikidata match was found using any candidate or title search.\n"
              f"Fallback will be: {fallback_url}\n"
              "Enter a Wikidata entity id (e.g., Q12345) manually to override, or press Enter to use the fallback: ")
    manual = input(prompt).strip()
    if manual:
        logger.info(f"User manually entered entity id: {manual}")
        return {"url": f"https://www.wikidata.org/wiki/{manual}", "label": "", "description": ""}
    return None

# --- FUNCTIONS FOR WIKIDATA LOOKUP VIA SPARQL ---

def wikidata_lookup_by_property(prop, value):
    """
    Look up a Wikidata entity by a specific property using SPARQL.
    Returns a list of results, each as a dict with keys 'id', 'url', 'label', and 'description'.
    Results are cached.
    """
    norm_value = value.strip()
    cache_key = f"prop:{prop}|value:{norm_value}"
    if cache_key in wikidata_cache:
        logger.debug(f"Cache hit for key '{cache_key}'.")
        return wikidata_cache[cache_key].copy()
    
    query = f"""
    SELECT ?item ?itemLabel ?itemDescription WHERE {{
      ?item wdt:{prop} "{norm_value}" .
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}
    """
    url = "https://query.wikidata.org/sparql"
    params = {"query": query, "format": "json"}
    logger.debug(f"Performing SPARQL query for {prop} with value '{norm_value}'.")
    try:
        response = requests.get(url, params=params, headers={'User-Agent': 'TraktConverter/1.0 (https://example.org)'})
        response.raise_for_status()
        data = response.json()
        results = []
        for binding in data.get("results", {}).get("bindings", []):
            item_url = binding.get("item", {}).get("value")
            if item_url:
                entity_id = item_url.rsplit("/", 1)[-1]
                label_val = binding.get("itemLabel", {}).get("value", "")
                desc_val = binding.get("itemDescription", {}).get("value", "")
                results.append({
                    "id": entity_id,
                    "url": item_url,
                    "label": label_val,
                    "description": desc_val
                })
        wikidata_cache[cache_key] = results  # Cache even empty responses.
        auto_save_cache()
        logger.debug(f"SPARQL query complete. Found {len(results)} result(s) for {prop}='{norm_value}'.")
        time.sleep(QUERY_DELAY)
        return results.copy()
    except Exception as e:
        logger.error(f"Error in SPARQL query for {prop}='{norm_value}': {e}")
        wikidata_cache[cache_key] = []
        auto_save_cache()
        return []

# --- FUNCTIONS FOR TITLE LOOKUP VIA wbsearchentities ---

def wikidata_search_by_title(title):
    """
    Fallback title search using wbsearchentities.
    Returns a list of results, each as a dict with keys 'id', 'url', 'label', and 'description' (if available).
    """
    norm_title = title.strip()
    if norm_title in wikidata_cache:
        logger.debug(f"Cache hit for title '{norm_title}'.")
        return wikidata_cache[norm_title].copy()
    
    url = "https://www.wikidata.org/w/api.php"
    params = {
        "action": "wbsearchentities",
        "format": "json",
        "language": "en",
        "search": norm_title,
        "type": "item"
    }
    logger.debug(f"Performing title search for '{norm_title}'.")
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        results_raw = response.json().get("search", [])
        results = []
        for item in results_raw:
            entity_id = item.get("id")
            url_val = f"https://www.wikidata.org/wiki/{entity_id}" if entity_id else ""
            results.append({
                "id": entity_id,
                "url": url_val,
                "label": item.get("label", ""),
                "description": item.get("description", "")
            })
        wikidata_cache[norm_title] = results
        auto_save_cache()
        logger.debug(f"Title search complete. Found {len(results)} result(s) for '{norm_title}'.")
        time.sleep(QUERY_DELAY)
        return results.copy()
    except Exception as e:
        logger.error(f"Error performing title search for '{norm_title}': {e}")
        wikidata_cache[norm_title] = []
        auto_save_cache()
        return []

# --- KEY DETERMINATION FUNCTION ---
#
# Now returns a dict with "key" and "meta". If a Wikidata match is found, meta holds the title/description.
# Otherwise meta is set to empty strings.

def get_wikidata_key(trakt_obj, content_type, extra=None):
    """
    Try candidate lookups in this order:
      For movies:
         1. Trakt.tv ID (P8013): "movies/{slug}"
         2. Trakt.tv film ID (P12492): trakt id
         3. IMDb (P345)
         4. TMDB (P4947)
         5. TVDB (P12196)
      For episodes:
         1. Trakt.tv ID (P8013): "shows/{show_slug}/seasons/{season}/episodes/{number}"
         2. IMDb (P345), then TMDB (P4947), then TVDB (P12196)
      For shows:
         1. Trakt.tv ID (P8013): "shows/{slug}"
         2. Then IMDb, TMDB, TVDB.
    Then perform a title search if running interactively.
    In non-interactive mode, the title search is skipped.
    Returns the Wikidata entity info as a dict if found, or None.
    """
    candidates = []
    ids = trakt_obj.get("ids", {})

    if content_type == "movie":
        slug = ids.get("slug")
        if slug:
            candidates.append(("trakt", "P8013", f"movies/{slug}"))
        trakt_id = ids.get("trakt")
        if trakt_id:
            candidates.append(("trakt_film", "P12492", str(trakt_id)))
        imdb = ids.get("imdb")
        if imdb:
            candidates.append(("imdb", "P345", imdb))
        tmdb = ids.get("tmdb")
        if tmdb:
            candidates.append(("tmdb", "P4947", str(tmdb)))
        tvdb = ids.get("tvdb")
        if tvdb:
            candidates.append(("tvdb", "P12196", str(tvdb)))
    elif content_type == "episode":
        show_slug = extra.get("ids", {}).get("slug") if extra else None
        season = trakt_obj.get("season")
        number = trakt_obj.get("number")
        if show_slug and season is not None and number is not None:
            candidates.append(("trakt", "P8013", f"shows/{show_slug}/seasons/{season}/episodes/{number}"))
        imdb = ids.get("imdb")
        if imdb:
            candidates.append(("imdb", "P345", imdb))
        tmdb = ids.get("tmdb")
        if tmdb:
            candidates.append(("tmdb", "P4947", str(tmdb)))
        tvdb = ids.get("tvdb")
        if tvdb:
            candidates.append(("tvdb", "P12196", str(tvdb)))
    elif content_type == "show":
        slug = ids.get("slug")
        if slug:
            candidates.append(("trakt", "P8013", f"shows/{slug}"))
        imdb = ids.get("imdb")
        if imdb:
            candidates.append(("imdb", "P345", imdb))
        tmdb = ids.get("tmdb")
        if tmdb:
            candidates.append(("tmdb", "P4947", str(tmdb)))
        tvdb = ids.get("tvdb")
        if tvdb:
            candidates.append(("tvdb", "P12196", str(tvdb)))
    
    # Try each candidate.
    for label, prop, value in candidates:
        logger.info(f"Searching Wikidata using {label.upper()} (property {prop}) with value '{value}'.")
        results = wikidata_lookup_by_property(prop, value)
        if results:
            if len(results) == 1:
                candidate = results[0]
                logger.info(f"Found unique candidate match: {candidate['url']} for {label.upper()}='{value}'.")
                return candidate
            elif len(results) > 1:
                if INTERACTIVE_MODE:
                    logger.info(f"\nCandidate {label.upper()} lookup for value '{value}' returned {len(results)} results.")
                    chosen = interactive_choose_from_results(f"{prop} {value}", results)
                    if chosen:
                        logger.info(f"User selected candidate: {chosen['url']} for {label.upper()}='{value}'.")
                        return chosen
                    else:
                        logger.info(f"No candidate confirmed for {label.upper()}='{value}'.")
                else:
                    candidate = results[0]
                    logger.info(f"Found candidate match (non-interactive): {candidate['url']} for {label.upper()}='{value}'.")
                    return candidate
    # Fallback: Title search.
    title = trakt_obj.get("title")
    if title:
        if INTERACTIVE_MODE:
            logger.info(f"Falling back to title search for '{title}'.")
            results = wikidata_search_by_title(title)
            if results:
                logger.info(f"\nTitle search for '{title}' returned {len(results)} results.")
                chosen = interactive_choose_from_results(f"Title search: {title}", results)
                if chosen:
                    wikidata_result = {
                        "url": f"https://www.wikidata.org/wiki/{chosen.get('id')}",
                        "label": chosen.get("label", ""),
                        "description": chosen.get("description", "")
                    }
                    logger.info(f"User confirmed title search result: {wikidata_result['url']} for '{title}'.")
                    return wikidata_result
                else:
                    logger.info(f"No title search result confirmed for '{title}'.")
            else:
                logger.info(f"No Wikidata match found from title search for '{title}'.")
        else:
            logger.info(f"Non-interactive mode: Skipping title search for '{title}'.")
    return None

def determine_key(trakt_record):
    """
    Given a Trakt record, determine its unique key and meta information.
    Logs a summary (record type, title, and IDs), then attempts to obtain a Wikidata match.
    If no match is found, computes the fallback Trakt.tv URL.
    In interactive mode, prompts the user to override the fallback.
    Returns a dict with "key" and "meta" (where meta has "title" and "description").
    """
    record_type = trakt_record.get("type")
    if record_type == "movie":
        movie = trakt_record.get("movie", {})
        summary = f"Movie: '{movie.get('title')}' | IDs: {movie.get('ids')}"
    elif record_type == "episode":
        episode = trakt_record.get("episode", {})
        show = trakt_record.get("show", {})
        summary = (f"Episode: '{episode.get('title', '(no title)')}' from show '{show.get('title')}' | "
                   f"Season {episode.get('season')}, Episode {episode.get('number')} | IDs: {episode.get('ids')}")
    elif record_type == "show":
        show = trakt_record.get("show", {})
        summary = f"Show: '{show.get('title')}' | IDs: {show.get('ids')}"
    else:
        summary = "Unknown record type."
    
    logger.info("=" * 30)
    logger.info(f"Processing record: {summary}")
    
    wikidata_result = None
    if record_type == "movie":
        movie = trakt_record.get("movie")
        if movie:
            wikidata_result = get_wikidata_key(movie, "movie")
            if wikidata_result is None:
                slug = movie.get("ids", {}).get("slug")
                fallback = f"{TRAKT_MOVIE_BASE}/{slug}" if slug else f"trakt://{trakt_record.get('id','unknown')}"
            else:
                fallback = wikidata_result["url"]
    elif record_type == "episode":
        episode = trakt_record.get("episode")
        show = trakt_record.get("show")
        if episode and show:
            wikidata_result = get_wikidata_key(episode, "episode", extra=show)
            if wikidata_result is None:
                slug = show.get("ids", {}).get("slug")
                season = episode.get("season")
                number = episode.get("number")
                fallback = (f"{TRAKT_EPISODE_BASE}/{slug}/seasons/{season}/episodes/{number}"
                            if slug and season is not None and number is not None
                            else f"trakt://{trakt_record.get('id','unknown')}")
            else:
                fallback = wikidata_result["url"]
    elif record_type == "show":
        show = trakt_record.get("show")
        if show:
            wikidata_result = get_wikidata_key(show, "show")
            if wikidata_result is None:
                slug = show.get("ids", {}).get("slug")
                fallback = f"{TRAKT_EPISODE_BASE}/{slug}" if slug else f"trakt://{trakt_record.get('id','unknown')}"
            else:
                fallback = wikidata_result["url"]
    else:
        fallback = f"trakt://{trakt_record.get('id','unknown')}"
    
    if wikidata_result:
        key = wikidata_result["url"]
        meta = {
            "title": wikidata_result.get("label", ""),
            "description": wikidata_result.get("description", "")
        }
    else:
        if INTERACTIVE_MODE:
            manual = prompt_manual_entry(fallback)
            if manual:
                key = manual["url"] if isinstance(manual, dict) else manual
                meta = {"title": manual.get("label", ""), "description": manual.get("description", "")} if isinstance(manual, dict) else {"title": "", "description": ""}
            else:
                key = fallback
                meta = {"title": "", "description": ""}
        else:
            key = fallback
            meta = {"title": "", "description": ""}
    
    logger.info(f"Resolved to record key: {key}")
    return {"key": key, "meta": meta}

# --- PROCESSING FUNCTIONS ---

def flush_output_data(output_file, output_data):
    """
    Write the current output_data to the output_file.
    This version flushes and fsyncs to force the OS to write the data to disk immediately.
    """
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        logger.debug(f"Flushed output to {output_file}.")
    except Exception as e:
        logger.error(f"Error flushing output file: {e}")

def process_history_file(filepath, output_data, output_file, export_dir):
    logger.info(f"Processing history file: {filepath}")
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            records = json.load(f)
        logger.debug(f"Found {len(records)} history records in file.")
    except Exception as e:
        logger.error(f"Error reading file {filepath}: {e}")
        return

    # Compute relative path from the parent of the parent of export_dir.
    base_dir = os.path.dirname(os.path.dirname(os.path.normpath(export_dir)))
    rel_path = os.path.relpath(filepath, start=base_dir)
    # Replace backslashes with forward slashes.
    rel_path = rel_path.replace(os.sep, '/')
    for rec in records:
        res = determine_key(rec)
        key = res["key"]
        meta = res["meta"]
        # Create record with new format if it doesn't exist.
        if key not in output_data:
            output_data[key] = {
                "meta": meta,
                "notes": "",
                "consumptions": [],
                "queue-votes": {}
            }
        # Create consumption with updated note.
        consumption = {
            "when": rec.get("watched_at"),
            "note": f"imported from {rel_path}:{rec.get('id')}",
            "rating": rec.get("rating", None)
        }
        output_data[key]["consumptions"].append(consumption)
        logger.debug(f"Added history record under key: {key}")
        flush_output_data(output_file, output_data)
        if INTERACTIVE_MODE:
            input("History record processed. Press ENTER to continue...")

def process_watchlist_file(filepath, output_data, output_file):
    logger.info(f"Processing watchlist file: {filepath}")
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            records = json.load(f)
        logger.debug(f"Found {len(records)} watchlist records in file.")
    except Exception as e:
        logger.error(f"Error reading file {filepath}: {e}")
        return

    for rec in records:
        logger.info("=" * 30)
        res = determine_key(rec)
        key = res["key"]
        meta = res["meta"]
        # Create record with new format if it doesn't exist.
        if key not in output_data:
            output_data[key] = {
                "meta": meta,
                "notes": "",
                "consumptions": [],
                "queue-votes": {}
            }
        vote = {
            "when": rec.get("listed_at"),
            "note": json.dumps(rec, ensure_ascii=False)
        }
        if WATCHLIST_QUEUE not in output_data[key]["queue-votes"]:
            output_data[key]["queue-votes"][WATCHLIST_QUEUE] = []
        output_data[key]["queue-votes"][WATCHLIST_QUEUE].append(vote)
        logger.debug(f"Added watchlist record under key: {key}")
        flush_output_data(output_file, output_data)
        if INTERACTIVE_MODE:
            input(f"Watchlist record for key: {key} processed. Press ENTER to continue...")

def process_trakt_export(export_dir, output_file):
    output_data = {}
    history_pattern = os.path.join(export_dir, "watched", "history-*.json")
    history_files = glob.glob(history_pattern)
    logger.info(f"Found {len(history_files)} history file(s) in '{export_dir}/watched'.")
    for filepath in history_files:
        process_history_file(filepath, output_data, output_file, export_dir)
    watchlist_pattern = os.path.join(export_dir, "lists", "watchlist-*.json")
    watchlist_files = glob.glob(watchlist_pattern)
    logger.info(f"Found {len(watchlist_files)} watchlist file(s) in '{export_dir}/lists'.")
    for filepath in watchlist_files:
        process_watchlist_file(filepath, output_data, output_file)
    return output_data

# --- MAIN SCRIPT ---

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Convert a Trakt.tv export into custom JSON for your content tracker."
    )
    parser.add_argument("export_dir", help="Path to the Trakt export directory")
    parser.add_argument("output_file", help="Path for the output JSON file")
    parser.add_argument("--non-interactive", action="store_true",
                        help="Run in non-interactive mode (no pauses or prompts)")
    args = parser.parse_args()

    if args.non_interactive:
        INTERACTIVE_MODE = False
        logger.info("Running in non-interactive mode.")

    load_cache()
    logger.info("Starting conversion...")
    data = process_trakt_export(args.export_dir, args.output_file)
    
    try:
        with open(args.output_file, "w", encoding="utf-8") as out_f:
            json.dump(data, out_f, indent=2, ensure_ascii=False)
        logger.info(f"Conversion complete. Output written to {args.output_file}")
    except Exception as e:
        logger.error(f"Error writing output file: {e}")

    save_cache()
