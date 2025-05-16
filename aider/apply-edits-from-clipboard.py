#!/usr/bin/env python3
"""
aider_apply_changes.py

1) Saves current clipboard contents (your LLM edits).
2) Launches the fileset‐wrapper (per your .aider.conf.yml) in CP mode,
   streaming its output.
3) As soon as it prints "Monitoring clipboard for changes", waits 0.1s and
   then restores your saved edits into the clipboard to trigger apply.
Usage:
    python aide­r_apply_changes.py [<files/globs or other flags>]
"""
import subprocess
import sys
import time
import os

import pyperclip  # pip install pyperclip

def main():
    # 1) Buffer whatever's in your clipboard (the LLM "edits")
    edits = pyperclip.paste()

    # 2) Locate the helper next to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    helper = os.path.join(script_dir, "aider-fileset.py")

    # 3) Build the command using the same Python interpreter
    cmd = [
        sys.executable,
        helper,
        *sys.argv[1:],      # your file globs or other flags
        "--",
        "--message", " ",    # dummy message to start CP mode
        "--exit",
    ]

    # Launch and capture stdout/stderr
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    # 4) Stream output and watch for the CP watcher to start
    marker = "Monitoring clipboard for changes"
    injected = False

    for line in proc.stdout:
        print(line, end="", flush=True)
        if not injected and marker in line:
            time.sleep(0.1)
            pyperclip.copy(edits)
            injected = True

    proc.wait()
    sys.exit(proc.returncode)

if __name__ == "__main__":
    main()
