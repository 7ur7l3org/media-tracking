#!/usr/bin/env python3
"""
update-site-dependencies.py

Download / update JS dependencies in ./site/external and their corresponding
TypeScript declaration files (.d.ts).  
Handles both normal and **scoped** npm packages (e.g. “@scope/pkg@x.y.z”).
"""

import os
import re
import fnmatch
import urllib.request
from urllib.parse import urlparse
from pathlib import Path
from pathvalidate import sanitize_filename

# 🎯 Templates (use `{version}` for the “latest” resolver)
dependencies = [
    "https://unpkg.com/isomorphic-git@{version}/index.umd.min.js",
    "https://unpkg.com/@isomorphic-git/lightning-fs@{version}/dist/lightning-fs.min.js",
    "https://unpkg.com/isomorphic-git@{version}/http/web/index.umd.js",
]

# 📁 Directories
script_dir   = os.path.dirname(os.path.abspath(__file__))
site_dir     = os.path.join(script_dir, "site")
external_dir = os.path.join(site_dir, "external")
types_dir    = os.path.join(external_dir, "api-types")
os.makedirs(external_dir, exist_ok=True)
os.makedirs(types_dir, exist_ok=True)


# ───────────────────────── helpers ──────────────────────────
def resolve_redirect(url: str) -> str:
    """Return the final URL after following any HTTP 30x redirects (HEAD request)."""
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req) as res:
        return res.geturl()


def sanitize_template(template_with_version: str) -> str:
    """Convert an unpkg URL to a filesystem‑safe filename."""
    return sanitize_filename(urlparse(template_with_version).path.lstrip("/"),
                             replacement_text="_")


def make_glob_pattern(template: str) -> str:
    """Translate a template into a glob pattern that matches any version."""
    return sanitize_template(template).replace("{version}", "*")


def update_references(old_name: str, new_name: str) -> None:
    """Scan all files under `site/` and replace references to an old file name."""
    for path in Path(site_dir).rglob("*"):
        if not path.is_file():
            continue
        content = path.read_text(encoding="utf-8")
        if old_name in content:
            print(f"↻ Updating reference in {path.relative_to(script_dir)}")
            path.write_text(content.replace(old_name, new_name), encoding="utf-8")


# ── NEW: robust split for scoped / unscoped packages ───────────────────────────
_pkg_re_normal = re.compile(r"^(?P<pkg>@?[^/@]+(?:/[^/@]+)?@[^/]+)/(.*)$")

def split_pkg_and_rel(path: str):
    """
    Given the pathname part of an unpkg URL, return (<pkg@ver>, <remainder>).

    Handles both:
      * /isomorphic-git@1.30.1/index.umd.min.js
      * /@isomorphic-git/lightning-fs@4.6.1/dist/lightning-fs.min.js
    """
    m = _pkg_re_normal.match(path.lstrip("/"))
    if not m:
        raise ValueError(f"Unrecognised unpkg path: {path}")
    return m.group(1), m.group(2)


def fetch_adjacent_types(js_path: str, js_name: str) -> None:
    """
    Try to download the .d.ts that sits next to the JS file (…/file.d.ts).  
    If that fails, fall back to the package root’s index.d.ts.
    """
    pkg_ver, rel = split_pkg_and_rel(js_path)

    rel_stripped = rel.replace(".umd", "").replace(".min", "")
    base = os.path.splitext(rel_stripped)[0]                   # dist/lightning-fs

    # 1️⃣ Adjacent attempt
    adjacent_url = f"https://unpkg.com/{pkg_ver}/{base}.d.ts"
    type_dest    = os.path.join(types_dir,
                                f"{os.path.splitext(js_name)[0]}.d.ts")

    print(f"   Attempting adjacent types: {adjacent_url}")
    try:
        urllib.request.urlretrieve(adjacent_url, type_dest)
        print(f"⬇ Downloaded adjacent types → {os.path.basename(type_dest)}")
        return
    except Exception:
        print("   Adjacent fetch failed, falling back to root index.d.ts")

    # 2️⃣ Package‑root fallback
    root_url = f"https://unpkg.com/{pkg_ver}/index.d.ts"
    print(f"   Attempting fallback types: {root_url}")
    try:
        urllib.request.urlretrieve(root_url, type_dest)
        print(f"⬇ Downloaded root types → {os.path.basename(type_dest)}")
    except Exception:
        print(f"⚠️  No types found at {root_url}")


# ─────────────────────────── main ────────────────────────────
def main() -> None:
    for template in dependencies:
        latest_url     = template.format(version="latest")
        resolved_url   = resolve_redirect(latest_url)       # real URL (with version)
        resolved_fname = sanitize_template(resolved_url)    # safe filename
        resolved_path  = os.path.join(external_dir, resolved_fname)

        # Already have latest JS? just (re‑)fetch types.
        if os.path.exists(resolved_path):
            print(f"✓ {resolved_fname} already exists.")
            fetch_adjacent_types(urlparse(resolved_url).path, resolved_fname)
            continue

        # Remove any older versions of the same file
        pattern = make_glob_pattern(template)
        for file in os.listdir(external_dir):
            if fnmatch.fnmatch(file, pattern) and file != resolved_fname:
                print(f"✘ Removing old: {file}")
                os.remove(os.path.join(external_dir, file))
                update_references(file, resolved_fname)

        # Download JS
        print(f"⬇ Downloading {resolved_url} → {resolved_fname}")
        urllib.request.urlretrieve(resolved_url, resolved_path)

        # Download corresponding .d.ts
        fetch_adjacent_types(urlparse(resolved_url).path, resolved_fname)

    print("\n✔ All dependencies and types are up to date.")


if __name__ == "__main__":
    main()
