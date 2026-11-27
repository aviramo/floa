"""links.json: which raw materials and which song each published ad uses, with the reverse maps.

    python build_links.py            writes _data/links.json beside this script, and prints the coverage

Rerun it after publishing a new ad. It reads local files only, and writes nothing else.
The output names private raw and music files, so it is NOT public: its store key is raw/_data/links.json (private), and the
local copy stays here, under tools/, never under public/.

Inputs (each path can be set in the environment, like the other ad tools):
    HARPATKA_MOTION_ROOT     the motion projects            (default C:/Users/ofira/Desktop/harpatka/motion)
    HARPATKA_MEDIA_STAGING   manifest.json of the upload    (default C:/Users/ofira/Desktop/harpatka-media-staging)
    HARPATKA_DOWNLOADS       originals some projects read   (default ~/Downloads)
    HARPATKA_ADS_DATA        the page's ads/_data           (default ../../public/ads/_data, for featured.json and videos.json)
    HARPATKA_LINKS_OUT       the output                     (default _data/links.json beside this script)

How a link is found, most exact first:
    ad-NN        the song is CONFIG.music.file in motion/ad-NN/index.html; a text ad uses no raw file
    the others   the recipe below names the project and the files that define THAT ad (its config, its build, its scene),
                 and every media file they reference is resolved to a manifest entry by path (the kept copy or a duplicate),
                 else by sha256. A reference written as a template (img/${...}, f'{n}.jpg') is expanded by the recipe.
Keys are relative to the business (the manifest's key without "harpatka/"). Entries with key null are skipped.
"""
import hashlib, json, os, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MOTION = Path(os.environ.get("HARPATKA_MOTION_ROOT", r"C:/Users/ofira/Desktop/harpatka/motion"))
STAGING = Path(os.environ.get("HARPATKA_MEDIA_STAGING", r"C:/Users/ofira/Desktop/harpatka-media-staging"))
DOWNLOADS = Path(os.environ.get("HARPATKA_DOWNLOADS", Path.home() / "Downloads"))
ADS_DATA = Path(os.environ.get("HARPATKA_ADS_DATA", HERE.parent.parent / "public" / "ads" / "_data"))
OUT = Path(os.environ.get("HARPATKA_LINKS_OUT", HERE / "_data" / "links.json"))

MEDIA = r"[^'\"`()\s]*?\.(?:mp4|mov|jpg|jpeg|png|webp|mp3|wav|m4a)"
REF = re.compile(r"['\"`(](" + MEDIA + r")['\"`)]", re.I)
SKIP_DIRS = {"out", "review", "stills", "stills43", "fonts", "__pycache__", "fr", "fr2", "auditions", "dl"}

