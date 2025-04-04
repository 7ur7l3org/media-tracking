#!/usr/bin/env python3

import subprocess
import sys
import shutil
import re
from pathlib import Path
from os.path import splitext

SCRIPT_DIR = Path(__file__).parent.resolve()
SITE_DIR = SCRIPT_DIR / "site"

# Hardcoded list of files to roll
ASSET_GLOBS = [
    "site/js/*.js",
    "site/styles.css",
]

def run(cmd):
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"❌ Command failed: {' '.join(cmd)}")
        print(result.stderr.strip())
        sys.exit(1)
    return result.stdout.strip()

def get_sha():
    return run(["git", "rev-parse", "--short", "HEAD"])

def check_branch():
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    if branch != "mattress":
        print(f"❌ Must be on 'mattress' branch, currently on '{branch}'")
        sys.exit(1)

def collect_files():
    files = []
    for pattern in ASSET_GLOBS:
        files.extend(SCRIPT_DIR.glob(pattern))
    return files

def roll_filenames(files, sha):
    rolled = []
    for path in files:
        if not path.is_file():
            continue

        base = path.stem
        ext = path.suffix
        new_name = f"{base}.{sha}{ext}"
        new_path = path.with_name(new_name)

        print(f"🔄 {path.relative_to(SCRIPT_DIR)} → {new_path.name}")
        shutil.move(str(path), str(new_path))
        rolled.append(new_path)

    return rolled

def update_refs(rolled_files, sha):
    print(f"[+] Rewriting references in {SITE_DIR}/*")

    for html_file in SITE_DIR.glob("*"):
        if not html_file.is_file():
            continue

        with html_file.open("r", encoding="utf-8") as f:
            content = f.read()

        original = content

        for path in rolled_files:
            rel = path.relative_to(SITE_DIR).as_posix()  # e.g. "js/git-sync.abc1234.js"
            stem, ext = splitext(rel)
            # Match quoted string like "js/git-sync.*.js"
            pattern = re.compile(rf'"{re.escape(stem)}.*?{re.escape(ext)}"')
            replacement = f'"{stem}.{sha}{ext}"'
            content = pattern.sub(replacement, content)

        if content != original:
            print(f"📝 Patched {html_file.name}")
            with html_file.open("w", encoding="utf-8") as f:
                f.write(content)

def commit_and_merge():
    print("[+] Committing and merging into 'mistress'")
    run(["git", "add", "."])
    run(["git", "commit", "-m", "Deploy: roll asset filenames to SHA"])
    run(["git", "checkout", "mistress"])
    run(["git", "merge", "--no-ff", "mattress"])
    run(["git", "push"])
    run(["git", "checkout", "mattress"])
    run(["git", "push"])

def main():
    check_branch()
    sha = get_sha()
    print(f"[+] Rolling to SHA: {sha}")

    files_to_roll = collect_files()
    rolled_files = roll_filenames(files_to_roll, sha)
    update_refs(rolled_files, sha)
    commit_and_merge()

    print("✅ Deploy complete. You are back on 'mattress'.")

if __name__ == "__main__":
    main()
