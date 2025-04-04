#!/usr/bin/env python3
import os
import urllib.request
from urllib.parse import urlparse
from pathlib import Path
from parse import parse
from pathvalidate import sanitize_filename
import fnmatch

# 🎯 List of templates with {version}
dependencies = [
    "https://unpkg.com/isomorphic-git@{version}/index.umd.min.js",
    "https://unpkg.com/@isomorphic-git/lightning-fs@{version}/dist/lightning-fs.min.js",
    "https://unpkg.com/isomorphic-git@{version}/http/web/index.umd.js"
]

# 📁 Directories
script_dir = os.path.dirname(os.path.abspath(__file__))
site_dir = os.path.join(script_dir, "site")
external_dir = os.path.join(site_dir, "external")
os.makedirs(external_dir, exist_ok=True)


def resolve_redirect(url):
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req) as res:
        return res.geturl()


def sanitize_template(template_with_version):
    """Sanitize full URL (with version substituted) into filename"""
    return sanitize_filename(urlparse(template_with_version).path.lstrip("/"), replacement_text="_")


def make_glob_pattern(template):
    """Turn template with {version} into a glob for matching files"""
    return sanitize_template(template).replace("{version}", "*")


def update_references(old_name, new_name):
    for path in Path(site_dir).rglob("*"):
        if not path.is_file():
            continue
        content = path.read_text(encoding="utf-8")
        if old_name in content:
            print(f"↻ Updating reference in {path}")
            path.write_text(content.replace(old_name, new_name), encoding="utf-8")


def main():
    for template in dependencies:
        latest_url = template.format(version="latest")
        resolved_url = resolve_redirect(latest_url)

        # Generate sanitized filename from resolved version URL
        resolved_filename = sanitize_template(resolved_url)
        resolved_path = os.path.join(external_dir, resolved_filename)

        if os.path.exists(resolved_path):
            print(f"✓ {resolved_filename} already exists.")
            continue

        # Remove old versions and update references
        pattern = make_glob_pattern(template)
        for file in os.listdir(external_dir):
            if fnmatch.fnmatch(file, pattern) and file != resolved_filename:
                print(f"✘ Removing old: {file}")
                os.remove(os.path.join(external_dir, file))
                update_references(file, resolved_filename)

        # Download new file
        print(f"⬇ Downloading {resolved_url} → {resolved_filename}")
        urllib.request.urlretrieve(resolved_url, resolved_path)

    print("\n✔ All dependencies checked and updated.")


if __name__ == "__main__":
    main()
