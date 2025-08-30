#!/usr/bin/env python3
import sys, subprocess
from pathlib import Path

try:
    from pathspec import PathSpec
    from pathspec.patterns import GitWildMatchPattern
except ImportError:
    sys.exit("▶️  Install pathspec: pip install pathspec")

raw = sys.argv[1:]
if "--" in raw:
    i = raw.index("--")
    before, forward = raw[:i], raw[i+1:]
else:
    before, forward = raw, []

# if first arg is a real file → treat as fileset
if before and not before[0].startswith("-") and Path(before[0]).is_file():
    fs = before[0]
    lines = [L for L in Path(fs).read_text().splitlines() if L.strip()]
    spec = PathSpec.from_lines(GitWildMatchPattern, lines)
    cwd = Path.cwd()
    matched = [
        str(f.relative_to(cwd))
        for f in sorted(cwd.rglob("*"))
        if f.is_file() and spec.match_file(f.relative_to(cwd).as_posix())
    ]
    if not matched:
        sys.exit("⚠️  No files matched fileset.")
else:
    matched = []
# build the final command
cmd = ["aider", *matched, *forward]

# **flush** so the apply-script’s pipe sees this immediately
print(">>>", " ".join(cmd), flush=True)

# hand off
sys.exit(subprocess.run(cmd).returncode)