# THE RECIPES: the ads that are not ad-NN. Each step: the project, the files that define this ad, and what a template expands to.
#   scan      files whose literal media references are this ad's sources
#   files     sources named here because the code builds the name (a template), with the reason
#   shots     a build whose SHOTS list photos as ('p', 'NN'): each is ../clips/photos/NN.jpg
RECIPES = {
    "biodanza-voices-40s": [{"project": "biodanza-voices", "scan": ["config-40s.json"]}],
    "biodanza-voices-40s-phone": [{"project": "biodanza-voices", "scan": ["config-40s-phone.json"]}],
    "paphos-30s": [{"project": "paphos", "scan": ["config-30s.json"]}],
    "paphos": [{"project": "paphos", "scan": ["config.json"]}],
    # letgo: the photos come from SHOTS; the one clip is cut from the reel's source; the music is Rituals (make_music_v2.py: festival-music-35s.wav, cut from it)
    "letgo-v2": [{"project": "letgo", "shots": "build_v2.py", "files": ["../clips/reel-clips/source.mp4", "../video2/src/rituals.mp3"]}],
    "letgo-v4": [{"project": "letgo", "shots": "build_v4.py", "files": ["../clips/reel-clips/source.mp4", "../video2/src/rituals.mp3"]}],
    "taltalia": [{"project": "letgo", "shots": "build_v5.py", "files": ["../clips/reel-clips/source.mp4", "../video2/src/rituals.mp3"]}],
    # video2: the footage is timeline.py's SRC (src/in.mp4), the music Rituals (make_music.py: src/rituals.mp3)
    "festival-plus": [{"project": "video2", "scan": ["timeline.py", "make_music.py"]}],
    "festival-fest2": [{"project": "video2", "scan": ["timeline.py", "make_music.py"]}],
    # combo: out/combined.mp4 is motion.mp4 then group.mp4 (overlay.html), each with its own music (not a song in the store)
    "biodanza-story": [{"project": "combo", "files": ["motion.mp4", "group.mp4"]}],
    # sweeps, the 9:16 story: scene.js uses story1..3.jpg, made from img1..3 (the same pictures, extended); the music is Changes
    "sweeps-story": [{"project": "sweeps", "files": ["img1-cafe.png", "img2-dance.png", "img3-circle.png"], "scan": ["make_music.py"]}],
    # biodanza-15s, the 9:16 story: the three pictures of scene.js; the music is make_music.py's (Drawing the Sky, then Happy Home)
    "moments-story": [{"project": "biodanza-15s", "scan": ["scene.js", "make_music.py"]}],
    # adventure-scenes: scene.js loads img/<prefix>-NN.jpg, made by prep_scenes.py from Downloads/<folder> (f = WOMAN40, n = MAN40);
    # the music is make_music.py's src-changes.mp3
    "adventure-woman40": [{"project": "adventure-scenes", "downloads": "WOMAN40", "scan": ["make_music.py"]}],
    "adventure-man40": [{"project": "adventure-scenes", "downloads": "MAN40", "scan": ["make_music.py"]}],
}


def norm(p):
    return os.path.normcase(os.path.normpath(str(p)))


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def load_manifest():
    entries = json.loads((STAGING / "manifest.json").read_text(encoding="utf8"))["entries"]
    by_path, by_sha, kinds = {}, {}, {}
    for e in entries:
        if not e.get("key") or e.get("category") not in ("raw", "music"):
            continue
        key = e["key"].split("/", 1)[1] if e["key"].startswith("harpatka/") else e["key"]
        kinds[key] = e["category"]
        for p in [e.get("local_path"), e.get("source_path")] + list(e.get("duplicates") or []):
            if p:
                by_path[norm(p)] = key
        if e.get("sha256"):
            by_sha[e["sha256"]] = key
    return by_path, by_sha, kinds


def project_files(proj):
    out = {}
    for p in proj.rglob("*"):
        if p.is_file() and not (set(p.relative_to(proj).parts[:-1]) & SKIP_DIRS):
            out.setdefault(p.name.lower(), []).append(p)
    return out


