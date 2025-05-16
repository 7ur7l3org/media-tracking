import sys
import time
import shutil
import zipfile
import os
from datetime import datetime

def watch_and_extract(inbox_dir, target_dir, processed_dir_name="processed", poll_interval=2):
    inbox_dir = os.path.abspath(inbox_dir)
    target_dir = os.path.abspath(target_dir)
    processed_dir = os.path.join(inbox_dir, processed_dir_name)

    os.makedirs(processed_dir, exist_ok=True)

    print(f"Watching {inbox_dir} for new zip files...")

    seen = set()

    while True:
        zip_files = [f for f in os.listdir(inbox_dir) if f.endswith(".zip")]
        for zip_file in zip_files:
            full_path = os.path.join(inbox_dir, zip_file)
            if full_path in seen:
                continue
            seen.add(full_path)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            base_name, ext = os.path.splitext(zip_file)
            new_name = f"{base_name}-{timestamp}{ext}"
            processed_path = os.path.join(processed_dir, new_name)

            try:
                print(f"[{datetime.now()}] Found new zip: {zip_file}")
                with zipfile.ZipFile(full_path, 'r') as zip_ref:
                    zip_ref.extractall(target_dir)
                print(f"[{datetime.now()}] Extracted to {target_dir}")

                shutil.move(full_path, processed_path)
                print(f"[{datetime.now()}] Moved to {processed_path}")
            except Exception as e:
                print(f"[{datetime.now()}] Error handling {zip_file}: {e}")

        time.sleep(poll_interval)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python update-site-from-gpt-inbox.py <inbox_dir> <target_dir>")
        sys.exit(1)

    inbox_dir = sys.argv[1]
    target_dir = sys.argv[2]
    watch_and_extract(inbox_dir, target_dir)
