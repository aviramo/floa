"""Re-render the ad videos after search_end.py and verify them.
For each ad: render.py full -> out/final.mp4, then
  1. frames before the invitation card must match the previous render (out/final.pre-search.mp4): nothing else changed;
  2. stills of the new end (card, bottom field, glide, typing, tap, hearts, last frame) -> motion/review/ad-XX-end.jpg.
usage: python rerender_search.py 1-50   (motion-studio python); a line per ad in motion/review/rerender.log"""
import re, subprocess, sys, io, os, shutil
from pathlib import Path
import imageio_ffmpeg
from PIL import Image, ImageChops, ImageStat

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
FF = imageio_ffmpeg.get_ffmpeg_exe()
PY = sys.executable
REV = M / "review"; REV.mkdir(exist_ok=True)
LOG = REV / "rerender.log"

def nums(args):
    out = []
    for a in args:
        if "-" in a: x, y = map(int, a.split("-")); out += list(range(x, y + 1))
        else: out.append(int(a))
    return out

def frame(mp4, t):
    r = subprocess.run([FF, "-v", "error", "-ss", f"{t:.3f}", "-i", str(mp4), "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
                       capture_output=True, check=True)
    return Image.open(io.BytesIO(r.stdout)).convert("RGB")

def times(d):
    sc = (d / "scene.js").read_text(encoding="utf-8"); cfg = (d / "index.html").read_text(encoding="utf-8")
    bpm = float(re.search(r"bpm:\s*([\d.]+)", cfg).group(1)); bt = 60 / bpm
    G = lambda k: (k + 1) * bt
    g = lambda name: G(int(re.search(rf"{name} = G\((\d+)\)", sc).group(1)))
    T_CARD, B4, T_TAP = g("T_CARD"), g("B4"), g("T_TAP")
    typed = 14 / (12 / bt)
    T_TYPE = B4 + 0.3 if B4 + 0.3 + typed <= T_TAP - 0.22 else T_TAP - 0.22 - typed
    return T_CARD, B4, T_TAP, T_TYPE, typed

def log(s):
    print(s, flush=True)
    with LOG.open("a", encoding="utf-8") as f: f.write(s + "\n")

for n in nums(sys.argv[1:]):
    d = M / f"ad-{n:02d}"
    T_CARD, B4, T_TAP, T_TYPE, typed = times(d)
    r = subprocess.run([PY, "render.py", "full"], cwd=d, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    out = d / "out" / "final.mp4"
    if r.returncode or "error" in (r.stderr or "").lower() or not out.exists():
        log(f"ad {n:02d}: RENDER FAILED {r.returncode} {(r.stderr or '')[-300:]}"); continue
    old = d / "out" / "final.pre-search.mp4"
    diffs = []
    for t in (0.5, 2.0, 4.0, 6.0, max(0.1, T_CARD - 0.25)):
        a, b = frame(old, t), frame(out, t)
        diffs.append(round(ImageStat.Stat(ImageChops.difference(a, b)).mean[0], 2))
    st = [T_CARD + 1.3, B4 - 0.15, B4 + 0.25, T_TYPE + typed * 0.5, T_TAP - 0.08, T_TAP + 0.35, 14.95]
    s = subprocess.run([PY, "render.py", "stills"] + [f"{x:.3f}" for x in st], cwd=d, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    errs = [l for l in (s.stdout + s.stderr).splitlines() if "error" in l.lower() or "failed" in l.lower()]
    if (d / "stills" / "sheet.jpg").exists(): shutil.copy(d / "stills" / "sheet.jpg", REV / f"ad-{n:02d}-end.jpg")
    ok = max(diffs) < 1.0 and not errs
    log(f"ad {n:02d}: {'ok' if ok else 'CHECK'}  before-card diff {diffs}  card {T_CARD:.2f} B4 {B4:.2f} type {T_TYPE:.2f}-{T_TYPE + typed:.2f} tap {T_TAP:.2f}"
        + (f"  stills errors: {errs[:2]}" if errs else ""))
