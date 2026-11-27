"""The one way the harpatka ad tools publish: a small manifest of the files that changed, handed to FLOA's shared
upload script (scripts/media-upload.mjs, worker/MEDIA.md). No other tool uploads, calls git, stage.py or promote.py.

By default it only prints the plan (media-upload.mjs's dry run: nothing is written and nothing is sent).
It uploads only with --publish, and --publish is given only on the owner's word.

Keys are relative to the business: ads/img/<file>, ads/video/<file>, ads/_data/<name>.json.
Media files come from paths.MEDIA_OUT (img/, video/), data files from paths.DATA.

Used by the tools:   import publish; publish.run([publish.media("ads/img/x.png", path, title=...), publish.data("ads.json")], publish=flag)
On its own:
  python tools/publish.py [--publish] data [ads.json videos.json ...]   data files (default: all five in _data)
  python tools/publish.py [--publish] ad 7 12 51-60                       message ads: image, video, ads.json, videos.json
  python tools/publish.py [--publish] video 51-60                         message ads: only the video and videos.json
  python tools/publish.py [--publish] featured <base> [--copyright "<text>"]   a featured card: its image and video, and featured.json
  python tools/publish.py [--publish] file <key>=<path> ... [--copyright "<text>"]   anything else (e.g. raw/clip.mov=D:\\x\\clip.mov)
Copyright: the exact text per key comes from the owner's staging manifest (paths.MEDIA_MANIFEST, env HARPATKA_MEDIA_MANIFEST),
e.g. "מוזיקה: David Bowie - Changes"; a card's image and video share one text. A NEW card with cr: true that the manifest does not
know needs --copyright "<text>" and is refused without it. There is no generic default.
Options: --manifest-out=<file> (where the manifest is written; default: the temp folder), --list (dry run that also reads the store)."""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

import paths as P

MIME = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif", "avif": "image/avif",
        "mp4": "video/mp4", "m4v": "video/mp4", "mov": "video/quicktime", "webm": "video/webm",
        "mp3": "audio/mpeg", "m4a": "audio/mp4", "ogg": "audio/ogg", "wav": "audio/wav", "flac": "audio/flac", "json": "application/json"}
BAD = re.compile("[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\u200b-\u200d\ufeff]")   # refused by the store (MEDIA.md)
_KNOWN = None


def known_copyright(key):
    """the exact copyright text the owner's staging manifest (paths.MEDIA_MANIFEST) gives this key, else None. No generic default."""
    global _KNOWN
    if _KNOWN is None:
        _KNOWN = {}
        try:
            j = json.loads(P.MEDIA_MANIFEST.read_text(encoding="utf-8"))
            for e in (j["entries"] if isinstance(j, dict) else j):
                k = e.get("key")
                if not k: continue
                k = k[len(P.BUSINESS) + 1:] if k.startswith(P.BUSINESS + "/") else k
                if isinstance(e.get("copyright"), str) and e["copyright"].strip(): _KNOWN[k] = e["copyright"]
        except (OSError, ValueError, KeyError) as ex:
            print(f"  (no copyright text from {P.MEDIA_MANIFEST}: {ex})")
    return _KNOWN.get(key)


def take_flag(name="--publish"):
    """remove a flag from sys.argv (the tools read their own arguments by position) and say whether it was there"""
    if name in sys.argv:
        sys.argv[:] = [a for a in sys.argv if a != name]
        return True
    return False


def text(s):
    """title or copyright as the store accepts it: no control, bidi or zero-width characters, at most 200 characters"""
    s = re.sub(r"\s+", " ", BAD.sub(" ", str(s))).strip()
    return s[:200]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()


