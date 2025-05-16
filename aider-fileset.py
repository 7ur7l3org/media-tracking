#!/usr/bin/env python3
import subprocess
import argparse
from pathlib import Path
import sys

try:
    from pathspec import PathSpec
    from pathspec.patterns import GitWildMatchPattern
except ImportError:
    print("Install pathspec with: pip install pathspec")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Run aider on files matching a fileset")
    parser.add_argument(
        "fileset",
        nargs="?",
        help="(optional) A .gitignore-style list of patterns to include"
    )
    parser.add_argument(
        "aider_args",
        nargs=argparse.REMAINDER,
        help="Arguments passed through to aider"
    )

    args = parser.parse_args()
    repo_root = Path(".").resolve()

    if args.fileset:
        # Load the ignore/include patterns from the fileset
        try:
            with open(args.fileset, "r", encoding="utf-8") as f:
                spec = PathSpec.from_lines(GitWildMatchPattern, f)
        except FileNotFoundError:
            print(f"Fileset not found: {args.fileset}")
            sys.exit(1)

        # Find all files matching the patterns
        all_files = [f for f in repo_root.rglob("*") if f.is_file()]
        matched = [
            f.relative_to(repo_root)
            for f in all_files
            if spec.match_file(f.relative_to(repo_root).as_posix())
        ]

        if not matched:
            print("No files matched fileset.")
            sys.exit(1)

        cmd = ["aider"] + [str(f) for f in sorted(matched)] + args.aider_args
    else:
        # No fileset provided → just pass args straight through to aider
        cmd = ["aider"] + args.aider_args

    print(">>>", " ".join(cmd))
    subprocess.run(cmd)

if __name__ == "__main__":
    main()
