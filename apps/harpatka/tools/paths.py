"""Where the harpatka ad tools read and write, in the FLOA layout. Every tool imports this; no tool names a folder of its own.

  TOOLS        apps/harpatka/tools                     the tools (ads/, motion/), and their inputs ads/sentences*.txt
  DATA         apps/harpatka/public/ads/_data          the ads' data, local source of truth: ads.json, videos.json,
                                                       registry.json, featured.json, video-cuts.json (published to ads/_data/ in the store)
  MEDIA_OUT    env HARPATKA_MEDIA_OUT                  generated images and videos (img/, video/, social/), never in the repo:
               default C:\\Users\\ofira\\Desktop\\harpatka\\ads   they go to the store through publish.py
  MOTION       env HARPATKA_MOTION_ROOT                the motion projects (ad-NN/, covers/, review/, music maps)
               default C:\\Users\\ofira\\Desktop\\harpatka\\motion
  UPLOAD       <floa>/scripts/media-upload.mjs         the shared upload script (worker/MEDIA.md)
  MEDIA_MANIFEST env HARPATKA_MEDIA_MANIFEST           the owner's staging manifest, source of the copyright text per key
               default C:\\Users\\ofira\\Desktop\\harpatka-media-staging\\manifest.json
  MOTION_PYTHON  env MOTION_PYTHON                     the motion-studio python (~/.motion-studio/venv)"""
import json, os
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
APP = TOOLS.parent
FLOA = APP.parents[1]
PUBLIC = APP / "public"
DATA = PUBLIC / "ads" / "_data"
SENTENCES = TOOLS / "ads"
AGE_JS = PUBLIC / "shared" / "age.js"
IMAGES = PUBLIC / "images"

MEDIA_OUT = Path(os.environ.get("HARPATKA_MEDIA_OUT") or r"C:\Users\ofira\Desktop\harpatka\ads")
IMG, VIDEO, SOCIAL = MEDIA_OUT / "img", MEDIA_OUT / "video", MEDIA_OUT / "social"

MOTION = Path(os.environ.get("HARPATKA_MOTION_ROOT") or r"C:\Users\ofira\Desktop\harpatka\motion")
MOTION_TOOLS = TOOLS / "motion"

UPLOAD = FLOA / "scripts" / "media-upload.mjs"
# the owner's staging manifest of the first bulk upload: the exact copyright text per file (e.g. "מוזיקה: David Bowie - Changes")
MEDIA_MANIFEST = Path(os.environ.get("HARPATKA_MEDIA_MANIFEST") or r"C:\Users\ofira\Desktop\harpatka-media-staging\manifest.json")
MOTION_PYTHON = os.environ.get("MOTION_PYTHON") or str(Path.home() / ".motion-studio" / "venv" / "Scripts" / "python.exe")
BUSINESS = "harpatka"
DATA_FILES = ("ads.json", "videos.json", "registry.json", "featured.json", "video-cuts.json")


def read_json(name, default=None):
    """a file in DATA by name"""
    p = DATA / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def write_json(name, obj, newline=False):
    """write a file in DATA in the format the tools always used (indent 1, Hebrew as is); returns True when the bytes changed"""
    p = DATA / name
    text = json.dumps(obj, ensure_ascii=False, indent=1) + ("\n" if newline else "")
    old = p.read_bytes() if p.exists() else None
    eol = b"\r\n" if old is None and os.linesep == "\r\n" or old and b"\r\n" in old else b"\n"   # keep the file's own line ends
    raw = text.encode("utf-8").replace(b"\n", eol)
    if old == raw: return False
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(raw)
    return True