class Linker:
    def __init__(self):
        self.by_path, self.by_sha, self.kinds = load_manifest()
        self.notes = []

    def resolve(self, path):
        path = Path(path)
        key = self.by_path.get(norm(path))
        if key is None and path.is_file():
            key = self.by_sha.get(sha(path))
        return key

    def refs(self, proj, name, where):
        """a referenced name: a relative path from the project, else every file of that name in the project"""
        if "/" in name or "\\" in name:
            cands = [(proj / name).resolve()]
        else:
            cands = project_files(proj).get(name.lower(), [])
        keys = [k for k in (self.resolve(c) for c in cands if c.exists()) if k]
        if not cands:
            self.notes.append(f"{where}: {name} not found")
        return keys

    def step(self, ad, s):
        proj, keys = MOTION / s["project"], []
        for f in s.get("scan", []):
            text = (proj / f).read_text(encoding="utf8", errors="ignore")
            for name in sorted(set(REF.findall(text))):
                keys += self.refs(proj, name, f"{ad} {s['project']}/{f}")
        for name in s.get("files", []):
            got = self.refs(proj, name, f"{ad} {s['project']}")
            if not got:
                self.notes.append(f"{ad}: {s['project']}/{name} is in no manifest entry")
            keys += got
        if s.get("shots"):
            text = (proj / s["shots"]).read_text(encoding="utf8", errors="ignore")
            for n in re.findall(r"\(\s*'p'\s*,\s*'(\d+)'", text):
                keys += self.refs(proj, f"../clips/photos/{n}.jpg", f"{ad} {s['shots']}")
        if s.get("downloads"):
            folder = DOWNLOADS / s["downloads"]
            files = sorted(p for p in folder.glob("*") if p.is_file()) if folder.is_dir() else []
            if not files:
                self.notes.append(f"{ad}: Downloads/{s['downloads']} is not here; its pictures are not linked")
            keys += [k for k in (self.resolve(p) for p in files) if k]
        return keys

    def ad_nn(self, ad):
        html = MOTION / ad / "index.html"
        if not html.is_file():
            self.notes.append(f"{ad}: no motion/{ad}/index.html")
            return []
        m = re.search(r"music\s*:\s*\{[^}]*file\s*:\s*['\"]([^'\"]+)['\"]", html.read_text(encoding="utf8", errors="ignore"))
        if not m:
            self.notes.append(f"{ad}: no CONFIG.music.file")
            return []
        key = self.resolve(MOTION / ad / m.group(1))
        if not key:
            self.notes.append(f"{ad}: {m.group(1)} is in no manifest entry")
        return [key] if key else []


def main():
    L = Linker()
    featured = json.loads((ADS_DATA / "featured.json").read_text(encoding="utf8"))
    videos = json.loads((ADS_DATA / "videos.json").read_text(encoding="utf8"))
    ads = {}
    for n in sorted(videos, key=int):   # a numbered ad with a video uses that video's song; an image alone uses nothing
        ad = "ad-%02d" % int(n)
        ads[ad] = L.ad_nn(ad)
    for c in featured:
        ad = c["base"]
        if ad not in RECIPES:
            L.notes.append(f"{ad}: no recipe (a new featured ad: add one)")
            continue
        ads[ad] = [k for s in RECIPES[ad] for k in L.step(ad, s)]
    for ad in RECIPES:
        if ad not in ads:
            L.notes.append(f"{ad}: has a recipe but is not in featured.json")
    out = {"version": 1, "ads": {}, "raw": {}, "music": {}}
    for ad, keys in ads.items():
        raw = sorted({k for k in keys if L.kinds.get(k) == "raw"})
        mus = sorted({k for k in keys if L.kinds.get(k) == "music"})
        if raw or mus:
            out["ads"][ad] = {"raw": raw, "music": mus}
    for ad, v in out["ads"].items():   # the reverse maps, from the forward one, so they always agree
        for k in v["raw"]:
            out["raw"].setdefault(k, []).append(ad)
        for k in v["music"]:
            out["music"].setdefault(k, []).append(ad)
    for side in ("raw", "music"):
        out[side] = {k: sorted(v) for k, v in sorted(out[side].items())}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf8")

    all_raw = sorted(k for k, c in L.kinds.items() if c == "raw")
    all_mus = sorted(k for k, c in L.kinds.items() if c == "music")
    print(f"wrote {OUT}")
    print(f"ads: {len(ads)} checked, {len(out['ads'])} with a link "
          f"({sum(1 for v in out['ads'].values() if v['raw'])} with raw, {sum(1 for v in out['ads'].values() if v['music'])} with music)")
    print(f"ads with no link: {', '.join(a for a in ads if a not in out['ads']) or 'none'}")
    print(f"raw: {len(out['raw'])} of {len(all_raw)} linked; not linked: {len(all_raw) - len(out['raw'])}")
    for k in all_raw:
        if k not in out["raw"]:
            print("  raw unlinked:", k)
    print(f"music: {len(out['music'])} of {len(all_mus)} linked")
    for k in all_mus:
        if k not in out["music"]:
            print("  music unlinked:", k)
    for n in L.notes:
        print("note:", n)


if __name__ == "__main__":
    sys.exit(main())
