#!/usr/bin/env python
"""
aider_copy_context.py

Runs only the architect stage in copy-paste mode, copies the prompt into the clipboard, and exits.
Usage:
    aider_copy_context.py [<aider-args>…]
Example:
    aider_copy_context.py site\*.html --message "/copy-context"
"""

import subprocess
import sys
import os

def main():
    # locate this script's directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    aider_path = os.path.join(script_dir, "aider-fileset.py")

    # use the same Python interpreter that launched this script
    cmd = [
        sys.executable,
        aider_path,
        *sys.argv[1:],
        "--",
        "--message", "/copy-context",
        "--exit",
    ]

    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Aider exited with error code {e.returncode}", file=sys.stderr)
        sys.exit(e.returncode)

if __name__ == "__main__":
    main()
