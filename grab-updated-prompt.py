#!/usr/bin/env python3

# thanks https://chatgpt.com/c/679dc23f-b420-800c-b3e8-0e7fbe293c74

import os
import sys
import pyperclip

def gather_files(root_dir):
    """
    Collects files from the root directory and then from subdirectories.
    Returns a list of tuples: (relative_filepath, full_filepath)
    """
    collected = []

    # First, add files that are directly in the root.
    for entry in sorted(os.listdir(root_dir)):
        full_path = os.path.join(root_dir, entry)
        if os.path.isfile(full_path):
            collected.append((entry, full_path))

    # Then, process subdirectories.
    for entry in sorted(os.listdir(root_dir)):
        full_path = os.path.join(root_dir, entry)
        if os.path.isdir(full_path):
            for subdir, dirs, files in os.walk(full_path):
                # Sort files for consistent ordering.
                for file in sorted(files):
                    # Create a relative file path from the root.
                    rel_dir = os.path.relpath(subdir, root_dir)
                    rel_file = os.path.join(rel_dir, file)
                    collected.append((rel_file, os.path.join(subdir, file)))
    return collected

def main():
    if len(sys.argv) < 2:
        print("Usage: python grab-updated-prompt.py <directory>")
        sys.exit(1)
    
    root_dir = sys.argv[1]
    if not os.path.isdir(root_dir):
        print(f"Error: {root_dir} is not a valid directory.")
        sys.exit(1)

    # Header text to be placed before the file listings.
    header = (
        "hello! i am working on a project that is coming along nicely that will end up being a media/content "
        "history/list tracker. currently it interfaces with wikidata to get information about media. the wikidata "
        "qid's will be the authoritative keys used for tracking things as much as possible. let me just paste the code "
        "for now and i'll ask you to help me iterate on it next after you are familiar with the code. in general i'd "
        "like you to always give me the complete code of any files you need to edit:"
    )

    # Start building the final prompt.
    prompt_text = header + "\n\n"

    # Gather all file data.
    files = gather_files(root_dir)
    for rel_path, full_path in files:
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                contents = f.read()
        except Exception as e:
            contents = f"<Error reading file: {e}>"
        # Append the file name and its content formatted with markdown-style code blocks.
        prompt_text += f"{rel_path}\n```\n{contents}\n```\n\n"

    # Copy the final prompt text to the clipboard.
    pyperclip.copy(prompt_text)
    print("Updated prompt copied to clipboard.")

if __name__ == '__main__':
    main()
