"""One batch of ad videos to the FLOA media store: the videos videos.json names for these ads, and videos.json itself.
It replaces the old git / stage.py / promote.py run: everything goes through tools/publish.py (scripts/media-upload.mjs).
usage: python tools/motion/publish_chunk.py [--publish] [--list] [numbers, e.g. 51-60]   (default: every ad in videos.json)
Without --publish it prints the plan only. --list also reads what the store already holds (no upload).
--publish uploads, only on the owner's word; the script skips what is already live with the same bytes."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P, publish

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass
send = publish.take_flag("--publish"); listing = publish.take_flag("--list")
videos = P.read_json("videos.json", {})
todo = publish.nums(sys.argv[1:]) or sorted(int(k) for k in videos)
missing = [n for n in todo if str(n) not in videos]
if missing: sys.exit(f"no video in videos.json for ads {missing}")
sys.exit(publish.run([publish.ad_video(n) for n in todo] + [publish.data("videos.json")], publish=send, listing=listing,
                     label=f"publish_chunk {' '.join(sys.argv[1:])}".strip()))
