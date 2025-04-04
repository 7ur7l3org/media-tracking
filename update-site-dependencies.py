#!/usr/bin/env python3
import os
import urllib.request

# Define dependencies with explicit filenames representing their version and path.
dependencies = [
    {
        "url": "https://unpkg.com/@isomorphic-git/lightning-fs@4.6.0/dist/lightning-fs.min.js",
        "filename": "lightning-fs-4.6.0.min.js"
    },
    {
        "url": "https://unpkg.com/isomorphic-git@1.29.0/index.umd.min.js",
        "filename": "isomorphic-git-1.29.0-index.umd.min.js"
    },
    {
        "url": "https://unpkg.com/isomorphic-git@1.29.0/http/web/index.umd.js",
        "filename": "isomorphic-git-1.29.0-http-web-index.umd.js"
    }
]

# Determine the directory of this script.
script_dir = os.path.dirname(os.path.abspath(__file__))
output_dir = os.path.join(script_dir, "site", "external")

# Create the output directory if it doesn't exist.
os.makedirs(output_dir, exist_ok=True)

def download_file(url, dest_path):
    print(f"Downloading {url}...")
    try:
        urllib.request.urlretrieve(url, dest_path)
        print(f"Saved to {dest_path}\n")
    except Exception as e:
        print(f"Failed to download {url}: {e}")

def main():
    for dep in dependencies:
        dest_path = os.path.join(output_dir, dep["filename"])
        download_file(dep["url"], dest_path)
    print("All dependencies have been updated.")

if __name__ == "__main__":
    main()