def probe(path):
    """width, height and (for audio and video) duration, from ffprobe; nothing when ffprobe is missing"""
    exe = shutil.which("ffprobe")
    if not exe: return {}
    r = subprocess.run([exe, "-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", str(path)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    try: j = json.loads(r.stdout)
    except ValueError: return {}
    out = {}
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video" and s.get("width")), None)
    if v: out["width"], out["height"] = int(v["width"]), int(v["height"])
    d = (j.get("format") or {}).get("duration")
    if d and Path(path).suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"):
        try: out["duration"] = round(float(d), 3)
        except ValueError: pass
    return out


def media(key, path, title=None, copyright=None):
    """a manifest entry for one media file. copyright: the exact text, or None/False to take the owner's manifest text for
    this key (paths.MEDIA_MANIFEST), else none. Never True: the store needs the words."""
    if not (isinstance(copyright, str) and copyright.strip()): copyright = known_copyright(key) or False
    path = Path(path)
    if not path.is_file(): raise FileNotFoundError(f"{key}: no file at {path}")
    ext = path.suffix.lower().lstrip(".")
    e = {"key": key, "path": str(path), "type": MIME.get(ext, ext), "bytes": path.stat().st_size, "sha256": sha256(path)}
    e.update(probe(path))
    if title: e["title"] = text(title)
    e["copyright"] = text(copyright) if isinstance(copyright, str) and copyright.strip() else False
    return e


def data(name):
    """a manifest entry for a data file in paths.DATA, published at ads/_data/<name> (overwrites; MEDIA.md, "Data files")"""
    p = P.DATA / name
    if not p.is_file(): raise FileNotFoundError(f"ads/_data/{name}: no file at {p}")
    return {"key": f"ads/_data/{name}", "path": str(p), "type": "application/json", "bytes": p.stat().st_size, "sha256": sha256(p),
            "copyright": False}


def json_supported():
    """does media-upload.mjs take data files yet? MEDIA.md allows JSON under <top>/_data/, but today the script refuses both the
    type (its TYPES table has no json) and the key (a folder segment must start with a letter or digit, so "_data" fails)"""
    try: src = P.UPLOAD.read_text(encoding="utf-8")
    except OSError: return False
    m = re.search(r"const TYPES = \{(.*?)\};", src, re.S)
    return bool(m and re.search(r"\bjson\s*:", m.group(1))) and "_data" in src


def run(entries, publish=False, label="", listing=False, manifest_out=None):
    """write the manifest and hand it to media-upload.mjs: a dry run (the plan) unless publish. Returns the script's exit code."""
    entries = [e for e in entries if e]
    seen, uniq = set(), []
    for e in entries:
        if e["key"] not in seen: seen.add(e["key"]); uniq.append(e)
    entries = uniq
    head = f"publish{(' (' + label + ')') if label else ''}"
    if not entries:
        print(f"{head}: nothing changed, nothing to publish"); return 0
    held = []
    if not json_supported():
        held = [e for e in entries if e["key"].endswith(".json")]
        entries = [e for e in entries if not e["key"].endswith(".json")]
    for e in entries: print(f"  {e['key']}  {e['bytes']:,} bytes" + (f"  copyright: {e['copyright']}" if e.get("copyright") else ""))
    if held:
        print("  NOT IN THE MANIFEST: media-upload.mjs does not take data files yet (no json type, and it refuses the _data folder),")
        print("  so these are not sent. Until it does, the page reads its bundled copy in public/ads/_data/ (deployed with the site):")
        for e in held: print(f"    {e['key']}  ({e['path']})")
    if not entries:
        print(f"{head}: no media to send"); return 0
    node = shutil.which("node")
    if not node: sys.exit("publish: node is not on PATH, media-upload.mjs cannot run")
    if not P.UPLOAD.exists(): sys.exit(f"publish: no upload script at {P.UPLOAD}")
    if manifest_out: mf = Path(manifest_out)
    else:
        d = Path(tempfile.gettempdir()) / "harpatka-media"; d.mkdir(exist_ok=True)
        mf = d / f"manifest-{time.strftime('%Y%m%d-%H%M%S')}-{os.getpid()}.json"
    mf.write_text(json.dumps({"entries": entries}, ensure_ascii=False, indent=1), encoding="utf-8")
    cmd = [node, str(P.UPLOAD), f"--business={P.BUSINESS}", f"--manifest={mf}"]
    if publish: cmd.append("--run")
    elif listing: cmd.append("--list")
    print(f"{head}: {len(entries)} files, manifest {mf}")
    print("  " + ("UPLOADING (--publish)" if publish else "plan only; add --publish to upload, and only on the owner's word"), flush=True)
    return subprocess.run(cmd, cwd=str(P.FLOA)).returncode


# ---------- entries for the ads, by what the data files say ----------

def nums(args):
    out = []
    for a in args:
        if "-" in a: lo, hi = map(int, a.split("-")); out += range(lo, hi + 1)
        else: out.append(int(a))
    return out


def ad_texts():
    return {int(k): v for k, v in (P.read_json("registry.json", {}) or {}).get("items", {}).items()}


def ad_image(n):
    it = next((x for x in P.read_json("ads.json", []) if x["id"] == n), None)
    if not it: raise KeyError(f"ad {n} is not in ads.json")
    return media(f"ads/img/{it['file']}", P.IMG / it["file"], title=it.get("text"))


def ad_video(n):
    name = (P.read_json("videos.json", {}) or {}).get(str(n))
    if not name: raise KeyError(f"ad {n} has no video in videos.json")
    return media(f"ads/video/{name}", P.VIDEO / name, title=ad_texts().get(n))


def featured(base, copyright=None):
    """a featured card's image and video, with ONE copyright text for both: --copyright if given, else the owner's manifest text
    for either file. A card with cr: true and no text anywhere is refused (no generic default)."""
    card = next((c for c in P.read_json("featured.json", []) if c.get("base") == base), None)
    if not card: raise KeyError(f"no featured card with base {base}")
    keys = [(f"ads/{card[f]}", P.MEDIA_OUT / card[f]) for f in ("img", "vid") if card.get(f)]
    found = sorted({t for t in (known_copyright(k) for k, _ in keys) if t})
    if copyright and copyright.strip(): cr = copyright.strip()
    elif len(found) > 1: sys.exit(f"publish: {base}: the manifest gives its files different copyright texts {found}; pass --copyright \"<text>\"")
    elif found: cr = found[0]
    elif card.get("cr"): sys.exit(f"publish: {base} has cr: true but no copyright text in {P.MEDIA_MANIFEST}; "
                                  f"pass --copyright \"<text>\" (e.g. \"מוזיקה: <artist> - <song>\")")
    else: cr = False
    return [media(k, p, title=card.get("label"), copyright=cr) for k, p in keys]


def main():
    publish = take_flag("--publish"); listing = take_flag("--list")
    mo = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--manifest-out=")), None)
    args, cr, it = [], None, iter(sys.argv[1:])
    for a in it:
        if a.startswith("--manifest-out="): continue
        elif a.startswith("--copyright="): cr = a.split("=", 1)[1]
        elif a == "--copyright": cr = next(it, None)
        else: args.append(a)
    if not args or args[0] in ("-h", "--help"): print(__doc__); return 0
    cmd, rest = args[0], args[1:]
    entries = []
    if cmd == "data":
        entries = [data(n) for n in (rest or P.DATA_FILES)]
    elif cmd in ("ad", "video"):
        for n in nums(rest):
            if cmd == "ad": entries.append(ad_image(n))
            if str(n) in (P.read_json("videos.json", {}) or {}): entries.append(ad_video(n))
        entries += [data("ads.json")] * (cmd == "ad") + [data("videos.json")]
    elif cmd == "featured":
        if cr and len(rest) > 1: sys.exit("publish: --copyright applies to one featured card at a time")
        for b in rest: entries += featured(b, cr)
        entries.append(data("featured.json"))
    elif cmd == "file":
        for a in rest:
            k, p = a.split("=", 1)
            entries.append(data(k.split("/")[-1]) if k.startswith("ads/_data/") else media(k, p, copyright=cr))
    else:
        print(__doc__); return 1
    return run(entries, publish=publish, label=f"{cmd} {' '.join(rest)}".strip(), listing=listing, manifest_out=mo)


if __name__ == "__main__":
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass
    sys.exit(main())
